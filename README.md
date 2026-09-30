<div align="center">

# 👁️⚡ Spy Extension
### Secure, Peer-to-Peer Remote Browser Control with Mutual Two-Party Consent

[![Manifest V3](https://img.shields.io/badge/Manifest_V3-Chrome_116+-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P_Encrypted-333333?logo=webrtc&logoColor=white)](https://webrtc.org/)
[![No Cloud Vendor Lock-in](https://img.shields.io/badge/Zero_API_Keys-100%25_Open_Source-10B981)](#-zero-cloud-dependencies)
[![GitHub Pages](https://img.shields.io/badge/Web_Client-GitHub_Pages-181717?logo=github)](https://fire162.github.io/spy-extension/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[**Live Web Controller**](https://fire162.github.io/spy-extension/) &bull; [**Chrome Web Store Docs**](CHROMEWEBSTORE.md) &bull; [**Privacy Policy**](https://fire162.github.io/spy-extension/privacy.html)

</div>

---

> [!WARNING]
> ### ⚠️ LEGAL DISCLAIMER & ACCEPTABLE USE WARNING
> **Spy Extension is designed and published STRICTLY for authorized remote collaboration, tech support, co-browsing, and accessibility assistance between two consenting parties.**
> 
> * **Mutual Consent Required**: Remote control is impossible without the explicit, manual approval of the browser host.
> * **No Liability**: The authors, contributors, and copyright holders disclaim all legal liability and responsibility for any unauthorized surveillance, illicit use, harassment, data loss, or damages resulting from the use or modification of this project.
> * **Compliance**: Users are exclusively responsible for complying with all relevant local and international computer privacy and wiretapping statutes.

---

## 💡 What is Spy Extension?

**Spy Extension** allows you to give remote viewing and control of your browser tab to someone else—without installing third-party remote desktop software (like TeamViewer or AnyDesk) and **without the other person needing any extension or software at all**.

### 🌟 Key Features

* **Zero-Install Controller**: The remote person simply opens a link (`https://fire162.github.io/spy-extension/#room=...&pin=...`) in any modern desktop or mobile browser.
* **Mutual Two-Party Consent**: Even with the correct Room ID and PIN, access is strictly held until the host clicks **"Allow Control"** or **"View Only"**.
* **Zero API Keys & Zero Accounts**: Uses direct peer-to-peer WebRTC over public standard STUN. No subscriptions, proprietary SDKs, or third-party servers required.
* **Native Input Injection**: Uses Chrome DevTools Protocol (`chrome.debugger`) to dispatch native clicks, double-clicks, typing, and mouse scrolling.
* **Full Host Override & Kill Switch**: The host's physical mouse and keyboard take precedence at all times. A single click terminates the session immediately.
* **Built-in Browser Transparency**: Chrome automatically displays a prominent notice bar (*"Spy Extension started debugging this browser"*) whenever a session is active.

---

## 🏗️ Architecture & Data Flow

```mermaid
sequenceDiagram
    autonumber
    actor Host as 🖥️ Host (Sharing Tab)
    participant Ext as 🧩 Spy Extension (MV3)
    participant Off as 📄 Offscreen WebRTC Worker
    participant Web as 🌐 Web Controller (GitHub Pages)
    actor Controller as 🧑‍💻 Remote Controller

    Host->>Ext: Clicks "Start Remote Session"
    Ext->>Off: Requests Tab MediaStream & generates PIN
    Host-->>Controller: Shares URL (https://fire162.github.io/spy-extension/#room=849-201&pin=4821)
    Controller->>Web: Opens URL in browser
    Web->>Off: Connects via P2P WebRTC & validates PIN
    Off->>Ext: Dispatches Permission Request
    Ext->>Host: Prompts "Allow Control or View Only?"
    Host->>Ext: Clicks "Allow Control"
    Off->>Web: Approves connection & transmits live tab video
    Web->>Controller: Displays low-latency live viewport (<100ms)
    Controller->>Web: Clicks, drags, or types inside viewport
    Web->>Off: Sends input payload over WebRTC DataChannel
    Off->>Ext: Routes input to service worker
    Ext->>Host: chrome.debugger dispatches OS-level input
    Host->>Ext: Clicks "Terminate & Disconnect" at any time
```

---

## 🚀 Quick Start Guide

### 1. Install Host Chrome Extension
1. Clone this repository:
   ```bash
   git clone https://github.com/Fire162/spy-extension.git
   ```
2. Open Google Chrome (or Brave, Edge, Chromium).
3. Navigate to `chrome://extensions/`.
4. Turn on **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** and select the [`extension/`](extension/) directory.
6. Pin the **Spy Extension** icon to your toolbar.

### 2. Start a Sharing Session
1. Navigate to the webpage or web application you want to share.
2. Click the **Spy Extension** icon in your browser toolbar.
3. Toggle whether you want to allow keyboard and mouse control (enabled by default).
4. Click **🚀 Start Remote Session**.
5. Click **📋 Copy Controller Link**.

### 3. Remote Controller Joins
1. Send the copied link to the remote person:  
   `https://fire162.github.io/spy-extension/#room=SPY-XXXX&pin=YYYY`
2. The remote person opens the link in their web browser and clicks **Request Access**.
3. A confirmation prompt appears in your extension popup:
   ```text
   ⚠️ Remote client requested access to this tab.
   [Allow Control]  [View Only]  [Deny]
   ```
4. Click **Allow Control** to start the interactive session!

---

## 📋 Manifest V3 Permissions Justification

In compliance with Chrome Web Store and Manifest V3 policies, every permission requested is strictly scoped:

| Permission | Type | Justification |
| :--- | :--- | :--- |
| `tabCapture` | API | Captures visual media from the active tab to transmit video over WebRTC to the remote user. |
| `debugger` | API | Dispatches authentic mouse and keyboard events onto the host tab using the Chrome DevTools Protocol (CDP). |
| `offscreen` | API | Hosts WebRTC `RTCPeerConnection` and DOM `getUserMedia` streams in an isolated worker as required by Manifest V3. |
| `storage` | API | Persists user settings (such as signaling options and permission preferences) across sessions. |
| `tabs` | API | Determines tab dimensions and active URL to accurately scale remote coordinates to the host's viewport. |
| `activeTab` | API | Grants temporary access to stream the currently focused tab upon clicking the extension icon. |

---

## 🔒 Security & Privacy Model

- **Zero Cloud Recording**: Tab video and input data are routed in-memory through WebRTC. Nothing is recorded, saved, or sent to cloud servers.
- **PIN Handshake**: Every session generates an unpredictable room code and 4-digit PIN. Unauthenticated connections are dropped immediately.
- **Visual Indicators**: Chrome displays a permanent warning banner when the debugger is active. The extension badge displays `ON` during live sessions.
- **Hardware Priority**: The host's physical mouse and keyboard immediately override any remote movement.

---

## 📂 Project Structure

```
spy-extension/
├── extension/                 # Chrome Extension (Manifest V3)
│   ├── manifest.json         # Manifest permissions, icons, and worker declarations
│   ├── background.js         # Service Worker: chrome.debugger CDP input injection
│   ├── offscreen.html        # Offscreen document for WebRTC media capture
│   ├── offscreen.js          # WebRTC PeerConnection & DataChannel coordinator
│   ├── peerjs.min.js         # Bundled standalone WebRTC library (zero CDN dependency)
│   ├── popup/                # Extension Popup UI
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   └── icons/                # Extension icons (16px, 48px, 128px)
├── docs/                      # GitHub Pages Web Controller Client
│   ├── index.html            # Web Controller interactive viewport
│   ├── controller.js         # WebRTC client & input event listener
│   ├── style.css             # Cyberpunk dark theme UI
│   ├── peerjs.min.js         # Standalone WebRTC bundle
│   ├── privacy.html          # Public Privacy Policy
│   └── .nojekyll
├── server/                    # Optional self-hostable Node.js signaling server
│   ├── package.json
│   └── server.js
├── CHROMEWEBSTORE.md          # Chrome Web Store listing & submission metadata
├── README.md                  # Project documentation
└── LICENSE                    # MIT License
```

---

## 🚢 Publishing to Chrome Web Store

See [`CHROMEWEBSTORE.md`](CHROMEWEBSTORE.md) for full metadata, permissions justifications, privacy disclosures, and store copy formatted for the Chrome Developer Dashboard.

To package the extension for submission:
```bash
cd extension
zip -r ../spy-extension-v1.0.0.zip . -x "*.DS_Store"
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).  
Copyright (c) 2026 Abhinav Maurya.
