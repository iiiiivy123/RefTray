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

## 0.5.47 可以调用什么

| 工具 | 用途 | 参数 |
| --- | --- | --- |
| `reftray_status` | 查看后台版本、连接和素材库 | 无 |
| `reftray_download_post` | 保存 Instagram 公开静态轮播、Pinterest Pin 或 X 分享图片 | `url` |
| `reftray_capture_browser` | 通过 Chrome 扩展采集当前登录页面 | `url`，`mode`：`images`、`text`、`video`，默认 `images` |
| `reftray_find_saved` | 按作品链接查本地已有文件和保存范围 | `url` |
| `reftray_resolve_video` | 解析原帖视频 | `url` |
| `reftray_download_video` | 下载一个视频；多视频时可指定第几个 | `url`，可选 `media_index`，从 1 开始 |
| `reftray_download_videos` | 将一帖中的全部视频按顺序下载 | `url` |
| `reftray_stop_queue` | 停止视频队列，保留已保存文件 | `job_id` |
| `reftray_job_status` | 查询进度、结果和文件位置 | `job_id`，`kind`：`collect`、`video`、`task` |

## 使用 Chrome 当前登录页面

在 Chrome 打开目标作品，保持 RefTray 采集弹窗打开，再调用 `reftray_capture_browser`。请求交给已配对的扩展，由扩展读取当前页面并采集。返回任务号后，用 `reftray_job_status` 查询，`kind` 填 `task`。

这个入口已经接入 Chrome 页面；普通下载工具由后台直接访问来源网站。无需导出 Cookie。X 登录视频的页面读取已修改，真实下载验证还没完成。

## 下载一帖中的多个视频

想全部下载，调用 `reftray_download_videos`，随后按返回的任务号查询 `kind: task`，需要停止时调用 `reftray_stop_queue`。

只想选其中一个，调用 `reftray_download_video`。返回 `selection_required` 时，按 `media_count` 选择序号，再传 `media_index` 下载。

直接视频接口支持 X 主帖、YouTube 单视频和 Shorts、B站视频；B站链接里的分 P 参数会保留。

## 连接和更新

保留平时访问这些网站所用的代理设置。MCP 与后台在本机通信，下载仍需要访问来源网站。

升级会关闭旧 MCP 进程。启动新版后台后，刷新 AI 客户端的连接，再用 `reftray_status` 核对版本。

[返回首页](../README.md) · [更新步骤](update.md) · [版本说明](release-0.5.47.md)
