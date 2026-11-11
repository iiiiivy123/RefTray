# RefTray · Inspiration Collector

Save web references to folders on your Windows PC: images, GIFs, Markdown notes, videos and audio.

[Download 1.0.1](https://github.com/iiiiivy123/RefTray/releases/tag/v1.0.1) · [中文](README.md) · [Installation](docs/install.md) · [MCP setup](docs/mcp.md)

**1.0.1 is the current stable release.** It uses the same capture engine in the Chrome extension and MCP interface.

## Getting started

1. Download the Windows x64 installer from the release assets.
2. Install and launch RefTray, shown as **灵感采集** in the Start menu and Chrome. Its icon appears in the Windows tray.
3. Copy the extension folder address from the tray menu. Open `chrome://extensions`, enable Developer mode, and load that folder as an unpacked extension.
4. Open a work in Chrome, choose a library folder and collection mode, then start collecting.

Windows 10/11 x64 and Chrome 120 or later are required. Load the extension manually on first use. The installer is unsigned; follow the checksum steps in the installation guide. Detailed installation and MCP guides are currently in Chinese.

## Features

- Save images and GIFs, preferring available high-resolution sources.
- Save articles and notes as Markdown, with optional comments and local image text recognition.
- Download supported videos, subtitles, transcripts or audio. Local speech recognition is included for videos without website captions.
- Collect supported author pages, boards, collections and video lists, with a starting position and item limit.
- View capture history with thumbnails, and pause, resume or retry tasks.
- Use MCP from a compatible AI client to submit tasks and find saved files.
- Check for official updates and restore the previous program version while keeping your library and settings.

Adapters cover Xiaohongshu, Huaban, Pinterest, X, Bilibili, YouTube, Instagram, ArtStation, Weibo and supported article pages. Available modes depend on the platform. Logged-in content uses the paired Chrome session; X profile batches should remain in the foreground while collecting.

## Updating

From 0.5.48 or earlier, install the full 1.0.1 package over the existing program. If 1.0.0 or an earlier version reports an update source mismatch after the repository rename, install the full 1.0.1 package once. Future updates are available in **Settings → About & updates**. Reload the Chrome extension and refresh work pages after upgrading. Reconnect the AI client's MCP connection when needed.

Your library, settings and saved records are retained. Read the [update guide](docs/update.md) for recovery steps.

## Using saved material

Keep the original URL, author, title and rights notices with the files. Before reposting, sharing publicly or using material in a commercial project, check that the license covers that use. Obtain permission when it does not. Attribution, personal collection and noncommercial use are not blanket permissions.

RefTray does not bypass login, payment, CAPTCHA, DRM or access controls. Files are saved locally; source websites receive collection requests, and your AI client may process MCP results such as titles and saved paths. See the [rights and privacy guide](docs/rights-and-privacy.md).

RefTray is an independent project. Its source is publicly viewable, but a project-wide open-source license has not been selected. Components have their own licenses, listed in the [third-party notices](docs/third-party-notices.md).

## Development

Build prerequisites and test commands are in the [development guide](docs/development.md) (Chinese). For normal use, download the Windows installer instead.
