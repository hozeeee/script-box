# Python 运行时支持

## 数据模型与兼容迁移
- 在 `src/shared/types/space.ts` 引入 `RuntimeKind = 'node' | 'python'` 和判别联合 `SpaceRuntime`，将 Space 的运行时统一表示为 `{ kind, version }`；Python Space 额外持久化从项目检测出的依赖管理方式 `uv | poetry | pdm | requirements | pep517 | none` 及版本约束来源。Space 创建后不允许切换语言，避免已有脚本、项目和环境失效。
- 在 `SpaceService` 读取旧 `space.json` 时，把缺少新字段的记录迁移为 Node.js Space，并保留原 `nodeVersion`；更新后写回新结构。现有普通 Space、外部 Node.js 工程及排序数据保持可用。
- 将 `RunRecord.nodeVersion` 泛化为运行时种类与版本；历史存储读取旧记录时按 Node.js 归一化，旧历史继续展示。
- 扩展 `ScriptLanguage`/扩展名支持 `.py`，但脚本创建、导入、遍历和运行都按 Space 语言过滤：Node.js 仅 JS/TS，Python 仅 `.py`。

## uv 与 Python 运行时服务
- 在 `src/main/paths.ts` 增加 `runtimes/python`、`tools/uv`、Python 工具缓存、每个 Space 的 venv 与同步状态路径；普通和外部项目的 venv、缓存、工具及状态一律留在 Electron `userData`，不把 Script Box 自身产物放进外部工程。
- 新增独立的 uv 引导服务：固定 uv `0.13.5`，按现有打包目标支持 Windows x64、Linux x64、macOS x64/arm64；从 Astral 版本化地址下载对应归档，校验官方 SHA-256，暂存解压后原子安装，并继承现有代理设置。
- 保留 Node.js 运行时实现并增加 Python runtime adapter；通过现有 `runtime:*` IPC 增加 `kind` 参数统一分发 list/install/cancel/remove/progress。进度事件包含运行时种类；uv 无法提供总字节数时使用不定进度并展示命令阶段。
- Python 版本通过固定 uv 的 JSON 输出发现，由 uv 从 `python-build-standalone` 安装、查找和卸载。新建 Space 只推荐仍受支持的普通 CPython 稳定分支及各分支最新补丁版，默认最新稳定版；导入项目时先读取精确 pin，再读取 `requires-python` 范围，并让 uv 选择满足约束的最新稳定补丁版。项目精确 pin 即使已 EOL 也可在 uv 仍提供时安装并显示警告；uv 无法提供或属于首版不支持的实现时明确阻止导入/运行。
- 所有 Python Space 均由 uv 使用精确托管解释器创建独立 venv；即使后续调用 Poetry/PDM，也强制复用该 venv 并禁用它们自行创建环境。脚本始终从此 venv 的 Python 启动，不回退到系统 PATH。

## Python 工程识别与依赖策略
- 将工程检查拆成 Node.js/Python 两条显式路径；Spaces 页的“导入工程”改为“导入 Node.js 项目”和“导入 Python 项目”，IPC 检查请求携带语言种类。
- 新增 Python 项目信息解析：读取 `.python-version`、`.tool-versions`、`pyproject.toml` 的名称、`requires-python`、build backend 和工具声明，检测 `uv.lock`、`poetry.lock`、`pdm.lock`、`requirements*.txt`。引入并显式声明轻量 TOML 解析依赖；多个互相冲突的锁文件或声明不唯一时，在导入弹窗解释检测结果并让用户确认一次，随后持久化。
- 依赖工具选择遵循“项目优先”：项目声明与唯一锁文件决定 uv/Poetry/PDM；存在锁文件时一律使用 frozen/locked 模式，绝不自动重写或升级锁。requirements-only 项目使用 uv 的 pip 兼容同步；只有 pyproject 且无锁时使用 uv 通过 PEP 517/660 安装；只有 `.py` 文件时只创建 venv，不擅自生成外部项目配置。
- 项目声明 uv/Poetry/PDM 版本约束时选择满足约束的工具版本；未声明时使用应用验证过的默认版本（uv `0.13.5`、Poetry `2.5.1`、PDM `2.29.2`）。Poetry/PDM 由托管 uv 按需安装到 userData 的隔离工具目录，不依赖系统工具。
- 依赖同步指纹包含解释器精确版本、项目版本约束、管理器/工具版本、锁文件或 requirements/pyproject 内容及索引配置。首次运行或指纹变化时同步；无变化直接运行。原生项目安装包含项目本身以支持 `src` 布局；无锁 PEP 517 优先 editable，后端不支持时回退普通安装。

