# CI/CD 流水线

<cite>
**本文引用的文件**   
- [ci.yml](file://.github/workflows/ci.yml)
- [release.yml](file://.github/workflows/release.yml)
- [script-hub.yml](file://.github/workflows/script-hub.yml)
- [electron-builder.yml](file://electron-builder.yml)
- [package.json](file://package.json)
- [script-hub/package.json](file://script-hub/package.json)
</cite>

## 更新摘要
**变更内容**   
- 新增 Script Hub 独立构建工作流，支持脚本中心的自动化构建和 GitHub Pages 部署
- 优化 Release 工作流，集成 Script Hub 的构建和发布流程
- 简化主应用 CI 工作流，专注于代码检查和构建验证
- 完善多项目并行构建架构，提升构建效率和可维护性

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖关系分析](#依赖关系分析)
7. [性能与缓存优化](#性能与缓存优化)
8. [故障排除指南](#故障排除指南)
9. [结论](#结论)
10. [附录：扩展与最佳实践](#附录扩展与最佳实践)

## 简介
本项目采用模块化 GitHub Actions 架构，包含三个独立的工作流：主应用持续集成、Script Hub 独立构建与部署、以及统一的自动化发布流程。CI 在 push 到 main/master 分支或创建 PR 时运行；Script Hub 工作流专门处理脚本中心的构建和 GitHub Pages 部署；Release 在推送 v* 标签或手动触发时执行，按矩阵并行构建 Windows、macOS、Linux 三端产物并上传至 GitHub Releases（草稿）。

## 项目结构
与 CI/CD 直接相关的配置集中在以下位置：
- .github/workflows/ci.yml：主应用持续集成工作流
- .github/workflows/script-hub.yml：Script Hub 独立构建与部署工作流
- .github/workflows/release.yml：统一发布工作流
- electron-builder.yml：Electron 打包与发布配置
- package.json：主应用脚本命令、pnpm 行为与 Git Hooks 配置
- script-hub/package.json：Script Hub 子项目的脚本命令和依赖配置

```mermaid
graph TB
subgraph "GitHub Actions"
CI[".github/workflows/ci.yml<br/>主应用CI"]
SH[".github/workflows/script-hub.yml<br/>Script Hub工作流"]
REL[".github/workflows/release.yml<br/>统一发布"]
end
subgraph "应用构建"
PKG["package.json<br/>主应用scripts / pnpm配置"]
SHPKG["script-hub/package.json<br/>Script Hub scripts"]
EB["electron-builder.yml<br/>打包与发布"]
end
CI --> PKG
SH --> SHPKG
REL --> PKG
REL --> EB
REL --> SHPKG
```

**图表来源**
- [ci.yml:1-26](file://.github/workflows/ci.yml#L1-L26)
- [script-hub.yml:1-78](file://.github/workflows/script-hub.yml#L1-L78)
- [release.yml:1-157](file://.github/workflows/release.yml#L1-L157)
- [electron-builder.yml:1-74](file://electron-builder.yml#L1-L74)
- [package.json:15-30](file://package.json#L15-L30)
- [script-hub/package.json:12-17](file://script-hub/package.json#L12-L17)

**章节来源**
- [ci.yml:1-26](file://.github/workflows/ci.yml#L1-L26)
- [script-hub.yml:1-78](file://.github/workflows/script-hub.yml#L1-L78)
- [release.yml:1-157](file://.github/workflows/release.yml#L1-L157)
- [electron-builder.yml:1-74](file://electron-builder.yml#L1-L74)
- [package.json:15-30](file://package.json#L15-L30)
- [script-hub/package.json:12-17](file://script-hub/package.json#L12-L17)

## 核心组件
- **主应用 CI 工作流**：负责拉取代码、安装依赖、静态检查、类型检查、单元测试与构建。
- **Script Hub 工作流**：独立构建脚本中心网站，包含代码检查、构建测试、静态资源上传和 GitHub Pages 自动部署。
- **统一 Release 工作流**：基于标签触发，按矩阵并行构建三端安装包，同时构建 Script Hub 发布包，并通过 electron-builder 发布为 GitHub Releases 草稿。
- **Electron Builder 配置**：定义产物格式、目标平台、签名与自动更新所需信息，以及将源码中资源与声明文件打包进应用。
- **脚本与工具链**：通过 pnpm 管理依赖，使用 ESLint、TypeScript、Vitest 与 electron-vite/electron-builder 完成检查与构建。

**章节来源**
- [ci.yml:1-26](file://.github/workflows/ci.yml#L1-L26)
- [script-hub.yml:1-78](file://.github/workflows/script-hub.yml#L1-L78)
- [release.yml:1-157](file://.github/workflows/release.yml#L1-L157)
- [electron-builder.yml:1-74](file://electron-builder.yml#L1-L74)
- [package.json:15-30](file://package.json#L15-L30)
- [script-hub/package.json:12-17](file://script-hub/package.json#L12-L17)

## 架构总览
下图展示从代码提交到产物发布的端到端流程，包括三个独立工作流的协作关系。

```mermaid
sequenceDiagram
participant Dev as "开发者"
participant GH as "GitHub"
participant CI as "主应用CI"
participant SH as "Script Hub工作流"
participant REL as "统一Release"
participant EB as "electron-builder"
participant GR as "GitHub Releases"
participant GP as "GitHub Pages"
Dev->>GH : 推送代码/PR
GH-->>CI : 触发主应用CI
GH-->>SH : 触发Script Hub构建
CI->>CI : 安装依赖/ESLint/类型检查/测试/构建
SH->>SH : 构建脚本中心/测试/部署Pages
CI-->>GH : 检查结果
SH-->>GP : 部署到GitHub Pages
Dev->>GH : 推送v*标签
GH-->>REL : 触发统一Release
REL->>REL : 矩阵并行构建(Windows/macOS/Linux)
REL->>EB : 调用electron-builder打包
REL->>SH : 构建Script Hub发布包
EB-->>GR : 上传桌面应用为草稿发布
REL-->>GR : 上传Script Hub发布包
REL-->>GH : 发布结果
```

**图表来源**
- [ci.yml:1-26](file://.github/workflows/ci.yml#L1-L26)
- [script-hub.yml:1-78](file://.github/workflows/script-hub.yml#L1-L78)
- [release.yml:1-157](file://.github/workflows/release.yml#L1-L157)
- [electron-builder.yml:71-74](file://electron-builder.yml#L71-L74)

## 详细组件分析

### 主应用 CI 工作流（持续集成）
- 触发条件：push 到 main/master 分支，或任意 pull_request。
- 权限：仅读取仓库内容。
- 步骤：
  - 检出代码
  - 安装 pnpm
  - 设置 Node.js 22 并启用 pnpm 缓存
  - 冻结依赖安装
  - 执行 lint、typecheck、test、build

```mermaid
flowchart TD
Start(["开始"]) --> Checkout["检出代码"]
Checkout --> SetupPNPM["安装 pnpm"]
SetupPNPM --> SetupNode["设置 Node.js 22 + pnpm 缓存"]
SetupNode --> Install["pnpm install --frozen-lockfile"]
Install --> Lint["pnpm lint"]
Lint --> Typecheck["pnpm typecheck"]
Typecheck --> Test["pnpm test"]
Test --> Build["pnpm build"]
Build --> End(["结束"])
```

**图表来源**
- [ci.yml:1-26](file://.github/workflows/ci.yml#L1-L26)
- [package.json:15-30](file://package.json#L15-L30)

**章节来源**
- [ci.yml:1-26](file://.github/workflows/ci.yml#L1-L26)
- [package.json:15-30](file://package.json#L15-L30)

### Script Hub 独立构建工作流
- 触发条件：对 script-hub/** 路径的 push/pull_request，或 workflow_dispatch 手动触发。
- 权限：仅读取仓库内容。
- 双阶段构建：
  - **build 阶段**：安装依赖、代码检查、构建测试、上传静态网站产物
  - **deploy 阶段**：仅在默认分支且非 PR 时部署到 GitHub Pages
- 特性：
  - 使用独立的 working-directory: script-hub
  - 指定 package_json_file: script-hub/package.json
  - 配置 cache-dependency-path: script-hub/pnpm-lock.yaml
  - 使用 actions/upload-artifact 上传构建产物
  - 集成 GitHub Pages 部署，支持环境 URL 输出

```mermaid
flowchart TD
Start(["Script Hub 构建开始"]) --> Checkout["检出代码"]
Checkout --> SetupPNPM["安装 pnpm (指定script-hub/package.json)"]
SetupPNPM --> SetupNode["设置 Node.js 22 + pnpm 缓存"]
SetupNode --> Install["pnpm install --frozen-lockfile"]
Install --> Lint["pnpm lint"]
Lint --> Test["pnpm test (构建+测试)"]
Test --> Upload["上传静态网站产物"]
Upload --> DeployCheck{"是否部署条件满足?"}
DeployCheck --> |是| Deploy["部署到 GitHub Pages"]
DeployCheck --> |否| End(["结束"])
Deploy --> End
```

**图表来源**
- [script-hub.yml:1-78](file://.github/workflows/script-hub.yml#L1-L78)

**章节来源**
- [script-hub.yml:1-78](file://.github/workflows/script-hub.yml#L1-L78)
- [script-hub/package.json:12-17](file://script-hub/package.json#L12-L17)

### 统一 Release 工作流（自动化发布）
- 触发条件：推送 v* 标签，或 workflow_dispatch 手动触发。
- 权限：写入仓库内容（用于创建/更新发布）。
- 三阶段并行策略：
  - **release 阶段**：fail-fast=false，矩阵包含 windows-latest、macos-latest、ubuntu-latest，分别对应 --win、--mac、--linux
  - **script-hub 阶段**：构建 Script Hub 发布包
  - **publish-script-hub 阶段**：上传 Script Hub 到 Release
  - **publish 阶段**：发布草稿为正式版本
- 步骤：
  - 检出代码、安装 pnpm、设置 Node.js 22 并启用 pnpm 缓存
  - 安装依赖、lint、typecheck、test、build
  - 配置代码签名（可选）
  - 调用 electron-builder 指定平台并 --publish always
  - 注入 secrets：GH_TOKEN、Apple/Windows 签名相关密钥等

```mermaid
sequenceDiagram
participant GH as "GitHub"
participant REL as "统一Release工作流"
participant EB as "electron-builder"
participant SH as "Script Hub构建"
participant GR as "GitHub Releases"
GH->>REL : 推送v*标签或手动触发
REL->>REL : 矩阵并行构建(桌面应用)
REL->>SH : 构建Script Hub发布包
REL->>EB : electron-builder $PLATFORM --publish always
EB->>GR : 上传桌面应用为草稿发布
SH->>GR : 上传Script Hub发布包
REL->>GR : 发布草稿为正式版本
REL-->>GH : 输出构建与发布结果
```

**图表来源**
- [release.yml:1-157](file://.github/workflows/release.yml#L1-L157)
- [electron-builder.yml:71-74](file://electron-builder.yml#L71-L74)

**章节来源**
- [release.yml:1-157](file://.github/workflows/release.yml#L1-L157)
- [electron-builder.yml:71-74](file://electron-builder.yml#L71-L74)

### Electron Builder 打包与发布配置
- 应用标识与输出目录：appId、productName、output=dist。
- 文件过滤：排除开发配置、源码、锁文件等，asarUnpack 原生模块与资源。
- 额外资源：将 @types/node、undici-types 的 d.ts 打入应用以支持离线提示。
- 平台目标：
  - Windows：NSIS 安装包（x64）
  - macOS：DMG 与 ZIP（x64/arm64），开启 hardenedRuntime 与 entitlements
  - Linux：AppImage 与 deb（x64）
- 发布：provider=github，releaseType=draft（草稿发布）。

```mermaid
flowchart TD
A["electron-builder.yml"] --> B["过滤与打包规则"]
A --> C["平台目标: Win/Mac/Linux"]
A --> D["签名与硬编码运行时"]
A --> E["发布到 GitHub Releases(草稿)"]
```

**图表来源**
- [electron-builder.yml:1-74](file://electron-builder.yml#L1-L74)

**章节来源**
- [electron-builder.yml:1-74](file://electron-builder.yml#L1-L74)

### 本地 Git Hooks 与提交前检查
- simple-git-hooks 配置 pre-commit 钩子，执行 lint-staged。
- lint-staged 对暂存文件统一执行 eslint --fix。
- 配合 CI 的 lint/typecheck/test/build，保证提交质量与一致性。

```mermaid
flowchart TD
Commit["git commit"] --> Hook["pre-commit 钩子"]
Hook --> LintStaged["lint-staged"]
LintStaged --> ESLint["eslint --fix"]
ESLint --> Stage["重新暂存修复后的文件"]
```

**图表来源**
- [package.json:84-89](file://package.json#L84-L89)

**章节来源**
- [package.json:84-89](file://package.json#L84-L89)

## 依赖关系分析
- CI/Release 均依赖 Node.js 22 与 pnpm。
- 构建阶段依赖 electron-vite 与 electron-builder。
- 测试依赖 vitest。
- 代码质量依赖 eslint 与 typescript。
- 发布依赖 GH_TOKEN 与可选的 Apple/Windows 签名凭据。
- Script Hub 独立依赖 esbuild 进行脚本打包。

```mermaid
graph LR
CI[".github/workflows/ci.yml"] --> P["package.json scripts"]
SH[".github/workflows/script-hub.yml"] --> SHP["script-hub/package.json"]
REL[".github/workflows/release.yml"] --> P
REL --> EB["electron-builder.yml"]
REL --> SHP
P --> T["vitest"]
P --> TS["typescript"]
P --> ESL["eslint"]
P --> EV["electron-vite"]
P --> EB
SHP --> ES["esbuild"]
```

**图表来源**
- [ci.yml:1-26](file://.github/workflows/ci.yml#L1-L26)
- [script-hub.yml:1-78](file://.github/workflows/script-hub.yml#L1-L78)
- [release.yml:1-157](file://.github/workflows/release.yml#L1-L157)
- [package.json:15-30](file://package.json#L15-L30)
- [script-hub/package.json:19-24](file://script-hub/package.json#L19-L24)
- [electron-builder.yml:1-74](file://electron-builder.yml#L1-L74)

**章节来源**
- [ci.yml:1-26](file://.github/workflows/ci.yml#L1-L26)
- [script-hub.yml:1-78](file://.github/workflows/script-hub.yml#L1-L78)
- [release.yml:1-157](file://.github/workflows/release.yml#L1-L157)
- [package.json:15-30](file://package.json#L15-L30)
- [script-hub/package.json:19-24](file://script-hub/package.json#L19-L24)
- [electron-builder.yml:1-74](file://electron-builder.yml#L1-L74)

## 性能与缓存优化
- pnpm 缓存：在 setup-node 中启用 cache: pnpm，加速依赖安装。
- 冻结依赖：install 使用 --frozen-lockfile，确保可重复构建。
- 并行矩阵：Release 使用 fail-fast=false 的矩阵并行构建，缩短整体耗时。
- 独立缓存：Script Hub 使用独立的 cache-dependency-path: script-hub/pnpm-lock.yaml，避免影响主应用缓存。
- 建议：
  - 若后续引入更多任务（如构建产物校验、签名验证），可拆分为独立 job 并利用 actions/cache 缓存 node_modules 与构建缓存目录。
  - 针对大型依赖（如 electron）可使用更细粒度的缓存键，避免全量重建。
  - 考虑为不同子项目使用不同的缓存键，提高缓存命中率。

**章节来源**
- [ci.yml:16-21](file://.github/workflows/ci.yml#L16-L21)
- [script-hub.yml:29-33](file://.github/workflows/script-hub.yml#L29-L33)
- [release.yml:34-38](file://.github/workflows/release.yml#L34-L38)
- [release.yml:100-104](file://.github/workflows/release.yml#L100-L104)
- [release.yml:16-25](file://.github/workflows/release.yml#L16-L25)

## 故障排除指南
- 依赖安装失败
  - 现象：pnpm install 报错或锁定文件不一致。
  - 排查：确认 Node.js 版本为 22；检查 pnpm-lock.yaml 是否被意外修改；必要时删除 lock 文件后重新生成。
  - 参考：[ci.yml:16-21](file://.github/workflows/ci.yml#L16-L21)、[release.yml:34-38](file://.github/workflows/release.yml#L34-L38)、[script-hub.yml:29-33](file://.github/workflows/script-hub.yml#L29-L33)

- 静态检查或类型检查失败
  - 现象：ESLint 或 TypeScript 报错。
  - 排查：本地先执行 pnpm lint:fix 与 pnpm typecheck；确认编辑器插件与 CI 一致。
  - 参考：[package.json:19-23](file://package.json#L19-L23)、[ci.yml:22-23](file://.github/workflows/ci.yml#L22-L23)

- 单元测试失败
  - 现象：vitest 报告用例失败。
  - 排查：定位失败用例，复现问题；检查环境差异（Node 版本、平台特性）。
  - 参考：[package.json:24](file://package.json#L24)、[ci.yml:24](file://.github/workflows/ci.yml#L24)

- Script Hub 构建失败
  - 现象：Script Hub 工作流构建或测试失败。
  - 排查：检查 script-hub/package.json 中的依赖是否正确；确认 Node.js 版本兼容性；查看构建日志中的具体错误信息。
  - 参考：[script-hub.yml:34-39](file://.github/workflows/script-hub.yml#L34-L39)、[script-hub/package.json:12-17](file://script-hub/package.json#L12-L17)

- 构建失败
  - 现象：electron-vite 构建报错。
  - 排查：清理 dist 与缓存后重试；检查配置文件与依赖版本兼容性。
  - 参考：[package.json:17](file://package.json#L17)、[ci.yml:25](file://.github/workflows/ci.yml#L25)

- 发布失败（签名或权限）
  - 现象：electron-builder 无法上传或签名失败。
  - 排查：
    - 确认已推送 v* 标签且拥有仓库写权限。
    - 检查 secrets 是否配置：GH_TOKEN、CSC_LINK/CSC_KEY_PASSWORD、APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID、WIN_CSC_LINK/WIN_CSC_KEY_PASSWORD。
    - macOS 需开启 hardenedRuntime 与 entitlements，并确保证书有效。
  - 参考：[release.yml:59-79](file://.github/workflows/release.yml#L59-L79)、[electron-builder.yml:44-53](file://electron-builder.yml#L44-L53)、[electron-builder.yml:71-74](file://electron-builder.yml#L71-L74)

- 产物未出现在 GitHub Releases
  - 现象：构建成功但无发布条目。
  - 排查：确认 publish.provider=github 且 releaseType=draft；检查 GH_TOKEN 权限；查看构建日志中的上传步骤。
  - 参考：[electron-builder.yml:71-74](file://electron-builder.yml#L71-L74)、[release.yml:81-84](file://.github/workflows/release.yml#L81-L84)

- GitHub Pages 部署失败
  - 现象：Script Hub 构建成功但 Pages 部署失败。
  - 排查：检查 repository settings 中 GitHub Pages 是否启用；确认 workflow 有 pages: write 权限；查看部署日志中的错误信息。
  - 参考：[script-hub.yml:48-77](file://.github/workflows/script-hub.yml#L48-L77)

**章节来源**
- [ci.yml:16-25](file://.github/workflows/ci.yml#L16-L25)
- [script-hub.yml:34-77](file://.github/workflows/script-hub.yml#L34-L77)
- [release.yml:59-84](file://.github/workflows/release.yml#L59-L84)
- [electron-builder.yml:44-53](file://electron-builder.yml#L44-L53)
- [electron-builder.yml:71-74](file://electron-builder.yml#L71-L74)
- [package.json:17-24](file://package.json#L17-L24)
- [script-hub/package.json:12-17](file://script-hub/package.json#L12-L17)

## 结论
本项目通过模块化的 GitHub Actions 架构实现了从代码检查到多平台构建与发布的完整闭环。主应用 CI 保障代码质量与稳定性，Script Hub 独立工作流提供专门的脚本中心构建与部署能力，统一 Release 工作流借助矩阵并行与 electron-builder 实现跨平台分发。结合 pnpm 缓存与冻结依赖，构建过程具备高可重复性与良好性能。新的架构设计提升了可维护性和扩展性，便于未来添加更多子项目和工作流。

## 附录：扩展与最佳实践
- 自定义工作流扩展
  - 新增任务：可在 ci.yml 中添加新的 job，复用已有的 checkout/setup-node/pnpm 步骤。
  - 独立子项目：参考 script-hub.yml 的结构，为新子项目创建独立的工作流文件。
  - 缓存策略：使用 actions/cache 缓存 node_modules、构建产物或 esbuild 缓存目录，提升速度。
  - 并发控制：利用 strategy.matrix 与 concurrency 控制并行度与队列。
- 失败重试机制
  - 当前未显式配置重试；如需重试，可在关键步骤添加 continue-on-error 并结合条件判断进行二次尝试，或在作业级别使用第三方重试 action。
- 安全与权限最小化
  - 保持 permissions 最小可用；仅在 Release 授予 contents: write。
  - 敏感凭据统一放入 GitHub Secrets，避免泄露。
- 发布说明与版本标签
  - 建议在推送 v* 标签前维护 CHANGELOG.md，并在 Release 步骤中自动生成或附加发布说明。
  - 可将 draft 发布改为自动发布，或增加人工审核环节。
- 多项目协调
  - 使用 artifact 在不同工作流间共享构建产物。
  - 通过 needs 关键字建立工作流间的依赖关系。
  - 为不同子项目使用独立的缓存键，提高缓存效率。