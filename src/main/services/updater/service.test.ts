import type { CachedUpdate } from './cache'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdaterService } from './index'

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (value: any) => void>(),
  nativeListeners: new Map<string, () => void>(),
  record: null as unknown,
  validCache: true,
  manualReason: undefined as 'mac-unsigned' | 'mac-signature' | undefined,
  packaged: true,
  check: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  reveal: vi.fn(),
  save: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { get isPackaged() { return mocks.packaged } },
  autoUpdater: { on: (event: string, fn: () => void) => mocks.nativeListeners.set(event, fn) },
  shell: { showItemInFolder: mocks.reveal },
}))
vi.mock('electron-updater', () => ({
  autoUpdater: {
    currentVersion: { compare: (version: string) => version === '0.1.1' ? 0 : -1 },
    on: (event: string, fn: (value: any) => void) => mocks.listeners.set(event, fn),
    checkForUpdates: mocks.check,
    downloadUpdate: mocks.download,
    quitAndInstall: mocks.install,
  },
}))
vi.mock('../../paths', () => ({ paths: { updates: '/data/updates' } }))
vi.mock('../../utils/fs', () => ({
  readJson: async () => mocks.record,
  writeJson: async (_path: string, record: unknown) => {
    mocks.save(record)
    mocks.record = record
  },
}))
vi.mock('./cache', () => ({
  hashUpdate: async () => 'checksum',
  validateCachedUpdate: async (value: CachedUpdate | null, isNewer: (version: string) => boolean) =>
    value && mocks.validCache && isNewer(value.version) ? value : null,
}))
vi.mock('./mac', () => ({
  detectMacManualReason: async () => mocks.manualReason,
  isMacSignatureError: (error: Error) => error.message.includes('Code signature'),
  macAppPath: () => '/Applications/Script Box.app',
  quarantineCommand: () => 'xattr -r -d com.apple.quarantine \'/Applications/Script Box.app\'',
}))

const info = { version: '0.2.0', downloadedFile: '/cache/update.zip', files: [] }
const cached: CachedUpdate = { version: info.version, path: info.downloadedFile, sha512: 'checksum', platform: 'darwin', arch: 'arm64' }

function emit(event: string, value?: unknown): void {
  mocks.listeners.get(event)?.(value)
}

