# 用 AI 调用 RefTray

把作品链接和要求发给 AI，例如“保存这篇图文，带 10 条评论”。AI 通过 RefTray 的 MCP 接口创建任务、查询进度，并返回实际保存位置。

## Chrome 采集

Chrome 和 RefTray 后台保持运行，扩展已加载即可。扩展在后台接单，自动打开或复用作品页；不用打开采集弹窗，也不用手动点击开始。空闲时通常在 30 秒内接单。

登录页面使用 Chrome 当前账号。遇到网站登录或验证页面时，先按网站提示完成操作，再重试。

**X 作者主页批量期间需要保持该页面在前台。** 扩展弹窗可以关闭，但不要把主页标签切到后台。

AI 客户端会收到任务结果，其中可能有原链接、标题、保存路径和诊断信息。使用前确认客户端的数据处理设置。[素材使用与隐私](rights-and-privacy.md)

## 接入

在支持 stdio MCP 的客户端添加 `reftray`。把下面两处 `<安装目录>` 换成你电脑上的完整路径：

```text
command: <安装目录>\runtime\python.exe
args:
  -B
  <安装目录>\server\mcp_stdio.py
```

默认安装目录为 `%LOCALAPPDATA%\Programs\InspirationCollector`。可以在文件资源管理器打开这个地址，再复制地址栏里的完整路径；自定义安装位置请用自己的目录。完整安装包同时包含后台、扩展和 MCP，更新沿用同一条启动命令，不需要重新填写安装路径。安装会关闭占用旧运行时的 MCP 进程；在 AI 客户端重新连接 RefTray 后，调用 `reftray_status` 可查看新后台版本和扩展是否在线。

## 日常使用

| 你要做什么 | AI 调用的工具 |
| --- | --- |
| 保存图片、GIF、图文、纯文字或视频 | `reftray_capture_browser` |
| 批量保存作者作品、画板或播放列表 | `reftray_capture_batch` |
| 先看当前作品有什么，或向下加载扫描 | `reftray_preview_browser` |
| 查看进度、结果和目录 | `reftray_job_status` |
| 暂停、继续、停止、重试失败项 | `reftray_task_control` |
| 查找任务或已保存作品 | `reftray_list_tasks`、`reftray_search_saved` |
| 按原链接核对本地文件 | `reftray_find_saved` |
| 查看某项任务的失败原因 | `reftray_diagnostics` |
| 本地视频转 GIF 或提取音频 | `reftray_process_local` |
| 检查官方正式新版 | `reftray_check_update` |
| 下载并安装指定的正式新版 | `reftray_install_update` |
| 查询更新进度、结果和备份位置 | `reftray_update_status` |
| 恢复上一版程序，保留当前素材和设置（0.5.50起） | `reftray_restore_update` |

从 0.5.49 起，可以直接对 AI 说“检查 RefTray 更新”或“更新到刚查到的正式版”。安装工具只接收版本号，复用界面使用的更新器，遵守同样的忙碌检查、官方来源校验、备份和重启规则。接受请求后返回下载中；最终结果持久保存，重新连接 MCP 后继续查询即可。

单篇和批量的 `mode` 都可选 `images`（图片/GIF）、`text`（图文）、`plain`（纯文字）、`video`（视频）。批量的 `scope` 选 `author` 或 `board`。具体平台支持范围跟浏览器扩展一致。

B 站分 P 选集可直接传当前视频链接，使用 `reftray_capture_batch`、`scope: author`、`mode: video`。`skip_posts: 2`、`limit: 5` 表示从第 3 P 开始保存 5 集；加 `output_format: audio` 则只保存这 5 首音频。每一 P 单独计数和命名。

视频页右侧的多稿件合集沿用同一入口和参数。当前稿件只有一个 P 时，读取其已加载的完整合集目录；`skip_posts: 23`、`limit: 2` 表示保存合集第 24、25 个视频。合集保留各稿件标题，不收集侧栏推荐；单个稿件含多个 P 时优先沿用分 P 范围。

