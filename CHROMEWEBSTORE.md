# Chrome Web Store Listing — Spy Extension

> Last Updated: 2026-09-30

## Store Listing

**Extension Name** [REQUIRED]
Spy Extension - Remote Browser Control

**Short Description** [REQUIRED]
Share and remotely control your browser tab with another person using secure peer-to-peer WebRTC and mutual two-party consent.

**Detailed Description** [REQUIRED]
Spy Extension allows you to grant live remote viewing and control of your browser tab to a trusted partner, coworker, or friend directly over encrypted peer-to-peer WebRTC.

The remote controller does not need to install any extension or create an account. They simply open your secure share link in any modern web browser.

KEY HIGHLIGHTS:

Two-Party Mutual Consent: Sessions require explicit approval from the host before any viewing or control begins.

Hardware-Level Responsiveness: Smooth mouse movement, clicks, scrolling, and keyboard typing powered by native browser input protocols.

Direct Peer-to-Peer Privacy: Audio and video stream directly between the two browsers using WebRTC with zero cloud recording, video storage, or telemetry.

Zero Accounts or API Keys: Built entirely on open web standards without third-party vendor lock-in or subscription tiers.

Instant Kill Switch: The host maintains full priority control and can revoke access or terminate the session at any second.

HOW TO USE:

1. Click the Spy Extension icon on the tab you wish to share.
2. Click "Start Remote Session" to generate your unique Room ID and 4-digit security PIN.
3. Click "Copy Controller Link" and send it to your partner.
4. When your partner requests to join, an approval prompt appears. Choose "Allow Control" or "View Only".
5. Click "Terminate & Disconnect" at any time to instantly end the session.

PRIVACY & SAFETY:
Spy Extension never collects personal data, browsing history, or keystrokes. Chrome automatically displays a prominent notice whenever a tab is being shared.

SUPPORT:
For source code, bug reports, and contributions, visit: https://github.com/Fire162/spy-extension

**Category** [REQUIRED]
Developer Tools

**Single Purpose** [REQUIRED]
Enables secure, mutual-consent peer-to-peer remote viewing and control of a browser tab.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `extension/icons/icon128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Pending | Store screenshot of Extension popup and active room |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Pending | Store screenshot of Web Controller interactive view |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Pending | Promo card banner |
| Marquee Promo Tile | 1400×560 | ⬜ Pending | Web store hero image |

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `tabCapture` | permissions | Captures the visual media stream of the active tab to transmit live video to the approved remote controller via WebRTC. |
| `debugger` | permissions | Uses the Chrome DevTools Protocol to dispatch authentic mouse clicks, wheel scrolls, and keystrokes sent by the authorized remote user onto the host tab. |
| `offscreen` | permissions | Required in Manifest V3 to manage WebRTC PeerConnections and MediaStreams in an isolated offscreen document without blocking background workers. |
| `storage` | permissions | Saves user preferences such as default control permissions and signaling settings across browser sessions. |
| `tabs` | permissions | Retrieves current tab dimensions and titles to properly calibrate remote cursor coordinates to the host's viewport. |
| `activeTab` | permissions | Allows host to target and initiate streaming on the currently focused browser tab upon clicking the extension action icon. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

All visual streams and input events are transmitted directly between peers via ephemeral WebRTC connections. No data is stored, tracked, or transmitted to any external analytics or logging servers.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://fire162.github.io/spy-extension/privacy.html

## Distribution

**Visibility**: Public  
**Regions**: All regions  

## Developer Info

**Publisher Name** [REQUIRED]
Abhinav Maurya (Fire162)

**Contact Email** [REQUIRED]
abhinavmaurya6672@gmail.com

**Support URL / Email** [RECOMMENDED]
https://github.com/Fire162/spy-extension/issues

**Homepage URL** [RECOMMENDED]
https://fire162.github.io/spy-extension/

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.1.0 | 2026-09-30 | Low-latency WebRTC optimization (zero-jitter buffering, 60fps capture, dimension caching), mobile touch dock, virtual keyboard, and live tab audio | Draft |
| 1.0.0 | 2026-09-30 | Initial Manifest V3 release with direct WebRTC P2P and GitHub Pages web controller | Archived |
