# 版权、平台关系与隐私 / Rights, platform affiliation & privacy

适用于 RefTray · 灵感采集（较早名称 InspiShelf；程序内名称为“灵感采集 / Inspiration Collector”）。这份说明是**产品使用与数据处理说明，不是法律意见或为用户提供的版权授权**。各司法辖区法律与平台条款不同，应根据具体用途核对。

## 来源内容的权利

- 网页公开可见**不等于**允许复制、下载、再发布、出售、训练模型或商业使用。图片、文字、评论、视频、音乐、人物肖像、商标及其他内容可能受到不同权利保护。
- 仅保存和使用你拥有权利、获得相应许可，或适用法律明确允许的内容；取得素材不转移原权利人的权利。
- 尊重来源署名、许可条件和保留水印的要求。不要用本工具移除权利信息、冒充作者、批量搬运或侵犯隐私。
- 若对某类素材可否保存、再传播或用于商业活动存在疑问，应先取得权利人许可或咨询适用法律下的专业意见。

## 平台名称与第三方关系

“RefTray”是本项目的对外名称；“小红书 / Xiaohongshu / RedNote”“X / Twitter”“Instagram”“Pinterest”“花瓣”“bilibili / B站”等名称仅用于说明**兼容性**，相关商标与标识归各自权利人所有。本项目不是这些平台的官方插件，未获其赞助、认可或授权进行品牌代言。请勿将本项目宣传为“官方”“授权下载器”或其他可能导致混淆的产品。

## 使用边界

- 工具并不提供绕过登录、付费、验证码、DRM、反访问控制措施的能力。
- 平台可能限制自动化访问、批量请求、抓取或内容复制。功能在技术上可用，**不等于平台条款允许该用法**。用户应自行核对并遵守适用规则。
- 仅处理你有权处理的内容；不要收集或公开私人信息、未获同意的私密内容或未经授权的他人数据。
- 平台改版、权限、网络、媒体格式及页面加载状态可能导致错误或遗漏。

## 当前版本的数据处理方式

- 安装版通过 Chrome 扩展与本机后台服务配合，后台使用 `127.0.0.1` 回环地址；素材保存到用户选择的**本地文件夹**。
- 采集时会向来源网页、图片 CDN 和视频 CDN 发送读取请求，下载后的素材保存在本机。
- Chrome 扩展可能在受支持的网站读取当前页面中已加载的作品媒体、标题、正文及用户主动选择的评论；部分读取使用浏览器现有访问状态。现有代码并不以向开发者服务器上传素材为工作方式。
- 使用记录、任务状态和本地目录偏好可能保存在浏览器本地存储、本地索引数据库和配置文件中。浏览器与来源网站的既有隐私规则仍然适用。
- 卸载软件不保证删除用户选择的素材目录、历史记录或独立的本地配置；请按 [使用教程](usage.md) 检查相关位置。
- 反馈问题时只提交必要的脱敏信息，**切勿发布 Cookie、访问令牌、账号凭据、家庭目录路径、未经许可的图片或私人聊天内容**。

以上仅描述当前公开代码的设计，不构成对用户整台设备、所有来源网站或未来版本的全面隐私审计结论。

## 权利、隐私和安全问题的反馈

请使用 [GitHub Issues](https://github.com/iiiiivy123/inspiration-collector/issues) 发起不含敏感信息的问题描述，写明涉及版本、功能与可核实的情况；不要上传存在争议的完整素材。维护者可核实情况后更新说明、移除不适当内容或修正功能，但不能代替平台或权利人授予使用许可。

## English summary

RefTray is an independent, third-party local-first collection tool, **not affiliated with or endorsed by** the platforms it supports. Platform names are descriptive only. Publicly accessible media is **not automatically licensed** for copying, redistribution or commercial use. Use it only where you have the necessary rights, authorization or another valid legal basis; comply with applicable law and site terms. The current app saves to local folders but makes ordinary requests to source websites and their CDNs. Do not submit credentials or private data in bug reports.
