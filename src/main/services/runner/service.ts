import type { RunOutputEvent, RunRecord, RunStartOptions, Space } from '@shared/types'
import type { IPty } from 'node-pty'
import type { WriteStream } from 'node:fs'
import type { PreparedCommand } from './languages'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { relative } from 'node:path'
import { AppError } from '@shared/errors'
import { isNpmScriptKey } from '@shared/types'
import { spawn } from 'node-pty'
import treeKill from 'tree-kill'
import { spaceWorkDir } from '../../paths'
import { exists } from '../../utils/fs'
import { registryEnv, resolvePackageManager, runScriptArgs } from '../deps/pm'
import { runtimeService } from '../runtime'
import { buildProcessEnv } from '../runtime/env'
import { scriptService } from '../script'
import { buildNetworkEnv, settingsStore } from '../settings'
import { assertProjectDir, spaceService } from '../space'
import { resolveProjectScript } from '../space/project'
import { parseArgs } from './args'
import { historyStore } from './history'
import { resolveLanguageRunner } from './languages'

interface ActiveRun {
  record: RunRecord
  pty: IPty
  log: WriteStream
  stopRequested: boolean
}

interface ResolvedCommand extends PreparedCommand {
  /** Command line echoed before the output */
  shown: string
  env: Record<string, string>
  cwd: string
}

const gray = (text: string): string => `\x1B[90m${text}\x1B[0m\r\n`

class RunnerService extends EventEmitter<{ output: [RunOutputEvent], exit: [RunRecord] }> {
  private runs = new Map<string, ActiveRun>()

  active(): RunRecord[] {
    return [...this.runs.values()].map(run => run.record)
  }

  isActive(runId: string): boolean {
    return this.runs.has(runId)
  }

  hasActiveInSpace(spaceId: string): boolean {
    return this.active().some(record => record.spaceId === spaceId)
  }

  /**
   * `script` is a file path relative to the working directory, or
   * `npm:<name>` for a package.json script of an imported project.
   */
  async start(spaceId: string, script: string, options: RunStartOptions): Promise<RunRecord> {
    const space = await spaceService.get(spaceId)
    if (space.projectPath)
      await assertProjectDir(space.projectPath)

    const runConfig = space.scripts[script]?.runConfig ?? { args: '', env: [] }
    const args = parseArgs(runConfig.args)
    const network = buildNetworkEnv(settingsStore.get().network)
    const prepared = isNpmScriptKey(script)
      ? await this.prepareNpmScript(space, script, args, network)
      : await this.prepareFile(space, script, args)

    // Run preflight (e.g. Python venv + deps sync) before spawning
    let preflightOutput = ''
    if (prepared.preflight) {
      const overrides = await prepared.preflight((data) => {
        preflightOutput += data
      })
      if (overrides?.command)
        prepared.command = overrides.command
      if (overrides?.binDir)
        prepared.binDir = overrides.binDir
    }
    const scriptEnv = Object.fromEntries(runConfig.env.filter(item => item.key.trim()).map(item => [item.key.trim(), item.value]))
    const env = buildProcessEnv(
      prepared.binDir,
      process.env,
      network,
      prepared.env,
      { FORCE_COLOR: '1', COLORTERM: 'truecolor' },
      scriptEnv,
    )

    const record: RunRecord = {
      id: randomUUID(),
      spaceId,
      script,
      args,
      runtimeKind: prepared.runtimeKind ?? 'node',
      runtimeVersion: prepared.runtimeVersion,
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      status: 'running',
    }
    const log = await historyStore.begin(record)
    const pty = spawn(prepared.command, prepared.args, {
      name: 'xterm-256color',
      cols: Math.max(options.cols, 20),
      rows: Math.max(options.rows, 5),
      cwd: prepared.cwd,
      env,
    })
    const run: ActiveRun = { record, pty, log, stopRequested: false }
    this.runs.set(record.id, run)

    if (preflightOutput)
      this.output(run, gray(preflightOutput.trimEnd()))
    this.output(run, gray(`> ${prepared.shown}${args.length ? ` ${args.join(' ')}` : ''}  (${prepared.runtimeVersion})`))
    pty.onData(data => this.output(run, data))
    pty.onExit(({ exitCode }) => void this.finish(run, exitCode))
    return record
  }

  private async prepareFile(space: Space, script: string, args: string[]): Promise<ResolvedCommand> {
    const source = scriptService.resolvePath(space, script)
    if (!(await exists(source)))
      throw new AppError('SCRIPT_NOT_FOUND', undefined, { name: script })
    const prepared = await resolveLanguageRunner(script).prepare({ space, script, source, args })
    const shown = relative(spaceWorkDir(space), source).split('\\').join('/')
    return { ...prepared, shown, env: {}, cwd: spaceWorkDir(space) }
  }

  /** 在命令所属的 package.json 目录执行，子工程优先使用自身的包管理器 */
  private async prepareNpmScript(space: Space, key: string, args: string[], network: Record<string, string>): Promise<ResolvedCommand> {
    if (!space.projectPath)
      throw new AppError('UNSUPPORTED_SCRIPT', undefined, { name: key })
    const { cwd, name, packageManager } = await resolveProjectScript(space.projectPath, key)
    const runtime = await runtimeService.resolve(space.runtime?.version ?? space.nodeVersion ?? null)
    const launcher = await resolvePackageManager(packageManager, runtime)
    return {
      command: launcher.command,
      args: [...launcher.prefix, ...runScriptArgs(launcher.manager, name, args)],
      binDir: runtime.bin,
      runtimeVersion: runtime.version,
      shown: `${launcher.manager} run ${name}  [${relative(space.projectPath, cwd).split('\\').join('/') || '.'}]`,
      env: { ...registryEnv(network), ...launcher.env },
      cwd,
    }
  }

  write(runId: string, data: string): void {
    this.runs.get(runId)?.pty.write(data)
  }

  resize(runId: string, cols: number, rows: number): void {
    const run = this.runs.get(runId)
    if (run && cols > 0 && rows > 0)
      run.pty.resize(cols, rows)
  }

  stop(runId: string): void {
    const run = this.runs.get(runId)
    if (!run)
      return
    run.stopRequested = true
    if (process.platform === 'win32')
      run.pty.kill()
    else
      treeKill(run.pty.pid, 'SIGTERM')
    // Force kill if the process ignores SIGTERM
    setTimeout(() => {
      if (this.runs.has(runId))
        treeKill(run.pty.pid, 'SIGKILL')
    }, 3000)
  }

  stopAll(): void {
    for (const runId of this.runs.keys())
      this.stop(runId)
  }

  private output(run: ActiveRun, data: string): void {
    run.log.write(data)
    this.emit('output', { runId: run.record.id, data })
  }

  private async finish(run: ActiveRun, exitCode: number): Promise<void> {
    const { record } = run
    record.endedAt = Date.now()
    record.exitCode = exitCode
    record.status = run.stopRequested ? 'stopped' : exitCode === 0 ? 'success' : 'failed'
    const seconds = ((record.endedAt - record.startedAt) / 1000).toFixed(2)
    this.output(run, `\r\n${gray(`Process exited with code ${exitCode} in ${seconds}s`)}`)
    this.runs.delete(record.id)
    run.log.end()
    try {
      await historyStore.finish(record)
    }
    catch (error) {
      console.error('[runner] failed to save history', error)
    }
    this.emit('exit', record)
  }
}

export const runnerService = new RunnerService()
