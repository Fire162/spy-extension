/**
 * Spy Extension - Top-Right Host Overlay
 * Injected into the host's active tab to show live connected sessions.
 * Features: Draggable pill, collapse/expand toggle, green status emoji, and Shadow DOM isolation.
 */

(function () {
  const OVERLAY_HOST_ID = '__spy_sessions_overlay__';

  // If overlay already exists, just ping it or keep it
  let hostEl = document.getElementById(OVERLAY_HOST_ID);
  if (hostEl) {
    return;
  }

  hostEl = document.createElement('div');
  hostEl.id = OVERLAY_HOST_ID;
  hostEl.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483646;pointer-events:auto;user-select:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

  const shadow = hostEl.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .overlay-badge {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 6px 12px;
      border-radius: 9999px;
      background: rgba(15, 23, 42, 0.88);
      border: 1px solid rgba(16, 185, 129, 0.45);
      color: #f8fafc;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 10px rgba(16, 185, 129, 0.2);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      cursor: grab;
      transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s;
    }

    .overlay-badge:hover {
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55), 0 0 14px rgba(16, 185, 129, 0.35);
      border-color: rgba(16, 185, 129, 0.7);
    }

    .overlay-badge:active {
      cursor: grabbing;
    }

    .status-emoji {
      font-size: 14px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.6));
      animation: pulse 2s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% {
        transform: scale(1);
        filter: drop-shadow(0 0 3px rgba(16, 185, 129, 0.4));
      }
      50% {
        transform: scale(1.15);
        filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.8));
      }
    }

    .session-text {
      letter-spacing: 0.2px;
      white-space: nowrap;
    }

    .count-highlight {
      color: #34d399;
      font-weight: 700;
      margin-right: 2px;
    }

    .btn-toggle {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 10px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      padding: 2px;
      margin-left: 2px;
      border-radius: 4px;
      transition: color 0.15s;
    }

    .btn-toggle:hover {
      color: #f1f5f9;
    }

    .roster-popup {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      background: rgba(15, 23, 42, 0.96);
      border: 1px solid rgba(56, 189, 248, 0.3);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
      border-radius: 8px;
      padding: 8px 12px;
      min-width: 170px;
      font-size: 11px;
      color: #cbd5e1;
      display: none;
      flex-direction: column;
      gap: 5px;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      pointer-events: auto;
    }

    .roster-header {
      font-weight: 700;
      color: #38bdf8;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 4px;
      margin-bottom: 2px;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.5px;
    }

    .roster-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .roster-device {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 120px;
    }

    .roster-role {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
    }
  `;

  const badge = document.createElement('div');
  badge.className = 'overlay-badge';

  const emoji = document.createElement('span');
  emoji.className = 'status-emoji';
  emoji.textContent = '🟢';

  const textSpan = document.createElement('span');
  textSpan.className = 'session-text';
  textSpan.innerHTML = '<span class="count-highlight">0</span> Sessions';

  const rosterPopup = document.createElement('div');
  rosterPopup.className = 'roster-popup';
  rosterPopup.innerHTML = '<div class="roster-header">Connected Guests</div><div id="rosterList">No active sessions</div>';

  badge.appendChild(emoji);
  badge.appendChild(textSpan);
  shadow.appendChild(style);
  shadow.appendChild(badge);
  shadow.appendChild(rosterPopup);

  document.body.appendChild(hostEl);

  let currentCount = 0;
  let clientList = [];

  function updateDisplay(count, clients = []) {
    currentCount = count;
    clientList = clients;
    if (count === 0) {
      textSpan.innerHTML = '<span class="count-highlight">0</span> Sessions';
      badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    } else {
      const label = count === 1 ? 'Session' : 'Sessions';
      textSpan.innerHTML = `<span class="count-highlight">${count}</span> ${label}`;
      badge.style.borderColor = 'rgba(16, 185, 129, 0.7)';
    }

    const rosterList = rosterPopup.querySelector('#rosterList');
    if (rosterList) {
      if (clients.length === 0) {
        rosterList.innerHTML = '<div style="color:#64748b;font-style:italic;">Waiting for guests...</div>';
      } else {
        // deviceInfo is attacker-controlled (client sends it in the auth
        // payload), so it must be escaped before touching innerHTML -
        // otherwise a crafted UA string executes script in the host page.
        const esc = (str) => String(str).replace(/[&<>"']/g, ch => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
        rosterList.innerHTML = clients.map(c => `
          <div class="roster-item">
            <span class="roster-device" title="${esc(c.deviceInfo || 'Remote Device')}">${esc(c.deviceInfo || 'Remote Device')}</span>
            <span class="roster-role">${c.canControl ? 'Control' : 'View'}</span>
          </div>
        `).join('');
      }
    }
  }

  // Hover to show roster
  badge.addEventListener('mouseenter', () => {
    if (clientList.length > 0) {
      rosterPopup.style.display = 'flex';
    }
  });

  hostEl.addEventListener('mouseleave', () => {
    rosterPopup.style.display = 'none';
  });

  // Dragging support
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialElX = 0;
  let initialElY = 0;
  let hasMoved = false;

  badge.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    hasMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = hostEl.getBoundingClientRect();
    initialElX = rect.left;
    initialElY = rect.top;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMoved = true;
    }
    const newX = Math.max(8, Math.min(window.innerWidth - hostEl.offsetWidth - 8, initialElX + dx));
    const newY = Math.max(8, Math.min(window.innerHeight - hostEl.offsetHeight - 8, initialElY + dy));
    hostEl.style.left = `${newX}px`;
    hostEl.style.top = `${newY}px`;
    hostEl.style.right = 'auto';
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Message listener from background
  const messageHandler = (message) => {
    if (message.type === 'SPY_OVERLAY_UPDATE') {
      updateDisplay(message.count || 0, message.clients || []);
    } else if (message.type === 'SPY_OVERLAY_REMOVE') {
      chrome.runtime.onMessage.removeListener(messageHandler);
      if (hostEl) hostEl.remove();
    }
  };

  chrome.runtime.onMessage.addListener(messageHandler);

  // Request initial count from background
  chrome.runtime.sendMessage({ type: 'GET_SESSION_STATE' }, (res) => {
    if (res && res.active) {
      updateDisplay((res.connectedClients || []).length, res.connectedClients || []);
    }
  });
})();
