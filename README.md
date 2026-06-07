# Volume Master Pro

Volume Master Pro is a small Chrome/Edge extension that lets you boost and control audio per browser tab. It supports up to 600% volume boost, per-tab muting, and quick access from the popup.

## Features
- Boost tab volume up to 600%
- Per-tab audio controls (mute/unmute, slider)
- Runs as a Manifest V3 extension with a service worker
- Injects content script to control audio on pages

## Files
- `manifest.json`: Extension manifest (Manifest V3).
- `popup.html` / `popup.js`: UI for quick access and controls.
- `background.js`: Service worker that manages extension lifecycle and messaging.
- `content.js`: Injected script that manipulates audio elements on pages.
- `icon16.png`, `icon48.png`: Icons used by the extension (if present).

## Permissions
- `storage`: Save user preferences.
- `tabs`: Query and control active tabs.
- `scripting`: Inject and run scripts on pages.
- `host_permissions` may include `<all_urls>` to allow controlling audio on any page.

## Install (developer mode)
1. Open Chrome or Edge and go to `chrome://extensions` (or `edge://extensions`).
2. Enable "Developer mode" (top-right).
3. Click "Load unpacked" and select the `VolumeMasterPro` folder.
4. The extension should appear in your toolbar; click the icon to open the popup.

## Usage
- Open the popup to view per-tab controls.
- Use the slider to increase/decrease volume. The extension will attempt to control HTML5 audio and video elements on the page.
- Mute/unmute controls affect the current tab only.

## Development
- To update content scripts or popup code, edit the files and reload the extension page or click the reload icon in the Extensions page.
- For debugging service worker logs, open `chrome://serviceworker-internals` or use the Extensions page "Inspect views" link (if available).

## Troubleshooting
- If audio controls do not work on a particular site, that site may use non-standard audio APIs or block script injection.
- Ensure the extension has the necessary host permissions for that site.

## License
Include your preferred license or keep it proprietary.

---

If you want, I can also:
- Add a short CHANGELOG.md
- Create a minimal `package.json` or build scripts
- Add screenshots and icons
