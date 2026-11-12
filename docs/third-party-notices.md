# Third-party notices / 第三方代码声明

本项目自身**尚未选定开源许可证**。下列第三方代码按各自许可分发；这些许可**不表示**本项目所有源代码均采用 MIT，也不授予任何来源图片、图文或视频的版权。

## CAT·LOGUE — MIT License

本仓库以下文件以对应上游实现为基础，并包含本地兼容调整，与上游原版存在差异：

| 当前仓库 | 上游 CAT·LOGUE 文件 |
| --- | --- |
| `source/extension/cat-media.js` | [`media_core.js`](https://github.com/cicicjy/CAT-LOGUE/blob/main/media_core.js) |
| `source/extension/cat-instagram.js` | [`instagram_core.js`](https://github.com/cicicjy/CAT-LOGUE/blob/main/instagram_core.js) |
| `source/extension/cat-xhs.js` | [`xhs_core.js`](https://github.com/cicicjy/CAT-LOGUE/blob/main/xhs_core.js) |

上游项目：[cicicjy/CAT-LOGUE](https://github.com/cicicjy/CAT-LOGUE)。  
上游授权：[MIT License](https://github.com/cicicjy/CAT-LOGUE/blob/main/LICENSE)。  
本仓库保留其原始版权及许可文本：[CAT-LOGUE-LICENSE.txt](CAT-LOGUE-LICENSE.txt)。

这些文件基于第三方作者的工作。后续对其中代码的修改应继续保留相应版权和许可声明。

**随包许可**：安装包 `licenses` 目录包含 CAT·LOGUE MIT 许可文本及第三方声明。

## yt-dlp

安装包包含 `yt-dlp==2026.10.26` 的 Python 包，并保留其许可文本。B站适配调用上游提取器而非复制网络解析实现，详见 [yt-dlp 许可与来源](ytdlp-license.md)。

## FFmpeg、Python 及其他依赖

Windows 安装包的媒体组件来源、对应源码、构建方式与许可说明见 [third-party-media.md](third-party-media.md)。Python 运行时与 Python 依赖分别受各自许可证约束，具体仍需在正式发布流程中核对发行包内容。

如发现署名、许可或来源清单不完整，请通过 GitHub Issues 报告，不要在公开 Issue 中提交敏感数据。
