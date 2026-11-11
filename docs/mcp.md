# 用 AI 调用 RefTray

把作品链接和要求发给 AI，例如“保存这篇图文，带 10 条评论”。AI 通过 RefTray 的 MCP 接口创建任务、查询进度，并返回实际保存位置。

## Chrome 采集

Chrome 和 RefTray 后台保持运行，扩展已加载即可。扩展在后台接单，自动打开或复用作品页；不用打开采集弹窗，也不用手动点击开始。空闲时通常在 30 秒内接单。

登录页面沿用接单的 Chrome 配置文件中已登录的账号。MCP 没有选择账号或 Chrome 配置文件的参数；建议只在本次要使用的配置文件中运行 RefTray 扩展，避免其他配置文件接单。遇到登录或验证页面时，在 Chrome 按网站提示完成后再重试，不用把 Cookie 或密码发给 AI。

**X 作者主页批量期间需要保持该页面在前台。** 扩展弹窗可以关闭，但不要把主页标签切到后台。

AI 客户端会收到任务结果，其中可能有原链接、标题、保存路径和诊断信息。使用前确认客户端的数据处理设置。[素材使用与隐私](rights-and-privacy.md)

## 接入

先启动 Windows 中的「灵感采集」，确认托盘图标已经出现，再配置 AI 客户端。MCP 接口不会代替你启动后台。

在支持 stdio MCP 的客户端添加一个名为 `reftray` 的服务。默认安装目录是 `%LOCALAPPDATA%\Programs\InspirationCollector`；在文件资源管理器打开这个地址，复制地址栏中的完整路径。自定义安装位置请用实际目录。

如果客户端分别填写命令和参数：

- 命令：`<安装目录>\runtime\python.exe`。
- 第一个参数：`-B`。
- 第二个参数：`<安装目录>\server\mcp_stdio.py`。

参数分成两项填写，不要把整条命令粘进一个参数。这里的 `<安装目录>` 必须替换；不要指向源码里的 `source/server` 或别人的安装位置。

下面是使用 `mcpServers` 配置格式的客户端示例。把两处 `C:/Users/你的用户名/AppData/Local/Programs/InspirationCollector` 都换成实际安装目录；客户端使用其他格式时，照上面的字段填写。

```json
{
  "mcpServers": {
    "reftray": {
      "command": "C:/Users/你的用户名/AppData/Local/Programs/InspirationCollector/runtime/python.exe",
      "args": [
        "-B",
        "C:/Users/你的用户名/AppData/Local/Programs/InspirationCollector/server/mcp_stdio.py"
      ]
    }
  }
}
```

JSON 示例用 `/` 表示路径分隔符，避免反斜杠转义问题。客户端不一定会展开 `%LOCALAPPDATA%`，请填完整路径。

连接后先检查状态。工具：`reftray_status`

```json
{}
```

看返回的 `release` 是否与安装版本一致，`browser.ready` 是否为 `true`。连接不到后台时先启动「灵感采集」；Chrome 未就绪时，打开已加载同版本扩展的 Chrome，再重试。

更新沿用同一安装目录时，启动配置不需要改。安装会关闭占用旧运行时的 MCP 进程；在 AI 客户端重新连接后，再查一次状态。

## 本机连接与访问范围

这是由 AI 客户端在你的电脑上启动的 stdio MCP 程序，不是可以填入网址的远程 MCP 服务。它再连接本机后台，默认地址为 `127.0.0.1:8766`；网页采集和更新仍需要网络。

- **只接入你信任的客户端。** MCP 可以创建采集任务、操作任务、读取结果和诊断，也能调用更新与恢复。请查看客户端的工具授权设置，不需要的操作不要长期自动批准。
- **不要把后台端口公开到外网或局域网。** 后台校验已登记的浏览器扩展来源和请求令牌，但本机程序可以取得该令牌；这不是用来隔离同一台电脑上其他程序或用户的账号鉴权。
- **保存范围不只限于默认素材库。** 任务的 `destination` 可以指定当前 Windows 用户有权写入的完整路径。使用单独的素材文件夹，开始前核对目标，不要选系统目录、程序安装目录或放有重要原件的目录。
- **本地视频加工会读取你指定的文件。** `reftray_process_local` 可读取素材库之外的本地视频，要求完整路径、受支持的视频格式、文件非空且不超过 512 MB。文件传给本机后台处理；只向 AI 提供你打算处理的那份文件路径。
- **AI 客户端有自己的数据处理方式。** 任务结果可能包含标题、原链接、本机路径和诊断信息；客户端是否将这些内容交给云端模型，由它的设置和服务规则决定。不要把本地保存理解成所有信息都不会离开电脑。

普通使用无需填写令牌，也不需要改端口。正式 Windows 启动器与 Chrome 扩展使用 `8766`；仅设置 MCP 的 `REFTRAY_MCP_PORT` 不能让整套程序切换端口。遇到占用时，先退出自己仍在运行的旧版后台；仍有冲突就保留错误提示反馈，不要结束来源不明的其他程序。

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
| 恢复上一版程序，保留当前素材和设置 | `reftray_restore_update` |

检查更新不会下载或安装。先让 AI 调用 `reftray_check_update`，看清目标版本和更新说明，再明确要求更新；这时才调用 `reftray_install_update`，传入刚查到的版本号。它与界面共用更新器，保留忙碌检查、官方来源校验、备份和重启流程。

**安装和恢复工具一旦调用，就会开始操作。** 不保证另外弹出确认框，是否再次询问由 AI 客户端的授权设置决定。只想查询时，用检查或状态工具。安装请求被接受只表示已开始，重新连接后用 `reftray_update_status` 确认最终结果。

