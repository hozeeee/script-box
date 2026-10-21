# 导入外部 JS 工程（原地引用）

## 核心原则
- **元数据与工作目录分离**：`spacePaths.root(id)`（`userData/spaces/<id>`）永远是元数据目录，删除 Space 时只删这里，**绝不触碰工程目录**。
- ScriptBox 不向工程目录写入任何自有文件（不写 `.npmrc`、`package.json`、`.scriptbox/`、模板脚本）。
- 工程目录里的变化只来自用户的显式操作，包括编辑、新建、重命名、删除文件，以及安装依赖。

## 共享类型与 IPC（src/shared）
- `Space` 新增 `projectPath?: string`，有这个字段就是工程型 Space。`SpaceInput` 增加可选的 `projectPath`。
- `ErrorCode` 新增 `PROJECT_NOT_FOUND`（目录不存在或不可访问）、`PROJECT_ALREADY_IMPORTED`、`PACKAGE_MANAGER_NOT_FOUND`、`INVALID_PROJECT`（目录内没有 package.json）。
- 新增类型 `PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'`、`ProjectInfo { packageManager, scripts: Record<string,string>, nodeVersionHint: string | null }`。
- 新增通道：
  - `app:select-directory` → `string | null`
  - `space:import-project(input: SpaceInput & { projectPath })` → `Space`
  - `space:project-info(id)` → `ProjectInfo`
- 现有通道的签名保持不变。脚本 `name` 的含义扩展为"相对工作目录的 POSIX 路径"，例如 `src/index.ts`。

## 主进程：路径与 Space 服务
- `paths.ts` 新增 `spaceWorkDir(space)`，返回 `space.projectPath ?? spacePaths.root(id)`；新增 `spaceScriptsDir(space)`，返回 `space.projectPath ?? spacePaths.scripts(id)`。
- `SpaceService.importProject`：
  - 用 `realpath` 规范化路径，校验目录存在且包含 package.json。
  - 和已有 Space 的 `projectPath` 比对，重复就拒绝。
  - 只写入 `space.json`。
- `get` 不检查目录是否存在，这样目录丢了 Space 仍能列出和删除。`list`、`run`、`deps` 访问工作目录前统一调用 `assertProjectDir`，失败抛 `PROJECT_NOT_FOUND`。
- `update` 允许修改 `projectPath`（工程移动后重新关联），校验规则和导入时一致。
- `remove` 维持现状（只删元数据目录和历史），并在代码注释里写明不变量。
- 新增 `project.ts`：
  - `detectPackageManager(dir)`：先看 package.json 的 `packageManager` 字段，再按 lockfile 判断（`pnpm-lock.yaml`、`yarn.lock`、`bun.lock`/`bun.lockb`、`package-lock.json`），都没有就用 npm。
  - `readProjectInfo`：读取 `scripts`，并从 `.nvmrc`/`.node-version`/`engines.node` 推断 `nodeVersionHint`。
- IPC：`space:open-dir` 对工程型 Space 打开 `projectPath`。

## 主进程：脚本服务（支持子目录）
- `naming.ts` 新增 `isValidScriptPath(rel)`：按 `/` 拆分后逐段复用现有的段校验，禁止 `..`、绝对路径、空段。普通 Space 仍然只接受平铺文件名。
- `resolvePath` 的签名改为 `(space: Space, name)`，除了上面的校验，还要求 `relative(workDir, resolved)` 不以 `..` 开头。调用方（`runner`、`deps.scanMissing`、`script` IPC）先取 Space 再传进来。
- `list` 对工程型 Space 递归遍历：
  - 只收录 `SCRIPT_EXTENSIONS` 的文件。
  - 固定忽略 `node_modules`、`.git`、`dist`、`build`、`out`、`coverage`、`.next`、`.nuxt`、`.turbo`、`.cache` 这几个目录。
  - 叠加根目录 `.gitignore` 的规则（新增依赖 `ignore`）。
  - 不跟随目录符号链接，深度上限 12，文件数上限 5000，超出就截断并带上 `truncated` 标记。
- `create`/`rename`/`remove`/`write` 在工程型 Space 中直接作用于原目录。`create` 按需创建父目录。`rename` 允许跨目录，但目标路径必须同样通过校验。`space.scripts[...]` 里的运行配置随文件迁移。
- 工程型 Space 不提供 `import`（复制外部脚本进来）的入口，UI 隐藏该按钮。

## 主进程：运行器
- `cwd` 改为 `spaceWorkDir(space)`。
- `transpile.ts`：
  - 产物路径为 `spacePaths.build(id)/<rel>.mjs`（仍在 userData），按相对路径建子目录。
  - `__dirname`/`import.meta.dirname` 改为 `dirname(source)`，顺便修掉子目录场景下取值错误的问题。
  - 工程型 Space 打包时启用"绝对化外部包"模式：ESM 产物把外部包解析成真实文件的 `file://` URL，CJS（`.cts`）产物解析成绝对路径。这样产物放在 userData 也能正确找到工程的 `node_modules`。
  - 这个模式扩展在 `interop.ts` 中，用 `build.resolve` 并通过 `pluginData` 防止递归。内置模块不受影响。
