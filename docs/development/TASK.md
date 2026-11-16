# RefTray 1.0.2 候选：下载 → 安装 → 首次使用

2026-11-16，分支 `feat/onboarding-101`，基线 GitHub main `eea11a680ad40829cc8a81634c7a3c41fb31c54f`（本轮 fetch 核实）。实施目录 `F:/RefTray/worktrees/onboarding-101`；旧 `F:/RefTray/source` 未提交工作和 `F:/RefTray/app` 日常安装保留。未授权推送或发布。

规则：Ivy v0.5，`C:/Users/Admin/.codex/ivy-dev-system/AGENTS.md` SHA256 `F6A0F36D4338BDAF24C7D4E33B81140EFEDB6228519D4D8985799759CECAB024`；项目 AGENTS/CURRENT/TASK、SPEC B01/B02 已读。

## 本轮要求与验收

- N01 安装可选开机启动，新装默认关闭；登录后后台启动，设置可改，升级保留当前选择，卸载只清本软件自启值。
- N02 首次手动启动立即选库：已有文件夹/新建文件夹，取消可重试，失败显示原因；保存复用 `/settings/directory`。已有配置（含旧 inbox）跳过选库，不搬文件。
- N03 单一原生引导：选库后同窗口说明 Chrome 加载及实际目录；托盘可返回。取消自动打开网页和记事本。用户可见名称统一 RefTray；保留 AppId、安装目录、互斥/管道、协议、数据键、推荐路径兼容。
- N04 专用干净 Windows 从发布页浏览器下载、双击安装、首图实存、真实重启登录两种自启选择/设置切换、1.0.1 覆盖升级保留。未验证不能写通过，不重启宿主。
- 不做悬浮一键保存、SVG、长截图；不启动全平台实采，不改下载/分类/历史核心。

## 当前执行与证据

