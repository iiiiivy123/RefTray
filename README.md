<p align="center">
  <img src="docs/assets/hero.svg" alt="RefTray · 灵感采集 — 把网页素材，存进自己的文件夹。" width="100%">
</p>

<p align="center">
  <a href="https://github.com/iiiiivy123/inspiration-collector/releases/tag/v0.5.47"><img src="docs/assets/download-preview.svg" alt="下载 0.5.47 预发布版" height="40"></a>
  &nbsp;
  <a href="https://github.com/iiiiivy123/inspiration-collector/releases/latest"><img src="docs/assets/download.svg" alt="下载 Windows 安装包" height="40"></a>
  &nbsp;
  <a href="docs/README.md"><img src="docs/assets/docs.svg" alt="项目文档" height="40"></a>
</p>

<p align="center">
  <a href="#能收集什么">功能介绍</a> · <a href="#开始使用">快速开始</a> · <a href="docs/use-cases.md">实际使用问题</a> · <a href="https://github.com/iiiiivy123/inspiration-collector/issues">问题反馈</a> · <a href="README_EN.md">English</a>
</p>

**RefTray · 灵感采集** 是面向设计师、插画师与内容创作者的 **Windows + Chrome 本地素材采集工具**。从支持的网页保存图片、Markdown 图文、纯文字与视频，部分作者页和画板支持批量采集，视频还可按需提取参考画面。

**你选择文件夹，素材就保存在那里。**

## 能收集什么

<table>
<tr>
<td width="50%" valign="top"><h3>图片与视觉参考</h3><p>从适配的作品页保存图片，收集构图、服装、场景与设计参考。</p></td>
<td width="50%" valign="top"><h3>图文与纯文字</h3><p>整理为 Markdown；图文包含正文图片，可选择附带评论和识别图片文字。</p></td>
</tr>
<tr>
<td width="50%" valign="top"><h3>视频与参考画面</h3><p>保存支持的视频，按需抽帧；也支持对本地视频提取参考画面。</p></td>
<td width="50%" valign="top"><h3>批量与任务恢复</h3><p>处理支持的作者页或画板，查看采集记录、去重结果，并继续或重试部分未完成任务。</p></td>
</tr>
</table>

## 从网页，到自己的文件夹

<img src="docs/assets/workflow.svg" alt="打开支持的页面 → 选择采集内容 → 保存到本地文件夹" width="100%">

图片、图文、视频和批量内容按类型与来源整理。更改素材库位置不会自动搬迁旧文件；历史记录可帮助打开此前的保存目录。

## 开始使用

**需要 Windows 10/11 64 位 + Chrome。** 安装包内置 Python 与媒体组件，不用自己配置开发环境。

