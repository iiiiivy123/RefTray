# 用 AI 调用 RefTray

RefTray 提供本机 stdio MCP 接口。AI 客户端启动一个接口进程，接口再调用正在运行的 RefTray 后台，素材保存到你设置的素材库。

## 接入

1. 安装 RefTray，启动托盘后台。
2. 在支持 stdio MCP 的 AI 客户端中添加服务器，名称填 `reftray`。
3. 将启动命令指向安装目录的 `runtime/python.exe`，参数依次为 `-B` 和 `server/mcp_stdio.py` 的完整路径。
4. 重启或刷新客户端的 MCP 连接，先调用 `reftray_status` 查看连接状态。

例如，这台机器的程序目录是 `F:\RefTray\app`：

```text
command: F:\RefTray\app\runtime\python.exe
args:
  -B
  F:\RefTray\app\server\mcp_stdio.py
```

把示例路径换成自己的安装路径。默认安装位置为 `%LOCALAPPDATA%\Programs\InspirationCollector`；自选位置的用户沿用自己的目录。接口默认连接 `127.0.0.1:8766`。自定义端口时，在客户端为接口进程设置 `REFTRAY_MCP_PORT`。

## 可以调用什么

| 工具 | 用途 | 参数 |
| --- | --- | --- |
| `reftray_status` | 查看后台版本、连接状态和素材库 | 无 |
| `reftray_download_post` | 保存 Pinterest Pin 或 X 原帖中已核对的公开图片 | `url` |
| `reftray_resolve_video` | 解析原帖视频来源 | `url` |
| `reftray_download_video` | 提交一个原帖视频下载；多视频先返回数量供选择 | `url`，可选 `media_index`（从1开始） |
| `reftray_job_status` | 查询保存结果、错误和实际文件位置 | `job_id`，`kind`（`collect` 或 `video`） |

图片接口支持 Pinterest 和 X 原帖链接，X 返回分享图；Pinterest 除分享图外，还可核对 Pin 原图及逐页静态故事图片。返回的 scope 和 warning 说明此次保存范围。多图和评论请用浏览器扩展。视频接口支持 X 主帖、YouTube 单视频及 Shorts、B 站单稿件（保留指定分 P），沿用现有解析器，下载提交后继续查询任务，完成时会返回保存结果。

多视频返回 `status: selection_required`、`media_count` 和空的 `jobs`，表示尚未启动下载。再次调用时传 `media_index` 选择一个视频，随后用返回的任务号查询。当前没有自动排队下载全部视频。

## 登录与代理

MCP 当前没有接入 Chrome 登录会话。登录后可见的内容请使用已登录 Chrome 中的扩展采集；接口遇到会话要求时会返回 `SESSION_REQUIRED`。Chrome 登录保持原样，无需为接口反复退出、重新登录。

访问来源网站需要使用当前网络可用的连接方式。本机后台和 MCP 之间使用本地地址；来源网站及媒体下载沿用对应下载路径的代理处理。网络错误请查看返回的具体阶段。

## 更新后

覆盖安装前先完成或停止任务，退出托盘后台。安装完成后启动后台，并刷新 AI 客户端的 MCP 连接。升级时接口进程可能被安装器关闭，客户端重新连接即可。

[返回首页](../README.md) · [更新步骤](update.md) · [版本说明](release-0.5.37.md)
