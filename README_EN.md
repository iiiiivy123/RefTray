# RefTray · Inspiration Collector

Save web references to folders on your Windows PC: images, GIFs, Markdown notes, videos and audio.

[Download 0.5.55](https://github.com/iiiiivy123/inspiration-collector/releases/tag/v0.5.55) · [中文](README.md) · [Installation](docs/install.md) · [MCP setup](docs/mcp.md)

**0.5.55 is the current stable release.** It uses the same capture engine in the Chrome extension and MCP interface.

## Getting started

1. Download the Windows x64 installer from the release assets.
2. Install and launch RefTray. Its icon appears in the Windows tray.
3. Copy the extension folder address from the tray menu. Open `chrome://extensions`, enable Developer mode, and load that folder as an unpacked extension.
4. Open a work in Chrome, choose a library folder and collection mode, then start collecting.

Windows 10/11 x64 and Chrome are required. The extension is loaded manually. The installer is unsigned; compare it with the published SHA256 checksum.

## Features

- Save images and GIFs, preferring available high-resolution sources.
- Save articles and notes as Markdown, with optional comments and local image text recognition.
- Download supported videos, subtitles, transcripts or audio. Local speech recognition is included for videos without website captions.
- Collect supported author pages, boards, collections and video lists, with a starting position and item limit.
- View capture history with thumbnails, and pause, resume or retry tasks.
- Use MCP from a compatible AI client while keeping collection and files on your computer.
- Check for official updates and restore the previous program version while keeping your library and settings.

Adapters cover Xiaohongshu, Huaban, Pinterest, X, Bilibili, YouTube, Instagram, ArtStation, Weibo and supported article pages. Available modes depend on the platform. Logged-in content uses the paired Chrome session; X profile batches should remain in the foreground while collecting.

## Updating

From 0.5.48 or earlier, install the full 0.5.55 package over the existing program. Later versions can check for updates in **Settings → About & updates**. Reload the Chrome extension and refresh work pages after upgrading. Reconnect the AI client's MCP connection when needed.

Your library, settings and saved records are retained. Read the [update guide](docs/update.md) for recovery steps.

Use RefTray for material you are authorized to save. See the [rights and privacy guide](docs/rights-and-privacy.md) and [third-party notices](docs/third-party-notices.md).
