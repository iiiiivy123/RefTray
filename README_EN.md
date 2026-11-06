<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="docs/assets/icon-clean-file-white.svg"><img src="docs/assets/icon-clean-file.svg" width="64" height="64" alt="RefTray"></picture>
</p>
<h1 align="center">RefTray</h1>
<p align="center"><strong>Your references. Your folders.</strong></p>
<p align="center">A local-first reference collector for Windows + Chrome.</p>
<p align="center">
  <a href="https://github.com/iiiiivy123/inspiration-collector/releases/latest"><strong>Download for Windows</strong></a> · <a href="docs/README.md">Documentation</a> · <a href="docs/use-cases-en.md">Use cases</a> · <a href="README.md">简体中文</a>
</p>

**RefTray / 灵感采集** saves authorized images, Markdown notes, text and supported videos from selected websites into local folders. Selected author pages and boards support batch collection; compatible videos can also become reference frames.

**Choose a folder. Keep the actual files.**

Current version: **0.5.37**. Latest source: `main`. [Release notes](docs/release-0.5.37.md).

## AI access through MCP

The local stdio adapter provides service status, Pinterest/X share images, video resolution and downloads, and job results. Start RefTray, then configure the installed `runtime/python.exe` with `-B` and the full path to `server/mcp_stdio.py`. [Setup](docs/mcp.md).

Use the Chrome extension for login-required content, multiple images and replies. Local tools offer video-to-GIF and M4A extraction while preserving originals.

## What it collects

| Workflow | Local output |
| --- | --- |
| Images from supported posts | Image files for visual reference |
| Notes or text only | Markdown, with optional images, already-loaded comments and OCR |
| Supported videos | Video files and optional extracted frames; local videos can also be processed |
| Selected profile / board batches | Organized folders, history, duplicate checks and recovery for certain unfinished tasks |

## Get started

**Windows 10/11 x64 + Chrome required.** Python and media components are bundled.

1. Download the Windows Setup `.exe` from **Assets** on [GitHub Releases](https://github.com/iiiiivy123/inspiration-collector/releases/latest), not the source ZIP.
2. Install and launch **灵感采集 / Inspiration Collector**. It runs in the Windows system tray.
3. Open `chrome://extensions`, enable **Developer mode**, then **Load unpacked**. Choose the installed `extension` folder; copy its path from the tray menu.
4. Pin the extension, choose a local library folder and open a supported content page.

[Full installation guide (Chinese) →](docs/usage.md)

> **Updating?** First right-click the Windows tray icon and choose **退出灵感采集 (Exit)**. Run the new installer, then reload the Chrome extension. Closing Chrome or the popup does not stop the local background service. Install to the existing location; you normally do not need to uninstall or delete your library.

No Chrome Web Store listing, mobile app or automatic updater is available yet. The installer is unsigned; verify its source and do not disable security protections.

## Supported sources

**Xiaohongshu / RedNote · Pinterest · Instagram · X · Huaban · Bilibili**, plus selected images from other webpages.

<details>
<summary><strong>Coverage by website</strong></summary>

| Website | Current scope |
| --- | --- |
| Xiaohongshu / RedNote | Supported note images, Markdown, text and video modes; some creator-profile batches |
| Pinterest | Individual Pins and specific boards; no batch Markdown mode for boards |
| Instagram | Posts, Reels and some profile-list workflows |
| X / Twitter | Posts and some author-post batches; reposts excluded |
| Huaban | Individual items and selected image-batch modes |
| Bilibili | Supported video pages and creator-upload lists; applicable video download and frame extraction |
| Other websites | Mainly current-page images; no universal batching |

Capabilities depend on the page, loaded content, login state and media format. The tool does not bypass logins, paywalls, DRM or other access controls.

</details>

## Common questions

**Can I save a Xiaohongshu post as Markdown?**  
Yes, on supported note pages. Comments include only already-loaded, identifiable content.

**Can it download Pinterest boards?**  
Open a specific board and choose batch image collection. It processes identifiable, accessible Pins; search results and hidden content are outside this workflow.

**Does it upload my files?**  
A local service writes the files to your chosen folders. Files are not uploaded to a project-operated cloud library; collection still makes normal requests to source websites and media CDNs.

**Where are the files?**  
In the library folder you choose, grouped by type, platform and item. Changing the library path does not migrate old files; history can help open their previous folders.

[More use cases and answers →](docs/use-cases-en.md)

## Documentation

[Documentation index](docs/README.md) · [Setup & troubleshooting](docs/usage.md) · [Brand & logo](docs/brand-guide.md) · [Rights & privacy](docs/rights-and-privacy.md)

<details>
<summary><strong>Name and release notes</strong></summary>

RefTray / 灵感采集 is the display name used in this documentation. Older references to **InspiShelf** refer to the same project. The current installer is `InspirationCollector-0.5.37-Windows-x64-Setup.exe`. The installer, tray app and extension use **Inspiration Collector / 灵感采集**.

The extension, tray application and installer use the selected clean file logo: an outlined file and a detached solid square, without inner text lines. The Chinese README banner stays white in both light and dark modes. [Release notes](docs/release-0.5.37.md) list changes, checks and remaining work. Earlier icon concepts remain archived in the brand guide.

</details>

---

Independent third-party project, not affiliated with or endorsed by the listed platforms. Save content only when you have the necessary rights or another lawful basis. Public visibility does not imply permission to redistribute or commercially reuse content.

The source is publicly readable but **no project-wide open-source license has been selected**. Third-party components retain their own licenses: [notices](docs/third-party-notices.md), [media components](docs/third-party-media.md).

Maintained by [iiiiivy123](https://github.com/iiiiivy123), with development assistance from OpenAI Codex. [Report an issue](https://github.com/iiiiivy123/inspiration-collector/issues) with the version, reproduction steps and redacted screenshots. Never submit cookies, credentials, private data or copyrighted media files.