beforeEach(() => {
  vi.stubGlobal('process', new Proxy(process, {
    get: (target, property) => property === 'platform' ? 'darwin' : property === 'arch' ? 'arm64' : Reflect.get(target, property),
  }))
  mocks.listeners.clear()
  mocks.nativeListeners.clear()
  mocks.record = null
  mocks.validCache = true
  mocks.manualReason = undefined
  mocks.packaged = true
  vi.clearAllMocks()
  mocks.check.mockImplementation(async () => {
    emit('checking-for-update')
    emit('update-available', info)
    return { isUpdateAvailable: true, updateInfo: info }
  })
  mocks.download.mockImplementation(async () => {
    emit('update-downloaded', info)
    return [info.downloadedFile]
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('更新下载与恢复', () => {
  it('未签名 Mac 只下载 ZIP，持久化并展示手动安装指引', async () => {
    mocks.manualReason = 'mac-unsigned'
    const service = new UpdaterService()
    await service.check()
    await service.download()
    expect(service.get()).toMatchObject({
      state: 'downloaded',
      downloaded: { version: '0.2.0', path: '/cache/update.zip', manualInstall: true, manualReason: 'mac-unsigned', appPath: '/Applications/Script Box.app' },
    })
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ version: '0.2.0', sha512: 'checksum' }))
    const { autoUpdater } = await import('electron-updater')
    expect(autoUpdater.autoDownload).toBe(false)
    expect(autoUpdater.autoInstallOnAppQuit).toBe(false)
    await service.install()
    expect(mocks.reveal).toHaveBeenCalledWith('/cache/update.zip')
    expect(mocks.install).not.toHaveBeenCalled()
  })

  it('重新启动及关闭自动检查时也能离线恢复下载状态', async () => {
    mocks.record = { ...cached, manualReason: 'mac-unsigned' }
    const service = new UpdaterService()
    await service.initialize()
    expect(service.get()).toMatchObject({ state: 'downloaded', downloaded: { manualInstall: true, path: '/cache/update.zip' } })
    expect(mocks.check).not.toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('再次检查同一版本时仍显示下载完成，不再要求重复下载', async () => {
    mocks.record = { ...cached, manualReason: 'mac-unsigned' }
    const service = new UpdaterService()
    await service.check()
    expect(service.get().state).toBe('downloaded')
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('检查失败保留已下载包，仍可在 Finder 定位', async () => {
    mocks.record = { ...cached, manualReason: 'mac-unsigned' }
    mocks.check.mockRejectedValue(new Error('Network unavailable'))
    const service = new UpdaterService()
    await service.check()
    expect(service.get()).toMatchObject({ state: 'error', downloaded: { path: '/cache/update.zip' } })
    await service.reveal()
    expect(mocks.reveal).toHaveBeenCalledWith('/cache/update.zip')
  })

  it('文件丢失或损坏时撤销可安装状态，而不是留下无效按钮', async () => {
    mocks.record = cached
    const service = new UpdaterService()
    await service.initialize()
    mocks.validCache = false
    await service.install()
    expect(service.get()).toMatchObject({ state: 'error', errorCode: 'cache-missing' })
    expect(service.get().downloaded).toBeUndefined()
    expect(mocks.install).not.toHaveBeenCalled()
  })

  it('升级到已下载版本后不再展示旧包', async () => {
    mocks.record = { ...cached, version: '0.1.1' }
    const service = new UpdaterService()
    await service.initialize()
    expect(service.get().state).toBe('idle')
    expect(service.get().downloaded).toBeUndefined()
  })

  it('开发环境不检查签名、不下载、不安装', async () => {
    mocks.packaged = false
    const service = new UpdaterService()
    await service.initialize()
    await service.check()
    await service.download()
    await service.install()
    expect(service.get().state).toBe('unsupported')
    expect(mocks.check).not.toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.install).not.toHaveBeenCalled()
  })
})

describe('其他平台及错误处理', () => {
  it.each(['linux', 'win32'])('%s 下载完成后保持原生安装行为', async (platform) => {
    vi.stubGlobal('process', new Proxy(process, {
      get: (target, property) => property === 'platform' ? platform : Reflect.get(target, property),
    }))
    const service = new UpdaterService()
    await service.check()
    await service.download()
    expect(service.get()).toMatchObject({ state: 'downloaded', downloaded: { manualInstall: false } })
    await service.install()
    expect(mocks.install).toHaveBeenCalledOnce()
  })

  it('安装抛出错误时保留文件，并报告失败而不是静默无操作', async () => {
    const service = new UpdaterService()
    await service.check()
    await service.download()
    mocks.nativeListeners.get('update-downloaded')?.()
    await vi.waitFor(() => expect(service.get().state).toBe('downloaded'))
    mocks.install.mockImplementationOnce(() => {
      throw new Error('Install failed')
    })
    await service.install()
    expect(service.get()).toMatchObject({ state: 'error', error: 'Install failed', downloaded: { path: '/cache/update.zip' } })
  })
})

describe('在 Mac 上的原生安装时序', () => {
  it('下载 ZIP 完成后等待原生签名校验，不提前宣称可以重启安装', async () => {
    const service = new UpdaterService()
    await service.check()
    await service.download()
    expect(service.get().state).toBe('preparing')
    expect(mocks.install).not.toHaveBeenCalled()
    mocks.nativeListeners.get('update-downloaded')?.()
    await vi.waitFor(() => expect(service.get().state).toBe('downloaded'))
    await service.install()
    expect(mocks.install).toHaveBeenCalledOnce()
  })

  it('下载后签名失败转成手动安装警告，并保留包及指引', async () => {
    const service = new UpdaterService()
    await service.check()
    await service.download()
    emit('error', new Error('Code signature did not pass validation'))
    expect(service.get()).toMatchObject({ state: 'downloaded', downloaded: { manualInstall: true, manualReason: 'mac-signature' } })
    await service.install()
    expect(mocks.install).not.toHaveBeenCalled()
    expect(mocks.reveal).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(mocks.record).toMatchObject({ manualReason: 'mac-signature' }))
  })

  it('签名错误发生在下载记录写入前，也不会被异步事件覆盖成自动安装就绪', async () => {
    mocks.download.mockImplementation(async () => {
      emit('update-downloaded', info)
      const error = new Error('Code signature did not pass validation')
      emit('error', error)
      throw error
    })
    const service = new UpdaterService()
    await service.check()
    await service.download()
    expect(service.get()).toMatchObject({ state: 'downloaded', downloaded: { manualInstall: true, version: '0.2.0' } })
    expect(mocks.install).not.toHaveBeenCalled()
  })

  it('重新启动后先复用缓存和恢复原生准备状态，再执行安装', async () => {
    mocks.record = cached
    const service = new UpdaterService()
    await service.initialize()
    await service.install()
    expect(mocks.check).toHaveBeenCalledOnce()
    expect(mocks.download).toHaveBeenCalledOnce()
    expect(mocks.install).not.toHaveBeenCalled()
    expect(service.get().state).toBe('preparing')
    mocks.nativeListeners.get('update-downloaded')?.()
    await vi.waitFor(() => expect(mocks.install).toHaveBeenCalledOnce())
  })

  it('新版本与已下载包不同，不在用户点击旧包时偷偷下载新版本', async () => {
    mocks.record = cached
    mocks.check.mockImplementation(async () => {
      const newer = { ...info, version: '0.3.0' }
      emit('update-available', newer)
      return { isUpdateAvailable: true, updateInfo: newer }
    })
    const service = new UpdaterService()
    await service.install()
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.install).not.toHaveBeenCalled()
    expect(service.get()).toMatchObject({ state: 'available', version: '0.3.0', downloaded: { version: '0.2.0' } })
  })
})
