import type { DeepPartial, NetworkSettings, Settings } from '@shared/types'
import {
  CN_BINARY_MIRRORS,
  NODE_MIRROR_CN,
  NODE_MIRROR_OFFICIAL,
  NPM_REGISTRY_CN,
  NPM_REGISTRY_OFFICIAL,
  PYPI_INDEX_CN,
  PYPI_INDEX_OFFICIAL,
} from '@shared/defaults'

export function isCnPreset(network: NetworkSettings): boolean {
  return network.nodeMirror === NODE_MIRROR_CN && network.npmRegistry === NPM_REGISTRY_CN
}

/** Switch Node download, npm registry, PyPI index and binary mirrors between official and China presets */
export function mirrorPreset(cn: boolean, current: NetworkSettings): DeepPartial<Settings> {
  const others = current.binaryMirrors.filter(item => !CN_BINARY_MIRRORS.some(preset => preset.key === item.key))
  return {
    network: {
      nodeMirror: cn ? NODE_MIRROR_CN : NODE_MIRROR_OFFICIAL,
      npmRegistry: cn ? NPM_REGISTRY_CN : NPM_REGISTRY_OFFICIAL,
      pypiIndex: cn ? PYPI_INDEX_CN : PYPI_INDEX_OFFICIAL,
      binaryMirrors: cn ? [...others, ...CN_BINARY_MIRRORS] : others,
    },
  }
}
