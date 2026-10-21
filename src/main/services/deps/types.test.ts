import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listPackages, typesPackageName, untypedModulesLib } from './types'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('typesPackageName', () => {
  it('maps scoped and plain names to DefinitelyTyped names', () => {
    expect(typesPackageName('lodash')).toBe('@types/lodash')
    expect(typesPackageName('@babel/core')).toBe('@types/babel__core')
  })
})

describe('untypedModulesLib', () => {
  it('declares only packages without own or @types declarations', () => {
    const lib = untypedModulesLib(['lodash', 'axios', 'express', '@types/express', 'chalk'], [
      { path: 'file:///node_modules/axios/index.d.ts', content: '' },
      { path: 'file:///node_modules/@types/express/index.d.ts', content: '' },
      { path: 'file:///node_modules/chalk/package.json', content: '{}' },
    ])
    expect(lib?.content).toBe([
      `declare module 'lodash';`,
      `declare module 'lodash/*';`,
      `declare module 'chalk';`,
      `declare module 'chalk/*';`,
    ].join('\n'))
  })

  it('returns null when everything is typed', () => {
    expect(untypedModulesLib([], [])).toBeNull()
  })
})

describe('listPackages', () => {
  it('includes direct and scoped package symlinks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sb-packages-'))
    roots.push(root)
    const modules = join(root, 'node_modules')
    const store = join(root, 'store')
    await mkdir(join(modules, '@scope'), { recursive: true })
    await mkdir(join(store, 'direct'), { recursive: true })
    await mkdir(join(store, 'scoped'), { recursive: true })
    await mkdir(join(modules, 'regular'))
    await symlink(join(store, 'direct'), join(modules, 'linked'))
    await symlink(join(store, 'scoped'), join(modules, '@scope', 'linked'))

    expect((await listPackages(modules)).sort()).toEqual(['@scope/linked', 'linked', 'regular'])
  })
})