## Runner 与终端执行链
- 扩展 `LanguageRunner`，新增 Python runner，并让 prepared command 可携带顺序执行的 preflight steps。
- 重构 `RunnerService` 为单个 RunRecord 下的 PTY 队列：先在同一终端输出 venv 创建、工具准备与依赖同步，再启动 `.py`；任一步失败即标记本次运行失败，停止操作杀掉当前阶段并取消后续阶段，resize/input 始终作用于当前 PTY。
- Python 主命令使用 venv interpreter、Space/工程目录作为 cwd，并沿用脚本参数、自定义环境变量、代理、日志和历史能力；运行记录展示 `Python <version>`。
- 增加 Python/uv/Poetry/PDM 网络环境适配，设置 `PIP_INDEX_URL`、uv/PDM 对应索引变量并复用 HTTP(S)/NO_PROXY；项目自身声明的 source 保持项目工具语义。

## Space、编辑器与运行时 UI
- 创建 Space 时先选 Node.js/Python，再显示对应已安装版本；编辑时语言只读。没有可用版本时在创建/导入弹窗内直接展示远程版本并下载安装，完成后继续保存。
- 移除全局强制 Node.js 的 `FirstRunGuide`；新用户仅在创建或导入具体语言 Space 时触发对应安装。
- 运行时管理页改为 Node.js/Python 标签页；store 按 kind 管理 installed/remote/progress。运行设置增加默认 Python 版本，Space 卡片显示正确语言、版本及缺失状态。
- 新建 Python Space 采用 uv 当前推荐的项目结构：初始化 `hello.py`、标准 PEP 621 `pyproject.toml` 和 `uv.lock`，后续同步固定使用 locked 模式；Python 外部工程不强行转换格式，只按其现有声明工作，并递归展示/编辑/运行 `.py`。遍历忽略 `.venv`、`venv`、`__pycache__`、`.pytest_cache`、`.mypy_cache`、`.ruff_cache`、`.tox`、`.nox` 等环境和缓存目录。
- Monaco 为 `.py` 使用 Python language id。现有 npm scripts、Node 缺失依赖提示和依赖面板仅在 Node.js Space 展示；Python 首版不增加手工依赖列表 UI，自动同步过程由运行终端呈现。

## 设置、IPC 与文案
- 在 `NetworkSettings` 增加 PyPI index URL，默认 `https://pypi.org/simple`，国内预设使用清华 PyPI simple 镜像；官方/国内预设同时切换 Node、npm、PyPI，连接测试可分别验证 npm 与 PyPI。
- 在 `RunSettings` 增加默认 Python 版本。同步更新 `src/shared/defaults.ts`、设置合并、IPC 契约、preload 白名单、renderer stores，以及中英文错误与界面文案。
- 增加 Python runtime/tool/bootstrap、解释器缺失、依赖管理器冲突和依赖同步失败等明确错误码；更新现有 README 中的运行时、Space 与项目导入说明。

## 测试与验收
- 单元测试覆盖：旧 Space/历史迁移、Python 扩展名隔离与 uv 项目模板、Python 版本 pin/范围选择、项目工具声明与锁文件检测及歧义、frozen/locked 保证、uv 平台目标/输出解析/校验/取消、venv 路径不落入外部项目、同步指纹与各管理器命令适配。
- Runner 测试覆盖 preflight 成功串行、同步失败不启动脚本、停止/强杀、PTY resize/input 切换以及 Python 历史字段。
- 设置测试覆盖 PyPI 默认值、深度合并、代理与索引环境；IPC/store 测试覆盖 kind 路由和进度隔离。
- 使用 mock 下载与进程输出完成常规测试，避免 CI 真实联网；最后执行 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。

## 约束与已确认范围
- 支持项目当前发布的平台/架构：Windows x64、Linux x64、macOS x64/arm64。
- Python 首版仅运行 `.py` 文件，不提供 `python -m`、console scripts 或项目任务入口。
- 不使用系统 Python 或系统依赖工具；首版不支持 PyPy、free-threaded CPython 和预发布版本。项目若精确 pin 到这些实现/变体则给出明确的不支持提示，不静默替换版本。
- “项目优先”同时适用于 Python 版本、依赖管理器、工具版本、包源和锁文件；项目没有提供约束时才采用 uv + PEP 621/PEP 517 的默认实践。
- 外部无锁 pyproject 采用 uv 驱动的 PEP 517/660 安装；构建后端可能在源码目录产生其自身的临时元数据，这是该兼容路径的已知边界。