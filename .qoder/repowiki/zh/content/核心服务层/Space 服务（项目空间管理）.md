# Space 服务（项目空间管理）

<cite>
**本文引用的文件**   
- [src/main/services/space/service.ts](file://src/main/services/space/service.ts)
- [src/main/services/space/project.ts](file://src/main/services/space/project.ts)
- [src/main/services/space/templates.ts](file://src/main/services/space/templates.ts)
- [src/main/ipc/space.ts](file://src/main/ipc/space.ts)
- [src/main/paths.ts](file://src/main/paths.ts)
- [src/shared/types/space.ts](file://src/shared/types/space.ts)
- [src/main/services/script/service.ts](file://src/main/services/script/service.ts)
- [src/main/services/script/project-files.ts](file://src/main/services/script/project-files.ts)
- [src/main/services/script/templates.ts](file://src/main/services/script/templates.ts)
- [src/main/services/runner/service.ts](file://src/main/services/runner/service.ts)
</cite>

## 更新摘要
**变更内容**   
- 新增项目检测与识别功能，支持自动识别包管理器和 Node.js 版本
- 增强空间管理，支持导入现有项目作为空间
- 扩展项目信息读取能力，包括脚本扫描和依赖分析
- 新增包管理器自动检测逻辑，支持 npm、pnpm、yarn、bun

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [项目检测与识别系统](#项目检测与识别系统)
7. [依赖关系分析](#依赖关系分析)
8. [性能与并发特性](#性能与并发特性)
9. [配置与数据模型](#配置与数据模型)
10. [路径解析与数据隔离](#路径解析与数据隔离)
11. [模板系统与初始化流程](#模板系统与初始化流程)
12. [版本兼容性与扩展指南](#版本兼容性与扩展指南)
13. [故障排查](#故障排查)
14. [结论](#结论)

## 简介
Space 服务负责"项目空间"的完整生命周期管理，包括空间的创建、读取、更新、删除，以及脚本与运行环境的关联。它通过 IPC 层暴露给渲染进程，使用文件系统持久化空间元数据、包配置和脚本内容，并通过 runner 与 deps 服务协调运行期资源占用，确保删除操作不会破坏正在运行的任务或依赖安装过程。

**更新** 新增了强大的项目检测能力，能够自动识别现有项目、检测包管理器类型、解析 Node.js 版本要求，并支持将现有项目直接导入为空间进行管理。

## 项目结构
Space 相关代码主要分布在以下位置：
- 主进程服务：`src/main/services/space`
- 项目检测模块：`src/main/services/space/project.ts`
- IPC 接口注册：`src/main/ipc/space.ts`
- 路径与 ID 校验：`src/main/paths.ts`
- 共享类型定义：`src/shared/types/space.ts`
- 脚本管理与模板：`src/main/services/script`
- 运行器与环境构建：`src/main/services/runner`

```mermaid
graph TB
subgraph "主进程"
A["IPC: space.ts"]
B["服务: space/service.ts"]
C["项目检测: space/project.ts"]
D["路径: paths.ts"]
E["脚本服务: script/service.ts"]
F["运行器: runner/service.ts"]
end
subgraph "共享类型"
T["types/space.ts"]
end
A --> B
B --> C
B --> D
B --> E
B --> F
A --> F
E --> D
F --> D
B -.-> T
E -.-> T
F -.-> T
C -.-> T
```

**图表来源**
- [src/main/ipc/space.ts:9-58](file://src/main/ipc/space.ts#L9-L58)
- [src/main/services/space/service.ts:10-181](file://src/main/services/space/service.ts#L10-L181)
- [src/main/services/space/project.ts:1-152](file://src/main/services/space/project.ts#L1-L152)
- [src/main/paths.ts:7-56](file://src/main/paths.ts#L7-L56)
- [src/main/services/script/service.ts:16-228](file://src/main/services/script/service.ts#L16-L228)
- [src/main/services/runner/service.ts:29-146](file://src/main/services/runner/service.ts#L29-L146)
- [src/shared/types/space.ts:1-100](file://src/shared/types/space.ts#L1-L100)

**章节来源**
- [src/main/ipc/space.ts:9-58](file://src/main/ipc/space.ts#L9-L58)
- [src/main/services/space/service.ts:10-181](file://src/main/services/space/service.ts#L10-L181)
- [src/main/services/space/project.ts:1-152](file://src/main/services/space/project.ts#L1-L152)
- [src/main/paths.ts:7-56](file://src/main/paths.ts#L7-L56)
- [src/shared/types/space.ts:1-100](file://src/shared/types/space.ts#L1-L100)

## 核心组件
- SpaceService：提供空间 CRUD、并发安全的元数据更新、以及与历史目录和脚本目录的联动清理，新增项目导入功能。
- ProjectDetector：项目检测模块，负责包管理器识别、Node.js 版本解析、项目信息扫描。
- ScriptService：管理空间内脚本文件的增删改查、导入、重命名、运行配置保存，支持项目空间模式。
- RunnerService：启动脚本进程、维护运行记录、写入历史、并感知空间是否仍有活跃任务。
- IPC 层：将前端调用映射到后端服务方法，并在删除前检查运行器和依赖服务的占用状态，新增项目信息查询接口。
- Path 模块：统一空间根目录、脚本目录、构建目录、历史目录等路径生成，并对 ID 进行安全校验。
- 模板模块：提供默认 .npmrc 与欢迎脚本；脚本模板根据语言自动选择 JS 或 TS 模板。

**章节来源**
- [src/main/services/space/service.ts:10-181](file://src/main/services/space/service.ts#L10-L181)
- [src/main/services/space/project.ts:1-152](file://src/main/services/space/project.ts#L1-L152)
- [src/main/services/script/service.ts:16-228](file://src/main/services/script/service.ts#L16-L228)
- [src/main/services/runner/service.ts:29-146](file://src/main/services/runner/service.ts#L29-L146)
- [src/main/ipc/space.ts:9-58](file://src/main/ipc/space.ts#L9-L58)
- [src/main/paths.ts:7-56](file://src/main/paths.ts#L7-L56)
- [src/main/services/space/templates.ts:1-18](file://src/main/services/space/templates.ts#L1-L18)
- [src/main/services/script/templates.ts:1-15](file://src/main/services/script/templates.ts#L1-L15)

## 架构总览
Space 服务作为"空间"这一业务实体的核心，向上通过 IPC 暴露 API，向下通过文件系统持久化数据，并与脚本服务和运行器协作完成脚本执行与历史记录。新增的项目检测系统使得 Space 服务能够智能识别和管理现有的 JavaScript/TypeScript 项目。

```mermaid
sequenceDiagram
participant UI as "渲染进程"
participant IPC as "IPC : space.ts"
participant Svc as "SpaceService"
participant Proj as "ProjectDetector"
participant Run as "RunnerService"
participant Deps as "DepsService"
participant FS as "文件系统"
UI->>IPC : "space : importProject(path)"
IPC->>Svc : "importProject(input)"
Svc->>Proj : "normalizeProjectPath(path)"
Proj->>FS : "验证项目目录存在"
Proj->>FS : "检查 package.json"
Svc->>FS : "写入 space.json (仅元数据)"
Svc-->>IPC : "返回 Space (含 projectPath)"
IPC-->>UI : "返回 Space"
UI->>IPC : "space : project-info(id)"
IPC->>Proj : "readProjectInfo(projectPath)"
Proj->>FS : "扫描 package.json, scripts, node version"
Proj-->>IPC : "返回项目信息"
```

**图表来源**
- [src/main/ipc/space.ts:36-48](file://src/main/ipc/space.ts#L36-L48)
- [src/main/services/space/service.ts:85-101](file://src/main/services/space/service.ts#L85-L101)
- [src/main/services/space/project.ts:73-88](file://src/main/services/space/project.ts#L73-L88)

## 详细组件分析

### SpaceService：空间生命周期与并发安全
- 列表：扫描 `paths.spaces`，过滤合法 ID，并行读取每个空间的 `space.json`，按更新时间倒序返回。
- 获取：校验 ID 格式后读取 `space.json`，不存在则抛出未找到错误。
- 创建：生成 UUID 作为 id，创建脚本目录、`package.json`、`.npmrc`、欢迎脚本，最后写入 `space.json`。
- **新增** 导入项目：`importProject` 方法允许将现有项目目录引用为空间，仅写入 `space.json` 元数据，不修改原项目文件。
- 更新：基于 mutate 串行化更新，仅更新传入字段，并刷新 `updatedAt`。
- 删除：先校验存在性，再递归删除空间根目录和历史目录。
- 并发控制：通过 per-space 的 Promise 链保证同一空间的元数据读写串行化，避免竞态。

```mermaid
classDiagram
class SpaceService {
- locks : Map<string, Promise>
+ list() Space[]
+ get(id) Space
+ create(input) Space
+ importProject(input) Space
+ update(id, input) Space
+ remove(id) void
+ mutate(id, fn) Space
}
```

**图表来源**
- [src/main/services/space/service.ts:10-181](file://src/main/services/space/service.ts#L10-L181)

**章节来源**
- [src/main/services/space/service.ts:14-181](file://src/main/services/space/service.ts#L14-L181)

### ProjectDetector：项目检测与识别系统
**新增** 项目检测模块提供完整的 JavaScript/TypeScript 项目识别能力：

- **包管理器检测**：`detectPackageManager` 函数优先检查 `packageManager` 字段，然后回退到锁文件检测（pnpm-lock.yaml、yarn.lock、bun.lock、package-lock.json），默认使用 npm。
- **Node.js 版本解析**：`parseNodeVersionHint` 函数从 `.nvmrc`、`.node-version`、`engines.node` 中解析 Node.js 版本要求，支持语义化版本、范围版本和 LTS 别名。
- **项目信息读取**：`readProjectInfo` 函数收集项目的完整信息，包括包管理器、脚本、Node.js 版本要求、包名、PnP 支持状态。
- **脚本扫描**：`scanProjectScripts` 函数递归扫描项目中的 package.json 文件，收集所有可执行的脚本命令。
- **路径规范化**：`normalizeProjectPath` 确保项目路径的有效性，验证目录存在且包含 package.json。

```mermaid
flowchart TD
Start(["项目检测"]) --> CheckPkg["检查 packageManager 字段"]
CheckPkg --> |找到| UseField["使用声明的包管理器"]
CheckPkg --> |未找到| CheckLocks["检查锁文件"]
CheckLocks --> |pnpm-lock.yaml| UsePnpm["使用 pnpm"]
CheckLocks --> |yarn.lock| UseYarn["使用 yarn"]
CheckLocks --> |bun.lock/bun.lockb| UseBun["使用 bun"]
CheckLocks --> |package-lock.json| UseNpm["使用 npm"]
CheckLocks --> |无锁文件| DefaultNpm["默认 npm"]
UseField --> ReadInfo["读取项目信息"]
UsePnpm --> ReadInfo
UseYarn --> ReadInfo
UseBun --> ReadInfo
UseNpm --> ReadInfo
DefaultNpm --> ReadInfo
ReadInfo --> ScanScripts["扫描脚本"]
ScanScripts --> End(["返回项目信息"])
```

**图表来源**
- [src/main/services/space/project.ts:34-50](file://src/main/services/space/project.ts#L34-L50)
- [src/main/services/space/project.ts:73-88](file://src/main/services/space/project.ts#L73-L88)

**章节来源**
- [src/main/services/space/project.ts:1-152](file://src/main/services/space/project.ts#L1-L152)

### IPC 层：API 映射与删除保护
- 注册 `space:list/get/create/update/remove/open-dir` 等事件处理器。
- **新增** 项目信息查询：`space:project-info` 和 `space:inspect-project` 接口提供项目详细信息和脚本扫描结果。
- 删除前检查 `runnerService.hasActiveInSpace` 与 `depsService.isBusy`，任一为真则拒绝删除并抛出 `SPACE_BUSY`。
- 打开目录时先校验空间存在，再通过 Electron shell 打开空间根目录。

```mermaid
flowchart TD
Start(["收到 space:project-info"]) --> GetSpace["获取空间信息"]
GetSpace --> CheckProject{"是否为项目空间"}
CheckProject --> |否| Error["抛出 INVALID_PROJECT"]
CheckProject --> |是| AssertDir["验证项目目录存在"]
AssertDir --> ReadInfo["读取项目信息"]
ReadInfo --> ScanScripts["扫描项目脚本"]
ScanScripts --> ReturnInfo["返回项目信息"]
```

**图表来源**
- [src/main/ipc/space.ts:36-48](file://src/main/ipc/space.ts#L36-L48)

**章节来源**
- [src/main/ipc/space.ts:9-58](file://src/main/ipc/space.ts#L9-L58)

### ScriptService：脚本与运行配置
- 路径解析：在空间脚本目录下拼接脚本名，并进行名称合法性校验。
- 列表/读取/写入：基于 `spacePaths.scripts` 访问脚本文件。
- 创建：根据文件名推断语言并注入对应模板。
- 导入：将外部脚本复制到空间脚本目录，处理冲突命名与非法字符。
- 重命名/删除：同步更新 `space.scripts` 元数据。
- 运行配置：通过 `saveRunConfig` 将 args/env 保存到 `space.scripts[name].runConfig`。
- **新增** 项目空间支持：当空间引用外部项目时，直接扫描项目文件而非复制。

```mermaid
flowchart TD
CreateScript["创建脚本"] --> ValidateName["校验脚本名"]
ValidateName --> Template["根据语言选择模板"]
Template --> WriteFile["写入 scripts/<name>"]
WriteFile --> ReturnMeta["返回脚本元信息"]
```

**图表来源**
- [src/main/services/script/service.ts:49-58](file://src/main/services/script/service.ts#L49-L58)
- [src/main/services/script/templates.ts:1-15](file://src/main/services/script/templates.ts#L1-L15)

**章节来源**
- [src/main/services/script/service.ts:16-228](file://src/main/services/script/service.ts#L16-L228)
- [src/main/services/script/templates.ts:1-15](file://src/main/services/script/templates.ts#L1-L15)

### RunnerService：运行环境与进程管理
- 启动：加载空间与脚本，解析运行参数，准备语言运行时，构建环境变量，设置工作目录为空间根目录。
- 输出与历史：通过 pty 捕获输出，写入历史存储，结束时更新记录状态并持久化。
- 停止：跨平台终止进程，必要时强制 kill。

```mermaid
sequenceDiagram
participant R as "RunnerService"
participant S as "SpaceService"
participant SC as "ScriptService"
participant L as "LanguageRunner"
participant H as "HistoryStore"
R->>S : "get(spaceId)"
R->>SC : "resolvePath(spaceId, script)"
R->>L : "prepare({space, script, source, args})"
R->>H : "begin(record)"
R->>R : "spawn(process, cwd=space root)"
R-->>R : "onData/onExit"
R->>H : "finish(record)"
```

**图表来源**
- [src/main/services/runner/service.ts:44-88](file://src/main/services/runner/service.ts#L44-L88)
- [src/main/services/runner/service.ts:127-142](file://src/main/services/runner/service.ts#L127-L142)

**章节来源**
- [src/main/services/runner/service.ts:29-146](file://src/main/services/runner/service.ts#L29-L146)

## 项目检测与识别系统

### 包管理器自动检测
系统支持多种包管理器的自动识别，优先级如下：

1. **packageManager 字段**：优先使用 package.json 中的 `packageManager` 字段
2. **锁文件检测**：按顺序检查 pnpm-lock.yaml、yarn.lock、bun.lock/bun.lockb、package-lock.json
3. **默认回退**：如果以上都未检测到，默认使用 npm

支持的包管理器包括：npm、pnpm、yarn、bun。

### Node.js 版本解析
系统能够从多个来源解析 Node.js 版本要求：

1. **.nvmrc 文件**：最高优先级，支持精确版本如 `v22.11.0`
2. **.node-version 文件**：次高优先级，支持简化版本如 `22`
3. **engines.node 字段**：最低优先级，支持语义化版本范围如 `>=18`

解析后的版本格式统一为标准形式：精确版本保持 `v22.11.0`，主版本号提取为 `22`，不支持的版本返回 null。

### 项目信息扫描
项目信息扫描功能收集以下关键信息：

- **脚本集合**：从所有 package.json 文件中提取可执行脚本
- **包管理器类型**：自动检测使用的包管理器
- **Node.js 版本要求**：从配置文件中提取版本要求
- **包名称**：用于预填充导入对话框
- **PnP 支持**：检测 Yarn Plug'n'Play 项目
- **脚本截断标志**：指示脚本列表是否因大小限制而被截断

**章节来源**
- [src/main/services/space/project.ts:17-50](file://src/main/services/space/project.ts#L17-L50)
- [src/main/services/space/project.ts:52-62](file://src/main/services/space/project.ts#L52-L62)
- [src/main/services/space/project.ts:73-88](file://src/main/services/space/project.ts#L73-L88)

## 依赖关系分析
- SpaceService 依赖：
  - 路径模块：`paths`、`spacePaths`、`historyPaths`、`ID_PATTERN`
  - 文件系统工具：`ensureDir`、`exists`、`readJson`、`writeJson`
  - 模板常量：`SPACE_NPMRC`、`WELCOME_SCRIPT`、`WELCOME_SCRIPT_NAME`
  - **新增** 项目检测：`normalizeProjectPath`、`projectExists`
- ProjectDetector 依赖：
  - 文件系统工具：`readFile`、`realpath`、`stat`
  - 路径工具：`dirname`、`isAbsolute`、`join`
  - 脚本工具：`resolveProjectDirectory`、`walkProject`
  - 类型定义：`PackageManager`、`ProjectInfo`、`ProjectScriptGroup`
- IPC 层依赖：
  - SpaceService、RunnerService、DepsService、Electron shell
  - **新增** 项目检测工具：`readProjectInfo`、`scanProjectScripts`
- ScriptService 依赖：
  - SpaceService、path、fs、naming、templates
  - **新增** 项目检测：`assertProjectDir`、`resolveProjectScript`
- RunnerService 依赖：
  - SpaceService、ScriptService、RuntimeEnv、Settings、HistoryStore、LanguageRunner

```mermaid
graph LR
Paths["paths.ts"] --> Space["space/service.ts"]
Templates["space/templates.ts"] --> Space
Project["space/project.ts"] --> Space
Space --> IPC["ipc/space.ts"]
Script["script/service.ts"] --> Space
Runner["runner/service.ts"] --> Space
Runner --> Script
IPC --> Runner
IPC --> Project
Project --> ScriptFiles["script/project-files.ts"]
Project --> Walk["script/walk.ts"]
```

**图表来源**
- [src/main/paths.ts:7-56](file://src/main/paths.ts#L7-L56)
- [src/main/services/space/service.ts:1-181](file://src/main/services/space/service.ts#L1-L181)
- [src/main/services/space/project.ts:1-152](file://src/main/services/space/project.ts#L1-L152)
- [src/main/services/space/templates.ts:1-18](file://src/main/services/space/templates.ts#L1-L18)
- [src/main/ipc/space.ts:1-58](file://src/main/ipc/space.ts#L1-L58)
- [src/main/services/script/service.ts:1-228](file://src/main/services/script/service.ts#L1-L228)
- [src/main/services/runner/service.ts:1-146](file://src/main/services/runner/service.ts#L1-L146)

**章节来源**
- [src/main/services/space/service.ts:1-181](file://src/main/services/space/service.ts#L1-L181)
- [src/main/services/space/project.ts:1-152](file://src/main/services/space/project.ts#L1-L152)
- [src/main/ipc/space.ts:1-58](file://src/main/ipc/space.ts#L1-L58)
- [src/main/services/script/service.ts:1-228](file://src/main/services/script/service.ts#L1-L228)
- [src/main/services/runner/service.ts:1-146](file://src/main/services/runner/service.ts#L1-L146)

## 性能与并发特性
- 列表操作：对每个空间元数据并行读取，提升 IO 吞吐。
- 元数据更新：通过 per-space 的 Promise 链串行化，避免并发写覆盖。
- 删除操作：递归删除空间与历史目录，注意大目录场景下的耗时。
- 运行器：pty 输出流式写入历史，避免内存堆积。
- **新增** 项目扫描：使用 `walkProject` 限制最大文件数为 1000，避免大型项目导致的性能问题。
- **新增** 包管理器检测：缓存检测结果，避免重复的文件系统操作。

[本节为通用性能讨论，不直接分析具体文件]

## 配置与数据模型
- 空间元数据 `Space`：包含 id、name、description、nodeVersion、createdAt、updatedAt、scripts，**新增** projectPath 和 projectMissing 字段。
- 脚本元数据 `ScriptMeta`：包含 `runConfig`，即命令行参数与环境变量。
- 运行配置 `RunConfig`：args 为原始参数字符串，env 为键值对数组。
- **新增** 项目信息 `ProjectInfo`：包含脚本组、包管理器、Node.js 版本提示、包名、截断标志、PnP 支持状态。
- **新增** 包管理器类型 `PackageManager`：支持 'npm' | 'pnpm' | 'yarn' | 'bun'。

```mermaid
erDiagram
SPACE {
string id PK
string name
string description
string nodeVersion
number createdAt
number updatedAt
json scripts
string projectPath
boolean projectMissing
}
SCRIPT_META {
string run_args
json run_env
}
PROJECT_INFO {
json script_groups
boolean scripts_truncated
string package_manager
json scripts
string node_version_hint
string package_name
boolean truncated
boolean pnp
}
SPACE ||--o{ SCRIPT_META : "scripts"
SPACE ||--|| PROJECT_INFO : "references"
```

**图表来源**
- [src/shared/types/space.ts:3-60](file://src/shared/types/space.ts#L3-L60)

**章节来源**
- [src/shared/types/space.ts:1-100](file://src/shared/types/space.ts#L1-L100)

## 路径解析与数据隔离
- 根目录：基于 Electron `app.getPath('userData')` 确定应用数据根。
- 空间目录：`paths.spaces` 下以合法 ID 命名的子目录。
- 关键路径：
  - 元数据：`spacePaths.meta(id)` -> `<spaces>/<id>/space.json`
  - 包配置：`spacePaths.pkg(id)` -> `<spaces>/<id>/package.json`
  - 依赖目录：`spacePaths.nodeModules(id)` -> `<spaces>/<id>/node_modules`
  - 脚本目录：`spacePaths.scripts(id)` -> `<spaces>/<id>/scripts`
  - 构建目录：`spacePaths.build(id)` -> `<spaces>/<id>/.scriptbox/build`
- 历史目录：`historyPaths.dir(spaceId)` -> `<history>/<spaceId>`
- ID 安全：所有 ID 经过 `safeId` 校验，防止路径穿越。
- **新增** 项目路径安全：`claimProjectPath` 确保项目不在 spaces 目录内，防止意外删除。

```mermaid
flowchart TD
Root["应用数据根"] --> Spaces["spaces"]
Spaces --> SpaceDir["<id>"]
SpaceDir --> Meta["space.json"]
SpaceDir --> Pkg["package.json"]
SpaceDir --> Scripts["scripts"]
SpaceDir --> Build[".scriptbox/build"]
History["history"] --> HistDir["<spaceId>"]
External["外部项目"] --> ProjectDir["<projectPath>"]
ProjectDir --> Pkg["package.json"]
ProjectDir --> Scripts["项目脚本"]
```

**图表来源**
- [src/main/paths.ts:7-56](file://src/main/paths.ts#L7-L56)
- [src/main/services/space/service.ts:165-177](file://src/main/services/space/service.ts#L165-L177)

**章节来源**
- [src/main/paths.ts:7-56](file://src/main/paths.ts#L7-L56)
- [src/main/services/space/service.ts:165-177](file://src/main/services/space/service.ts#L165-L177)

## 模板系统与初始化流程
- 空间模板：
  - `.npmrc`：禁用 fund/audit/update-notifier，启用 package-lock。
  - 欢迎脚本：`hello.ts`，演示 readline 交互与 Node 版本输出。
- 脚本模板：
  - JS 模板：简单 console 示例。
  - TS 模板：带 process.argv 的示例。
- 初始化流程（创建空间）：
  1. 生成 id 与时间戳。
  2. 创建脚本目录。
  3. 写入 `package.json`（私有包、空依赖）。
  4. 写入 `.npmrc`。
  5. 写入欢迎脚本。
  6. 写入 `space.json`。
- **新增** 项目导入流程：
  1. 验证项目路径有效性。
  2. 检查项目是否在 spaces 目录外。
  3. 确保项目未被其他空间引用。
  4. 仅写入 `space.json` 元数据。

```mermaid
flowchart TD
Start(["创建空间"]) --> GenId["生成 UUID 与时间戳"]
GenId --> MakeScripts["创建 scripts 目录"]
MakeScripts --> WritePkg["写入 package.json"]
WritePkg --> WriteNpmrc["写入 .npmrc"]
WriteNpmrc --> WriteWelcome["写入 hello.ts"]
WriteWelcome --> WriteMeta["写入 space.json"]
WriteMeta --> End(["返回 Space"])
ImportStart(["导入项目"]) --> ValidatePath["验证项目路径"]
ValidatePath --> CheckLocation["检查项目位置"]
CheckLocation --> CheckUnique["检查唯一性"]
CheckUnique --> WriteMetaOnly["仅写入 space.json"]
WriteMetaOnly --> ImportEnd(["返回 Space"])
```

**图表来源**
- [src/main/services/space/service.ts:33-55](file://src/main/services/space/service.ts#L33-L55)
- [src/main/services/space/service.ts:85-101](file://src/main/services/space/service.ts#L85-L101)
- [src/main/services/space/templates.ts:1-18](file://src/main/services/space/templates.ts#L1-L18)
- [src/main/services/script/templates.ts:1-15](file://src/main/services/script/templates.ts#L1-L15)

**章节来源**
- [src/main/services/space/service.ts:33-55](file://src/main/services/space/service.ts#L33-L55)
- [src/main/services/space/service.ts:85-101](file://src/main/services/space/service.ts#L85-L101)
- [src/main/services/space/templates.ts:1-18](file://src/main/services/space/templates.ts#L1-L18)
- [src/main/services/script/templates.ts:1-15](file://src/main/services/script/templates.ts#L1-L15)

## 版本兼容性与扩展指南
- 兼容性要点：
  - ID 格式限制：仅允许字母、数字、下划线与连字符，长度 1-64。
  - 元数据结构：新增字段需考虑旧版本空间迁移策略（当前实现未显式做迁移逻辑）。
  - 脚本模板：JS/TS 模板由语言推断，可扩展更多语言模板。
  - **新增** 项目路径安全：项目不能位于 spaces 目录内，避免意外删除。
  - **新增** 包管理器支持：支持 npm、pnpm、yarn、bun 的自动检测。
- 自定义空间模板：
  - 修改欢迎脚本与 `.npmrc`：在 `space/templates.ts` 中替换常量。
  - 扩展脚本模板：在 `script/templates.ts` 中添加新语言模板，并在命名规则中支持相应后缀。
- 扩展现有空间管理功能：
  - 新增空间属性：在 `SpaceInput` 与 `Space` 类型中扩展字段，并在 `update/mutate` 中处理。
  - 增加空间级配置：可在空间根目录新增配置文件（如 `config.json`），并在 Service 中提供读写方法。
  - 扩展删除保护：在 IPC 层增加更多占用检查（例如打包任务、缓存清理等）。
- **新增** 项目检测扩展：
  - 添加新的包管理器支持：在 `LOCKFILES` 数组中添加新的锁文件映射。
  - 扩展 Node.js 版本解析：在 `parseNodeVersionHint` 中添加新的版本格式支持。
  - 自定义项目信息扫描：重写 `readProjectInfo` 函数以支持额外的项目配置。

[本节为概念性指导，不直接分析具体文件]

## 故障排查
- 常见错误：
  - `SPACE_NOT_FOUND`：空间不存在或 ID 不合法。
  - `SCRIPT_NOT_FOUND`：脚本不存在。
  - `SCRIPT_EXISTS`：脚本已存在。
  - `INVALID_SCRIPT_NAME`：脚本名不符合规范。
  - `UNSUPPORTED_SCRIPT`：导入的文件不被识别为脚本。
  - `SPACE_BUSY`：空间仍有活跃运行或依赖安装中，无法删除。
  - **新增** `PROJECT_NOT_FOUND`：项目目录不存在或无效。
  - **新增** `INVALID_PROJECT`：项目路径无效或位于 spaces 目录内。
  - **新增** `PROJECT_ALREADY_IMPORTED`：项目已被其他空间引用。
- 定位建议：
  - 检查 `paths.spaces` 与 `paths.history` 是否存在对应目录。
  - 确认 `space.json` 与 `package.json` 是否被正确写入。
  - 查看运行器日志与历史存储，确认进程是否正常结束。
  - **新增** 验证项目路径的有效性和唯一性。
  - **新增** 检查包管理器检测是否正确识别了项目使用的工具。

**章节来源**
- [src/main/services/space/service.ts:26-30](file://src/main/services/space/service.ts#L26-L30)
- [src/main/services/script/service.ts:38-42](file://src/main/services/script/service.ts#L38-L42)
- [src/main/services/script/service.ts:49-57](file://src/main/services/script/service.ts#L49-L57)
- [src/main/services/script/service.ts:61-75](file://src/main/services/script/service.ts#L61-L75)
- [src/main/ipc/space.ts:15-19](file://src/main/ipc/space.ts#L15-L19)
- [src/main/services/space/project.ts:132-147](file://src/main/services/space/project.ts#L132-L147)

## 结论
Space 服务以清晰的职责边界与稳健的路径/ID 校验机制，提供了可靠的空间管理能力。通过 IPC 层与 Runner/Deps 服务的协作，确保了删除操作的原子性与安全性。新增的项目检测系统显著增强了服务的智能化水平，能够自动识别和管理现有的 JavaScript/TypeScript 项目，支持多种包管理器和 Node.js 版本的自动检测。模板系统简化了空间初始化与脚本开发体验。未来可通过扩展模板、增强迁移策略、增加更多包管理器支持和优化项目扫描性能来进一步提升系统的可维护性与健壮性。