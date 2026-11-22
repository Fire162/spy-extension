# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Fixed
* **Input pipeline**
  * Remote clicks no longer fire 2–3× per press. Removed the `Runtime.evaluate` → `el.click()` fallback (CDP `mousePressed`/`mouseReleased` already activates the target) and stopped the controller relaying redundant `click`/`dblclick` payloads on top of `down`/`up`.
  * Mouse wheel no longer applies each tick twice (removed the manual `scrollBy` fallback that ran alongside `Input.dispatchMouseEvent`).
  * Real double-click works again: presses now carry an incrementing `clickCount` (500 ms / 6 px window, clamped to 3) instead of a hard-coded `1`.
  * Keyboard shortcuts now reach the host: the CDP `modifiers` bitmask is computed from `altKey`/`ctrlKey`/`shiftKey`/`metaKey` (previously ignored, so Ctrl+C arrived as a literal `c`). Printable characters are sent as a single `keyDown` with `text`, fixing the double `keydown` per character.
  * Controller: `mousemove` is coalesced per animation frame, mobile text input derives valid `code`/`keyCode` values and releases `Shift`, and `keyup` carries modifier state.
* **Session lifecycle**
  * The MV3 service worker is kept alive for the duration of a session, so remote input no longer silently stops after ~30 s of idle.
  * Session state is persisted to `chrome.storage.session` and recovered on `onStartup`/`onInstalled`; a crashed worker no longer leaves a ghost badge/overlay behind.
  * `attachDebugger()` retries once after detaching on "Another debugger is already attached".
  * `STOP_SESSION` is awaited with a 300 ms flush before the offscreen document closes, so guests reliably receive `session-ended` instead of looping through auto-reconnect against a dead room.
  * `SESSION_ERROR` is now handled and surfaced in the popup (it was emitted with no listener).
* **Security**
  * Escaped attacker-controlled `deviceInfo` in `overlay.js` (stored-XSS in the host's active tab via the roster hover card).
  * Kicking a client now revokes their resumption token; previously a kicked guest reconnected and was auto-approved in about a second.
  * Role changes (Full Control ↔ View-Only) are written through to the resumption token, so a downgrade survives reconnects.
  * Resumption tokens expire after 12 h and are generated with `crypto.getRandomValues`.
  * Peer ID normalisation preserves word boundaries: `SPY-4821` and `SPY4821` no longer collide onto the same PeerJS room.
* **Consent**
  * "Default Permission" toggle now persists and pre-selects the preferred action on request cards.
  * Pending access requests expire after 30 s and are auto-denied; the card shows request age.
  * Stop Session asks for confirmation while guests are still connected.
  * Copy Link falls back to `execCommand`/prompt when the Clipboard API is unavailable.
* **Server**
  * `join-room` is rate limited to 8 attempts per 60 s per socket (4-digit PIN brute-force mitigation).
  * Path traversal check normalises the path and uses a separator-aware prefix comparison.
  * `maxPayload` capped at 64 KB, rooms capped at 50 per host socket, payload shape validated.
  * Host `stop-session` frees the room ID.

### Changed
* Host tab capture is capped at 60 fps (previously requested 144 fps while the sender was tuned for 8 Mbps).

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
