// UI strings only. Captured titles, paths, OCR and source documents stay unchanged.
(() => {
  const en={
    '管理':'Manage','任务':'Tasks','工具与帮助':'Tools & help','采集默认值':'Capture defaults','视频与保护':'Video & protection','内容偏好':'Content preferences',
    '正在连接本地后台…':'Connecting to local service…','本地后台已连接':'Local service connected','后台连接失败':'Local service unavailable','本地服务 · 素材保存在你的文件夹':'Local service · Files stay in your folders',
    '查看连接与诊断 ↗':'Connection & diagnostics ↗','默认值只影响未来新任务，续采保留原参数。':'Defaults apply to future tasks. Resume keeps original options.',
    '默认设置已保存 · 仅影响之后的新任务':'Defaults saved · Applies to future tasks','有尚未保存的更改':'Unsaved changes','撤销更改':'Revert changes',
    '遇到已保存内容':'Existing content','默认采集篇数':'Default item limit','跳过动图':'Skip animations','包含已加载评论':'Include loaded comments','图片文字识别':'Image text recognition','采样间隔':'Sampling interval',
    '补齐缺失，不删除已有文件。':'Fill missing content; keep existing files.','网页抽帧从采集弹窗开始。':'Start web-video frames in the popup.','不保存 GIF / LIVE 动图内容。':'Skip GIF / LIVE animations.','仅页面已加载的内容。':'Already loaded content only.','本地 OCR':'Local OCR',
    '{count} 本页':'{count} on page','下载确认 · {count}':'Download approval · {count}',
    '扩展 {extension} · 后台 {backend}':'Extension {extension} · Service {backend}','扩展 {extension}':'Extension {extension}',
    '已确认图片 {images} · GIF {gifs} · 视频 {videos}':'Confirmed images {images} · GIFs {gifs} · videos {videos}',
 '当前作品':'Current post','批量采集':'Batch capture','媒体过滤':'Media filters','跳过 GIF':'Skip GIFs','附带内容':'Include','正文图片':'Images','待开始':'Ready','处理中':'Processing','部分完成':'Partially complete','已完成':'Complete','已停止':'Stopped','正在收尾':'Finishing','失败':'Failed','跳过':'Skipped','选择采集内容后开始':'Choose content to begin','重新识别当前页':'Identify this page again','正在识别已加载正文…':'Checking loaded main content…','已确认图片 {images} · 视频 {videos}':'Confirmed images {images} · videos {videos}','未能识别，可手动选择采集内容。':'Could not identify content. Choose manually.',
    '后台已连接':'Backend connected',
    '下载保护':'Download protection','单个下载上限':'Download size limit','单个下载上限（MB）':'Download size limit (MB)',
    '跳过前几篇':'Skip first posts','最短时长（秒）':'Minimum duration (sec)','最长时长（秒）':'Maximum duration (sec)',
    '按当前列表顺序，0 从第一篇开始；跳过项不占采集额度。':'Current list order; 0 starts at the first post. Skipped items do not consume the capture quota.',
    '0 表示不限；设置范围后，无法确认时长的媒体会跳过并记录原因。':'0 means no limit. When filtering, unknown-duration media is skipped with a recorded reason.',
    '只限制下载大小；不检查或预留磁盘空间。未知大小的媒体会在下载中检查上限。':'Limit download size only. No disk-space checks or reserves. Unknown-size downloads are checked while downloading.',
    '调整抽帧参数':'Adjust frame settings','处理进度':'Processing','任务记录与日志':'Task history & logs',
    '查看媒体解析诊断':'View media resolver diagnostics',
    '合并相近画面：适合课件、分镜；定时取图：适合普通视频。采样间隔越大，输出图片通常越少。':'Merge similar frames for slides or storyboards; timed sampling for regular videos. A longer interval usually produces fewer images.',
    '新作品保存到此处；先选择位置和目录组织方式。':'Save new works here. Choose a location and folder organization.',
    '作品目录组织方式':'Work folder organization','按平台分类（默认）':'Group by platform (default)','直接展示作品':'Show works directly',
    '只影响新作品；已有作品沿用原位置。批量保留平台和合集结构，纯文字不建作品文件夹。':'Applies to new works. Existing works keep their locations. Batches retain platform and collection folders; text-only saves do not create a work folder.',
    '保存目录组织方式':'Save folder organization','目录组织方式已保存；旧文件保留原位置。':'Folder organization saved. Existing files stay in place.',

    '跳过动图（GIF／LIVE）':'Skip GIF / LIVE animations',
    '浏览器任务日志保留最近200条；采集索引和已保存素材不受此数量限制。图片预取与下载分段使用内存或临时磁盘，正常结束或停止会清理；异常退出可能留下临时文件。正式素材不会自动清理。':'The browser task log keeps the latest 200 entries. The capture index and saved files have no such limit. Image prefetching and media segments use memory or temporary disk space, cleaned after normal completion or stopping; crashes may leave temporary files. Saved media is never cleaned automatically.',
    '每次任务图片上限':'Image limit per task',
    '0 表示不限；单页和批量共用，图片与 GIF 合计，重复和失败项也占额度。达到上限会提示未处理内容。':'0 means unlimited. Applies across a single page or batch; images and GIFs share the limit, including duplicates and failed attempts. Unprocessed items are reported.',
    '优先原语言作者字幕，其次原语言自动字幕，最后本地识别；不取翻译字幕。支持中、英、日、韩等，歌曲或混唱可能识别不准。':'Use creator captions in the original language, then original automatic captions, then local transcription. Translated tracks are excluded. Supports Chinese, English, Japanese, Korean and more; songs and mixed vocals may be inaccurate.',
    '请打开一篇 ArtStation 作品详情':'Open an ArtStation artwork',
    '保存当前作品已加载图片与说明；不包含推荐作品、嵌入视频或3D预览':'Save loaded images and text from the current artwork; recommendations, embedded videos and 3D previews are excluded.',

    '视频清晰度':'Video quality','最高可用':'Best available','最高 1080p':'Up to 1080p','最高 720p':'Up to 720p','最高 480p':'Up to 480p','按可用源选择，不放大画面；下载前显示实际画质。':'Select from available sources without upscaling. Actual quality is shown before downloading.',
    '上一页':'Previous','下一页':'Next','第 {page} / {pages} 页 · 共 {total} 条':'Page {page} / {pages} · {total} records',
    '每页20条，可翻页查看全部匹配记录。保留实际保存位置；文件移动后不会自动关联。':'20 records per page. Browse all matching records. Saved locations are retained; moved files are not automatically relinked.',
    '全部待处理':'All pending tasks','不再处理':'Ignored','已忽略':'Ignored','不再处理所选（保留文件）':'Ignore selected (keep files)',
    '不再处理（保留文件）':'Ignore (keep files)','恢复到待处理':'Restore to pending','选择本页任务':'Select tasks on this page','选择此任务':'Select this task',
    '批量附带视频':'Videos in batches','保存视频':'Save videos','图文笔记包含正文图片和动图；只要文字请选择纯文字模式。':'Notes include body images and GIFs. Choose Text only when you do not need images.',
    '任务日志':'Task log','全部记录':'All records','音频':'Audio','仅音频':'Audio only','仅视频':'Video only','保存内容':'Save content',
    '视频 + 字幕 + MD':'Video + subtitles + MD','仅视频，不提取文字':'Video only, no transcript','仅文字稿（MD）':'Transcript only (MD)',
    '优先原语言作者字幕，其次原语言自动字幕，最后本地识别。歌曲或演唱可能无法提取字幕。':'Prefer creator subtitles in the original language, then automatic subtitles, then local transcription. Songs or singing may not produce subtitles.',
    '网站字幕':'Site subtitles','原语言优先':'Original language first','中文优先':'Chinese first','英文优先':'English first','日文优先':'Japanese first','韩文优先':'Korean first',
    '优先保存网站字幕；没有可用字幕时用本地多语言模型识别，支持中、英、日、韩等。歌曲、混唱及背景音乐可能识别不准或没有结果；不自动翻译。':'Use site subtitles first, then the local multilingual model if unavailable. Supports Chinese, English, Japanese, Korean and more. Songs, mixed languages and background music may produce inaccurate or empty results. No automatic translation.',
    '跳过开头 / 结尾（可选）':'Trim start / end (optional)','跳过开头（秒）':'Trim start (seconds)','跳过结尾（秒）':'Trim end (seconds)',
    '默认不剪裁；通常仍需下载完整视频。字幕随剪裁同步。':'No trimming by default. The full video usually still downloads; subtitles follow the trim.',
    '只提取音频（M4A），不生成字幕或 MD。':'Extract audio (M4A), without subtitles or MD.','检查音轨并估算大小':'Check audio & estimate size',
    '失败':'Failed','部分成功':'Partly saved','部分完成':'Partly completed','成功':'Saved','处理中':'Running','已停止':'Stopped','图片/GIF':'Images/GIF',
    '{time} · {platform} / {kind} · {state} · {title}':'{time} · {platform} / {kind} · {state} · {title}',
    '{state} · {url} · {reason}':'{state} · {url} · {reason}',
    '小红书':'Xiaohongshu','B站':'Bilibili','花瓣':'Huaban','其他网页':'Other sites',
    '任务未完成，请打开原页重试':'Task incomplete. Open the source to retry.',
    '已跳过':'Skipped','待保存':'Ready to save',
    '检查本地完整副本，已有内容不重复下载；缺失内容补齐。重新下载仍使用同一素材库中的原目录，不删除旧文件或手动编辑内容。':'Check complete local copies and fill missing content without duplicate downloads. Downloading again reuses the original folder in the same library and preserves existing files and manual edits.',
    '图片 / GIF':'Images / GIF','保存正文图片':'Keep body images','保存已加载评论':'Keep loaded comments','识别图片文字':'Recognize image text',
    '字幕':'Subtitles','不提取字幕':'No subtitles','仅保留字幕':'Subtitles only','保留视频和字幕':'Video and subtitles','仅保存本视频封面':'Save this video cover only',
    '保存此页':'Save this page','批量保存':'Save a list',
    '批量遇到已保存内容':'Saved items in a batch','检查已有并补齐缺失':'Check existing and fill missing','重新下载（原目录）':'Download again (same folder)',
    '这是列表页，请选择「批量保存」。':'This is a list. Choose Save a list.',
    '此处无法采集，请打开一篇作品详情；批量保存请打开作者列表或具体画板。':'Open a post to save it, or an author list / board to save a batch.',
    '打开原页重试':'Open source to retry',

    '打开保存位置':'Open saved folder',
    '后台核验未完成':'Backend check incomplete',
    '本地后台响应超时。请查看任务记录确认结果，避免重复开始采集。':'The local service timed out. Check task history before starting again to avoid duplicate captures.',
    '连接不到本地后台。请从 Windows 开始菜单打开“灵感采集”，确认右下角托盘有图标，再重新打开扩展。关闭 Chrome 不会启动后台。':'Cannot connect to the local service. Open Inspiration Collector from the Windows Start menu, check its system tray icon, then reopen the extension. Closing Chrome does not start the service.',
    '纯文字 · Markdown':'Text only · Markdown','附带已加载评论':'Include loaded comments',
    '只保存 MD；不下载图片、视频或识别图片文字':'Save MD only; no images, videos or OCR',
    '使用默认目录':'Using library','选择…':'Choose…','选择其他位置仅影响本次，不改变素材库。':'Choosing another folder affects this task only.',
    '待处理':'Needs attention','仅显示进行中、未完成及失败任务。成功作品保留在采集记录。':'Only active, unfinished or failed tasks. Saved works remain in capture history.',
    '正文图片':'Images','抽帧参数':'Frame settings','普通选择自动沿用；临时目录只用于本次。':'Choices are remembered; a temporary folder applies only to this task.',
    '仅本次另存':'Save elsewhere once','恢复默认位置':'Use library','正在打开系统目录窗口…':'Opening the system folder picker…',
    '所选位置下仍按功能和平台分类。留空使用默认素材库。':'Files remain organized by type and platform. Leave blank to use the library.',
    '素材库未就绪':'Library setup required','此后台尚未设置素材库。上次保存位置：':'This service has no library configured. Previous save location: ','升级后遇到此提示，请先核对原后台。':'After an upgrade, check that the previous service is running.','首次使用请点右上角设置选择素材库。升级后遇到此提示，请先核对原后台。':'First use: choose a library in Settings. After an upgrade, check which service is running first.','没有符合筛选条件的记录。请清除筛选后再查。':'No matches. Clear your filters and search again.','当前后台的数据目录：{root}':'Current service data folder: {root}','这个目录中有 0 条采集记录。如果升级前有记录，请先核对原后台的数据目录。':'This folder contains 0 captures. If you had records before upgrading, check the data folder used by your previous service.',
    '请先在设置页选择素材库位置':'Choose your library folder in Settings first',
    '本次目录尚未创建，请先完成采集。':'This folder has not been created yet. Complete a capture first.',
    '素材库位置':'Library folder','首次使用：选择素材库位置':'Welcome: choose your library folder','更改素材库':'Change library','使用推荐位置':'Use recommended folder','确认素材库位置':'Confirm library folder',
    '所有新任务默认在此按图文、图片、视频、批量和平台分类。':'New captures are organized here by type and platform.',
    '新任务使用新位置；旧文件不会自动迁移，历史记录和未完成任务仍使用原位置。':'New tasks use the new location. Existing files are not moved; history and unfinished tasks keep their original locations.',
    '请确认：只改变以后保存的位置，不搬迁旧文件。':'Please confirm: this changes future saves only; existing files stay where they are.',
    '保存偏好会重置弹窗记忆，不影响正在运行的任务。':'Saving preferences resets remembered popup choices, not running tasks.',
    '采集偏好':'Capture preferences','视频与抽帧':'Video and frames','空间与安全':'Space and safety','帮助与工具':'Help and tools','记录':'History',
    '记录 · 作品':'History · Captures','记录 · 任务':'History · Tasks','作品':'Captures','任务':'Tasks','全部分类':'All types','全部平台':'All platforms',
    '每次显示最近200条匹配记录。保留实际保存位置；文件移动后不会自动关联。':'Shows the latest 200 matching captures. Original locations are retained; moved files are not automatically relinked.',
    '全部状态':'All states','进行中':'Running','未完成':'Unfinished','已完成':'Completed','有失败':'Has failures','暂无匹配的任务记录':'No matching tasks',
    '任务详情':'Task details','关闭':'Close',
    '更多选项':'More options','自动去重补齐':'Check & fill missing','重新读取原帖':'Read source again','评论':'Comments','图片文字识别':'Image OCR',
    '常用选择可记住；长期默认仍在设置页。':'Remember choices here; defaults are in Settings.',
    '下次沿用这些选择':'Remember these choices','记住模式、附件、参数和目录；不记住重采或续采。':'Remembers mode, attachments, parameters and folder, not refresh or resume.',
    '恢复设置页默认值':'Restore defaults','卡住时停止并重置':'Stop / reset stuck task',
    '检查本地文件并补齐缺失；相同内容不重复保存。':'Check local files and fill missing items; identical content is not duplicated.',
    '重新读取原帖；同一目录复用，保留手动编辑内容。':'Read the source again; reuse the same folder and preserve manual edits.',
    '保存文件夹':'Save folder','可选择系统文件夹，也可以直接输入路径。':'Choose a system folder or enter its path.',
    '选择系统文件夹':'Browse folders','路径':'Path','使用此目录':'Use this folder',
    '正在打开系统窗口；若未出现，可直接输入路径。':'Opening system dialog. You can also enter a path.',
    '已取消选择，原目录保留。':'Cancelled; previous folder kept.',
    '目录已选择，点击使用此目录。':'Folder selected. Click Use this folder.',
    '系统选择未完成，请直接输入路径后使用。':'System selection failed. Enter a path to continue.',
    '已请求停止；若仍无响应，请在扩展管理页重新加载。已保存文件和批量断点保留。':'Stop requested. If still stuck, reload the extension from Extensions. Saved files and batch checkpoints are kept.',
    '设置':'Settings','当前作品':'Current item','批量采集':'Batch','采集内容':'Content','图文笔记':'Notes · Markdown','视频':'Video',
    '视频处理':'Video action','仅保存':'Save only','视频数量上限':'Video limit','个视频':'videos',
    '本次选项':'Task options','返回采集':'Back','应用并返回':'Apply & back','附带视频':'Attached videos',
    '仅影响这次采集，不修改长期默认值。':'Applies to this task only. Defaults stay unchanged.',
    '长期默认值请到设置页修改。':'Change long-term defaults in Settings.',
    '正文与图片文字整理为 Markdown':'Save text and recognized image text as Markdown.',
    '只处理视频，不保存图片帖':'Videos only; image posts are skipped.','保存当前作品图片':'Save images from this item.',
    '按视频计数；图片帖跳过。重复和失败的视频占额度；最多扫描500篇。':'Counts videos, not image posts. Existing/failed videos count. Scans up to 500 posts.',
    'OCR 开':'OCR on','OCR 关':'OCR off','评论 开':'Comments on','评论 关':'Comments off','抽帧参数可调整':'Frame settings available',
    '选择文件夹':'Choose folder','使用默认目录':'Use default folder','仅抽取当前视频画面':'Extract frames from current video only',
    '继续未完成任务':'Resume unfinished task','结束这次任务':'End this task','任务没反应？':'Task not responding?',
    '扫描视频并估算大小':'Scan videos & estimate size','检查视频并估算大小':'Check video & estimate size',
    '数量请填写 1–500。':'Enter a limit from 1 to 500.','此页面不支持所选采集方式':'This page does not support that capture mode.',
    '无法选择文件夹':'Could not choose a folder.','没有新的可采视频；图片帖不占额度':'No new video; image posts do not count.',
    '来源未记录':'Source not recorded','时间未记录':'Time not recorded',
    '正在执行 · {source}':'Running · {source}','上次任务 · {source} · {time}':'Last task · {source} · {time}',
    '任务状态已更新，请查看详情。':'Task updated. See details for the original message.',
    '操作未完成，请查看详情。':'Operation could not complete. See details for the original error.',
    '续采使用原任务参数；取消续采后才能修改。':'Resuming with original settings. Uncheck resume to edit.',
    '采样间隔应为 0.5–60 秒':'Enter an interval from 0.5 to 60 seconds.',
    '没有未完成任务，请在管理页选择历史任务。':'No unfinished task. Choose a task in history.',
    '没有匹配的采集记录；旧文件可从下方导入。':'No matching captures. Import an old folder below.',
    '默认设置已保存；正在运行的任务不变。':'Defaults saved. Running tasks are unchanged.',
    '已打开原帖。打开采集面板后确认本次位置并开始；不会删除旧文件。':'Source opened. Confirm the destination in the capture popup and start. Existing files are preserved.',
    '已恢复任务。打开原页采集面板，确认继续上次任务后开始。':'Task restored. Open the capture popup on the source page to resume.',
    '请先停止当前任务':'Stop the current task first.','没有失败项':'No failed items.',
    '目录已改变，请重新预览。':'Folder changed. Preview again.',
    '请先预览当前目录。':'Preview the current folder first.',
    '正在预览…':'Preparing preview…','正在导入…':'Importing…',
    '预览目录：{directory}\n可导入 {count} 条；异常 {errors} 个{limited}':'Preview folder: {directory}\n{count} records; {errors} errors{limited}',
    '；已达到扫描上限':'; scan limit reached','已导入 {count} 条':'Imported {count} records',
    '文件存在':'Files available','文件已移走、删除或大小改变':'Files moved, deleted or changed',
    '本轮结束':'Run finished','正在运行':'Running','中断／可恢复':'Interrupted / resumable','任务':'Task',
    '尚未确认保存位置':'Save location not confirmed',
    '{title} · {author} · {mode} · {time}':'{title} · {author} · {mode} · {time}',
    '{state} · {directory}':'{state} · {directory}',
    '{name} · {state} · {count} 篇 · 失败/部分失败 {failures}':'{name} · {state} · {count} posts · Failed/partial {failures}',
    '预览已失效，请重新扫描':'Preview expired. Scan again.',
    '保存服务不可用':'Local save service unavailable.','本地服务请求失败':'Local service request failed.',
    '保存服务尚未更新，请重启保存服务；刷新扩展不能更新保存服务。':'Update and restart the local save service. Reloading the extension does not update it.',
    '保存目录设置失败':'Could not change the save folder.',
    '扩展或保存服务版本不一致，请更新并重新加载扩展':'Extension and save service are incompatible. Update and reload the extension.',
    '任务未完成':'Task did not complete.',
    '帖子采集':'Posts','视频工具':'Video tools','保存视频':'Save video','保存并抽帧':'Save + frames','仅抽帧':'Frames only','当前视频':'Current video','图文':'Notes','图片':'Images','篇':'posts',
    '请先选择视频操作':'Choose a video action','尚未选择视频操作':'No video action selected',
    '适用于本次帖子采集，包含批量中的视频。':'Applies to videos in this post or batch.',
    '只处理当前视频；不受帖子采集的“遇到视频”影响。':'Process only the current video, independently of post capture settings.',
    '选择一项，再点开始；再次点击可取消选择。':'Choose one, then start. Click it again to deselect.',
    '打开默认文件夹':'Open default folder','正在检查本次媒体…':'Checking media…','开始采集…':'Starting capture…',
    '检查原帖，复用已校验文件，补到本次目录。':'Check the source and fill this destination using verified files.',
    '找到可用旧副本就跳过；不复制到本次目录，不刷新正文或评论。':'Skip usable copies elsewhere. No copying here or refreshing text/comments.',
    '重新读取并保存到本次目录；旧文件及手动编辑的文档保留。':'Read again into this destination. Preserve old files and edited notes.',
    '灵感采集 · 管理':'Inspiration Collector · Manage','设置与记录':'Settings & history','默认设置':'Defaults','采集记录':'Capture history','任务记录':'Task history','工具':'Tools',
    '采集范围':'Scope','作者／画板批量':'Profile / board batch','重复处理':'Duplicates','检查并补齐':'Check & fill gaps','跳过已有':'Skip existing','重新采集':'Capture again','本次更多选项':'More options for this task','▶ 开始采集':'▶ Start capture','当前视频工具':'Current video tools','重置中断状态':'Reset interrupted state',
    '默认采集模式':'Default mode','默认篇数':'Default post limit','抽帧方式':'Frame strategy','采样间隔（秒）':'Interval (seconds)','保留磁盘空间（MB）':'Keep free disk space (MB)','单个视频上限（MB）':'Maximum video size (MB)','保存默认设置':'Save defaults','留空使用默认目录':'Leave blank for default folder',
    '确认下载':'Confirm download','确认开始下载':'Start download','等待下载确认':'Awaiting download approval','取消任务':'Cancel task','刷新记录':'Refresh history','最近诊断':'Recent diagnostics','查询':'Search','标题、作者或原链接':'Title, author or source URL','预览':'Preview','确认导入':'Import','导入或重新关联旧采集目录':'Import or relink an old collection folder','原采集目录完整路径':'Full path to the old collection folder',
    '只影响之后开始的任务；弹窗中的本次修改不会覆盖这里。':'Applies to future tasks only. Changes in the popup do not overwrite these defaults.',
    '旧文件不会自动移动。':'Existing files are not moved.',
    '文件移走或删除会显示不可用。跳过已有可能使用其他目录的副本，不代表本次目录有文件。':'Missing files are marked unavailable. Skipping may use another folder; it does not copy files to this destination.',
    '只读取指定目录内的来源记录，不移动素材。先预览再确认，旧记录完整程度标为未知。':'Reads source records only in the selected folder, without moving files. Preview before importing. Legacy coverage is marked unknown.',
    '网页视频的下载和抽帧在当前网页的采集面板中操作。':'Download or extract frames from web videos using the capture popup.',
    '打开原帖':'Open source','重新采到当前目录':'Capture again','回原页续采':'Return & resume','只重试失败项':'Retry failed items','逐项结果':'Item results','暂无任务记录':'No tasks yet',
    '打开作者主页的帖子或 Reels 列表；逐帖核对作者后采集':'Open the profile Posts or Reels tab; each post’s author is checked before saving',
    '打开作者主页的帖子页；按页面顺序采集本人帖子，不含转帖':'Open the profile Posts tab; capture the author’s own posts in page order, excluding reposts',
    '▶ 开始':'▶ Start','遇到视频':'Video handling','跳过视频':'Skip videos','仅保存视频':'Save videos only','保存视频并抽帧':'Save videos and extract frames',
    '平台下直接分为：图片单帖、图文单帖、图片批量、图文批量。其下是帖子或作者／画板名称，不再加中间层。关闭平台分组只省略平台层；旧文件不移动。':'Four categories per platform: single images, single notes, batch images and batch notes. Post, author or board folders go directly inside. Disabling platform grouping removes only the platform level. Existing files stay in place.',
    '平台分组':'Group by platform','开启':'On','关闭':'Off',
    '始终区分单帖／作者／画板。作者和画板下，图片素材与图文笔记分开保存。关闭平台分组只省略平台层；旧文件不移动。':'Posts, authors and boards are always separated. Author/board images and notes have separate folders. Turning this off removes only the platform level. Existing files stay in place.',
    '灵感采集':'Inspiration Collector','正在核验后台':'Checking service',
    '本地视频抽帧':'Local video frames','选择视频':'Choose video','间隔':'Interval','开始抽帧':'Extract frames','请选择已下载的视频。':'Choose a downloaded video.',
    '视频只在你的电脑上处理，不上传云端。图片保存到当前总目录下的「普通采集」。':'Videos are processed locally, never uploaded. Frames use the default local-video destination.',
    '分段模式按画面相似度合并，不能保证一段恰好一张；短于采样间隔的画面可能遗漏。最长边超过 2560 像素会缩小。每次最多 600 个采样点。':'Similar frames are merged. Short scenes may be missed. Frames are limited to 2560 px on the longest edge and 600 samples per run.',
    '正在读取视频…':'Loading video…','视频已就绪。':'Video ready.','浏览器无法解码这个视频，请尝试 MP4（H.264）格式。':'Cannot decode this video. Try MP4 (H.264).','抽帧连接中断':'Frame extraction disconnected','正在停止，已保存图片保留…':'Stopping. Saved images are preserved…',
    '采集模式':'Capture mode','图片采集':'Images','图文采集 · Markdown':'Notes · Markdown',
    '当前页':'Current page','当前帖':'Current post','当前 Pin':'Current Pin','当前采集':'Current item',
    '作者全部图':'Author collection','作者批量图文':'Author notes','作者批量采集':'Author collection','画板批量采集':'Board collection',
    '保存正在浏览的帖子图片':'Save images from this post','正文、来源与可选图片／评论 → Markdown':'Text and selected attachments → Markdown',
    '打开作者主页后低频逐篇采集':'Open an author profile to collect posts','先打开具体画板；只采集画板内的 Pin':'Open a board; collect only its Pins',
    '低频逐篇采集，自动去重':'Collect posts with duplicate checks','采集选项':'Capture options',
    '图文附件与评论':'Note attachments & comments','附带正文图片':'Include post images','已加载评论':'Loaded comments','保存正文、来源及所选附件。':'Save text, source and selected attachments.',
    '图片文字识别（本地）':'Recognize image text (local)','本次最多处理':'Post limit','10 篇':'10 posts','20 篇':'20 posts','50 篇':'50 posts','全部（最多 500 篇）':'All (up to 500)','自定义':'Custom',
    '按页面顺序；失败和跳过也计入篇数。':'Page order; failed and skipped posts count toward the limit.',
    '续采选项':'Resume options','继续上次未完成任务（沿用原设置）':'Resume unfinished task (original settings)',
    '视频附件选项':'Video attachments','同时保存帖子中的视频':'Include videos','同时抽帧，归入同一素材文件夹':'Also extract frames into the same collection',
    '适用于批量和当前图文；下方手动保存视频不受此开关影响。':'Applies to batches and notes. Manual video tools work independently.',
    '保存设置（持续生效）':'Save preferences','默认整理方式':'Folder layout','按平台分开':'By platform','不按平台分开':'Without platform folders','直接存到指定文件夹':'Directly in destination','保持旧分类目录':'Legacy folders','本次保存到':'This task only',
    '切换后旧文件仍在原处，新采集按新设置保存，可能形成两处目录；不会自动迁移或跨目录去重。建议固定一种方式。':'Applies to future captures. Existing files stay in place; no migration or cross-folder deduplication.',
    '视频抽帧':'Video tools','先打开一个视频。抽取的是视频帧，不是原图。':'Open a video first. Frames are not original photos.','方式':'Method','分段图文 · 合并相近画面':'Slides · merge similar frames','普通视频 · 定时取图':'Video · regular intervals','采样间隔':'Interval','秒':'seconds',
    '抽取当前视频':'Extract current video','下载后自动抽帧':'Download & extract','仅保存视频':'Download video only','视频遵循保存设置。支持可下载的 MP4/WebM；blob、分段流及受保护视频暂不支持。':'Uses save preferences. Downloadable MP4/WebM supported; protected videos and segmented streams are not.',
    '打开最近视频所在文件夹':'Open last video folder','选择已下载的视频…':'Choose a local video…',
    '等待开始':'Ready','结果详情':'Details','诊断详情':'Diagnostics','复制诊断信息':'Copy diagnostics','已复制':'Copied','复制失败，可手动选择文本':'Copy failed; select text manually',
    '暂停':'Pause','停止':'Stop','继续':'Resume','已暂停':'Paused','已继续':'Resumed','正在停止，请稍候…':'Stopping…','正在停止任务，请等待当前操作结束…':'Stopping the current operation…','已解除卡住状态':'Task state reset',
    '采集卡住了？点此重置':'Reset a stuck task','修复：重载扩展后台':'Reload extension service',
    '保存位置':'Save location','正在读取…':'Loading…','更改':'Change','打开文件夹':'Open folder','保存':'Save','取消':'Cancel',
    '默认保存位置；可在“存放方式”中为本次指定其他文件夹。':'Default location. Override it in Save preferences for one task.',
    '已记住新目录。旧文件保留原位置。':'Location saved. Existing files stay in place.',
    '留空使用下方保存位置':'Leave blank to use the default folder','粘贴文件夹完整路径，例如 D:\\灵感素材':'Full folder path, e.g. D:\\Inspiration',
    '无额外诊断信息':'No additional diagnostics','扩展版本不一致':'Extension versions do not match','扩展后台未响应':'Extension service is not responding','保存失败':'Save failed',
    '正在读取作者主页':'Reading author profile','正在读取视频下载地址':'Reading video source','准备抽帧':'Preparing frame extraction','开始采集当前页':'Starting capture',
    '检测到旧版遗留进度，不作为当前任务显示。已保存图片保留。':'Previous-version result hidden. Saved files are preserved.',
    '请先停止采集，再修改保存目录。':'Stop collection before changing the folder.',
    '更改默认整理方式？旧文件保留原位置，后续下载使用新方式，可能分成两处。不会移动旧文件。':'Change the default layout? Existing files stay in place; new captures may go to a different folder.',
    '篇数请填写 1–500。':'Enter a post limit from 1 to 500.'
  };
  Object.assign(en,{'默认评论条数':'Default reply limit','评论条数':'Reply limit','视频转 GIF':'Video to GIF','提取音频':'Extract audio','选择本地视频，转换为动图。':'Convert a local video into an animated GIF.','从本地视频提取 M4A 音频。':'Extract M4A audio from a local video.','打开本地视频工具；不上传视频。':'Open local frame extraction. No cloud upload.','暂无符合筛选条件的任务':'No tasks match this filter','失败':'Failed'});
  let language='zh';const originals=new WeakMap();
  function translate(s){
    if(language!=='en')return s;
    if(en[s])return en[s];
    let m;
    if((m=s.match(/^已处理 (\d+)\/(\d+) 篇 · 图文 (\d+) 篇 · 新增图片 (\d+) · 重复图片 (\d+) · 视频 (\d+)$/)))return `Processed ${m[1]}/${m[2]} posts · Notes ${m[3]} · New images ${m[4]} · Duplicates ${m[5]} · Videos ${m[6]}`;
    if((m=s.match(/^本次预检 (\d+) 篇：已知视频 ([\d.]+) MB（可本地复用 ([\d.]+) MB），(\d+) 项大小或地址未知。\n磁盘剩余 ([\d.]+) GB；图片、抽帧和临时空间未计入。确认后开始下载。$/)))return `Checked ${m[1]} posts: known videos ${m[2]} MB (${m[3]} MB reusable locally); ${m[4]} sizes or sources unknown.\nFree disk space ${m[5]} GB. Images, frames and temporary files are not included. Confirm to download.`;
    if((m=s.match(/^保存完成，新增 (\d+) 张$/)))return `Saved ${m[1]} new images`;
    if(/^识别图片文字 /.test(s))return s.replace('识别图片文字','Recognizing image text');
    if(/^保存图片 /.test(s))return s.replace('保存图片','Saving images');
    if(/后台已核验/.test(s))return s.replace('后台已核验','Service verified');
    if(s.includes(' · ') && /小红书|Pinterest|Instagram|微博|花瓣|单帖|图文模式/.test(s))return s.replace('小红书','Xiaohongshu').replace('微博','Weibo').replace('花瓣','Huaban').split(' · ')[0]+' · Open a post or a supported profile / board.';
    return s;
  }
  function apply(){
    for(const el of document.querySelectorAll('[data-ui-message]'))renderMessage(el);
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;
    while(n=walker.nextNode()){
      if(n.parentElement.closest('script,style,.brand-wordmark,#diagnostic-text,#result-heading,#save-path,.select-trigger,.select-menu,[data-ui-message],[data-user-content]'))continue;
      const old=originals.get(n);const source=old && n.textContent===old.rendered?old.source:n.textContent;
      const rendered=source.replace(source.trim(),translate(source.trim()));originals.set(n,{source,rendered});if(n.textContent!==rendered)n.textContent=rendered;
    }
    for(const input of document.querySelectorAll('[placeholder]')){input.dataset.originalPlaceholder ||= input.placeholder;input.placeholder=translate(input.dataset.originalPlaceholder);}
    document.documentElement.lang=language==='en'?'en':'zh-CN';
    globalThis.refreshSelects?.();
  }
  function renderMessage(el){
    const data=el.uiMessage;if(!data)return;
    let value=translate(data.source);
    if(data.fallback&&language==='en'&&/[\u3400-\u9fff]/.test(value))value=translate(data.fallback);
    value=value.replace(/\{(\w+)\}/g,(_,key)=>{const v=data.params[key];return v&&typeof v==='object'&&'ui'in v?translate(v.ui):String(v??'');});
    if(el.textContent!==value)el.textContent=value;
  }
  function message(el,source,params={},fallback){el.dataset.uiMessage='';el.uiMessage={source,params,fallback};renderMessage(el);}
  globalThis.UI={t:translate,message,feedback:(el,source,fallback='操作未完成，请查看详情。')=>message(el,source,{},fallback),get language(){return language;}};
  chrome.storage.local.get(['uiLanguage']).then(s=>{language=s.uiLanguage==='en'?'en':'zh';const picker=document.querySelector('#ui-language');if(picker)picker.value=language;apply();document.dispatchEvent(new Event('uilanguage'));});
  document.querySelector('#ui-language')?.addEventListener('change',async e=>{language=e.target.value;await chrome.storage.local.set({uiLanguage:language});apply();document.dispatchEvent(new Event('uilanguage'));});
  let queued=false;
  new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;apply();});}).observe(document.body,{childList:true,subtree:true,characterData:true});
})();
