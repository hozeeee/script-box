# Script Box 实施方案

## 概要
- 技术栈：pnpm、electron-vite、Electron（最新稳定版）、React 19 + TypeScript（strict）、Ant Design 5、zustand、react-router（hash 模式）、i18next、Monaco Editor、xterm.js + node-pty、esbuild、electron-builder、electron-updater。
- 代码规范：用 `@antfu/eslint-config`（开启 `react: true`、`typescript: true`）统一负责检查和格式化，不引入 Prettier；配合 simple-git-hooks + lint-staged 在提交前自动修复。
- 应用名 Script Box，appId `com.scriptbox.app`，MIT 协议。

## 项目结构（按职责拆分，单文件尽量控制在 200 行以内）
```
src/
  shared/            # 主进程与渲染进程共用：类型、IPC 通道常量、默认配置
    types/ (settings.ts, space.ts, script.ts, run.ts, runtime.ts)
    ipc.ts
  main/
    index.ts         # 应用入口、窗口创建
    paths.ts         # userData 下的目录布局
    ipc/             # 按领域注册 handler：settings / runtime / space / script / deps / run / updater
    services/
      settings/      # 读写 settings.json，把配置转换成代理和环境变量
      network/       # 基于 undici ProxyAgent 的 fetch 封装，session.setProxy 也在这里设置
      runtime/       # 拉取 Node 版本列表、下载、校验 SHASUMS、解压、删除
      space/         # 运行空间增删改查，生成 package.json
      script/        # 导入、读写、删除脚本
      deps/          # 调用 npm 安装/卸载/更新；扫描 import/require；收集类型定义
      runner/        # 用 esbuild 转译 TS、node-pty 启动进程、记录运行历史
      updater/       # electron-updater 封装
  preload/index.ts   # contextBridge 暴露带类型的 window.api
  renderer/src/
    app/ (App.tsx, router.tsx, providers.tsx)   # antd ConfigProvider、主题、语言
    layouts/MainLayout.tsx
    pages/ (spaces/, editor/, runtimes/, settings/, history/)
    components/
      editor/ (CodeEditor.tsx, useMonacoTypes.ts, monacoSetup.ts)
      terminal/ (RunTerminal.tsx, useXterm.ts)
      deps/ (DepList.tsx, InstallDepModal.tsx, MissingDepsAlert.tsx)
      script/ (ScriptTree.tsx, ImportScriptButton.tsx, RunConfigDrawer.tsx)
      runtime/ (NodeVersionSelect.tsx, DownloadProgress.tsx)
    stores/ (settings, spaces, runs) — zustand
    i18n/ (index.ts, locales/zh-CN.json, en-US.json)
    api/             # window.api 的薄封装
```

## 数据布局（`app.getPath('userData')` 下）
- `settings.json`：全局配置。
- `runtimes/node/v22.x.x/`：下载的 Node 版本，每个都自带 npm。
- `npm-cache/`：所有空间共用的 npm 缓存。
- `spaces/<id>/`：`space.json`（名称、Node 版本、创建时间）、`package.json`、`node_modules/`、`scripts/`、`.scriptbox/build/`（TS 转译产物）。
- `history/<spaceId>/<runId>.json` 和 `.log`：运行元数据和完整输出。

## 运行时管理（Node 多版本）
- 版本列表从 `{nodeMirror}/index.json` 拉取，在界面上标出 LTS。
- 按平台和架构下载对应压缩包（win 下 zip，其他平台 tar.gz/xz），用 `SHASUMS256.txt` 校验后解压到 `runtimes/node/<ver>`；下载进度通过 IPC 事件推给界面。
- 每个空间绑定一个已安装的版本；正被空间使用的版本删除时要给出提示。
- 首次启动时如果还没装任何 Node，引导用户下载一个 LTS 版本，并在界面上提供"使用国内镜像"开关。

