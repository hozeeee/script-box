import { describe, expect, it } from 'vitest'
import { depTaskArgs, registryEnv, runScriptArgs } from './pm'

describe('package manager arguments', () => {
  it('maps dependency tasks for npm', () => {
    expect(depTaskArgs('npm', 'install', ['foo@1'])).toEqual(['install', 'foo@1', '--save', '--prefer-offline'])
    expect(depTaskArgs('npm', 'update', ['foo@latest'])).toEqual(['install', 'foo@latest', '--save', '--prefer-online'])
    expect(depTaskArgs('npm', 'uninstall', ['foo'])).toEqual(['uninstall', 'foo'])
    expect(depTaskArgs('npm', 'install-all', [])).toEqual(['install', '--prefer-offline'])
  })

  it('maps dependency tasks for alternative managers', () => {
    for (const manager of ['pnpm', 'yarn', 'bun'] as const) {
      expect(depTaskArgs(manager, 'install', ['foo'])).toEqual(['add', 'foo'])
      expect(depTaskArgs(manager, 'update', ['foo@latest'])).toEqual(['add', 'foo@latest'])
      expect(depTaskArgs(manager, 'uninstall', ['foo'])).toEqual(['remove', 'foo'])
      expect(depTaskArgs(manager, 'install-all', [])).toEqual(['install'])
    }
  })

  it('passes npm script arguments after a separator only for npm', () => {
    expect(runScriptArgs('npm', 'dev', ['--host'])).toEqual(['run', 'dev', '--', '--host'])
    expect(runScriptArgs('npm', 'dev', [])).toEqual(['run', 'dev'])
    expect(runScriptArgs('pnpm', 'dev', ['--host'])).toEqual(['run', 'dev', '--host'])
  })

  it('derives corepack and yarn registry variables', () => {
    expect(registryEnv({ npm_config_registry: 'https://registry.example.com///' })).toEqual({
      COREPACK_NPM_REGISTRY: 'https://registry.example.com',
      YARN_REGISTRY: 'https://registry.example.com/',
      YARN_NPM_REGISTRY_SERVER: 'https://registry.example.com',
    })
    expect(registryEnv({})).toEqual({})
  })
})
