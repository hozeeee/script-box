import antfu from '@antfu/eslint-config'

export default antfu({
  react: true,
  typescript: true,
  ignores: ['out', 'dist', 'resources/types', 'build/*.plist', 'script-hub/**'],
}, {
  files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
  rules: {
    'node/prefer-global/process': 'off',
    'node/prefer-global/buffer': 'off',
  },
})
