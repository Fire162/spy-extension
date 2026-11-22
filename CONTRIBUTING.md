# Contributing to Spy Extension

Thank you for your interest in contributing to Spy Extension! We welcome bug fixes, performance improvements, and feature contributions.

---

## Development Setup

1. **Prerequisites**:
   * Google Chrome (or Chromium-based browser) version 116+.
   * Node.js 18+ and `pnpm` or `npm`.

2. **Loading Extension Locally**:
   * Open Chrome and navigate to `chrome://extensions/`.
   * Enable **Developer mode** in the top right corner.
   * Click **Load unpacked** and select the `/root/spy-extension/extension` directory.

3. **Running the Signaling Server**:
   ```bash
   cd server
   npm install
   node server.js
   ```

4. **Testing the Web Controller**:
   * Open `server/public/index.html` or start the local server and visit `http://localhost:3000`.
   * The GitHub Pages build is deployed directly from the `docs/` folder.

---

## Synchronization Rule: `server/public/` and `docs/`

The web controller client exists in two directories:
* `server/public/`: Served by the local Node.js signaling daemon.
* `docs/`: Hosted publicly on GitHub Pages.

> [!IMPORTANT]
> Whenever you modify `index.html`, `controller.js`, or `style.css` in either folder, you **must** synchronize the changes to the other so both stay 100% identical:
> ```bash
> diff -u server/public/controller.js docs/controller.js
> ```

---

## Code Style & Standards

* **No Unnecessary Abstractions**: Keep scripts clean, readable, and vanilla where possible.
* **Manifest V3 Separation**: Remember that WebRTC and `navigator.mediaDevices` cannot execute in Service Workers; all media streaming belongs in `extension/offscreen.js`.
* **Zero IP Leaks**: Never hardcode or commit server IP addresses or private credentials. Use placeholder documentation IPs (e.g. `192.0.2.1`).

---

## Submitting Pull Requests

1. Fork or branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Verify syntax and synchronization:
   ```bash
   node --check extension/background.js
   node --check extension/offscreen.js
   node --check extension/overlay.js
   node --check server/public/controller.js
   ```
3. Commit your changes with concise, standard commit messages (`feat: ...`, `fix: ...`, `docs: ...`).
4. Push and submit a Pull Request targeting `main`.
