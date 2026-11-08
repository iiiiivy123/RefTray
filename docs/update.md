# 更新 RefTray

最新预发布版：[0.5.47](https://github.com/iiiiivy123/inspiration-collector/releases/tag/v0.5.47)。稳定版：[0.5.37](https://github.com/iiiiivy123/inspiration-collector/releases/tag/v0.5.37)。

1. 完成或停止正在采集的任务。
2. 下载新版本的 Windows 安装包，安装到原来的程序目录。安装器会处理旧后台和本程序的 MCP 进程占用。
3. 启动「灵感采集」。
4. 打开 `chrome://extensions`，找到「灵感采集」，点重新加载，核对扩展版本。
5. 刷新要采集的网页。使用 AI 接口的用户再刷新客户端的 MCP 连接。

素材库、已有文件和设置会保留。更改程序安装位置不会搬动素材库。

## 新版提醒和自动安装

打开采集弹窗时，程序会检查 GitHub 正式版，成功检查后一天内不重复请求。发现更高版本会显示版本号和更新内容，可以稍后提醒或忽略该版本。

目前需要下载并运行安装包，**一键自动安装还没做**。预发布版不触发正式版提醒，需从首页下载。

## 更新后遇到问题

- 扩展仍是旧版：重新加载后再核对它使用的扩展文件夹。
- MCP 提示连接关闭：启动后台后，刷新 AI 客户端的连接。
- 后台启动失败：查看程序状态目录的 `data/inspiration/logs/service-errors.log`，保留数据再反馈。

[实际遇到的问题](use-cases.md) · [返回首页](../README.md)