- npm scripts 运行：
  - 运行键用 `npm:<name>`。`:` 本来就是文件名里的非法字符，不会和真实文件冲突。
  - `start` 识别到这个前缀后，读取 package.json 校验脚本存在，再用 `<pm> run <name> [args]` 在 pty 中执行。
  - 运行配置（args/env）、历史记录、`runKey` 全部复用现有机制。
- 包管理器命令解析（新增 `services/deps/pm.ts`，供运行器和依赖服务共用）：
  - npm：沿用 `runtime.node + npmCli`。
  - pnpm/yarn：先用运行时自带的 corepack（路径推导方式同 `npmCli`，设置 `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`）。运行时里没有 corepack（Node 25+）时，回退到系统 PATH 查找。
  - bun：只在 PATH 中查找。
  - 都找不到就抛 `PACKAGE_MANAGER_NOT_FOUND`，参数里带上 PM 名称。

## 主进程：依赖服务
- 所有路径都改为基于 `spaceWorkDir(space)`，`nodeModules` 指向工程下的 `node_modules`。
- `run` 按检测到的 PM 映射命令：

| 操作 | npm | pnpm / yarn / bun |
|---|---|---|
| install | `install <specs> --save` | `add <specs>` |
| update | `install x@latest` | `add x@latest` |
| uninstall | `uninstall` | `remove` |
| install-all | `install` | `install` |

- `--cache`、`--no-fund`、`--prefer-offline/online` 这些参数只对 npm 追加。网络代理和 registry 仍通过 `buildNetworkEnv` 注入。
- `types.ts` 的 `listPackages` 把 `isSymbolicLink()` 也当作包目录处理（兼容 pnpm），作用域包目录同样处理。
- 工程型 Space 运行中或有依赖任务时，沿用现有的 `DEPS_BUSY`/`SPACE_BUSY` 规则。

## 渲染进程
- **Spaces 页**：
  - 新增"导入工程"按钮，流程是选目录 → 弹窗。弹窗预填名称（取 package.json 的 name，没有就用目录名）和 Node 版本（`nodeVersionHint` 有匹配的已安装版本就用它，否则用默认版本），并展示路径。
  - `SpaceCard` 用徽标标出"工程"并显示路径。目录丢失时显示警告，提供"重新关联"（编辑弹窗中修改路径）。
  - 删除确认文案写明"不会删除工程目录"。
- **脚本树**：
  - `ScriptTree` 按 `/` 拆分路径，渲染成可折叠的目录树（antd `Tree` 或 `DirectoryTree`）。普通 Space 是单层，所以表现不变。
  - 新建时可以输入带子目录的路径。
  - 新增"刷新"按钮，窗口重新获得焦点时也自动重新 list。
  - 工程型 Space 隐藏"导入脚本"按钮和拖拽导入。
- **npm scripts 面板**：脚本树下方增加 "NPM Scripts" 分组，列出 `ProjectInfo.scripts`，支持运行、停止和运行配置。运行输出复用底部面板的 tab。
- **外部改动保护**：保存前比较 `mtime`，磁盘上的文件比打开时新就提示"文件已在外部修改"，让用户选覆盖或重新加载。
- **Monaco**：
  - 模型 URI 保持 `file:///spaces/<id>/<rel>`，这样 `file:///node_modules/...` 的类型库能正常向上解析。
  - 打开工程型 Space 时，为工程内的 `.ts/.d.ts/.js` 源文件（不超过 16MB、2000 个文件）创建后台只读模型，让相对导入能解析到；超出预算的部分只忽略诊断码 2307（找不到模块）。
- i18n：中英文文案同步补齐。

## 测试计划
- 单元测试（vitest）：
  - `isValidScriptPath`：穿越、绝对路径、Windows 盘符、空段。
  - `resolvePath` 的越界拦截。
  - `detectPackageManager`：各种 lockfile 和 `packageManager` 字段的组合。
  - PM 命令映射。
  - `listPackages` 处理符号链接。
  - 递归 list 的忽略规则和截断。
  - 绝对化外部包插件：ESM-only 包、CJS 包、内置模块、子路径导出。
- 手动验证：
  - 分别导入 npm、pnpm、yarn 工程，确认导入前后工程目录 `git status` 都是干净的。
  - 运行子目录里的 TS 文件（ESM/CJS 依赖都要有），运行 npm scripts，安装和卸载依赖，删除 Space 后确认工程目录完好。
  - 移走工程目录再重新关联。

## 前提与范围
- 文件树只显示 js/ts 脚本，不提供编辑 package.json、.env 等其他文件的能力。
- 只支持工程根目录的 `node_modules`。monorepo 子包各自的依赖不做专门处理，运行时由 Node 自行解析。
- 不做实时文件监听，靠"刷新"按钮、窗口聚焦刷新和保存前的 mtime 检查。
- 对于 yarn berry 的 PnP 模式（没有 node_modules），运行和类型提示不保证可用，导入时给出提示。