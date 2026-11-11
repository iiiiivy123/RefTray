# Common questions

For RefTray 1.0. The detailed [installation](install.md), [usage](usage.md) and [update](update.md) guides are currently in Chinese.

## Where is the app window?

The backend runs in the Windows tray. Collection and settings are in the Chrome extension, named **灵感采集**. Load the extension manually on first use.

## The service will not start, or the extension cannot connect

Launch 灵感采集 from the Start menu, check for its tray icon, then reopen the extension. If the problem began after an update, follow the [recovery guide](update.md). Keep the library and task database.

The default startup log is `%LOCALAPPDATA%\InspirationCollector\data\inspiration\logs\service-errors.log`. For a custom state directory, look under its `data/inspiration/logs/` folder.

## Chrome still shows the old version

Reload 灵感采集 at `chrome://extensions`, then refresh the source page. If the version stays old, compare its loaded folder with the address copied from the tray menu.

## Installation pauses at Preparing to Install

The installer is waiting for the old backend and MCP processes to close and preparing a program backup. Finish or stop collection tasks first. If installation fails, retain the log and existing program folder.

## Why is there no preview update notification?

Update checks look for stable releases. Use **Settings → About & updates → Check for updates**, then choose to download and install. RefTray does not schedule installation for you. Preview releases are downloaded manually.

## Huaban shows an image but collection finds none

Open the work's detail page and wait for its main image to load. For a board batch, open the specific board. If collection still fails, report the source link, a screenshot and the diagnostic ID.

## X plays a video, but saving reports missing post identity

Collection did not obtain the media information needed for that post. Open the post's detail page and wait for the media to load. Refresh the page after an extension update. If it still fails, send the diagnostic ID and link, not your login information.

## An X batch stops or saves fewer new items than requested

Keep the profile page in the foreground and leave its list and sort order unchanged. Switching tabs makes collection wait; after about 30 seconds it can stop with completed items retained. Return to the profile and continue the unfinished task.

Posts without the selected media, reposts and quote posts are skipped. Check the separate new, existing, skipped and failed results in task details.

## How do I save GIFs?

Choose **Images / GIF** and turn off **Skip GIFs**. Open the saved file to check that it animates. GIFs captured with a note belong beside that note; image-only captures use the image directory.

If a Xiaohongshu animation also leaves a JPG, check which files this task created and whether the JPG is a separate image or a duplicate cover. This still needs checking against the specific page; existing files are not automatically removed.

## Do comment limits include replies?

Top-level comments and replies have separate limits. Replies are off by default; when enabled, the default is two per top-level comment. Change the limits in settings.

Xiaohongshu and Instagram attempt to expand selected replies. Unloaded or folded content, access limits and timeouts can leave fewer replies than requested. Compare with the source page when completeness matters.

## Bilibili operations all report Not Found

Check that the backend and extension versions match. An old backend may not have the interfaces the new extension expects. Quit your old backend, launch the installed version and reload the extension. Include the diagnostic request path if the problem continues.

## Where are my files and error details?

Open the work from capture history and choose its saved location. A note's images, GIFs and Markdown belong in its work directory. Changing the library path does not move old files.

Open a failed item's diagnostic from task details, or search **Diagnostics** by ID, site or error text.

## MCP reports Transport closed after an update

Start the updated backend, reconnect RefTray in your AI client, then call `reftray_status`. You usually do not need to enter the connection configuration again.

## Can I repost or use saved material commercially?

Check that the license covers your intended use. Keep the source URL, author, title and rights notices. Obtain permission when redistribution or commercial use is not covered. Attribution, personal collection and noncommercial use are not blanket permissions. See the [rights and privacy guide](rights-and-privacy.md).

For bug reports, include the version, steps and relevant screenshots with personal details removed. Do not upload credentials or full private logs.

[English home](../README_EN.md) · [中文常见问题](use-cases.md) · [MCP setup](mcp.md)
