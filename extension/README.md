# TabVault Chrome Extension Foundation

This project includes a Chrome Manifest V3 package in `client/public/`. After building the project, the unpacked extension files are emitted into `dist/public/` alongside `manifest.json`, `background.js`, `popup.html`, `popup.js`, `popup.css`, and the TabVault icons.

To install the extension locally, open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose the `dist/public/` directory. The toolbar action opens the **TabVault fast-save popup**; its button at the top, **Open TabVault workspace**, opens the TabVault side panel in the current browser window. `Command+Shift+S` on macOS or `Ctrl+Shift+S` on other platforms also opens the side panel and requests a capture of the active tab.

## Fast-save popup

The toolbar popup is intentionally limited to rapid cleanup. The three arrow buttons carry both visible labels and browser tooltips:

| Button                   | Selected tabs                                                                 | Result of **Save selected & close**                  |
| ------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Left** (`←`)           | Every tab to the left of the active tab                                       | Saves those HTTP(S) tabs to Inbox, then closes them. |
| **All** (`↔`)           | Every tab in the current browser window                                       | Saves all eligible tabs to Inbox, then closes them.  |
| **Right** (`→`)          | Every tab to the right of the active tab                                      | Saves those HTTP(S) tabs to Inbox, then closes them. |
| **Use Chrome selection** | Chrome-highlighted tabs; falls back to the active tab if none are highlighted | Saves those tabs to Inbox, then closes them.         |

The popup stores each chosen tab in `chrome.storage.local` before closing it and sends a `TABVAULT_LIBRARY_UPDATED` message so an already-open side panel refreshes its Inbox. When a configured authenticated API is reachable, it also forwards the saved records to the server. Chrome internal pages are skipped and left open. The popup deliberately has no settings; use **Open TabVault workspace** for collection management, search, API connection, semantic controls, and alerts.

The extension uses `chrome.storage.local` as its initial durable library store. The website preview uses browser `localStorage` when Chrome extension APIs are not available. See the [Supatabs interaction reference](../docs/SUPATABS_REFERENCE.md) for the directional interaction source and TabVault’s deliberate differences.