## 运行空间与依赖
- 新建空间时生成 `package.json`（`private: true`）和空间 `.npmrc`。
- 安装、卸载、更新时直接用 `<node> <npm-cli.js>` 执行，统一加上参数：`--cache <npm-cache> --prefer-offline`。这样同名同版本的包会直接命中共享缓存，不会重复下载；只有用户点击"更新"时才改用 `--prefer-online` 并装 `@latest` 或用户指定的版本。
- 镜像和代理通过环境变量注入：`npm_config_registry`、`npm_config_proxy`、`npm_config_https_proxy`、`npm_config_noproxy`，以及二进制镜像变量（如 `ELECTRON_MIRROR`、`SASS_BINARY_SITE`、`PUPPETEER_DOWNLOAD_BASE_URL` 等）。
- 缺失依赖识别：用 esbuild 的 onResolve 插件扫描脚本里的 import 和 require，收集裸模块名，归一成包名（scoped 包取前两段），排掉 `module.builtinModules` 和 `node:` 前缀，再和 package.json 及 node_modules 比对。编辑器上方显示提示条，可以一键安装。
- 依赖列表从 package.json 和 `node_modules/*/package.json` 读出声明版本和实际安装版本。安装输出实时显示在一个只读终端里。

## 脚本导入与运行
- 导入：通过文件对话框或拖拽，把 `.js/.mjs/.cjs/.ts/.mts/.cts` 文件复制到 `spaces/<id>/scripts/`，重名时自动重命名。也可以在空间里直接新建脚本。
- 每个脚本的运行配置（参数、环境变量）存在 `space.json` 的 `scripts[name].runConfig` 里。
- TS 处理：用 esbuild `transform` 只转译不打包，输出到 `.scriptbox/build/<name>.mjs`；加 banner 注入 `createRequire`，让 ESM 产物里的 `require` 也能用。JS 文件直接运行。运行时的 cwd 设为空间根目录，保证 `node_modules` 能正常解析。
- 运行：node-pty 启动 `<space 的 node> <entry> ...args`，env 合并顺序为系统 env、全局代理 env、脚本 env，PATH 前面加上该 Node 版本的 bin 目录。输出通过 IPC 流式推给 xterm.js，键盘输入写回 pty，实现交互；窗口大小变化时同步 resize；停止时 kill 掉整个进程树。
- 同一时间允许多个脚本各自运行，界面上每个脚本一个终端 tab。
- 运行历史：记录开始/结束时间、退出码、参数和日志文件，每个空间最多保留 N 条（可配置，默认 50）；可以回看日志，也可以清空。

## 编辑器
- 使用 `@monaco-editor/react`，并用 `loader.config({ monaco })` 改为加载本地打包的 `monaco-editor`，不走 CDN，避免国内网络问题；worker 通过 Vite 的 `?worker` 导入。
- JS/TS 语言服务：开启 `checkJs`、`allowJs`，moduleResolution 设为 bundler。内置一份 `@types/node` 放进 `resources/types`，首次打开时通过 IPC 读取并 `addExtraLib`，这样不用联网也有 Node API 提示。
- 依赖类型：主进程遍历空间 `node_modules`，按 `types`/`typings`/`index.d.ts` 或对应的 `@types/<pkg>` 收集 `.d.ts`，以 `file:///node_modules/...` 路径注入 Monaco，有总大小上限。依赖安装完成后自动刷新。
- 支持 Ctrl/Cmd+S 保存、F5 运行，有未保存标记，编辑器主题跟随应用主题。

## 全局设置
- 外观：语言（zh-CN/en-US，默认跟随系统）、主题（亮/暗/跟随系统，用 antd 的 darkAlgorithm 实现）。
- 网络：Node 下载镜像（默认官方地址，预设 `https://npmmirror.com/mirrors/node`）；npm registry（预设 npmmirror）；HTTP/HTTPS 代理和 no_proxy；二进制镜像环境变量列表（可编辑，提供"国内预设"一键填充）；"测试连接"按钮。
- 代理同时作用于主进程下载、npm、`session.setProxy`（自动更新也会走代理）。
- 运行：历史保留条数、默认 Node 版本。

