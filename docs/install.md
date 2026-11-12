# 首次安装

需要 Windows 10/11 64 位和 Chrome 120 或更新版本。当前正式版为 **1.0.1**。

## 1. 下载安装包

打开 [Releases 下载页](https://github.com/iiiiivy123/RefTray/releases)，在 Assets 下载文件名以 `Windows-x64-Setup.exe` 结尾的安装包。`user.zip` 和 Source code ZIP 都需要自行配置运行环境；普通使用请选择安装包。

**普通安装只需下载安装包并双击运行，不需要打开 PowerShell、手动校验或另装 Python、FFmpeg。** 安装包内置运行环境、媒体组件和扩展文件。`SHA256SUMS` 是可选校验文件，不是安装依赖。

AI 客户端接入见 [MCP 接口](mcp.md)。先完成以下安装和扩展设置，再配置 AI。

## 2. 安装并启动

双击安装包，按向导完成安装。默认安装到当前用户目录，无需管理员权限。

打开桌面或开始菜单中的 **灵感采集**，在 Windows 右下角系统托盘找到它的图标；图标可能藏在向上的小箭头里。程序在后台运行，没有单独的主窗口。设置和采集操作都在 Chrome 扩展里。

采集时保持后台运行。需要退出时，在托盘图标上右键选择 **退出灵感采集**。关闭 Chrome 或扩展弹窗后，后台仍会运行。

### 只有遇到 Windows 拦截时才看这里

安装包暂未签名。如果出现蓝色 **“Windows 已保护你的电脑”** SmartScreen 提示，确认文件来自[本仓库 Releases](https://github.com/iiiiivy123/RefTray/releases)、应用名是刚下载的安装包，且你愿意安装 RefTray 后，点击 **“更多信息” → “仍要运行”**。

“未知发布者”表示没有签名，不等于下载损坏。担心下载是否完整，可用文末的**可选校验**。没有“仍要运行”、被组织策略禁止，或安全软件明确报告病毒/恶意软件时，请停止并反馈截图；不要关闭安全防护或添加排除项。默认安装不需要管理员权限；意外弹出管理员授权窗口时先取消，核实打开的文件。

## 3. 把扩展添加到 Chrome（仅首次）

程序到这里已经安装完成。**当前扩展尚未通过 Chrome 网上应用店分发，首次仍需手动加载一次**；安装器已准备好扩展文件，不用另行下载或解压。后续打开 Chrome 就可以使用，不必每天重做（采集时后台需保持运行）。


1. 右键托盘图标，选择 **复制扩展文件夹地址**。
2. 在 Chrome 地址栏输入 `chrome://extensions`。
3. 打开右上角 **开发者模式**，点击 **加载已解压的扩展程序**（有些版本叫“加载未打包的扩展程序”）。
4. 在文件夹选择窗口按 **Ctrl+L → Ctrl+V → 回车**，再点击 **选择文件夹**。选中的是 `extension` 文件夹，里面应有 `manifest.json`。
5. Chrome 出现“灵感采集”扩展卡片后，在工具栏的拼图菜单中将它固定。

扩展目前需要手动加载。安装位置可以自定义，**请使用托盘复制出的实际地址**。如果文件夹不存在，先确认安装已完成、当前启动的是新安装的程序；不要照抄别人的目录。

## 4. 打开管理页，选择素材库

点击 Chrome 工具栏里的「灵感采集」，再点击弹窗右上角的齿轮「设置」。管理页会在新标签页打开。左侧可以切换设置、采集记录、任务、诊断记录、工具与帮助。

进入 **设置 → 素材库位置 → 更改素材库**，选择一个可写、空间充足的文件夹。之后的新任务默认保存到这里。文件夹名称由你决定，教程中的目录只是示例。

更改素材库位置只影响新任务，旧文件留在原处；可从采集记录打开它们。历史记录和设置由程序单独保存，无需从别人那里复制数据库或日志。

安装目录、状态目录和素材库用途不同：

| 位置 | 默认位置或选择方法 | 用来放什么 |
| --- | --- | --- |
| 程序安装目录 | `%LOCALAPPDATA%\Programs\InspirationCollector`，也可以在安装时自定义 | 程序、运行环境、扩展和 MCP |
| 程序状态目录 | `%LOCALAPPDATA%\InspirationCollector`；旧安装或自定义配置可能不同 | 设置、采集记录、日志、更新备份 |
| 素材库 | 你在设置中选择的文件夹 | 采集得到的图片、Markdown、视频等 |

在文件资源管理器地址栏粘贴上述默认路径可打开对应位置。`InspirationCollector` 是保留兼容的内部名称，不要为了改名而手动重命名这些目录。素材搬家见[保存目录说明](save-layout.md)。

## 5. 保存第一份素材

打开一篇自己有权保存的作品，点击扩展，选择当前页面可用的内容类型，检查保存位置后开始。视频可能需要先确认下载大小。

完成后点击 **打开保存位置**，检查图片能否打开、媒体能否播放。若失败，请保留错误提示，并按下面的方法排查。

想加工本地视频时，打开同一个管理页，选择左侧 **工具与帮助**，再选抽帧、视频转 GIF 或提取音频。

## 可选：自动检查下载是否完整

这不是必做的安装步骤。怀疑文件下载不完整，或想额外核对时，再下载同版本的 `SHA256SUMS` 文件，用下面的方法自动检查，**不用逐字比对校验码**：

1. 将同一次发布的安装包和 `SHA256SUMS` 文件放进**同一个文件夹**。下面以 1.0.1 为例，文件名应为 `InspirationCollector-1.0.1-Windows-x64-Setup.exe` 和 `SHA256SUMS-1.0.1.txt`。不要混用不同版本；若浏览器给文件名加了 `(1)`，先把这两个文件恢复为上述原名，或重新下载到空文件夹。
2. 在文件资源管理器打开这个文件夹，点击顶部**地址栏**，输入 `powershell` 后回车。不需要管理员权限；下载到其他磁盘或中文、带空格的目录也一样。
3. 复制下面**整段**命令，粘贴进 PowerShell 后按回车。它只读文件并校验，不会安装程序、联网或修改安全设置。

```powershell
& {
    $version = '1.0.1'
    $name = "InspirationCollector-$version-Windows-x64-Setup.exe"
    $installer = Join-Path (Get-Location).Path $name
    $sums = Join-Path (Get-Location).Path "SHA256SUMS-$version.txt"
    try {
        foreach ($file in @($installer, $sums)) {
            if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
                throw "找不到 $file。请在两个下载文件所在的文件夹打开 PowerShell，并检查文件名。"
            }
        }
        $pattern = '^([0-9a-fA-F]{64})\s+\*?' + [regex]::Escape($name) + '$'
        $entries = @(Get-Content -LiteralPath $sums -ErrorAction Stop |
            ForEach-Object { if ($_ -match $pattern) { $Matches[1] } })
        if ($entries.Count -ne 1) {
            throw '校验文件中没有唯一的对应安装包记录。请重新下载同一版本的两个文件。'
        }
        $stream = [IO.File]::OpenRead($installer)
        $sha = [Security.Cryptography.SHA256]::Create()
        try {
            $actual = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '')
        } finally {
            $stream.Dispose()
            $sha.Dispose()
        }
        if ($actual -ine $entries[0]) {
            throw '文件内容不一致。不要运行安装包，请从本仓库重新下载两个文件后再试。'
        }
        Write-Host '校验通过：下载文件与发布记录一致。下一步可双击安装包。' -ForegroundColor Green
    } catch {
        Write-Host ('校验失败：' + $_.Exception.Message) -ForegroundColor Red
    }
}
```

- **显示“校验通过”**：可以双击安装包。SHA256 只确认文件与发布记录一致，不是安全认证，也不替代你对下载来源的信任。
- **显示“校验失败”**：不要运行安装包，按后面的具体原因处理，再运行整段检查。如果提示找不到文件，先确认打开的是下载目录，而不是 PowerShell 的默认用户目录。
- 以后安装其他版本时，将第一行 `$version = '1.0.1'` 中的版本号换成该次发布的版本；安装包和校验文件必须来自同一个 Release。


## 常见问题

- **连接不到后台**：从开始菜单启动“灵感采集”，确认托盘图标出现后，重新打开扩展。
- **版本不一致**：按 [更新说明](update.md) 重新加载扩展，再刷新作品页。
- **端口被占用**：安装版与 Chrome 扩展使用本机 `127.0.0.1:8766`。先退出自己仍在运行的旧版后台；仍有冲突时反馈具体提示，不要结束来源不明的其他程序。无需向外网开放该端口，也不要只修改 MCP 端口来处理冲突。
- **提示服务启动失败**：升级后失败时，先看 [更新与恢复说明](update.md)。有可用完整程序备份时可使用独立恢复入口；启动日志默认在 `%LOCALAPPDATA%\InspirationCollector\data\inspiration\logs\service-errors.log`，自定义状态目录则看其中的同名日志。
- **花瓣图片或 X 视频保存失败**：查看 [常见问题](use-cases.md)，保留该次任务记录。

仍有问题时，反馈版本、操作步骤、错误编号和脱敏截图即可。请勿发送 Cookie、密码或完整私人日志。更多操作见 [使用教程](usage.md)。