已实现并构建候选：原生引导与现有保存 API 相连；新 startup 模块只负责当前用户 Run 值，设置通过鉴权 API 读写。Run 值是自启唯一权威，避免安装任务旧记录覆盖设置页变更。新依赖：无（现有 .NET / Python 标准库）。
P1/P2（2026-11-16）：核对 Microsoft [Run 登录启动](https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys) 和 Inno [WizardSelectTasks](https://jrsoftware.org/inno-setup/documentation/topic_isxfunc_wizardselecttasks.htm)、[Tasks](https://jrsoftware.org/inno-setup/documentation/topic_taskssection.htm)。平台支持不代表已完成重启测试。

环境检查：当前机器 ASUS System Product Name，HypervisorPresent=True；只有 vmcompute 服务，未发现 vmms/Get-VM、VBoxManage、vmrun、常见 Oracle/VMware 安装或已登记专用测试机。**没有可用的专用干净 Windows 验收环境证据**，不能把宿主维护环境当替代。未重启、未关闭安全防护。

构建解释器：`C:/Users/Admin/AppData/Roaming/uv/python/cpython-3.11.15-windows-x86_64-none/python.exe`；测试解释器 `F:/RefTray/app/runtime/python.exe`（3.13.17），显式插入当前 source。构建输入复用旧仓库 build-tools 的只读 junction；本轮依赖预检通过，日志 `work/dependency-preflight.log`。
准备错误：Python313 常规安装目录只有残留 Lib，无 exe；改用已核验的安装包解释器。直接 csc 相对正斜杠路径被误识别，改为绝对路径；均是准备错误，不是产品验证。

## 本轮结果（2026-11-16，UTC+08:00）

- 58 项 Python 检查通过：45 项定向 API/选库/品牌升级/分发/维护，5 项安装文档与仓库卫生，8 项架构。170 项 JavaScript 回归通过。源码改动不涉及采集参数、下载、分类和任务所有权。
- 命名管道检查通过：无效/空闲请求后仍能退出，新增引导请求不关闭后台，UTF-8 中文路径保持；最终全部 C# 源文件编译通过。初次 harness 缺少新增 OpenOnboarding stub，属于测试适配缺失，一次修正并复验通过（`work/launcher-contracts*.log`），没有更改产品换绿。
- `tools/build_windows.py --check-dependencies` 与完整构建通过。1.0.2 候选安装器 126579400 字节，SHA256 `5b5c63c8390d0fc630c299eeec5a0a98a09054f05080eb7b31be467dd0488f95`。源码 ZIP 同目录。未签名，未上传、未发布、未移动任何正式标签。
- 构建输出使用独立端口 18766 和 `work/smoke-state` 完成真实后台启动/版本核对/退出，`release_ok=true, service_stopped=true`。这是宿主隔离启动证据，不是干净 Windows 安装或重启证据。
- **日常安装状态发生变化，覆盖最初“日常安装不变”的计划**：助手只拟查看安装向导；启动后观察到 Ready to Install，随后状态进入安装检查。工具明确报告用户在该窗口输入，双方操作出现交叠。没有把来源不明的界面变化归因成产品 bug。用户随后明确选择“保留 1.0.2 候选”。最终安装器退出，`F:/RefTray/app` 已为 1.0.2，开始使用窗口出现；没有继续恢复或重启宿主。
- 宿主安装后核验（`work/host-upgrade-evidence.json`）：1848 个受管程序文件全部匹配；素材库仍为 `F:/LibLib自动化`；collector-settings 与安装前备份逐字节一致；captures 456、assets 2566、tasks 429、preferences 1，所有安装前数据库行均仍在且内容相同。未做所有原素材文件逐一校验，未声称替代完整数据验收。
- 宿主自启项现为开启；首次观察前已有用户操作，**不能据此证明新装默认复选框状态**。没有切换宿主设置、没有重启。最近后台记录的 Chrome 扩展为 1.0.1，需重新加载一次；未重复重载用户扩展。
- 安装器能在宿主打开并完成升级；它是本地构建文件，非浏览器下载，未捕获下载安全提示，因此不能解释朋友的“双击无反应”，也不能声明 SmartScreen 已通过。

## 2026-11-16 追加：用户授权重载与宿主单图实采

用户要求重新加载扩展、确认 1.0.2、实际保存一张测试图并核对文件和记录；保留原素材/设置，仍不发布。浏览器工具因 chrome:// 协议策略拒绝管理页，未换工具绕过；用户手动重新加载并确认后，RefTray status 验证扩展与后台均 1.0.2、browser.ready=true、busy=false。

首次 NASA 页面任务 `408eed4a85d940ec9c85bf222c207a2c` 因扩展缺少该 host 权限失败，无文件保存；保留失败记录，未扩权限。改选已有 host 授权的 ArtStation 作品 [Single Image, Public Domain](https://www.artstation.com/artwork/Jv3JJz)，通过 reftray_capture_browser 交给真实 Chrome 扩展执行，任务 `5658a438ac5f4e0e8a0c52bf260d081b` completed：新增1、重复0、失败0、partial=false。仅本次 max_images=1，不改默认值。

实际文件 `F:/LibLib自动化/图片/ArtStation/图片-Single Image, Public Domain/001_dc02a3db67.jpg`，183649字节，JPEG 960×960，可完整解码；SHA256 `dc02a3db675b890feeffd8e7a65b671f48d11b66b95aa6e52a8834254384891b`。find_saved 返回 verified_local，采集记录 ID457 的目录/大小/摘要均与文件一致。

采集前后比较：captures456→457、assets2566→2567、tasks429→433（两次尝试的父子任务）、preferences1→1；所有旧数据库行内容保留，collector-settings 摘要保持。证据 `work/live-capture-20261116/result.json`；含旧数据的 baseline.json 仅本地忽略，不进入 Git 或发行包。此次完成的是**已有宿主 Chrome 扩展实采**，没有补齐专用干净 Windows、浏览器下载安装器或真实重启登录验收。

## 尚未满足的真实验收（N04）

| 场景 | 本轮证据 | 状态 / 继续条件 |
| --- | --- | --- |
| 发布页浏览器下载、双击、完整安全提示 | 只有本地候选在已有宿主打开 | 待专用测试 Windows；候选未发布 |
| 无配置首次已有/新建目录、取消/不可写重试 | API、持久化和错误行为检查 | 原生完整 UI 待干净环境 |
| 加载 Chrome → 保存第一张图 → 核对实际落盘 | 已有宿主1.0.2扩展单图实采通过，见追加记录 | 专用干净环境仍待验 |
| 默认不勾、勾选、设置切换后的真实重启登录 | 隔离注册表读写 fixture，仅本产品值 | 未重启，不能报通过 |
| 1.0.1 覆盖升级、原库与数据保留 | 宿主用户操作完成；配置/全部旧 DB 行保留 | 专用环境仍待验 |
| 关闭引导后托盘重新打开、卸载清本软件自启 | 实现与编译检查 | 原生操作仍待验 |

下一步：提供专用、可重启登录的 Windows VM/测试电脑后按上表执行；浏览器下载新版需要另行授权的候选分发渠道。无额外授权不发布。原 `F:/RefTray/source` 旧未提交工作保持，独立分支仅本地提交。


---

# RefTray 1.0.1 交付记录

## 已完成

- 兼容仓库改名，保留安装包名称、AppId、数据路径和校验规则。
- 通过真实旧版清单发现并修复 help、speech-tools 升级预检遗漏；未知目录和越界路径仍拒绝，用户修改保留。
- 合入文档 review。用户教程、开发记录、历史发布和宣传资料分层；32 个文件移动后保留历史，178 个本地链接检查通过。安装包不再附带旧审查报告。
- 基于 `2c15a0d` 构建并发布 1.0.1，仓库改名为 RefTray；Release ID 为 442114056，三个资产均已上传且 GitHub 摘要与本地一致。

## 验证

169 项 Python 采集/更新、46 项分发/帮助、170 项 JavaScript 检查通过。1847 个受管文件逐项核验，源码 ZIP 对应，启动器和安装器均为 1.0.1，隔离启动退出通过。

最终真实程序副本从 1.0.0 升级到 1.0.1，再恢复到 1.0.0，15 项检查通过。素材、设置、历史、去重和手改文件保持，新内容保存与授权检查正常，隔离扩展目录更新和恢复正常。15 个过时受管文档清理准确，回滚可恢复。Inno MCP 预检关闭两个本程序测试客户端，保留无关 Python，陌生客户端在复制前阻止升级。

新旧仓库与 Release API、旧发布网页、Git 克隆地址、新旧校验文件下载通过；新更新器正确解析实际发布元数据，旧版需要一次手动安装。当前网络匿名更新 API 曾限流，没有把它记作直连检查成功。完整 setup.exe 升级/卸载尚未在干净 Windows 环境验证。

1.0.0、0.5.55、0.5.37 Release 与资产保持；0.5.47 和 0.5.48 预发布由本轮另一项已确认的清理工作移除，保留对应 tags。本任务没有删除旧 Release。原分支、HEAD、137 个改动或未跟踪文件摘要及 Git 状态保持；日常安装、素材、设置和注册项没有改动。

## 发布后的三份指南修订

按用户后续授权，将 `d502495` 的三份指南和测试合入 main `c494369`，使用独立工作树 `work/integrate-postrelease-guides/checkout`、分支 `integrate/postrelease-guides`。原提交基于发布标签 `2c15a0d`；CURRENT/TASK 的冲突按当前 main 保留上述实际发布结果，再追加本轮记录，没有用旧的发布准备状态覆盖。

- MCP 增加分项启动配置和 6 个带工具名的参数示例，说明先启动后台、完整路径、状态检查、scope/options、批量起点和任务完成确认。
- 说明接单使用的 Chrome 配置文件、文件读取和目标目录范围、AI 客户端的数据处理与工具授权。更新和恢复须看清目标后明确要求操作，不声称一定出现二次确认弹窗。
- 说明安装版和 Chrome 使用 8766，仅改 MCP 端口不能切换整套程序；补管理页入口、导航、素材库选择和三类目录；校验与 SmartScreen 分开解释。
- 增加 3 项回归，覆盖启动配置、工具 schema 与 BrowserCapture 参数、生成帮助中的关键操作和权限说明。产品源码、运行时、配置格式与构建规则没有改动，B01 依赖方向、任务所有权和失败传播保持。

集成验证使用 Python 3.13.17，导入的是当前工作树源码。49 项分发/帮助、8 项架构、13 项 MCP 检查通过；10 个离线 HTML 可生成，47 份 Markdown 的 180 个相对链接有效，`git diff --check` 通过。示例只验证参数契约，没有连接网站、操作真实素材或在第三方 AI 客户端配置。完整 Chrome 与干净 Windows 安装器测试不在本次文档范围。

仅推送 main 的文档和测试，不移动 v1.0.1 标签、不重建或替换 Release 附件、不发新版。发布资产的大小和 SHA256、原工作树的 137 个文件及分支/HEAD/Git 状态保持。在线指南随 main 更新；1.0.1 安装器、离线帮助及 user.zip 仍是 `2c15a0d` 的内容，下次版本发布时再同步。


## 2026-11-12 安装流程与文档当前态修订

- 用户反馈：安装不应要求人工比对校验码或先操作 PowerShell；删除“从哪个版本开始支持”等无意义历史措辞。
- 修改：正常安装不做强制校验；补简明 SmartScreen 条件步骤，保留真实需要的首次 Chrome 手动加载。可选 SHA256 使用内置 .NET 自动比较，不修改执行策略或安全防护。清理 update、save-layout、第三方声明/语音、品牌指南中的历史版本；保留实际升级兼容条件及 changelog。
- 验证：25 项文档/分发/架构检查；校验片段直接在 Windows PowerShell 5.1 运行 8 类夹具，覆盖正常、损坏、错版本、重复、非法、缺文件，中文/空格/方括号路径及大小写/星号校验格式。初始测试暴露 Windows PowerShell 相对路径与 Get-FileHash 模块可用性差异，改为绝对 LiteralPath 和内置 SHA256 后通过，不启用执行策略。
- 边界：仅文档和回归测试；发行包、日常安装、用户数据及既有开发目录未动。未新增完整安装/卸载或 SmartScreen 实测。

## 2026-11-12 仓库卫生复查

- 完成：按目录整理公开文件白名单，补齐 27 个被误忽略的已跟踪文件，去掉两条过时文档规则；添加仓库卫生回归，保留凭据、日志、构建输出和未审核文件的忽略边界。
- 验证：24 项文档、分发、架构及卫生检查通过，`git diff --check` 通过；297 个已跟踪文件中的 Markdown 相对链接无断链。
- 保留：四个现有 Release、全部 tag、远端与本地旧审查分支及原工作区 137 项改动；旧预发布备份的四个资产 SHA256 重新验证通过。未重写历史或发布新的安装包。
- 待决定：是否仅对外保留 1.x 发布列表；0.5.37 未标为预发布，0.5.55 明确标为正式版，因此本轮未删除或隐藏。旧 Release 中改名前的链接和 0.5.37 的旧审查文档路径仍可后续统一。
