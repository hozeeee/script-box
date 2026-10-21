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

## 脚本中心（独立子项目）

[`script-hub/`](./script-hub/) 是常用脚本的静态下载中心，与 Electron 应用的依赖、类型检查、构建和产物完全独立。页面包含 Script Box 介绍、脚本说明、启动参数、命令行示例和下载入口，不需要后端，也不会在浏览器中执行这些 Node.js 脚本。

首批包含 JSON 格式化、文件哈希校验、HTTP 可用性检查。每个脚本用 TypeScript 编写，由 esbuild 将本地模块和 npm 依赖打包成一个 `.js` 文件；下载后只需要 Node.js >= 22，无需安装 npm 依赖，也可导入 Script Box 的普通运行空间。

### 独立构建和预览

在仓库根目录执行，无需先安装主项目依赖：

```bash
pnpm --dir script-hub install --frozen-lockfile
pnpm --dir script-hub lint
pnpm --dir script-hub build
pnpm --dir script-hub test       # 包含类型检查、构建与产物测试
pnpm --dir script-hub preview    # http://127.0.0.1:4173
```

构建输出到 `script-hub/dist/`，将这个目录整体上传到任意静态网站服务即可；所有下载链接都是相对路径，适用于 GitHub Pages 的仓库子路径。也可以直接打开生成的 `index.html` 查看页面。`preview` 只用于本地预览，不是生产服务器。

```text
script-hub/
  scripts/<id>/index.ts       每个脚本项目的入口，可以包含更多本地 TS 模块
  scripts/<id>/script.json    脚本介绍、参数定义、默认值和示例
  shared/cli.ts               共用的参数解析、--help 和错误处理
  web/index.html             独立静态页面模板
  site.json                  网站标题、主项目介绍和可选链接
  tools/                     脚本发现、打包、网页生成和预览
  tests/                     产物、脚本行为与元数据验证测试
  package.json               子项目专属依赖和命令
  pnpm-lock.yaml             子项目独立锁文件
  dist/index.html            生成的下载页面
  dist/scripts/<id>.js       可独立下载的单文件脚本
  dist/catalog.json          含文件大小、下载路径和 SHA-256 的脚本目录
  dist/SHA256SUMS.txt         下载校验清单
```

下载后的运行示例：

```bash
node json-format.js "/absolute/path/data.json" --indent 4
node file-hash.js "/absolute/path/archive.zip" --algorithm sha256
node http-probe.js "https://example.com" --headers
```

在 Script Box 的运行配置中只填写文件路径、选项等启动参数，不要填写 `node` 或脚本文件名。相对路径以运行时工作目录为准，建议使用绝对路径。产物是 CommonJS：如果放入声明了 `"type": "module"` 的工程，请将后缀改为 `.cjs`。

### 添加脚本

1. 在 `script-hub/scripts/` 下新增目录（例如 `my-tool`），目录名和 `script.json` 的 `id` 必须一致，使用小写字母、数字和连字符。
2. 添加 `index.ts` 和 `script.json`，参考现有脚本。元数据包含 `title`、`description`、`category`、`usage`、`options`、`examples`；选项支持 `string` / `boolean` 类型、可选的 `short` 和同类型的 `default`。`--help` / `-h` 由共用 CLI 提供，无需重复声明。
3. 入口调用 `runCli(manifest, async ({ values, positionals }) => { ... })`，选项定义同时用于网页和 `--help`，避免重复维护。若需要第三方依赖，在子项目中用 `pnpm --dir script-hub add <包名>` 显式添加；不支持需要附带原生二进制或资源文件的依赖。
4. 补充测试并运行 `pnpm --dir script-hub lint` 和 `pnpm --dir script-hub test`。构建会自动发现所有脚本目录，无需维护注册表或手动改 HTML。

### GitHub Actions

[Script Hub 工作流](./.github/workflows/script-hub.yml) 在相关路径的 push / PR 和手动触发时独立安装子项目依赖、检查代码、构建、测试，并上传 `script-hub-site` artifact（保留 14 天），内容就是完整的 `script-hub/dist/`。当前不部署 GitHub Pages，后续配置 Website 时可直接使用此目录作为发布内容。

网站的主项目介绍在 `script-hub/site.json` 中独立维护，不读取主应用源码或配置。仓库地址可填写 `repositoryUrl`，安装包地址可填写 `releasesUrl`；留空时 GitHub Actions 会从 `GITHUB_REPOSITORY` 自动生成 GitHub 仓库和 Releases 链接，本地构建未配置时不显示链接。

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