单篇和批量的 `mode` 都可选 `images`（图片/GIF）、`text`（图文）、`plain`（纯文字）、`video`（视频）。单篇用 `scope: single`，不填时也是单篇；批量工具必须填写 `scope`，只接受 `author` 或 `board`。作者主页、B站选集、播放列表和收藏夹用 `author`，具体画板用 `board`，不要另造 `playlist`、`collection` 等 scope 值。平台和列表类型由链接识别，支持范围与浏览器扩展一致。

B 站分 P 选集可直接传当前视频链接，使用 `reftray_capture_batch`、`scope: author`、`mode: video`。在 `options` 中填 `skip_posts: 2`、`limit: 5`，表示从第 3 P 开始保存 5 集；加 `output_format: audio` 则只保存这 5 集的音频。每一 P 单独计数和命名。

视频页右侧的多稿件合集沿用同一入口和参数。当前稿件只有一个 P 时，读取其已加载的完整合集目录；`skip_posts: 23`、`limit: 2` 表示保存合集第 24、25 个视频。合集保留各稿件标题，不收集侧栏推荐；单个稿件含多个 P 时优先沿用分 P 范围。

浏览器界面直接填写“从第几 P 开始”。MCP 保留原参数兼容性：用户说“从第 10 P 开始取 5 集”，AI 传 `skip_posts: 9`、`limit: 5`。恢复未完成任务沿用原起点和数量。

想退回上一版时，先查 `reftray_update_status` 的 `recovery.available` 和可恢复版本。看清目标并明确要求恢复这版后，再调用 `reftray_restore_update`。接受后连接会断开，重新连接并查询到 `rolled_back` 才算恢复结束。后台无法启动时，用 [更新说明](update.md) 中的独立恢复程序。

## 采集选项

下面这些选项都放在 `options` 对象里，不放在 `url`、`mode`、`scope` 同一层。未指定的选项采用设置页默认值；每次任务保存一份参数，后续修改设置不会影响正在执行的任务。

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

## 调用示例

下面的 JSON 是对应工具的参数，不是客户端的启动配置。网址和文件路径都是示例，使用时换成你有权保存或处理的内容。

### 保存一篇图文及评论

工具：`reftray_capture_browser`

```json
{
  "url": "https://x.com/example/status/123",
  "scope": "single",
  "mode": "text",
  "options": {
    "include_comments": true,
    "comment_limit": 10,
    "include_replies": true,
    "replies_per_comment": 2
  }
}
```

### 从作者主页保存 5 篇图片作品

工具：`reftray_capture_batch`

```json
{
  "url": "https://x.com/example",
  "scope": "author",
  "mode": "images",
  "options": {
    "limit": 5,
    "skip_gifs": false,
    "video_action": "skip"
  }
}
```

### B站从第 10 P 开始，取 5 集音频

工具：`reftray_capture_batch`

```json
{
  "url": "https://www.bilibili.com/video/BV1234567890/",
  "scope": "author",
  "mode": "video",
  "options": {
    "skip_posts": 9,
    "limit": 5,
    "output_format": "audio"
  }
}
```

`skip_posts` 是跳过的数量，从 0 算；开始序号减 1 就是要填的值。它、`limit` 和 `output_format` 都在 `options` 里。

### 把本地视频另存为 GIF

工具：`reftray_process_local`

```json
{
  "path": "C:/Users/你的用户名/Videos/示例视频.mp4",
  "format": "gif"
}
```

文件必须已经存在。提取音频时把 `format` 改为 `audio`；原文件保留。

## 查询与控制

采集返回 `job_id` 和 `kind`，把这两个值原样交给 `reftray_job_status`。Chrome 采集的 `kind` 为 `task`，进度包括整批完成数和当前媒体进度。暂停在采集安全位置生效；当前图片写入会先收尾。停止保留已保存文件。

例如查询刚才的 Chrome 采集，先把 `PASTE_JOB_ID` 换成它返回的 `job_id`。本地加工等其他任务请沿用其返回的 `kind`，不要都写成 `task`。

工具：`reftray_job_status`

```json
{"job_id": "PASTE_JOB_ID", "kind": "task"}
```

返回任务号只说明已接单，不能当作文件已保存。根据状态继续查询；完成后核对结果中的保存位置，失败则查看该任务诊断。

`reftray_task_control` 的 `action` 可选 `pause`、`resume`、`stop`、`retry`。继续中断任务或重试会返回新任务号；批量重试保留成功记录，只处理失败项。后台重启后旧任务会显示中断，可继续。浏览器连接中断会在查询时更新状态。

失败后调用 `reftray_diagnostics`，传 `job_id`，即可看到该任务及对应诊断；无需再去管理页找编号。已保存文件仍可通过原链接核对。

## 原有直接下载工具

`reftray_download_post` 保存公开图片，`reftray_download_video` 保存一个公开视频，`reftray_download_videos` 顺序保存整帖公开视频。这些入口直接访问网站，不使用 Chrome 登录页面；需要登录、评论或完整采集选项时使用上面的 Chrome 入口。

`reftray_resolve_video` 用于先看视频数量和画质，再选择下载哪个。普通下载自动完成解析，用户不需要单独操作它。`reftray_stop_queue` 可停止原有视频队列。

本地视频加工返回 `kind: local`，可查询进度或停止。原有单篇图片任务只支持停止；暂停和继续使用 Chrome 采集任务。

保留平时访问网站所用的代理设置。MCP 与后台在本机通信，下载使用现有网络配置。
