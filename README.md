# Kick RTL Chat Fix

A small Chrome extension for Kick chat that makes Persian and Arabic messages render as RTL paragraphs while keeping mixed Persian + English text, usernames, URLs, numbers, punctuation, and emoji/emote images in their natural order. It also offers optional message-card styling and chat readability controls.

It does not replace message text, move badges, or change usernames, chat input, or the send controls.

## Build

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run build
```

The unpacked extension is created in `dist/`.

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** in the top-right corner.
3. Choose **Load unpacked**.
4. Select this project's `dist` folder.
5. Open or refresh any `https://kick.com/...` page with chat.
6. Click the extension's **K** icon in Chrome's toolbar. The Persian control panel lets you enable/disable the fix, choose smart or forced RTL mode, and refresh the current Kick page.

The popup groups chat direction, appearance, readability, and panel-font settings in a scrollable panel. Preferences are saved locally and applied live. The display mode supports smart auto-detection, forced RTL, and forced LTR. Hover or focus a message and use its **Auto / RTL / LTR** control to override direction for that message; the setting is discarded if Kick recycles the row for another message.

The panel's default font is **Vazirmatn**. The font must be installed on your computer for Chrome to use it; otherwise it falls back to Tahoma. You can switch to Kick's original font or Arad in the same panel.

After a source change, run `npm run build` again and click the extension's reload button on `chrome://extensions`, then refresh Kick.

## What it changes

The supplied Kick markup contains a virtualized `#chatroom-messages` list and uses spans such as:

```html
<span class="leading-[1.55] font-normal" dir="auto" data-kick-bidi="auto">...</span>
```

It also uses the same `data-kick-bidi="auto"` marker for reply-preview text. The extension targets only those markers inside `#chatroom-messages`.

- The content script uses the actual supplied message line structure—timestamp, badges/username, colon, message—to correct Persian message lines as a whole. The username is kept as an isolated Latin run, so it remains readable while the Persian line is ordered correctly.
- Smart mode chooses the dominant script after ignoring URLs and `@mentions`, which avoids a leading English token or link forcing a mostly Persian message to LTR.
- CSS uses `unicode-bidi: plaintext`, allowing the browser's Unicode bidi algorithm to keep embedded Latin words, URLs, code-like text, digits, punctuation, and emoji runs in proper order.
- Inline `img` and `svg` emotes are isolated as atomic inline content; no image, badge, username, or text node is moved or replaced.
- Links and marked mention elements are isolated from surrounding RTL text. Reply previews and supported quote containers receive the same direction handling.
- The chat viewport keeps a scrollable bottom inset so the final virtualized messages can be scrolled clear of Kick's composer.
- A `MutationObserver` handles new messages, changed text, and recycled virtualized message rows. It only watches the chat viewport and queues work in a microtask. Its own attribute updates are not observed, preventing feedback loops.

## Design limits

This extension cannot infer an intended direction for a message made entirely of emoji, digits, or punctuation, so it leaves those as LTR—the same neutral default Kick chat uses. It does not alter the chat composer; the task is display-only.

## If it still does not apply

First confirm that Chrome shows the extension as enabled at `chrome://extensions`, then refresh the Kick tab after installing or reloading the extension. If the issue remains, send a screenshot of the chat and the **outer HTML** of one broken message from Chrome DevTools. Kick sometimes deploys different markup to different chat views; those two items let the selector be matched exactly without changing the rest of the site.

## Project layout

```text
manifest.json          Manifest V3 definition
src/content.ts         Scoped direction detection and live-chat observer
src/content.css        Scoped bidi/isolation rules
src/popup.*            Persian, Kick-themed control panel
scripts/build.mjs      TypeScript compile + extension packaging
dist/                  Generated folder loaded by Chrome
```
