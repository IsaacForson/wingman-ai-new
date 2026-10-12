# Wingman browser extension

Select text on any page and ask Wingman to explain, summarize or draft a reply. The answer appears in Chrome's side panel.

## Install (developer mode)

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this `chrome-extension` folder.
3. The options page opens. In the Wingman desktop app go to **Settings → Browser extension**, copy the pairing key and paste it there.

## Use

- Select text, right-click → **Explain / Summarize / Draft a reply with Wingman**, or
- Select text and press **Ctrl+Shift+Y** (⌘⇧Y on macOS).

## Permissions

| Permission | Why |
|---|---|
| `contextMenus` | The right-click menu items |
| `activeTab`, `scripting` | Read the current selection when you press the shortcut (only then, only that tab) |
| `sidePanel` | Show answers |
| `storage` | Remember the pairing key |
| `http://127.0.0.1:8765/*` | Talk to the Wingman app on this computer |

The pairing key is scoped: it can only call `/api/extension/explain`. Generating a new key in Wingman invalidates the old one.
