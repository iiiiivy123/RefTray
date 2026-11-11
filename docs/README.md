[← 返回项目首页](../README.md) · [English](../README_EN.md)

# RefTray 项目文档

**灵感采集 · Windows + Chrome 本地素材采集工具**

第一次使用先看安装教程；遇到采集问题先查平台支持范围。这里整理已有文档，不需要在首页翻找长篇说明。

## 开始使用

| 文档 | 你能找到什么 |
| --- | --- |
| [首次安装](install.md) | 下载正确安装包、加载扩展、选择自己的素材库 |
| [旧版更新](update.md) | 退出后台、覆盖安装、重载扩展与保留数据 |
| [1.0.0 正式版说明](release-1.0.0.md) | 下载、功能范围、更新与数据保留 |
| [MCP接口](mcp.md) | AI接入、工具参数、会话与网络 |
| [全仓代码审查交接](REVIEW_HANDOFF.md) | 产品、架构、规范、历史问题和审查范围 |
| [安装与使用教程](usage.md) | 下载安装、加载 Chrome 扩展、选择素材库、日常使用、更新与故障排查 |
| [使用场景与常见问题](use-cases.md) | 启动失败、旧扩展、花瓣识别、X 登录视频与批量数量等实际反馈 |
| [English use cases](use-cases-en.md) | Reported issues and current fixes in English |
| [下载与发布记录](https://github.com/iiiiivy123/inspiration-collector/releases) | Windows 安装包、版本说明与校验文件 |

> 已有旧版：先从系统托盘**退出灵感采集**，再运行新安装包，最后重新加载 Chrome 扩展。只关闭浏览器不会退出本地后台。

## 名称与视觉

[品牌与表达规范](brand-guide.md) 包括 RefTray / 灵感采集的名称用法、已选定的文件图标、早期候选以及程序内名称的对应关系。

<picture><source media="(prefers-color-scheme: dark)" srcset="assets/icon-clean-file-white.svg"><img src="assets/icon-clean-file.svg" width="64" height="64" alt="RefTray 简洁文件图标"></picture>

**当前使用：简洁文件图标。** 空心文件轮廓 + 右上实心方块，内部不加横线。[SVG 原稿](assets/icon-clean-file.svg) · [反白版本](assets/icon-clean-file-white.svg)

首页横幅固定使用白底，不随深色模式变黑。0.5.28 构建已把同一款文件图标应用到安装器、程序与扩展。

<details>
<summary>早期图标候选（归档）</summary>

| A · 托盘 | B · 叠页 | C · 字母标 | D · 框选 |
| :---: | :---: | :---: | :---: |
| <picture><source media="(prefers-color-scheme: dark)" srcset="assets/icon-a-tray-white.svg"><img src="assets/icon-a-tray.svg" width="48" alt="托盘图标"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="assets/icon-b-sheets-white.svg"><img src="assets/icon-b-sheets.svg" width="48" alt="叠页图标"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="assets/icon-c-monogram-white.svg"><img src="assets/icon-c-monogram.svg" width="48" alt="字母图标"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="assets/icon-d-frame-white.svg"><img src="assets/icon-d-frame.svg" width="48" alt="框选图标"></picture> |

这些 SVG 是早期设计归档；当前采用上方的简洁文件图标。

</details>

## 版权、隐私与组件

[版权与隐私](rights-and-privacy.md) · [第三方声明](third-party-notices.md) · [媒体组件说明](third-party-media.md) · [CAT·LOGUE 许可](CAT-LOGUE-LICENSE.txt)

项目源代码可公开查看，尚未选择项目级开源许可证。RefTray 是独立第三方工具；保存和使用素材时，请遵守来源网站规则与内容授权。

## 发布与介绍材料

[发布指南](publishing.md) · [演示脚本](demo-script.md) · [宣传稿](launch-copy.md) · [媒体资料](press-kit.md)

这里提供介绍草稿和拍摄方案。发布时请配合当前版本的真实截图或录屏，并按 [品牌规范](brand-guide.md) 使用名称和图标。

## 反馈问题

在 [GitHub Issues](https://github.com/iiiiivy123/inspiration-collector/issues) 中说明软件版本、来源平台、操作步骤和实际结果。截图请脱敏，不要提交 Cookie、登录凭据、私人资料或受版权保护的完整媒体文件。
