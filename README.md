# Script Box

[English](./README.en.md) | 简体中文

开箱即用的脚本运行器：选中脚本就能运行，不需要在电脑上预先安装 Node.js。

## 功能

- **免安装运行时**：在应用内下载 Node.js（可同时装多个版本），下载后会用 `SHASUMS256.txt` 校验；每个运行空间可以单独指定版本。
- **运行空间**：每个空间有自己的 `package.json` 和 `node_modules`，依赖互不影响。
- **依赖管理**：
  - 按 `包名@版本` 安装、卸载或更新依赖；
  - 会扫描脚本里的 `import` 和 `require`，找出缺失的依赖，可以一键安装；
  - 所有空间共用一个 npm 缓存，同名同版本的包只下载一次，除非手动点"更新"。
- **直接运行 JS/TS**：支持 `.js/.mjs/.cjs/.ts/.mts/.cts`。TS 用 esbuild 转译，不做类型检查。
- **交互式终端**：
  - 基于 node-pty 和 xterm.js，输出实时显示，也能通过 stdin 交互输入；
  - 可以随时停止；
  - 支持命令行参数和环境变量，多个脚本可以同时运行。
- **运行历史**：记录退出码、耗时和完整日志，可以回看。
- **内置编辑器**：
  - 基于 Monaco，资源全部本地加载，不依赖 CDN；
  - 内置 Node.js 类型，离线也有智能提示，已安装依赖的类型定义会自动注入；
  - `Ctrl/Cmd+S` 保存，`F5` 运行。
- **网络配置**：
  - 可配置 Node 下载镜像、npm registry、HTTP/HTTPS 代理，以及二进制镜像环境变量（如 `ELECTRON_MIRROR`），并提供一键"国内预设"；
  - 代理同时作用于运行时下载、npm 和自动更新。
- **中英双语**，支持亮色、暗色和跟随系统三种主题。
- **自动更新**：从 GitHub Releases 获取新版本。

## 下载

到 [Releases](https://github.com/<owner>/script-box/releases) 下载对应平台的安装包：

| 平台 | 文件 |
| --- | --- |
| Windows | `script-box-x.y.z-setup.exe` |
| macOS | `script-box-x.y.z-arm64.dmg` / `script-box-x.y.z-x64.dmg` |
| Linux | `script-box-x.y.z-x86_64.AppImage` / `script-box-x.y.z-amd64.deb` |

> macOS 安装包目前没有签名。首次打开时如果提示"已损坏"或"无法验证开发者"，可以在终端执行 `xattr -cr "/Applications/Script Box.app"`。没有签名时，macOS 上的自动更新不保证可用。

## 快速上手

1. 首次启动时，按引导下载一个 LTS 版本的 Node.js。国内网络建议打开"使用国内镜像"。
2. 新建一个运行空间，选择要使用的 Node 版本。
3. 导入脚本（支持拖拽），或者直接新建一个脚本。
4. 编辑器上方如果提示缺少依赖，点"一键安装"即可；也可以在"依赖"面板里手动安装，例如 `lodash@4`。
5. 按 `F5` 或点"运行"。脚本输出显示在下方终端里，终端可以直接输入。

## 数据目录

所有数据都保存在系统的用户数据目录下，可以在 设置 → 关于 中打开：

```
settings.json          全局设置
runtimes/node/<ver>/   已下载的 Node.js
npm-cache/             共享 npm 缓存
spaces/<id>/           运行空间（space.json、package.json、node_modules、scripts）
history/<spaceId>/     运行历史与日志
```

## 开发

需要 Node.js >= 22 和 pnpm 10。必须使用 pnpm，没有安装的话见[安装 pnpm](#安装-pnpm)。

```bash
pnpm install        # 会自动为 Electron 重新编译 node-pty
pnpm dev            # 开发模式
pnpm lint           # ESLint（@antfu/eslint-config，同时负责格式化）
pnpm typecheck      # TypeScript 类型检查
pnpm test           # vitest 单元测试
pnpm build:linux    # 打包（也可以用 build:win / build:mac）
```

> 国内网络安装 Electron 较慢时，可以先设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 再执行 `pnpm install`。

### 安装 pnpm

本项目只支持 pnpm，不要用 npm 或 yarn 安装依赖，原因如下：

- 依赖版本由 `pnpm-lock.yaml` 锁定，CI 也用 `pnpm install --frozen-lockfile` 安装；
- `package.json` 中的 `pnpm` 字段只有 pnpm 会读取，包括依赖补丁（`patches/`）、原生依赖构建白名单和多架构原生包配置；
- `typecheck`、`build:*` 脚本和 pre-commit 钩子内部都直接调用 `pnpm`。

推荐用 Node.js 自带的 Corepack 启用 pnpm，它会自动使用 `package.json` 中 `packageManager` 字段指定的版本：

```bash
corepack enable
pnpm -v
```

> Node.js 25 起不再自带 Corepack，需要先执行 `npm install -g corepack`。不想用 Corepack 的话，也可以直接执行 `npm install -g pnpm@10`。
>
> 如果之前已经用 npm 装过依赖，先删除 `node_modules` 和 `package-lock.json`，再执行 `pnpm install`。

### 目录结构

```
src/
  shared/      主进程与渲染进程共用的类型、IPC 通道和默认配置
  main/        Electron 主进程：ipc 处理与各领域服务（settings、network、runtime、space、script、deps、runner、updater）
  preload/     通过 contextBridge 暴露带类型的 window.api
  renderer/    React 19 + Ant Design 界面
```

### 发布

推送 `v*` 格式的 tag（例如 `git tag v0.1.0 && git push --tags`）后，GitHub Actions 会在 Windows、macOS、Linux 三个平台上构建，并把安装包上传到一个草稿 Release，确认无误后手动发布即可。

代码签名是可选的，需要时在仓库 Secrets 中配置：

- macOS：`CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`
- Windows：`WIN_CSC_LINK`、`WIN_CSC_KEY_PASSWORD`

## 许可证

[MIT](./LICENSE)
