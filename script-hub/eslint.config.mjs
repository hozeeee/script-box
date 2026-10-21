import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  react: false,
  // 使用 Node.js 内置测试工具，避免 Vitest 规则改写导入和测试函数。
  test: false,
  ignores: ['dist/**'],
  rules: {
    'no-console': 'off',
  },
}, {
  files: ['tools/build.mjs', 'tools/preview.mjs', 'tests/**/*.mjs'],
  rules: {
    'antfu/no-top-level-await': 'off',
  },
})
