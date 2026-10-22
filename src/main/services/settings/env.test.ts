import type { NetworkSettings } from '@shared/types'
import { DEFAULT_SETTINGS, PYPI_INDEX_CN, PYPI_INDEX_OFFICIAL } from '@shared/defaults'
import { describe, expect, it } from 'vitest'
import { buildNetworkEnv, resolveProxy, toElectronProxyConfig } from './env'
import { deepMerge } from './merge'

function network(patch: Partial<NetworkSettings> = {}, proxy: Partial<NetworkSettings['proxy']> = {}): NetworkSettings {
  return { ...DEFAULT_SETTINGS.network, ...patch, proxy: { ...DEFAULT_SETTINGS.network.proxy, ...proxy } }
}

describe('resolveProxy', () => {
  it('is null when disabled or empty', () => {
    expect(resolveProxy(network({}, { http: 'http://p:1' }).proxy)).toBeNull()
    expect(resolveProxy(network({}, { enabled: true }).proxy)).toBeNull()
  })

  it('falls back to the http proxy for https', () => {
    expect(resolveProxy(network({}, { enabled: true, http: ' http://p:1 ', noProxy: 'a,b' }).proxy))
      .toEqual({ http: 'http://p:1', https: 'http://p:1', noProxy: 'a,b' })
  })
})

describe('buildNetworkEnv', () => {
  it('maps registry, proxy and binary mirrors to env vars', () => {
    const env = buildNetworkEnv(network(
      { npmRegistry: 'https://registry.npmmirror.com//', binaryMirrors: [{ key: ' ELECTRON_MIRROR ', value: 'https://m/' }, { key: ' ', value: 'x' }] },
      { enabled: true, http: 'http://p:1', https: 'http://p:2', noProxy: 'localhost' },
    ))
    expect(env).toEqual({
      npm_config_registry: 'https://registry.npmmirror.com/',
      PIP_INDEX_URL: 'https://pypi.org/simple',
      UV_INDEX_URL: 'https://pypi.org/simple',
      PDM_PYPI_URL: 'https://pypi.org/simple',
      HTTP_PROXY: 'http://p:1',
      http_proxy: 'http://p:1',
      npm_config_proxy: 'http://p:1',
      HTTPS_PROXY: 'http://p:2',
      https_proxy: 'http://p:2',
      npm_config_https_proxy: 'http://p:2',
      NO_PROXY: 'localhost',
      no_proxy: 'localhost',
      npm_config_noproxy: 'localhost',
      ELECTRON_MIRROR: 'https://m/',
    })
  })

  it('omits proxy vars when the proxy is disabled', () => {
    expect(Object.keys(buildNetworkEnv(network()))).toEqual(['npm_config_registry', 'PIP_INDEX_URL', 'UV_INDEX_URL', 'PDM_PYPI_URL'])
  })

  it('uses custom PyPI index for all Python tools', () => {
    const env = buildNetworkEnv(network({ pypiIndex: PYPI_INDEX_CN }))
    expect(env.PIP_INDEX_URL).toBe(PYPI_INDEX_CN)
    expect(env.UV_INDEX_URL).toBe(PYPI_INDEX_CN)
    expect(env.PDM_PYPI_URL).toBe(PYPI_INDEX_CN)
  })

  it('omits PyPI vars when pypiIndex is empty', () => {
    const env = buildNetworkEnv(network({ pypiIndex: '' }))
    expect(env).not.toHaveProperty('PIP_INDEX_URL')
    expect(env).not.toHaveProperty('UV_INDEX_URL')
    expect(env).not.toHaveProperty('PDM_PYPI_URL')
  })
})

describe('toElectronProxyConfig', () => {
  it('uses the system proxy when disabled', () => {
    expect(toElectronProxyConfig(network().proxy)).toEqual({ mode: 'system' })
  })

  it('builds fixed proxy rules with bypass list', () => {
    expect(toElectronProxyConfig(network({}, { enabled: true, http: 'http://p:1', noProxy: 'a.com, b.com' }).proxy)).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'http=http://p:1;https=http://p:1',
      proxyBypassRules: '<local>,a.com,b.com',
    })
  })
})

describe('deepMerge', () => {
  it('merges nested objects and replaces arrays', () => {
    const merged = deepMerge(DEFAULT_SETTINGS, {
      theme: 'dark',
      network: { proxy: { enabled: true }, binaryMirrors: [{ key: 'A', value: '1' }] },
    })
    expect(merged.theme).toBe('dark')
    expect(merged.network.proxy).toEqual({ ...DEFAULT_SETTINGS.network.proxy, enabled: true })
    expect(merged.network.binaryMirrors).toEqual([{ key: 'A', value: '1' }])
    expect(merged.network.npmRegistry).toBe(DEFAULT_SETTINGS.network.npmRegistry)
    expect(DEFAULT_SETTINGS.network.proxy.enabled).toBe(false)
  })

  it('ignores undefined values', () => {
    expect(deepMerge({ a: 1, b: { c: 2 } }, { a: undefined, b: { c: undefined } })).toEqual({ a: 1, b: { c: 2 } })
  })
})

describe('defaults', () => {
  it('has correct PyPI defaults', () => {
    expect(PYPI_INDEX_OFFICIAL).toBe('https://pypi.org/simple')
    expect(PYPI_INDEX_CN).toBe('https://pypi.tuna.tsinghua.edu.cn/simple')
    expect(DEFAULT_SETTINGS.network.pypiIndex).toBe(PYPI_INDEX_OFFICIAL)
  })

  it('has defaultPythonVersion in run settings', () => {
    expect(DEFAULT_SETTINGS.run.defaultPythonVersion).toBeNull()
    expect(DEFAULT_SETTINGS.run.defaultNodeVersion).toBeNull()
  })
})
