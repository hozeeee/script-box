# Script Box

English | [简体中文](./README.md)

An out-of-the-box script runner. Pick a script and run it: no Node.js installation required.

## Features

- **No runtime setup**: download Node.js from inside the app. Multiple versions can be installed side by side, and every download is verified against `SHASUMS256.txt`. Each space chooses its own version.
- **Isolated spaces**: every space has its own `package.json` and `node_modules`.
- **Dependency management**:
  - Install, uninstall or update packages with `name@version`.
  - Script `import`/`require` statements are scanned so missing packages can be installed in one click.
  - All spaces share one npm cache, so a package with the same name and version is downloaded only once unless you click "Update".
- **Run JS/TS directly**: `.js/.mjs/.cjs/.ts/.mts/.cts`. TypeScript is transpiled by esbuild without type checking.
- **Interactive terminal**:
  - Output streams live through node-pty and xterm.js, and you can type into stdin.
  - Stop a script at any time.
  - Set arguments and environment variables, and run several scripts at once.
- **Run history**: exit code, duration and the full log of each run.
- **Built-in editor**:
  - Monaco loaded entirely from local files, with no CDN.
  - Bundled Node.js typings work offline, and declarations of installed packages are added automatically.
  - `Ctrl/Cmd+S` saves and `F5` runs.
- **Network settings**:
  - Node.js download mirror, npm registry, HTTP/HTTPS proxy, and binary mirror variables such as `ELECTRON_MIRROR`, with a one-click China preset.
  - The proxy is used for runtime downloads, npm and auto update.
- **English and Chinese UI**, with light, dark and system themes.
- **Auto update** from GitHub Releases.

## Download

Grab the installer for your platform from [Releases](https://github.com/<owner>/script-box/releases):

| Platform | File |
| --- | --- |
| Windows | `script-box-x.y.z-setup.exe` |
| macOS | `script-box-x.y.z-arm64.dmg` / `script-box-x.y.z-x64.dmg` |
| Linux | `script-box-x.y.z-x86_64.AppImage` / `script-box-x.y.z-amd64.deb` |

> macOS builds are currently unsigned. If macOS says the app is damaged or from an unidentified developer, run `xattr -cr "/Applications/Script Box.app"`. Auto update on macOS is not guaranteed without signing.

## Getting started

1. On first launch, follow the prompt to download an LTS version of Node.js.
2. Create a space and choose its Node.js version.
3. Import scripts (drag and drop works) or create a new one.
4. If the banner above the editor lists missing packages, click "Install". You can also install packages from the "Dependencies" panel, e.g. `lodash@4`.
5. Press `F5` or click "Run". Output appears in the terminal below, which also accepts input.

## Data directory

Everything is stored in the user data directory. Open it from Settings → About.

```
settings.json          global settings
runtimes/node/<ver>/   downloaded Node.js versions
npm-cache/             shared npm cache
spaces/<id>/           spaces (space.json, package.json, node_modules, scripts)
history/<spaceId>/     run history and logs
```

## Development

Requires Node.js >= 22 and pnpm 10. pnpm is mandatory; see [Installing pnpm](#installing-pnpm) if you don't have it.

```bash
pnpm install        # also rebuilds node-pty for Electron
pnpm dev            # start in development mode
pnpm lint           # ESLint (@antfu/eslint-config, also handles formatting)
pnpm typecheck      # TypeScript type check
pnpm test           # vitest unit tests
pnpm build:linux    # package the app (or build:win / build:mac)
```

### Installing pnpm

Only pnpm is supported. Do not install dependencies with npm or yarn:

- Dependency versions are locked by `pnpm-lock.yaml`, and CI installs with `pnpm install --frozen-lockfile`.
- The `pnpm` field in `package.json` is read only by pnpm. It holds the dependency patches (`patches/`), the allowlist of native dependencies that may build, and the multi-architecture native package settings.
- The `typecheck` and `build:*` scripts and the pre-commit hook call `pnpm` directly.

The recommended way is to enable pnpm through Corepack, which ships with Node.js and automatically uses the version pinned in the `packageManager` field of `package.json`:

```bash
corepack enable
pnpm -v
```

> Node.js 25 and later no longer bundle Corepack, so run `npm install -g corepack` first. If you'd rather not use Corepack, run `npm install -g pnpm@10` instead.
>
> If you already installed dependencies with npm, delete `node_modules` and `package-lock.json` before running `pnpm install`.

### Layout

```
src/
  shared/      types, IPC channels and defaults shared by main and renderer
  main/        Electron main process: ipc handlers and services (settings, network, runtime, space, script, deps, runner, updater)
  preload/     typed window.api exposed through contextBridge
  renderer/    React 19 + Ant Design UI
```

### Releasing

Push a `v*` tag (for example `git tag v0.1.0 && git push --tags`). GitHub Actions then builds on Windows, macOS and Linux and uploads the installers to a draft release. Review the draft and publish it.

Code signing is optional. To enable it, add these repository secrets:

- macOS: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`
- Windows: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`

## License

[MIT](./LICENSE)
