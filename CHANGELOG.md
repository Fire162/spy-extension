# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.6.0] - 2026-11-22 13:12 IST

### Added
* Floating top-right live sessions overlay on the host's active tab (`overlay.js`) showing real-time connected session count (`🟢 N Sessions`), pulsing glow, draggable positioning, and hover roster ([#6](https://github.com/Fire162/spy-extension/pull/6)).
* WebRTC connection resilience with a 15-second grace period for transient ICE and network `disconnected` states before session termination.
* Seamless session resumption tokens in `offscreen.js` allowing previously approved remote controllers to auto-reconnect without re-prompting the host.
* Automatic reconnection engine with exponential backoff (1s, 2s, 4s, 6s) and `visibilitychange` detection in the web controller for stable streaming when switching mobile apps.
* Top-right stream overlay badge and reconnection banner on the web controller stream viewport.

---

## [1.5.2] - 2026-10-02 14:17 IST

### Fixed
* Calibrated laser pointer coordinates using live tab viewport dimensions for pixel-perfect host alignment.
* Calibrated screen portion streaming to use GPU-accelerated viewport cropping on the web controller.
* Removed redundant floating screen fit pill from the center of the video stream.

### Added
* Interactive on-screen snipping tool (`snipper.js`) with 1-click Snap to `<main>` and DOM reflow element tracking for view-only portion sharing.

---

## [1.4.0] - 2026-09-30 11:43 IST

### Added
* View-only screen portion sharing with presets (Top Half, Bottom Half, Center, and Custom Snip) ([#4](https://github.com/Fire162/spy-extension/pull/4)).
* Guest inactivity tracking and disconnected roster in the host popup.
* Host tab closure session lockdown and automatic peer teardown.

---

## [1.3.0] - 2026-09-29 18:30 IST

### Added
* 1-to-many multi-peer WebRTC streaming pool allowing multiple simultaneous remote viewers.
* Multi-device access request queues with granular per-device control permissions (Full Control vs View-Only).
* Persistent session history stored in `chrome.storage.local`.

---

## [1.2.0] - 2026-09-28 16:15 IST

### Added
* Remote browser navigation bar (Back, Forward, Reload, URL address bar with Google Search fallback).
* Instant QR code pairing in extension popup for mobile controllers.
* Mobile pinch-to-zoom and two-finger pan gestures.
* High-bitrate 8 Mbps Ultra-HD streaming with `degradationPreference: maintain-resolution`.

---

## [1.1.0] - 2026-09-27 12:40 IST

### Added
* Low-latency `playoutDelayHint` (0s) and Chromium `jitterBufferTarget` (0ms) integration.
* Tab capture optimization up to 144 FPS.
* Live tab audio capture and playback with host speaker loopback.
* Mobile touch gestures and virtual keyboard input sheet.

---

## [1.0.0] - 2026-09-26 10:00 IST

### Added
* Initial release of Spy Extension.
* Peer-to-peer WebRTC tab media streaming via PeerJS.
* Genuine mouse and keyboard event dispatching using Chrome DevTools Protocol (`chrome.debugger`).
* 4-digit PIN authentication and mutual two-party consent.
