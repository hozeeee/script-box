import type { NetworkSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/defaults'
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
    expect(Object.keys(buildNetworkEnv(network()))).toEqual(['npm_config_registry'])
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
