import type { RunOutputEvent, RunRecord, RunStartOptions } from '@shared/types'
import type { IPty } from 'node-pty'
import type { WriteStream } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { relative } from 'node:path'
import { AppError } from '@shared/errors'
import { spawn } from 'node-pty'
import treeKill from 'tree-kill'
import { spacePaths } from '../../paths'
import { exists } from '../../utils/fs'
import { buildProcessEnv } from '../runtime/env'
import { scriptService } from '../script'
import { buildNetworkEnv, settingsStore } from '../settings'
import { spaceService } from '../space'
import { parseArgs } from './args'
import { historyStore } from './history'
import { resolveLanguageRunner } from './languages'

interface ActiveRun {
  record: RunRecord
  pty: IPty
  log: WriteStream
  stopRequested: boolean
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

  async start(spaceId: string, script: string, options: RunStartOptions): Promise<RunRecord> {
    const space = await spaceService.get(spaceId)
    const source = scriptService.resolvePath(spaceId, script)
    if (!(await exists(source)))
      throw new AppError('SCRIPT_NOT_FOUND', undefined, { name: script })

    const runConfig = space.scripts[script]?.runConfig ?? { args: '', env: [] }
    const args = parseArgs(runConfig.args)
    const prepared = await resolveLanguageRunner(script).prepare({ space, script, source, args })
    const scriptEnv = Object.fromEntries(runConfig.env.filter(item => item.key.trim()).map(item => [item.key.trim(), item.value]))
    const env = buildProcessEnv(
      prepared.binDir,
      process.env,
      buildNetworkEnv(settingsStore.get().network),
      { FORCE_COLOR: '1', COLORTERM: 'truecolor' },
      scriptEnv,
    )

    const record: RunRecord = {
      id: randomUUID(),
      spaceId,
      script,
      args,
      nodeVersion: prepared.runtimeVersion,
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
      cwd: spacePaths.root(spaceId),
      env,
    })
    const run: ActiveRun = { record, pty, log, stopRequested: false }
    this.runs.set(record.id, run)

    const shown = relative(spacePaths.root(spaceId), source).split('\\').join('/')
    this.output(run, gray(`> ${shown}${args.length ? ` ${args.join(' ')}` : ''}  (${prepared.runtimeVersion})`))
    pty.onData(data => this.output(run, data))
    pty.onExit(({ exitCode }) => void this.finish(run, exitCode))
    return record
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
