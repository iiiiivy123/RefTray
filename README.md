# RefTray · 灵感采集

把网页里的图片、图文、视频，保存到自己的文件夹。

RefTray 是 Windows + Chrome 本地素材采集工具。素材保存在你选的目录，图文保存为 Markdown，视频可以提取字幕、文字稿、音频或参考画面。

[下载安装包](https://github.com/iiiiivy123/RefTray/releases) · [使用说明](docs/usage.md) · [首次安装](docs/install.md) · [更新与恢复](docs/update.md) · [English](README_EN.md)

当前正式版为 **1.0.1**。[下载 Windows 安装包](https://github.com/iiiiivy123/RefTray/releases/download/v1.0.1/InspirationCollector-1.0.1-Windows-x64-Setup.exe) · [版本说明](docs/release-1.0.1.md)

## 能做什么

- 保存图片和 GIF，优先读取站点提供的高清源。
- 保存正文和配图，按需加入评论、识别图片文字；也可以只保存文字。
- 保存视频、字幕与文字稿，或只提取音频。没有网站字幕时使用本地语音识别。
- 批量采集支持的作者主页、画板、收藏夹和视频列表，设置起点与数量。
- 查看任务和采集记录，暂停、继续或重试失败项，按设置去重补齐。
- 通过 MCP 让 AI 调用同一套采集功能。

## 开始使用

需要 Windows 10/11 64 位和 Chrome 120 或更新版本。完整安装包内置运行环境与媒体组件。

1. 在 Releases 的 Assets 下载 Windows 安装包（文件名以 `Windows-x64-Setup.exe` 结尾）。
2. 安装并启动「灵感采集」，Windows 右下角会出现托盘图标。
3. 从托盘复制扩展文件夹地址，到 `chrome://extensions` 开启开发者模式，加载该文件夹。
4. 固定 Chrome 工具栏里的扩展，选择素材库，打开作品页开始采集。

首次加载扩展需要手动操作。安装包暂未签名，下载后按[安装教程](docs/install.md)核对 SHA256。

软件内可从「工具与帮助 → 使用说明」或托盘的使用说明入口打开离线教程。下载源码中的 Markdown 文件后，也可以用支持 Markdown 的编辑器阅读。

## 支持的入口

- **小红书**：单篇笔记、作者主页和具体收藏夹。
- **花瓣、Pinterest**：当前作品和具体画板；花瓣支持画板中的普通与素材采集。
- **X**：单帖和作者主页；主页批量不包含转帖与引用帖。
- **B站**：单视频、分 P、视频合集、UP 主投稿、图文和文集。
- **YouTube**：单视频、Shorts、播放列表与频道入口。
- **Instagram、ArtStation、微博**：已适配的作品或列表入口。
- **其他网页**：当前文章正文与图片。

打开作品页或列表页后，扩展会显示该页面可选的采集方式。需要登录的内容先在 Chrome 登录；X 主页批量期间请保持页面在前台。[常见问题](docs/use-cases.md)

## 文件放在哪里

新采集按类型、平台和入口命名，图片、视频、字幕直接放在作品目录；没有内容的分类不创建文件夹。

例如小红书收藏夹为 `批量/小红书/收藏夹采集-减肥-Ivy/图文-笔记标题`，B站分 P 为 `批量/B站/分P采集-总标题-UP主/P03-分P标题`。[各平台保存目录](docs/SAVE-LAYOUT-REVIEW-2026-11-11.md)

**更改素材库位置不会自动搬动旧文件。** 手动搬素材后，在设置中选择搬后的同一层目录，并保留每份素材的 `_来源记录`。如果素材库内有存放设置和记录的 `data` 文件夹，把它留在原处。

## 更新与排查

在「设置 → 关于与更新」检查新版本、更新或恢复上一版程序。托盘的「程序更新」打开同一页。更新包括后台、Chrome 扩展和 MCP；素材与设置保留。[更新与恢复](docs/update.md)

失败任务可直接打开对应诊断，也可以从左侧「诊断记录」搜索。诊断每页 10 条，详细日志按需展开。

## 让 AI 调用

通过 MCP 接入后，AI 可以提交网页采集、查看进度、查找保存结果和控制任务。采集登录网页时保持 Chrome 与 RefTray 后台运行，扩展弹窗可以关闭。[接入步骤和工具说明](docs/mcp.md)

## 保存之后怎么用

保存时留好原链接、作者、作品标题、署名和版权说明，素材旁的 `_来源记录` 也一起保留。转载、公开分享或放进商业项目之前，先确认授权覆盖这次用途；没有相应许可时，联系权利人取得许可。

本地收藏、署名或“非商用”都不是通用授权。RefTray 不提供绕过登录、付费、验证码、DRM 或访问限制的功能。[素材使用与隐私](docs/rights-and-privacy.md)

## 项目说明

RefTray 是独立项目，平台名称用于说明支持哪些网页。

源代码可公开查看，项目尚未选定开源许可证；第三方组件遵守各自许可。[第三方声明](docs/third-party-notices.md) · [媒体组件](docs/third-party-media.md)

维护：[iiiiivy123](https://github.com/iiiiivy123) · [问题反馈](https://github.com/iiiiivy123/RefTray/issues) · [全部文档](docs/README.md)。反馈请附版本、步骤与脱敏截图。开发过程中使用 OpenAI Codex 辅助。

## Windows 构建前检查

构建宿主使用 Python 3.11 或更新版本及 pip；安装包运行时仍为锁定的 Python 3.13。先准备项目要求的离线 wheelhouse、运行时及编译工具，再从仓库根目录运行：

0.5.50起还需已核验的 `build-tools/speech-runtime`。可用 `tools/prepare_build_inputs.py --media-source <媒体组件目录> --speech-source <已核验的speech-tools目录>` 准备；语音引擎、模型、对应源码与许可证按独立清单校验，缺失时在生成安装包前停止。原生构建方法、固定源码和许可见 [本地语音组件](docs/third-party-speech.md)，无需将本机完整FFmpeg或外部语音环境带进安装包。

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
