# RefTray 维护者发布清单

[品牌规范](../marketing/brand-guide.md) · [产品资料](../marketing/press-kit.md) · [宣传文案](../marketing/launch-copy.md) · [演示脚本](../marketing/demo-script.md) · [开发与构建](README.md) · [发布记录](https://github.com/iiiiivy123/RefTray/releases)

## 发布前检查

1. **核对功能和问题。** 按平台、页面和模式记录测试结果。版本说明写清更新内容、测过什么、哪些问题还在；用户教程优先说明怎么操作和如何排错。
2. **检查安装和更新。** 在干净 Windows 环境测试首次安装、覆盖更新、旧记录保留、扩展加载、图文与视频保存、卸载和托盘操作。记录使用的系统和测试环境。每次发布的实测结果记录在 [TASK](TASK.md)，未执行的安装器或真机检查单独列出，不能沿用旧版结论。
3. **核对安装包内容。** 检查内置组件、中文说明、校验文件和下载入口；README、Release 和随包说明中的版本、步骤保持一致。
4. **核对更新路径。** 新版可在「设置 → 关于与更新」更新；旧版首次升级、仓库改名后提示来源不一致时，按[更新说明](../update.md)覆盖安装完整包。手动安装前退出旧后台，完成后重载扩展并刷新作品页；MCP 客户端需要重新连接。
5. **保持数据兼容。** 沿用安装器 AppId、状态目录和采集索引；修改 `InspirationCollector`、`LIBLIB_ROOT` 或旧路径前，先检查升级与数据迁移。
6. **核对许可。** 随代码和安装包保留 CAT·LOGUE 的 MIT 许可、FFmpeg 对应源码和 LGPL、Python 等组件的许可材料，见 [第三方声明](../third-party-notices.md)。Windows 构建使用非商业用途的 Inno Setup，商业构建前需核对工具许可。项目级 `LICENSE` 尚未选定；确定授权和兼容性后再开放相应修改与再分发权限。
7. **准备真实演示。** 使用自有或获准素材录制，遮住个人路径和凭据。说明当前 Windows + Chrome 的使用方式、具体适配范围；保留第三方署名，避免造成平台官方合作的误解。
8. **写清变更。** 品牌、功能、许可和隐私处理发生变化时，在 Release 中说明；新安装包构建并测试完成后再更新下载入口。

## 测试入口

依赖预检、架构检查和回归命令统一见[开发指南](README.md)，先通过依赖预检再打包。

Windows 安装测试脚本为 `tools/verify_windows_install.py`。参数 `--run-isolated-installer-tests` 会实际安装、升级、卸载，并临时写入再恢复本软件的卸载注册项。运行前阅读脚本，优先使用专门的 Windows 测试环境。

## 对外介绍

- **名称**：RefTray · 灵感采集。程序和 Chrome 扩展显示「灵感采集」；安装包和部分内部目录保留 `InspirationCollector` 以兼容旧版。
- **中文短句**：把网页素材，存进自己的文件夹。
- **GitHub Description**：Local-first Windows + Chrome tool for saving authorized web images, Markdown notes and supported videos, with selected batch workflows and frame extraction.
- **GitHub Topics**：`chrome-extension`、`web-clipper`、`reference-manager`、`markdown`、`local-first`、`video-frame-extraction`、`windows-app`、`pinterest`、`image-archiving`。

名称做过初步公开检索，商标、域名和软件商店的完整核查仍待完成。注册或商业使用前另行核对。

## GitHub 页面与搜索

- 用真实问题组织 FAQ，例如“画板图片怎么保存？”“图文怎么导出 Markdown？”“视频怎么抽帧？”。
- 中英文主页互相链接；功能和使用条件保持一致，避免重复堆砌关键词。
- 使用获许可的真实评价和录屏。下载量、Stars 和第三方引用按实际情况填写。
- About、Topics 和 Social preview 需在仓库设置中单独核对。改仓库名时，检查 Release、克隆地址和外部文档中的链接。
- 推广时展示从网页到本地文件的实际操作，先收集可复现的使用反馈。程序不提供绕过付费或访问限制的功能。
