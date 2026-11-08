<p align="center"><img src="docs/assets/icon-clean-file.svg" width="80" alt="RefTray"></p>

# RefTray · Inspiration Collector

Save web references to a folder on your Windows PC: images, GIFs, Markdown notes, videos and audio. Use the Chrome extension to collect a work or process an author page or board.

[Download 0.5.47 preview](https://github.com/iiiiivy123/inspiration-collector/releases/tag/v0.5.47) · [Download 0.5.37 stable](https://github.com/iiiiivy123/inspiration-collector/releases/tag/v0.5.37) · [中文](README.md)

The current preview is **0.5.47**. The stable version and application code on `main` are **0.5.37**; preview code is tagged `v0.5.47`. These guides describe the preview.

## Getting started

1. Install the Windows x64 `.exe` from the release assets.
2. Start Inspiration Collector. Its icon appears in the Windows tray.
3. Copy the extension folder address from the tray menu. Open `chrome://extensions`, enable Developer mode, and load that folder as an unpacked extension.
4. Open a work in Chrome, choose a library folder and collection mode, then start collecting.

Windows 10/11 x64 and Chrome are required. The installer includes the runtime and media components. The extension is loaded manually; the installer is currently unsigned.

## What changed in 0.5.47

- Choose video + subtitles + Markdown, video only, transcript only, or audio extraction. Frame extraction is a separate option, with a default interval of one second.
- Image and note modes expose GIF and video filters. Notes include the body images; plain-text mode saves text.
- Set top-level comment and reply limits separately. Nested replies are off by default, with a default limit of two replies per top-level comment when enabled.
- Keep duplicate handling, download size limits and frame intervals in settings.
- Search and filter media diagnostics, or open a matching diagnostic from a failed task.
- Use MCP to capture through the Chrome extension or queue all videos from a post.
- Receive official release notifications. Download and run the installer to update; automatic installation is not implemented.

## Problems reported during testing

**The extension still shows the old version after installation.** Reload it in `chrome://extensions`, then refresh the work page. If the version stays old, check which extension folder Chrome has loaded.

**The background service fails to start.** Version 0.5.44 had a startup failure when restoring an old task. The fix is included in 0.5.47. Keep the library and task database; retain `data/inspiration/logs/service-errors.log` if startup still fails.

**Huaban shows the image, or X plays the video, but saving fails.** Both issues have been reported. Version 0.5.47 changes the extraction flow; live download verification for Huaban fullscreen/batch and X logged-in video is still unfinished.

[More reported issues](docs/use-cases-en.md) · [Release notes](docs/release-0.5.47.md)

## MCP for AI clients

The local stdio interface offers nine tools for status, public images, Chrome capture, saved-file lookup, video resolution, single-video download, video queues, stopping queues and job status.

For `reftray_capture_browser`, open the target work in Chrome and keep its RefTray popup open. The extension uses the logged-in page. The direct download tools make requests from the local backend instead. [Setup and tool parameters](docs/mcp.md)

## Platforms

Adapters cover Xiaohongshu, Pinterest, Instagram, X, Huaban, Bilibili, YouTube, ArtStation, Weibo and article pages. Collection modes vary by platform. Full live regression testing of this preview is not finished; the specific outstanding X and Huaban issues are listed above.

## Updating

Finish or stop active tasks, run the new installer in the existing program directory, start the app, reload the Chrome extension, and refresh work pages. Refresh the AI client's MCP connection after upgrading. The library and settings are retained.

Update notifications check official releases. Preview 0.5.47 is available through the download link above.

## Project information

RefTray / 灵感采集 is the display name; the installer and tray app also use Inspiration Collector. Older InspiShelf references refer to this project.

Files are saved to your selected local folder. Changing the library location does not move existing files. The project provides no cloud synchronization.

This is an independent third-party project. Save and use material with appropriate permission. The source is publicly viewable; a project-wide open-source license has not been selected. Third-party components retain their own licenses.

[Documentation](docs/README.md) · [Rights and privacy](docs/rights-and-privacy.md) · [Third-party notices](docs/third-party-notices.md) · [Report an issue](https://github.com/iiiiivy123/inspiration-collector/issues)
