import type { DependencyInfo, DepTask, DepTaskEvent, DepTaskKind, TypeLib } from '@shared/types'
import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { AppError } from '@shared/errors'
import treeKill from 'tree-kill'
import { spacePaths } from '../../paths'
import { readJson } from '../../utils/fs'
import { runtimeService } from '../runtime'
import { scriptService } from '../script'
import { spaceService } from '../space'
import { spawnNpm } from './npm'
import { findMissing, isValidSpec, parseSpec } from './packageName'
import { scanImports } from './scanner'
import { collectTypeLibs, listPackages, typesPackageName, untypedModulesLib } from './types'

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
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
    const pkg = await readJson<PackageJson>(spacePaths.pkg(spaceId), {})
    const entries = [
      ...Object.entries(pkg.dependencies ?? {}).map(([name, wanted]) => ({ name, wanted, dev: false })),
      ...Object.entries(pkg.devDependencies ?? {}).map(([name, wanted]) => ({ name, wanted, dev: true })),
    ]
    return Promise.all(entries.map(async (entry) => {
      const installed = await readJson<{ version?: string }>(
        join(spacePaths.nodeModules(spaceId), entry.name, 'package.json'),
        {},
      )
      return { ...entry, installed: installed.version ?? null }
    }))
  }

  install(spaceId: string, specs: string[]): Promise<DepTask> {
    this.assertSpecs(specs)
    return this.run(spaceId, 'install', ['install', ...specs, '--save', '--prefer-offline'], specs)
  }

  /** Re-resolve against the registry. Bare names are upgraded to their latest version. */
  update(spaceId: string, specs: string[]): Promise<DepTask> {
    this.assertSpecs(specs)
    const targets = specs.map((spec) => {
      const { name, range } = parseSpec(spec)
      return `${name}@${range ?? 'latest'}`
    })
    return this.run(spaceId, 'update', ['install', ...targets, '--save', '--prefer-online'], specs)
  }

  uninstall(spaceId: string, names: string[]): Promise<DepTask> {
    this.assertSpecs(names)
    return this.run(spaceId, 'uninstall', ['uninstall', ...names], names)
  }

  installAll(spaceId: string): Promise<DepTask> {
    return this.run(spaceId, 'install-all', ['install', '--prefer-offline'], [])
  }

  cancel(taskId: string): void {
    const item = this.tasks.get(taskId)
    if (item?.child.pid)
      treeKill(item.child.pid)
  }

  /** Packages imported by the script that are neither declared nor installed */
  async scanMissing(spaceId: string, script: string): Promise<string[]> {
    const imported = await scanImports(scriptService.resolvePath(spaceId, script))
    const declared = (await this.list(spaceId)).map(dep => dep.name)
    const installed = await listPackages(spacePaths.nodeModules(spaceId))
    return findMissing(imported, new Set([...declared, ...installed]))
  }

  async typeLibs(spaceId: string): Promise<TypeLib[]> {
    const declared = (await this.list(spaceId)).map(dep => dep.name)
    const all = await listPackages(spacePaths.nodeModules(spaceId))
    // Declared packages and their @types first so they win when the size budget runs out
    const priority = new Set([...declared, ...declared.map(typesPackageName)])
    const ordered = [...all.filter(name => priority.has(name)), ...all.filter(name => !priority.has(name))]
    const libs = await collectTypeLibs(spacePaths.nodeModules(spaceId), ordered)
    const untyped = untypedModulesLib(declared, libs)
    return untyped ? [...libs, untyped] : libs
  }

  private assertSpecs(specs: string[]): void {
    if (!specs.length || specs.some(spec => !isValidSpec(spec)))
      throw new AppError('UNKNOWN', `Invalid package name: ${specs.join(' ')}`)
  }

  private async run(spaceId: string, kind: DepTaskKind, args: string[], packages: string[]): Promise<DepTask> {
    const space = await spaceService.get(spaceId)
    if (this.isBusy(spaceId))
      throw new AppError('DEPS_BUSY')
    const runtime = await runtimeService.resolve(space.nodeVersion)
    const task: DepTask = { id: randomUUID(), spaceId, kind, packages, startedAt: Date.now() }
    const child = spawnNpm(runtime, args, spacePaths.root(spaceId))
    this.tasks.set(task.id, { task, child })

    const emitData = (data: string): void => {
      this.emit('task', { type: 'data', taskId: task.id, spaceId, data })
    }
    this.emit('task', { type: 'start', task })
    emitData(`\x1B[90m> npm ${args.join(' ')} (node ${runtime.version})\x1B[0m\n`)
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
