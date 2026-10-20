import { describe, expect, it } from 'vitest'
import { typesPackageName, untypedModulesLib } from './types'

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
