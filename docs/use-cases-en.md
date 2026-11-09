# Reported issues

These are issues reported during testing. The current preview is **0.5.48**; individual fixes retain their original version numbers below.

| Report | Current status and next step |
| --- | --- |
| The service fails to start after installation | The old-task recovery failure in 0.5.44 is fixed in 0.5.47. Preserve the library and database; retain `data/inspiration/logs/service-errors.log` if it still fails. |
| Chrome keeps using the old extension | Reload the extension and refresh work pages. If the version stays old, check the loaded folder. |
| Installation pauses at Preparing to Install | This stage handles the old backend and MCP processes that may hold program files open. Finish or stop collection tasks before upgrading; keep the install log if it fails. |
| Huaban displays the main image but collection finds none | Main-image and browser extraction were changed. Fullscreen and batch live download checks remain unfinished. |
| X plays a video but saving reports missing post identity | The download flow lacks the media identity data it needs. It does not establish whether Chrome is logged out. The page-to-download flow has changed; logged-in video still needs a successful live test. |
| X image batch requests five works but a text-only pinned post consumes one | The X branch now skips works without matching media and continues. The original profile still needs a live retest. |
| X GIFs require video mode but land in the image folder | Image/GIF classification was changed. Previously failing samples need retesting. |
| Xiaohongshu animations also leave JPG files | The reported static-cover duplicates still need checking against newly collected files. Existing files are retained. |
| Comment counts are unclear | Top-level comments and replies have separate limits. Replies are off by default; when enabled, the default is two per top-level comment. Expand folded replies on the page first. |
| Failed tasks are hard to match to diagnostics | Version 0.5.47 links tasks with diagnostic IDs to their matching media diagnostics, with search and category filters. |
| MCP reports Transport closed after upgrading | Start the new backend, refresh the AI client's MCP connection, and check `reftray_status`. |
| No update notification for a preview release | Notifications check official releases. Download preview 0.5.48 manually. One-click installation is not implemented. |

[English home](../README_EN.md) · [中文反馈记录](use-cases.md) · [MCP setup](mcp.md)