## 自动更新
- electron-updater 使用 GitHub provider，启动后检查更新，也可以在设置页手动检查，下载完成后提示重启。
- macOS 需要签名才能自动更新：CI 预留 `CSC_LINK`/`APPLE_ID` 等 secrets，未配置时 mac 版只发布、不保证自动更新可用。

## 工程与 GitHub 配置
- `eslint.config.mjs`：`antfu({ react: true, typescript: true, ignores: ['out','dist','resources/types'] })`。
- `.vscode/settings.json`：关闭 prettier，`source.fixAll.eslint`，使用 antfu 推荐的配置；`.vscode/extensions.json`。
- `.editorconfig`、`.gitignore`、`.npmrc`（`shamefully-hoist` 不需要；为 electron 配置 `node-linker=hoisted`，以兼容 electron-builder 打包 node-pty）。
- `package.json` 脚本：`dev`、`build`、`typecheck`、`lint`、`lint:fix`、`build:win|mac|linux`、`postinstall: electron-builder install-app-deps`（重编译 node-pty）。
- `electron-builder.yml`：win 输出 nsis，mac 输出 dmg 和 zip（x64+arm64），linux 输出 AppImage 和 deb；`asarUnpack` 包含 node-pty 和 esbuild 的原生二进制；`extraResources` 放 `resources/types`；publish 配置为 github。
- `.github/workflows/release.yml`：推送 `v*` tag 时触发，在 windows/macos/ubuntu 三个平台矩阵里依次执行 pnpm install、lint、typecheck、build，再用 `electron-builder --publish always` 发布到 GitHub Releases（Release 为草稿）。
- `.github/ISSUE_TEMPLATE/`（bug_report.yml、feature_request.yml）、`PULL_REQUEST_TEMPLATE.md`、`dependabot.yml`（npm 和 github-actions，按周检查）、`LICENSE`（MIT）、`README.md`（中文）+ `README.en.md`。

## 实施顺序
1. 脚手架：electron-vite React TS、ESLint、git hooks、目录结构、shared 类型和 IPC 定义、带类型的 preload。
2. 设置服务和网络层（代理、镜像），以及设置页和 i18n、主题。
3. Node 运行时管理：列表、下载、校验、解压，以及运行时页面。
4. 运行空间：增删改查、脚本导入和新建、空间页面。
5. 依赖：npm 安装/卸载/更新、缺失依赖扫描、依赖面板。
6. 运行器：esbuild 转译、node-pty、xterm 终端、运行配置、历史记录。
7. 编辑器：Monaco 本地化加载、Node 类型和依赖类型注入。
8. 自动更新、electron-builder 配置、GitHub workflow 和仓库规范文件、README。
9. 验证：`pnpm lint`、`pnpm typecheck`、`pnpm build` 通过；在 Linux 本地 dev 下手动跑通"下载 Node、新建空间、装 lodash、运行 TS 脚本并交互输入"整个流程。

## 测试计划
- 在 `src/main/services` 里给纯逻辑加 vitest 单测：包名归一化和缺失依赖识别、代理/镜像到环境变量的映射、Node 下载文件名按平台拼接、SHASUMS 解析、重名处理。
- CI 的 release workflow 中执行 lint、typecheck 和 vitest。

## 假设
- GitHub 仓库的 owner/repo 暂时不写死：electron-builder 在 Actions 里会从 `GITHUB_REPOSITORY` 推断，README 里先用 `<owner>/script-box` 占位，等你告诉我实际地址再替换。
- 暂不做代码签名，只预留 secrets 位置。
- 依赖去重靠共享 npm 缓存（不重复下载，但每个空间的 node_modules 仍各自占一份磁盘），不引入 pnpm 的硬链接 store，以保证各个 Node 版本下的兼容性。
- 多语言架构预留：运行器按扩展名路由到 `runners/<lang>`，第一版只实现 node。
