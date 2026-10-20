import type { NetworkSettings, ProxySettings } from '@shared/types'

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export function resolveProxy(proxy: ProxySettings): { http: string, https: string, noProxy: string } | null {
  if (!proxy.enabled)
    return null
  const http = proxy.http.trim()
  const https = proxy.https.trim() || http
  if (!http && !https)
    return null
  return { http, https, noProxy: proxy.noProxy.trim() }
}

/**
 * Environment variables applied to npm and user scripts so they honour
 * the configured registry, proxy and binary mirrors.
 */
export function buildNetworkEnv(network: NetworkSettings): Record<string, string> {
  const env: Record<string, string> = {}
  const registry = trimSlash(network.npmRegistry)
  if (registry)
    env.npm_config_registry = `${registry}/`

  const proxy = resolveProxy(network.proxy)
  if (proxy) {
    if (proxy.http) {
      env.HTTP_PROXY = proxy.http
      env.http_proxy = proxy.http
      env.npm_config_proxy = proxy.http
    }
    if (proxy.https) {
      env.HTTPS_PROXY = proxy.https
      env.https_proxy = proxy.https
      env.npm_config_https_proxy = proxy.https
    }
    if (proxy.noProxy) {
      env.NO_PROXY = proxy.noProxy
      env.no_proxy = proxy.noProxy
      env.npm_config_noproxy = proxy.noProxy
    }
  }

  for (const { key, value } of network.binaryMirrors) {
    if (key.trim())
      env[key.trim()] = value
  }
  return env
}

/** Convert settings into the shape accepted by Electron's `session.setProxy` */
export function toElectronProxyConfig(proxy: ProxySettings): Electron.ProxyConfig {
  const resolved = resolveProxy(proxy)
  if (!resolved)
    return { mode: 'system' }
  const rules: string[] = []
  if (resolved.http)
    rules.push(`http=${resolved.http}`)
  if (resolved.https)
    rules.push(`https=${resolved.https}`)
  const bypass = resolved.noProxy
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  return {
    mode: 'fixed_servers',
    proxyRules: rules.join(';'),
    proxyBypassRules: ['<local>', ...bypass].join(','),
  }
}
