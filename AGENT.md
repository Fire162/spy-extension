# Agent Guide - Spy Extension

> Essential architecture, workflows, conventions, and operational instructions for AI coding agents (`agy`) working in this repository.

---

## 1. Project Overview

**Spy Extension** is a secure, low-latency, peer-to-peer remote browser sharing and control platform built with Chrome Extension Manifest V3 and WebRTC (PeerJS). It enables seamless 1-to-many tab sharing, remote navigation, mouse/touch/keyboard injection via Chrome DevTools Protocol (CDP), view-only privacy portion cropping, and mutual two-party consent.

* **Repository**: [`Fire162/spy-extension`](https://github.com/Fire162/spy-extension)
* **Default Branch**: `main`
* **Package / Target**: Chrome Extension (Manifest V3), Node.js WebRTC Signaling Server, Standalone Web Controller

---

## 2. Architecture & Directory Structure

```
spy-extension/
├── extension/                 # Chrome Extension (Manifest V3)
│   ├── manifest.json          # Extension metadata, permissions & service worker entry
│   ├── background.js          # Background Service Worker (CDP debugger, tabCapture, lifecycle)
│   ├── offscreen.html         # Offscreen Document host for WebRTC and audio processing
│   ├── offscreen.js           # PeerJS WebRTC multi-peer host, media capture, session resumption
│   ├── overlay.js             # Injected Shadow DOM host tab floating pill (🟢 N Sessions)
│   ├── snipper.js             # Interactive on-screen drag-and-crop snipping tool & element tracker
│   ├── peerjs.min.js          # Bundled PeerJS library for offscreen document
│   ├── popup/                 # Host popup UI (room generator, PIN, request queue, roster)
│   └── icons/                 # Extension toolbar icons (16, 48, 128)
├── server/                    # Self-hosted Signaling Server & Web Controller
│   ├── package.json           # Node.js dependencies (peerjs, ws)
│   ├── server.js              # Express + PeerServer signaling daemon
│   └── public/                # Web controller client files (index.html, controller.js, style.css)
├── docs/                      # GitHub Pages mirror of the web controller client
│   ├── index.html             # Web controller UI
│   ├── controller.js          # WebRTC viewer peer, touch gestures, auto-reconnect logic
│   └── style.css              # Cyber-slate responsive stylesheet
├── LICENSE                    # MIT License
├── CHANGELOG.md               # Version history (Keep a Changelog standard)
├── CONTRIBUTING.md            # Contributor guidelines
├── AGENT.md                   # This file (AI agent operational guide)
└── AGENT_HISTORY.md           # Local agent memory log (strictly excluded via .git/info/exclude)
```

---

## 3. Core Subsystems

### A. Background Service Worker (`extension/background.js`)
* **Chrome DevTools Protocol (CDP)**: Attaches `chrome.debugger` to the active shared tab to dispatch genuine OS-level mouse events (`mousePressed`, `mouseReleased`, `mouseMoved`, `mouseWheel`) and keyboard events (`keyDown`, `keyUp`). Forwards modifier bitmasks (`altKey`, `ctrlKey`, `metaKey`, `shiftKey`) and tracks proximity/timestamps to compute dynamic `clickCount` for native double/triple-click selections.
* **Keepalive Connection**: Holds an active `runtime.connect` port with the offscreen document to prevent Manifest V3 service worker termination (~30s idle kill), ensuring continuous remote control dispatching throughout active sessions.
* **Tab Capture**: Calls `chrome.tabCapture.getMediaStreamId({ targetTabId })` to obtain the stream ID and passes it to the offscreen document.
* **Overlay Injection**: Injects `overlay.js` via `chrome.scripting.executeScript` to display the floating `🟢 N Sessions` indicator on the host tab, synchronizing client counts on updates and removing it on session termination.
* **Session Lifecycle**: Monitors `chrome.tabs.onRemoved`, `chrome.debugger.onDetach`, and window bounds updates to safeguard tab state and prevent orphan sessions.

### B. Offscreen Document (`extension/offscreen.js`)
* **Manifest V3 Sandbox Bridge**: WebRTC peer-to-peer connections and `navigator.mediaDevices.getUserMedia` cannot run in Service Workers; they run inside `offscreen.html`.
* **Multi-Peer Host & TURN Relay**: Listens for incoming controller connections using PeerJS (`spy-<roomId>`). Supports configurable STUN/TURN ICE servers via extension popup settings for symmetric NAT / cellular network traversal.
* **Session Resumption & Security**:
  * Grants a cryptographically random `sessionToken` upon approval. Reconnecting clients presenting a valid token and PIN auto-resume without re-prompting the host.
  * Properly revokes session tokens upon host kicking a client, and persists role changes (Control vs View-Only).
  * Employs a 15-second grace timer for transient ICE/WebRTC `disconnected` states instead of terminating sessions abruptly.
* **Local Audio Loopback**: Renders captured tab audio back to host speakers using `AudioContext` so the host tab audio remains audible locally while streaming.
* **Bitrate Tuning**: Configures video senders to 8 Mbps Ultra-HD with `degradationPreference: 'maintain-resolution'`.

### C. Web Controller Client (`server/public/` & `docs/`)
* **Mirror Synchronization**: `docs/` is the GitHub Pages deployment; `server/public/` is served by the local Node server. **Both copies must always remain strictly identical.**
* **Connection Lifecycle**: Features exponential backoff auto-retry (`attemptAutoReconnect`) and `visibilitychange` detection to recover live streams instantly when mobile users switch between apps.
* **Interaction Engine**: Supports desktop mouse/keyboard, mobile single-finger drag/tap, two-finger pinch-to-zoom/pan, and virtual keyboard input sheets.

### D. Signaling Server (`server/server.js`)
* **Multi-Controller Rooms**: Manages active rooms with a `controllers: Map<clientId, ws>` roster, routing signals directly to targeted peers without crosstalk.
* **Hardened Security**: Enforces PIN attempt rate limiting (max 8 attempts per 60 seconds per socket), static path normalization to prevent directory traversal, and WebSocket payload limits.

---

## 4. Development & Testing Commands

### Automated Test Suite
```bash
# Run multi-controller signaling server integration tests
cd server
npm test
```

### Syntax & Lint Verification
```bash
# Verify JavaScript syntax across all files
node --check extension/background.js
node --check extension/offscreen.js
node --check extension/overlay.js
node --check extension/snipper.js
node --check server/public/controller.js
node --check server/server.js
```

### File Synchronization Audit
```bash
# Verify docs/ and server/public/ are 100% in sync
diff -u server/public/controller.js docs/controller.js
diff -u server/public/index.html docs/index.html
diff -u server/public/style.css docs/style.css
```

### Running the Signaling Server
```bash
cd server
npm install --silent
node server.js
```

---

## 5. Critical Agent Conventions & Gotchas

1. **Docs Synchronization**: Any change to `server/public/index.html`, `server/public/controller.js`, or `server/public/style.css` **must** be mirrored to `docs/` in the same commit.
2. **Restricted Chrome URLs**: `chrome.debugger` and `chrome.scripting` cannot attach to `chrome://`, `chrome-extension://`, or the Chrome Web Store gallery. Always guard against errors when injecting content scripts.
3. **Local Exclusions**: `AGENT_HISTORY.md` must **never** be added to public `.gitignore` or tracked in Git. It is strictly preserved locally via `.git/info/exclude`.
4. **Security & IP Privacy**: Never commit server IP addresses, VPS hosts, or raw credentials. Use RFC 5737 documentation IPs (`192.0.2.1`) or `<your-server-domain>` placeholders.
