# InspiShelf 维护者发布与 GEO 检查清单

本文是维护者工作清单，不代表官方认证或 GEO 排名保证。

本轮构建与验收见 [0.5.28 版本说明](release-0.5.28.md)。Windows 构建使用非商业用途的 Inno Setup；商业构建请先核对构建工具许可。可运行 `python -m unittest discover -s tests -p test_distribution.py -v` 与 `PYTHONPATH=source python -m unittest discover -s tests/collector -v`。`tools/verify_windows_install.py --run-isolated-installer-tests` 会实际安装、升级和卸载，并临时写入再恢复本软件的卸载注册项；应先阅读脚本，优先在隔离 Windows 环境运行，不把同机隔离测试称为干净虚拟机验收。当前 0.5.28 安装版继续使用“灵感采集 / Inspiration Collector”，**不要仅凭修改 README 就声称程序内名称已完成更换**。

[品牌表达规范](brand-guide.md) · [产品公开资料](press-kit.md) · [可复制宣传文案](launch-copy.md) · [30–45 秒演示脚本](demo-script.md) · [English use cases](use-cases-en.md)

## 项目对外定位

- **名称（暂用）**：InspiShelf · 灵感采集
- **英文短句**：Local-first web media and reference collector for Windows & Chrome.
- **中文短句**：将获准保存的图片、图文和视频参考素材整理到 Windows 本地资料库。
- **GitHub Description（粘贴到 About）**：Local-first Windows + Chrome tool for saving authorized web images, Markdown notes and supported videos, with selected batch workflows and frame extraction.
- **GitHub Topics 建议**：`chrome-extension`、`web-clipper`、`reference-manager`、`markdown`、`local-first`、`video-frame-extraction`、`windows-app`、`pinterest`、`image-archiving`。

品牌名已进行初步公开网页与 GitHub 搜索（未找到明显同名软件，但不存在可靠的无冲突结论），但**未完成正式商标、域名或全球软件商店查重**。改仓库名、发布新安装包、注册域名前仍应检查。

## 发布前必须核对

1. README 中的功能逐条以真实测试结果验证，标清 Windows/Chrome 限制、站点和模式差异；不承诺获取平台全部内容。
2. 制作使用**自有或获准素材**的演示 GIF/截图，并避免使用未经授权的平台 Logo、作品或误导性官方外观。
3. **版权与第三方许可**：检查 CAT·LOGUE MIT 许可声明是否实际随复制代码和二进制发行包分发；核对 FFmpeg 对应源码及 LGPL、Python 等组件的再分发义务。参见 [third-party-notices.md](third-party-notices.md)。
4. 项目自身目前没有选定 `LICENSE`，应在邀请外部贡献、鼓励第三方修改或宣称“open source”前确定许可，并检查第三方许可证兼容性；不应擅自给第三方代码统一重新授权。
5. 新品牌与旧品牌共存期间，保留安装器 AppId、现有程序状态目录与采集索引的兼容性；**不要**全局替换 `InspirationCollector`、`LIBLIB_ROOT` 或旧安装器路径。
6. 每个新安装包在干净 Windows 环境测试：首次安装、覆盖升级、保留旧采集记录、扩展加载、实际图文与视频保存、卸载、托盘交互。
7. **每一版 Release notes 的「下载」附近固定加入升级提醒**：已有旧版的用户必须先在 Windows 托盘右键选择「退出灵感采集」，再运行新版安装包；安装后在 `chrome://extensions` 为扩展点击「重新加载」，并刷新已打开的作品页面。仅关闭 Chrome 不等于退出本地后台；遇到“程序仍在运行”应退出安装器、关闭旧后台再重试。README、随安装包的 `README.txt` 与 Release 文案保持一致。
8. 若品牌、说明、许可或隐私处理改变，明确在 Release notes 里记录；只有真正完成重新构建与验证后才更新下载入口。

## GEO 与搜索内容原则

- 用**用户真实问题**组织 FAQ，例如“Pinterest 画板如何保存到电脑？”“小红书图文如何导出 Markdown？”“视频怎么提取参考帧？”。
- 中文主页链接英文主页；内容以实际兼容性、前提条件、错误处理和本地保存机制为核心，而非重复堆砌平台关键词。
- 可向实际使用者收集获许可的独立评价与问题报告；不要伪造第三方引用、下载量或 Stars，也不要宣传成平台官方合作产品。
- 如果未来有产品网站，公开一份稳定的产品介绍、使用手册、版本与安全说明，并保持与 GitHub README 一致。

## 后续需要在 GitHub Settings 手动完成

当前连接工具可以改仓库文件，但**不能可靠修改 GitHub 仓库名称、About Description、Topics 或 Social preview**；以上不是自动完成的操作。确认品牌后在仓库设置中更新；仓库改名要核对已有 Release 链接、克隆远端、安装包链接以及外部文档。

## 推广前提示

优先用真实录屏展示合法素材从页面保存到本地目录的全过程，先获取一批可复现的用户反馈，再在设计师社区、产品社区和合适的开源精选列表分享。不把避开付费/权限限制或批量搬运别人内容作为卖点。