0.5.50浏览器界面直接填写“从第几 P 开始”。MCP 保留原参数兼容性：用户说“从第 10 P 开始取 5 集”，AI 传 `skip_posts: 9`、`limit: 5`。恢复未完成任务沿用原起点和数量。

程序恢复与界面使用同一入口。调用前先查 `reftray_update_status` 的 `recovery.available` 和目标版本；接受后连接会断开，重新连接并查询到 `rolled_back` 才算恢复结束。后台无法启动时，用 [更新说明](update.md) 中的独立恢复程序。

## 采集选项

未指定的选项采用设置页默认值。每次任务保存一份参数，后续修改设置不会影响正在执行的任务。

| 选项 | 用途 |
| --- | --- |
| `include_comments`、`comment_limit` | 是否附带评论、最多一级评论数 |
| `include_replies`、`replies_per_comment` | 是否包含楼中楼、每条一级评论最多回复数 |
| `skip_gifs`、`video_action` | 跳过动图；附带视频选 `skip`、`save` 或 `frames` |
| `ocr_enabled` | 图文中识别图片文字 |
| `limit`、`skip_posts` | 批量目标篇数、跳过前几篇 |
| `max_images`、`min_duration`、`max_duration` | 图片数量与视频时长过滤 |
| `output_format` | 视频保存原格式 `original`，或提取音频 `audio` |
| `subtitle_mode` | `none` 仅视频、`with_video` 视频加字幕和 MD、`only` 仅文字稿 |
| `subtitle_language`、`video_quality` | 字幕语言与视频画质 |
| `strategy`、`interval` | 抽帧方式与秒数间隔 |
| `trim_start`、`trim_end` | 跳过开头、结尾的秒数 |
| `media_index` | 单篇视频只保存第几个；不填则按顺序保存该帖识别到的视频 |
| `destination`、`layout` | 本次保存目录与目录整理方式 |
| `duplicate_policy`、`max_video_mb` | 重复保存处理与单文件下载上限 |

楼中楼单独计数。例如 10 条一级评论、每条 2 个回复，最多保存 30 条。能展开、读取哪些评论沿用对应平台的采集规则。纯文字不保存图片；视频入口不附带评论；音频不生成字幕和抽帧。

例：保存一篇图文及评论。

```json
{"url":"https://x.com/example/status/123","mode":"text","options":{"include_comments":true,"comment_limit":10,"include_replies":true,"replies_per_comment":2}}
```

例：批量保存 5 篇图片作品。

```json
{"url":"https://x.com/example","scope":"author","mode":"images","options":{"limit":5,"skip_gifs":false,"video_action":"skip"}}
```

## 查询与控制

采集返回 `job_id` 和 `kind`，把这两个值原样交给 `reftray_job_status`。Chrome 采集的 `kind` 为 `task`，进度包括整批完成数和当前媒体进度。暂停在采集安全位置生效；当前图片写入会先收尾。停止保留已保存文件。

`reftray_task_control` 的 `action` 可选 `pause`、`resume`、`stop`、`retry`。继续中断任务或重试会返回新任务号；批量重试保留成功记录，只处理失败项。后台重启后旧任务会显示中断，可继续。浏览器连接中断会在查询时更新状态。

失败后调用 `reftray_diagnostics`，传 `job_id`，即可看到该任务及对应诊断；无需再去管理页找编号。已保存文件仍可通过原链接核对。

## 原有直接下载工具

`reftray_download_post` 保存公开图片，`reftray_download_video` 保存一个公开视频，`reftray_download_videos` 顺序保存整帖公开视频。这些入口直接访问网站，不使用 Chrome 登录页面；需要登录、评论或完整采集选项时使用上面的 Chrome 入口。

`reftray_resolve_video` 用于先看视频数量和画质，再选择下载哪个。普通下载自动完成解析，用户不需要单独操作它。`reftray_stop_queue` 可停止原有视频队列。

本地视频加工返回 `kind: local`，可查询进度或停止。原有单篇图片任务只支持停止；暂停和继续使用 Chrome 采集任务。

保留平时访问网站所用的代理设置。MCP 与后台在本机通信，下载使用现有网络配置。
