import type { EnvVar, Settings } from './types'

export const NODE_MIRROR_OFFICIAL = 'https://nodejs.org/dist'
export const NODE_MIRROR_CN = 'https://npmmirror.com/mirrors/node'

export const NPM_REGISTRY_OFFICIAL = 'https://registry.npmjs.org'
export const NPM_REGISTRY_CN = 'https://registry.npmmirror.com'

export const PYPI_INDEX_OFFICIAL = 'https://pypi.org/simple'
export const PYPI_INDEX_CN = 'https://pypi.tuna.tsinghua.edu.cn/simple'

/** Common binary download mirrors for packages that fetch prebuilt files from GitHub/CDNs. */
export const CN_BINARY_MIRRORS: EnvVar[] = [
  { key: 'ELECTRON_MIRROR', value: 'https://npmmirror.com/mirrors/electron/' },
  { key: 'ELECTRON_BUILDER_BINARIES_MIRROR', value: 'https://npmmirror.com/mirrors/electron-builder-binaries/' },
  { key: 'SASS_BINARY_SITE', value: 'https://npmmirror.com/mirrors/node-sass' },
  { key: 'PUPPETEER_DOWNLOAD_BASE_URL', value: 'https://cdn.npmmirror.com/binaries/chrome-for-testing' },
  { key: 'PLAYWRIGHT_DOWNLOAD_HOST', value: 'https://npmmirror.com/mirrors/playwright' },
  { key: 'npm_config_sharp_binary_host', value: 'https://npmmirror.com/mirrors/sharp' },
  { key: 'npm_config_sharp_libvips_binary_host', value: 'https://npmmirror.com/mirrors/sharp-libvips' },
  { key: 'CHROMEDRIVER_CDNURL', value: 'https://npmmirror.com/mirrors/chromedriver' },
  { key: 'PRISMA_ENGINES_MIRROR', value: 'https://registry.npmmirror.com/-/binary/prisma' },
]

export const DEFAULT_SETTINGS: Settings = {
  locale: 'system',
  theme: 'system',
  network: {
    nodeMirror: NODE_MIRROR_OFFICIAL,
    npmRegistry: NPM_REGISTRY_OFFICIAL,
    pypiIndex: PYPI_INDEX_OFFICIAL,
    proxy: {
      enabled: false,
      http: '',
      https: '',
      noProxy: 'localhost,127.0.0.1',
    },
    binaryMirrors: [],
  },
  run: {
    historyLimit: 50,
    defaultNodeVersion: null,
    defaultPythonVersion: null,
  },
  update: {
    autoCheck: true,
  },
}
