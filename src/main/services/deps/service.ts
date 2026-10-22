import type { DependencyInfo, DepTask, DepTaskEvent, DepTaskKind, Space, TypeLib } from '@shared/types'
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { dirname, join } from 'node:path'
import { AppError } from '@shared/errors'
import treeKill from 'tree-kill'
import { spaceWorkDir, workPaths } from '../../paths'
import { exists, readJson } from '../../utils/fs'
import { runtimeService } from '../runtime'
import { scriptService } from '../script'
import { assertProjectDir, detectPackageManager, spaceService } from '../space'
import { spawnPm } from './npm'
import { findMissing, isValidSpec, parseSpec } from './packageName'
import { depTaskArgs, resolvePackageManager } from './pm'
import { scanImports } from './scanner'
import { collectTypeLibs, listPackages, typesPackageName, untypedModulesLib } from './types'

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

/** Whether `name` is installed in a node_modules folder of `dir` or any of its ancestors (workspaces, hoisting) */
async function resolvableFrom(dir: string, name: string): Promise<boolean> {
  let current = dir
  while (true) {
    if (await exists(join(current, 'node_modules', name)))
      return true
    const parent = dirname(current)
    if (parent === current)
      return false
    current = parent
  }
}

class DepsService extends EventEmitter<{ task: [DepTaskEvent] }> {
  private tasks = new Map<string, { task: DepTask, child: ChildProcess }>()

  isBusy(spaceId: string): boolean {
    return [...this.tasks.values()].some(item => item.task.spaceId === spaceId)
  }

  active(): DepTask[] {
    return [...this.tasks.values()].map(item => item.task)
  }

  async list(spaceId: string): Promise<DependencyInfo[]> {
    return this.listOf(await spaceService.get(spaceId))
  }

  private async listOf(space: Space): Promise<DependencyInfo[]> {
    const pkg = await readJson<PackageJson>(workPaths.pkg(space), {})
    const entries = [
      ...Object.entries(pkg.dependencies ?? {}).map(([name, wanted]) => ({ name, wanted, dev: false })),
      ...Object.entries(pkg.devDependencies ?? {}).map(([name, wanted]) => ({ name, wanted, dev: true })),
    ]
    return Promise.all(entries.map(async (entry) => {
      const installed = await readJson<{ version?: string }>(
        join(workPaths.nodeModules(space), entry.name, 'package.json'),
        {},
      )
      return { ...entry, installed: installed.version ?? null }
    }))
  }

  install(spaceId: string, specs: string[]): Promise<DepTask> {
    this.assertSpecs(specs)
    return this.run(spaceId, 'install', specs, specs)
  }

  /** Re-resolve against the registry. Bare names are upgraded to their latest version. */
  update(spaceId: string, specs: string[]): Promise<DepTask> {
    this.assertSpecs(specs)
    const targets = specs.map((spec) => {
      const { name, range } = parseSpec(spec)
      return `${name}@${range ?? 'latest'}`
    })
    return this.run(spaceId, 'update', targets, specs)
  }

  uninstall(spaceId: string, names: string[]): Promise<DepTask> {
    this.assertSpecs(names)
    return this.run(spaceId, 'uninstall', names, names)
  }

  installAll(spaceId: string): Promise<DepTask> {
    return this.run(spaceId, 'install-all', [], [])
  }

  cancel(taskId: string): void {
    const item = this.tasks.get(taskId)
    if (item?.child.pid)
      treeKill(item.child.pid)
  }

  /** Packages imported by the script that are neither declared nor installed */
  async scanMissing(spaceId: string, script: string): Promise<string[]> {
    const space = await spaceService.get(spaceId)
    const source = scriptService.resolvePath(space, script)
    const imported = await scanImports(source)
    const declared = (await this.listOf(space)).map(dep => dep.name)
    const installed = await listPackages(workPaths.nodeModules(space))
    const missing = findMissing(imported, new Set([...declared, ...installed]))
    if (!space.projectPath)
      return missing
    // Projects may get packages from a workspace root or a nested node_modules
    const flags = await Promise.all(missing.map(name => resolvableFrom(dirname(source), name)))
    return missing.filter((_, index) => !flags[index])
  }

  async typeLibs(spaceId: string): Promise<TypeLib[]> {
    const space = await spaceService.get(spaceId)
    const nodeModules = workPaths.nodeModules(space)
    const declared = (await this.listOf(space)).map(dep => dep.name)
    const all = await listPackages(nodeModules)
    // Declared packages and their @types first so they win when the size budget runs out
    const priority = new Set([...declared, ...declared.map(typesPackageName)])
    const ordered = [...all.filter(name => priority.has(name)), ...all.filter(name => !priority.has(name))]
    const libs = await collectTypeLibs(nodeModules, ordered)
    const untyped = untypedModulesLib(declared, libs)
    return untyped ? [...libs, untyped] : libs
  }

  private assertSpecs(specs: string[]): void {
    if (!specs.length || specs.some(spec => !isValidSpec(spec)))
      throw new AppError('UNKNOWN', `Invalid package name: ${specs.join(' ')}`)
  }

  private async run(spaceId: string, kind: DepTaskKind, packages: string[], requested: string[]): Promise<DepTask> {
    const space = await spaceService.get(spaceId)
    if (this.isBusy(spaceId))
      throw new AppError('DEPS_BUSY')
    if (space.projectPath)
      await assertProjectDir(space.projectPath)
    const runtime = await runtimeService.resolve(space.runtime?.version ?? space.nodeVersion ?? null)
    // Regular spaces are always managed with npm; projects keep the manager they were set up with
    const manager = space.projectPath ? await detectPackageManager(space.projectPath) : 'npm'
    const launcher = await resolvePackageManager(manager, runtime)
    const args = depTaskArgs(manager, kind, packages)
    const task: DepTask = { id: randomUUID(), spaceId, kind, packages: requested, startedAt: Date.now() }
    const child = spawnPm(runtime, launcher, args, spaceWorkDir(space))
    this.tasks.set(task.id, { task, child })

    const emitData = (data: string): void => {
      this.emit('task', { type: 'data', taskId: task.id, spaceId, data })
    }
    this.emit('task', { type: 'start', task })
    emitData(`\x1B[90m> ${manager} ${args.join(' ')} (node ${runtime.version})\x1B[0m\n`)
    child.stdout?.on('data', (chunk: Buffer) => emitData(chunk.toString()))
    child.stderr?.on('data', (chunk: Buffer) => emitData(chunk.toString()))

    let finished = false
    const finish = (code: number | null): void => {
      if (finished)
        return
      finished = true
      this.tasks.delete(task.id)
      this.emit('task', { type: 'exit', taskId: task.id, spaceId, code })
    }
    child.on('error', (error) => {
      emitData(`\x1B[31m${error.message}\x1B[0m\n`)
      finish(-1)
    })
    child.on('close', code => finish(code))
    return task
  }
}

export const depsService = new DepsService()