1. **下载安装。** 试用新版请下载 [0.5.47 预发布版](https://github.com/iiiiivy123/inspiration-collector/releases/tag/v0.5.47)；稳定版前往 [Releases](https://github.com/iiiiivy123/inspiration-collector/releases/latest)，在 **Assets** 下载 Windows 安装包，不要下载源码 ZIP。
2. **启动本地程序。** 打开「灵感采集」，程序会在 Windows 右下角系统托盘运行。
3. **加载 Chrome 扩展。** 打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」。从托盘菜单复制 `extension` 文件夹的实际地址，选择该文件夹。
4. **保存第一份素材。** 固定工具栏扩展，选择本地素材库，打开支持的作品页并选择采集内容。

[首次安装 →](docs/install.md) · [旧版更新 →](docs/update.md) · [完整教程与故障排查 →](docs/usage.md)

最新预发布版为 **[0.5.47](https://github.com/iiiiivy123/inspiration-collector/releases/tag/v0.5.47)**，稳定版为 **0.5.37**。以下功能和教程按 0.5.47 编写；稳定版代码在 `main`，预发布代码见 `v0.5.47` 标签。[0.5.47 说明](docs/release-0.5.47.md) · [完整代码审查交接](docs/REVIEW_HANDOFF.md)。

更新后到 Chrome 扩展管理页重新加载「灵感采集」，再刷新作品页面。[完整更新步骤](docs/update.md)

首次使用需要手动加载扩展。目前提供 Windows + Chrome 版本，安装包暂未签名。

## 0.5.47 新版内容

- 视频可选「视频 + 字幕 + MD」「仅视频」「仅文字稿」或「仅提取音频」，另可开启自动抽帧。
- 图片 / GIF 与图文的过滤选项直接显示在弹窗；去重方式、下载上限和抽帧间隔放在设置页。
- 评论分别设置一级评论数量和每条评论的回复数量。楼中楼默认关闭。
- MCP 新增 Chrome 页面采集和整帖视频顺序下载；可按原链接查本地保存结果。
- 任务失败可跳到对应媒体诊断，支持搜索和错误类型筛选。
- 修复旧任务恢复导致的启动失败，调整 X 媒体读取、花瓣主图识别与 X 批量计数。
- 打开采集弹窗时检查正式新版并提醒；安装仍需运行下载的安装包。

这是预发布版。**X 登录视频、花瓣全屏图与批量仍待真实下载验收**。[完整版本说明](docs/release-0.5.47.md)

## 让 AI 调用 RefTray

**开发分支的 0.5.48 候选版**已加入后台接单、完整采集参数、批量、任务控制和诊断，共 16 个工具。AI 可以自动打开作品页，按要求保存图文、评论、图片或视频，并返回进度和保存位置。Chrome 关弹窗的现场验收尚未完成，检查结果见 [当前状态](docs/CURRENT.md)。

公开下载的 **0.5.47** 仍为 9 个工具，Chrome 采集还需要保持弹窗打开。普通下载工具由本地后台直接访问网页。

[0.5.48 MCP 接入步骤与工具说明](docs/mcp.md)

## 能在哪些网站使用？

**小红书 · Pinterest · Instagram · X · 花瓣 · B站**，以及部分其他网页图片。

各平台可用的采集方式见下表。

<details>
<summary><strong>展开查看各平台适配范围</strong></summary>

| 平台 | 目前适配的范围 |
| --- | --- |
| 小红书 | 单篇笔记的图片、图文、纯文字及部分视频模式；部分作者页面批量 |
| Pinterest | 当前 Pin、具体画板的相关图片采集；画板批量不支持图文模式 |
| Instagram | 帖子、Reels 与部分作者帖子列表 |
| X（原 Twitter） | 单帖和部分作者帖子列表；批量不包含转帖 |
| 花瓣 | 已加入主图与画板/作者采集适配；全屏图和批量仍在修复验证 |
| B站 | 受支持的视频稿件及 UP 主投稿列表，支持符合条件的视频保存、抽帧 |
| YouTube | 单视频、Shorts 及播放列表/频道入口；字幕取决于原视频是否提供 |
| ArtStation、微博 | 作品图片与图文入口；新版线上回归还没做完 |
| 其他网页 | 当前文章的正文与图片，不提供通用作者批量 |

新版完整线上回归还没做完。已收到的问题和处理进度见 [实际使用问题](docs/use-cases.md)。

</details>

## 常见问题

**安装完，Chrome 里怎么还是旧版？**

到 `chrome://extensions` 找到「灵感采集」，点重新加载，再刷新要采集的网页。安装程序更新磁盘上的文件，Chrome 需要重新加载扩展。[更新步骤](docs/update.md)

**网页已经能看到图片或播放视频，为什么还保存失败？**

花瓣主图识别和 X 登录视频都收到过这样的反馈。0.5.47 改了读取流程，这两项还没完成真实下载验收。遇到失败，保留任务记录；有诊断入口的任务可以直接查看对应原因。[已遇到的问题](docs/use-cases.md)

**安装后提示“服务启动失败”，怎么办？**

0.5.44 曾因恢复旧任务失败而无法启动，修复已包含在 0.5.47。更新后重试，保留原素材库和任务数据；若仍失败，查看程序状态目录中的 `data/inspiration/logs/service-errors.log`。[安装排查](docs/install.md)

[更多实际使用问题 →](docs/use-cases.md)

## 项目文档

| 想做什么 | 从这里开始 |
| --- | --- |
| 安装、更新、解决使用问题 | [首次安装](docs/install.md) · [旧版更新](docs/update.md) · [完整教程](docs/usage.md) |
| 查找真实反馈和修复进度 | [实际使用问题](docs/use-cases.md) · [English use cases](docs/use-cases-en.md) |
| 查找全部文档 | [文档导航](docs/README.md) |
| 介绍项目、查看图标方案 | [品牌与图标](docs/brand-guide.md) |

<details>
<summary><strong>名称、版本与文件位置说明</strong></summary>

**RefTray · 灵感采集** 是对外展示名称；较早文档中的 **InspiShelf** 也指这个项目。最新预发布版为 **0.5.47**，稳定版为 **0.5.37**。安装器、快捷方式、托盘和扩展继续使用「灵感采集 / Inspiration Collector」。下载和已知问题见 [版本说明](docs/release-0.5.47.md)。

首页采用已选定的简洁文件图标：空心文件轮廓与右上实心方块，不加内部横线。横幅固定使用白底，不随深色模式切换；0.5.28 构建已将同一 A 款标识应用到扩展与 Windows 程序图标。

```text
你选择的素材库/
├── 图片/平台/作品/
├── 图文/平台/作品/
├── 视频/平台/作品/
└── 批量/平台/作者或画板/
```

这是结构示例，实际目录随采集模式变化。

</details>

---

**独立第三方项目，非相关平台官方产品。** 仅在拥有相应权利、获得许可或其他合法依据时保存内容；公开可见不等于允许再分发或商用。[版权与隐私](docs/rights-and-privacy.md)

源代码可公开查看，但**项目尚未选定开源许可证**；第三方组件遵守各自许可。[第三方声明](docs/third-party-notices.md) · [媒体组件说明](docs/third-party-media.md)

维护：[iiiiivy123](https://github.com/iiiiivy123) · [提交反馈](https://github.com/iiiiivy123/inspiration-collector/issues)。反馈请附版本、复现步骤与脱敏截图，不要上传 Cookie、凭据、私人资料或受版权保护的完整媒体。开发过程中使用 OpenAI Codex 辅助。

## Windows 构建前检查

构建宿主使用 Python 3.11 或更新版本及 pip；安装包运行时仍为锁定的 Python 3.13。先准备项目要求的离线 wheelhouse、运行时及编译工具，再从仓库根目录运行：

```powershell
python tools/build_windows.py --check-dependencies
python tools/build_windows.py
```

第一条只解析和校验锁定的离线依赖，不生成安装包；第二条也自动执行同一检查，通过后才创建打包目录。构建子进程隔离本机 pip 默认配置，不修改全局配置。规则见 `docs/SPEC.md` B02。

实现依据：[pip 配置隔离](https://pip.pypa.io/en/stable/topics/configuration/)、[pip 离线解析与 dry-run](https://pip.pypa.io/en/stable/cli/pip_install/)。

## 开发检查

在仓库根目录运行。Python 需要项目依赖；当前本机使用安装包自带的解释器，导入路径明确指向这份源码。其他机器把第一行改为实际解释器路径。

```powershell
$reftrayTestPython = 'F:/RefTray/app/runtime/python.exe'
& $reftrayTestPython -c "import sys,unittest; sys.path.insert(0,'source'); r=unittest.TextTestRunner().run(unittest.defaultTestLoader.discover('tests/collector',pattern='test_architecture_boundaries.py')); sys.exit(not r.wasSuccessful())"
```

每轮收尾执行架构检查。修改共享采集、任务或参数模块时，再运行完整回归：

```powershell
& $reftrayTestPython -c "import sys,unittest; sys.path.insert(0,'source'); r=unittest.TextTestRunner().run(unittest.defaultTestLoader.discover('tests/collector',pattern='test_*.py')); sys.exit(not r.wasSuccessful())"
& $reftrayTestPython -c "import sys,unittest; sys.path.insert(0,'source'); r=unittest.TextTestRunner().run(unittest.defaultTestLoader.discover('tests',pattern='test_*.py')); sys.exit(not r.wasSuccessful())"
node --test tests/collector/*.cjs
git diff --check
```

架构检查覆盖服务端本地模块引用、循环依赖、解析与下载的依赖方向，以及扩展脚本加载文件。参数、停止、断线和平台内容由行为测试验证；真实 Chrome 验收记录在 [CURRENT](docs/CURRENT.md)。
