/**
 * Spy Extension - Popup Script
 * Multi-Device Session Management, Requests Queue, Device Roster, and Session History.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation Tabs
  const tabActiveBtn = document.getElementById('tabActiveBtn');
  const tabHistoryBtn = document.getElementById('tabHistoryBtn');
  const sessionMainPanel = document.getElementById('sessionMainPanel');
  const historyView = document.getElementById('historyView');
  const historyCountBadge = document.getElementById('historyCountBadge');

  // Active/Setup Views
  const setupView = document.getElementById('setupView');
  const activeView = document.getElementById('activeView');
  const globalStatusPill = document.getElementById('globalStatusPill');
  const activeTabTitle = document.getElementById('activeTabTitle');
  const activeTabUrl = document.getElementById('activeTabUrl');
  const allowControlToggle = document.getElementById('allowControlToggle');
  const serverSettingsHeader = document.getElementById('serverSettingsHeader');
  const serverSettingsBody = document.getElementById('serverSettingsBody');
  const webClientUrlInput = document.getElementById('webClientUrlInput');
  const startSessionBtn = document.getElementById('startSessionBtn');
  const stopSessionBtn = document.getElementById('stopSessionBtn');

  // Portion Sharing Controls
  const portionToggle = document.getElementById('portionToggle');
  const portionControls = document.getElementById('portionControls');
  const portionPresetSelect = document.getElementById('portionPresetSelect');
  const portionX = document.getElementById('portionX');
  const portionY = document.getElementById('portionY');
  const portionW = document.getElementById('portionW');
  const portionH = document.getElementById('portionH');
  const portionPreviewBox = document.getElementById('portionPreviewBox');
  const portionPreviewTrack = document.getElementById('portionPreviewTrack');
  const snipScreenBtn = document.getElementById('snipScreenBtn');
  const activePortionToggle = document.getElementById('activePortionToggle');
  const activePortionDetails = document.getElementById('activePortionDetails');
  const activePortionTag = document.getElementById('activePortionTag');
  const activeSnipScreenBtn = document.getElementById('activeSnipScreenBtn');

  // Room Details & QR
  const sessionTimer = document.getElementById('sessionTimer');
  const displayRoomId = document.getElementById('displayRoomId');
  const displayPin = document.getElementById('displayPin');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const qrEl = document.getElementById('qrcode');

  // Multi-Device Sections
  const pendingSection = document.getElementById('pendingSection');
  const pendingCountBadge = document.getElementById('pendingCountBadge');
  const requestsQueue = document.getElementById('requestsQueue');

  const connectedSection = document.getElementById('connectedSection');
  const connectedCountBadge = document.getElementById('connectedCountBadge');
  const devicesList = document.getElementById('devicesList');
  const noDevicesBanner = document.getElementById('noDevicesBanner');

  const inactiveSection = document.getElementById('inactiveSection');
  const inactiveCountBadge = document.getElementById('inactiveCountBadge');
  const inactiveList = document.getElementById('inactiveList');

  // History Elements
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const historyList = document.getElementById('historyList');

  let currentTab = null;
  let timerInterval = null;

  // --- Tab Navigation ---
  tabActiveBtn.addEventListener('click', () => {
    tabActiveBtn.classList.add('active');
    tabHistoryBtn.classList.remove('active');
    sessionMainPanel.style.display = 'block';
    historyView.style.display = 'none';
  });

  tabHistoryBtn.addEventListener('click', () => {
    tabHistoryBtn.classList.add('active');
    tabActiveBtn.classList.remove('active');
    sessionMainPanel.style.display = 'none';
    historyView.style.display = 'block';
    loadHistory();
  });

  // Toggle server settings accordion
  serverSettingsHeader.addEventListener('click', () => {
    const isHidden = serverSettingsBody.style.display === 'none';
    serverSettingsBody.style.display = isHidden ? 'flex' : 'none';
    serverSettingsHeader.querySelector('.arrow').textContent = isHidden ? '▴' : '▾';
  });

  // --- Portion Controls Engine ---
  function updatePortionPreview() {
    if (!portionPreviewBox || !portionX || !portionY || !portionW || !portionH) return;
    const x = Math.max(0, Math.min(90, parseInt(portionX.value) || 0));
    const y = Math.max(0, Math.min(90, parseInt(portionY.value) || 0));
    const w = Math.max(10, Math.min(100 - x, parseInt(portionW.value) || 100));
    const h = Math.max(10, Math.min(100 - y, parseInt(portionH.value) || 50));
    portionPreviewBox.style.left = `${x}%`;
    portionPreviewBox.style.top = `${y}%`;
    portionPreviewBox.style.width = `${w}%`;
    portionPreviewBox.style.height = `${h}%`;
  }

  function getPortionSettings() {
    return {
      enabled: !!(portionToggle && portionToggle.checked),
      preset: portionPresetSelect ? portionPresetSelect.value : 'topHalf',
      x: parseInt(portionX ? portionX.value : 0) || 0,
      y: parseInt(portionY ? portionY.value : 0) || 0,
      width: parseInt(portionW ? portionW.value : 100) || 100,
      height: parseInt(portionH ? portionH.value : 50) || 50
    };
  }

  function applyPortionSettings(settings) {
    if (!settings) return;
    if (portionToggle) portionToggle.checked = !!settings.enabled;
    if (activePortionToggle) activePortionToggle.checked = !!settings.enabled;
    if (portionControls) portionControls.style.display = settings.enabled ? 'flex' : 'none';
    if (portionPresetSelect && settings.preset) portionPresetSelect.value = settings.preset;
    if (portionX && settings.x !== undefined) portionX.value = settings.x;
    if (portionY && settings.y !== undefined) portionY.value = settings.y;
    if (portionW && settings.width !== undefined) portionW.value = settings.width;
    if (portionH && settings.height !== undefined) portionH.value = settings.height;
    updatePortionPreview();

    if (activePortionDetails && activePortionTag) {
      if (settings.enabled) {
        activePortionDetails.style.display = 'block';
        const presetLabel = settings.isElementTracked
          ? '🎯 Auto-Tracked Element'
          : (settings.preset === 'custom' ? 'Custom Snip' : (settings.preset === 'element' ? '🎯 Auto-Tracked Element' : (settings.preset || 'Portion')));
        activePortionTag.textContent = `${presetLabel} (${settings.width || 100}% × ${settings.height || 50}%)`;
      } else {
        activePortionDetails.style.display = 'none';
      }
    }
  }

  function triggerOnScreenSnip() {
    chrome.runtime.sendMessage({ type: 'GET_SESSION_STATE' }, (state) => {
      const targetTabId = (state && state.active && state.tabId) ? state.tabId : (currentTab ? currentTab.id : null);
      if (targetTabId) {
        chrome.runtime.sendMessage({
          type: 'START_SCREEN_SELECTION',
          payload: { tabId: targetTabId }
        });
        window.close(); // Close popup so host can view and snip full screen
      }
    });
  }

  if (snipScreenBtn) {
    snipScreenBtn.addEventListener('click', triggerOnScreenSnip);
  }

  if (activeSnipScreenBtn) {
    activeSnipScreenBtn.addEventListener('click', triggerOnScreenSnip);
  }

  // Interactive drag-and-draw inside popup preview track
  if (portionPreviewTrack) {
    let isTrackDragging = false;
    let trackStartX = 0, trackStartY = 0;

    portionPreviewTrack.addEventListener('mousedown', (e) => {
      isTrackDragging = true;
      const rect = portionPreviewTrack.getBoundingClientRect();
      trackStartX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      trackStartY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

      const pctX = Math.round((trackStartX / rect.width) * 100);
      const pctY = Math.round((trackStartY / rect.height) * 100);
      portionX.value = pctX;
      portionY.value = pctY;
      portionW.value = 10;
      portionH.value = 10;
      if (portionPresetSelect) portionPresetSelect.value = 'custom';
      updatePortionPreview();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isTrackDragging) return;
      const rect = portionPreviewTrack.getBoundingClientRect();
      const curX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const curY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

      const minX = Math.min(trackStartX, curX);
      const minY = Math.min(trackStartY, curY);
      const w = Math.abs(curX - trackStartX);
      const h = Math.abs(curY - trackStartY);

      const pctX = Math.round((minX / rect.width) * 100);
      const pctY = Math.round((minY / rect.height) * 100);
      const pctW = Math.max(10, Math.min(100 - pctX, Math.round((w / rect.width) * 100)));
      const pctH = Math.max(10, Math.min(100 - pctY, Math.round((h / rect.height) * 100)));

      portionX.value = pctX;
      portionY.value = pctY;
      portionW.value = pctW;
      portionH.value = pctH;
      if (portionPresetSelect) portionPresetSelect.value = 'custom';
      updatePortionPreview();
    });

    window.addEventListener('mouseup', () => {
      if (isTrackDragging) {
        isTrackDragging = false;
        sendPortionUpdate();
      }
    });
  }

  function sendPortionUpdate() {
    const settings = getPortionSettings();
    chrome.runtime.sendMessage({
      type: 'UPDATE_PORTION_SETTINGS',
      payload: settings
    });
  }

  if (portionToggle) {
    portionToggle.addEventListener('change', () => {
      if (portionControls) portionControls.style.display = portionToggle.checked ? 'flex' : 'none';
      if (activePortionToggle) activePortionToggle.checked = portionToggle.checked;
      sendPortionUpdate();
    });
  }

  if (activePortionToggle) {
    activePortionToggle.addEventListener('change', () => {
      if (portionToggle) portionToggle.checked = activePortionToggle.checked;
      if (portionControls) portionControls.style.display = activePortionToggle.checked ? 'flex' : 'none';
      sendPortionUpdate();
    });
  }

  if (portionPresetSelect) {
    portionPresetSelect.addEventListener('change', () => {
      const val = portionPresetSelect.value;
      if (val === 'topHalf') {
        portionX.value = 0; portionY.value = 0; portionW.value = 100; portionH.value = 50;
      } else if (val === 'bottomHalf') {
        portionX.value = 0; portionY.value = 50; portionW.value = 100; portionH.value = 50;
      } else if (val === 'center') {
        portionX.value = 25; portionY.value = 25; portionW.value = 50; portionH.value = 50;
      } else if (val === 'mainContent') {
        const targetTabId = currentTab ? currentTab.id : null;
        if (targetTabId) {
          chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            func: () => {
              const candidates = [
                'main',
                '[role="main"]',
                'article',
                '#main-content',
                '#main',
                '#content',
                '.main-content',
                '.content-area',
                '#article',
                '.post-content',
                '.entry-content'
              ];
              for (const sel of candidates) {
                const el = document.querySelector(sel);
                if (el) {
                  const r = el.getBoundingClientRect();
                  if (r.width >= 100 && r.height >= 80) {
                    if (typeof window.__spyStartElementTracker === 'function') {
                      window.__spyStartElementTracker(el, sel);
                    }
                    return {
                      x: Math.max(0, Math.min(95, Math.round((r.left / window.innerWidth) * 100))),
                      y: Math.max(0, Math.min(95, Math.round((r.top / window.innerHeight) * 100))),
                      w: Math.max(5, Math.min(100 - Math.round((r.left / window.innerWidth) * 100), Math.round((r.width / window.innerWidth) * 100))),
                      h: Math.max(5, Math.min(100 - Math.round((r.top / window.innerHeight) * 100), Math.round((r.height / window.innerHeight) * 100))),
                      isElementTracked: true,
                      selector: sel
                    };
                  }
                }
              }
              return null;
            }
          }).then(results => {
            if (results && results[0] && results[0].result) {
              const res = results[0].result;
              portionX.value = res.x;
              portionY.value = res.y;
              portionW.value = res.w;
              portionH.value = res.h;
            } else {
              portionX.value = 0; portionY.value = 0; portionW.value = 100; portionH.value = 70;
            }
            updatePortionPreview();
            const s = getPortionSettings();
            s.isElementTracked = true;
            s.preset = 'element';
            chrome.runtime.sendMessage({
              type: 'UPDATE_PORTION_SETTINGS',
              payload: s
            });
          }).catch(() => {
            portionX.value = 0; portionY.value = 0; portionW.value = 100; portionH.value = 70;
            updatePortionPreview();
            sendPortionUpdate();
          });
          return;
        } else {
          portionX.value = 0; portionY.value = 0; portionW.value = 100; portionH.value = 70;
        }
      }

      if (val !== 'mainContent' && currentTab && currentTab.id) {
        chrome.tabs.sendMessage(currentTab.id, { type: 'STOP_PORTION_TRACKER' }).catch(() => {});
      }

      updatePortionPreview();
      sendPortionUpdate();
    });
  }

  [portionX, portionY, portionW, portionH].forEach(input => {
    if (input) {
      input.addEventListener('input', () => {
        if (portionPresetSelect) portionPresetSelect.value = 'custom';
        updatePortionPreview();
        sendPortionUpdate();
      });
    }
  });

  updatePortionPreview();

  // 1. Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTab = tab;
    activeTabTitle.textContent = tab.title || 'Untitled Tab';
    activeTabUrl.textContent = tab.url || '';
  }

  // 2. Load History Count
  loadHistoryCount();

  // 3. Load persisted default portion settings if configured
  chrome.storage.local.get(['defaultPortionSettings'], (res) => {
    if (res && res.defaultPortionSettings) {
      applyPortionSettings(res.defaultPortionSettings);
    }
  });

  // 4. Check current session state from background service worker
  chrome.runtime.sendMessage({ type: 'GET_SESSION_STATE' }, (state) => {
    if (chrome.runtime.lastError || !state) return;
    renderState(state);
  });

  // Session duration timer
  function startSessionTimer(startTime) {
    if (timerInterval) clearInterval(timerInterval);
    if (!startTime) return;

    function update() {
      const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      sessionTimer.textContent = `⏱️ ${mins}:${secs}`;
    }

    update();
    timerInterval = setInterval(update, 1000);
  }

  function renderInactiveDevices(disconnectedClients) {
    if (!inactiveList) return;
    inactiveList.innerHTML = '';
    const list = disconnectedClients || [];
    if (inactiveCountBadge) inactiveCountBadge.textContent = list.length;

    if (list.length === 0) {
      if (inactiveSection) inactiveSection.style.display = 'none';
      return;
    }

    if (inactiveSection) inactiveSection.style.display = 'flex';

    list.forEach(item => {
      const card = document.createElement('div');
      card.className = 'inactive-card';

      const name = document.createElement('span');
      name.className = 'inactive-name';
      name.textContent = item.deviceInfo || 'Remote Client';

      const badge = document.createElement('span');
      badge.className = 'inactive-badge';
      const timeStr = item.disconnectedAt ? new Date(item.disconnectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      badge.textContent = `🔴 Left (${timeStr || item.reason || 'inactive'})`;

      card.appendChild(name);
      card.appendChild(badge);
      inactiveList.appendChild(card);
    });
  }

  function renderState(state) {
    if (state.active) {
      setupView.style.display = 'none';
      activeView.style.display = 'flex';
      activeView.style.flexDirection = 'column';
      activeView.style.gap = '12px';

      const clientCount = state.connectedClients ? state.connectedClients.length : 0;
      const inactiveCount = state.disconnectedClients ? state.disconnectedClients.length : 0;

      if (clientCount > 0) {
        globalStatusPill.textContent = `${clientCount} STREAMING`;
        globalStatusPill.className = 'status-pill active';
      } else if (inactiveCount > 0) {
        globalStatusPill.textContent = 'ALL GUESTS INACTIVE';
        globalStatusPill.className = 'status-pill';
      } else {
        globalStatusPill.textContent = 'WAITING FOR GUEST';
        globalStatusPill.className = 'status-pill active';
      }

      displayRoomId.textContent = state.roomId || '---';
      displayPin.textContent = state.pin || '---';

      // Start live timer
      startSessionTimer(state.startTime);

      // Sync Portion Settings
      if (state.portionSettings) {
        applyPortionSettings(state.portionSettings);
      }

      // Render instant QR Code for mobile camera pairing
      let clientBase = webClientUrlInput ? (webClientUrlInput.value.trim() || 'https://fire162.github.io/spy-extension/') : 'https://fire162.github.io/spy-extension/';
      if (!clientBase.endsWith('/')) clientBase += '/';
      const shareUrl = `${clientBase}#room=${encodeURIComponent(state.roomId || '')}&pin=${encodeURIComponent(state.pin || '')}`;

      if (qrEl && typeof qrcode !== 'undefined' && state.roomId) {
        try {
          const qr = qrcode(0, 'M');
          qr.addData(shareUrl);
          qr.make();
          qrEl.innerHTML = qr.createSvgTag(3, 0);
        } catch (e) {
          console.warn('QR code generation notice:', e);
        }
      }

      // Render Pending Requests, Connected Devices, and Inactive Roster
      renderPendingRequests(state.pendingRequests || []);
      renderConnectedDevices(state.connectedClients || []);
      renderInactiveDevices(state.disconnectedClients || []);
    } else {
      setupView.style.display = 'block';
      activeView.style.display = 'none';
      globalStatusPill.textContent = 'IDLE';
      globalStatusPill.className = 'status-pill';
      if (timerInterval) clearInterval(timerInterval);
    }
  }

  let activePendingRequests = [];

  // --- Render Pending Requests Queue ---
  function renderPendingRequests(requests) {
    activePendingRequests = requests || [];
    requestsQueue.innerHTML = '';
    pendingCountBadge.textContent = activePendingRequests.length;

    if (activePendingRequests.length === 0) {
      pendingSection.style.display = 'none';
      return;
    }

    pendingSection.style.display = 'flex';

    activePendingRequests.forEach(req => {
      const card = document.createElement('div');
      card.className = 'request-card';
      card.id = `req-card-${req.clientId}`;

      const topRow = document.createElement('div');
      topRow.className = 'request-device-row';

      const devName = document.createElement('span');
      devName.className = 'request-device-name';
      devName.textContent = req.deviceInfo || 'Remote Device';

      const timeText = document.createElement('span');
      timeText.style.cssText = 'font-size:10px;color:var(--text-muted);font-family:var(--font-mono)';
      timeText.textContent = 'Knocking...';

      topRow.appendChild(devName);
      topRow.appendChild(timeText);

      const actions = document.createElement('div');
      actions.className = 'request-actions';

      const allowControlBtn = document.createElement('button');
      allowControlBtn.className = 'btn btn-success btn-sm';
      allowControlBtn.textContent = 'Allow Control';

      const viewOnlyBtn = document.createElement('button');
      viewOnlyBtn.className = 'btn btn-outline btn-sm';
      viewOnlyBtn.textContent = 'View Only';

      const denyBtn = document.createElement('button');
      denyBtn.className = 'btn btn-danger btn-sm';
      denyBtn.textContent = 'Deny';

      const allBtns = [allowControlBtn, viewOnlyBtn, denyBtn];

      const handleDecision = (approved, canControl, clickedBtn, statusText, actionLabel) => {
        // 1. Instantly disable all buttons on this card to prevent duplicate submissions
        allBtns.forEach(btn => btn.disabled = true);
        clickedBtn.textContent = actionLabel;
        timeText.textContent = statusText;

        // 2. Animate dismissal and immediately update queue state
        card.classList.add('exiting');
        activePendingRequests = activePendingRequests.filter(r => r.clientId !== req.clientId);
        pendingCountBadge.textContent = activePendingRequests.length;

        setTimeout(() => {
          if (card.parentNode) card.remove();
          if (activePendingRequests.length === 0) {
            pendingSection.style.display = 'none';
          }
        }, 220);

        // 3. Dispatch permission decision to background service worker
        decidePermission(req.clientId, approved, canControl);
      };

      allowControlBtn.addEventListener('click', () => {
        handleDecision(true, true, allowControlBtn, 'Approved', 'Allowing...');
      });

      viewOnlyBtn.addEventListener('click', () => {
        handleDecision(true, false, viewOnlyBtn, 'Approved', 'Connecting...');
      });

      denyBtn.addEventListener('click', () => {
        handleDecision(false, false, denyBtn, 'Denied', 'Denying...');
      });

      actions.appendChild(allowControlBtn);
      actions.appendChild(viewOnlyBtn);
      actions.appendChild(denyBtn);

      card.appendChild(topRow);
      card.appendChild(actions);
      requestsQueue.appendChild(card);
    });
  }

  function decidePermission(clientId, approved, canControl) {
    chrome.runtime.sendMessage({
      type: 'DECIDE_PERMISSION',
      payload: { clientId, approved, canControl }
    }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && Array.isArray(res.pendingRequests)) {
        renderPendingRequests(res.pendingRequests);
      }
    });
  }

  // --- Render Connected Devices Roster ---
  function renderConnectedDevices(clients) {
    devicesList.innerHTML = '';
    connectedCountBadge.textContent = clients.length;

    if (clients.length === 0) {
      noDevicesBanner.style.display = 'flex';
      return;
    }

    noDevicesBanner.style.display = 'none';

    clients.forEach(client => {
      const card = document.createElement('div');
      card.className = 'device-card';

      const info = document.createElement('div');
      info.className = 'device-info';

      const name = document.createElement('span');
      name.className = 'device-name';
      name.textContent = client.deviceInfo || 'Remote Client';

      const roleBadge = document.createElement('span');
      roleBadge.className = `device-role-badge ${client.canControl ? 'control' : 'view'}`;
      roleBadge.textContent = client.canControl ? '🟢 Full Control' : '👁️ View Only';

      info.appendChild(name);
      info.appendChild(roleBadge);

      const actions = document.createElement('div');
      actions.className = 'device-actions';

      const toggleRoleBtn = document.createElement('button');
      toggleRoleBtn.className = 'btn-toggle-role';
      toggleRoleBtn.textContent = client.canControl ? 'Switch to View' : 'Grant Control';
      toggleRoleBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: 'UPDATE_CLIENT_ROLE',
          payload: { clientId: client.clientId, canControl: !client.canControl }
        });
      });

      const kickBtn = document.createElement('button');
      kickBtn.className = 'btn-kick';
      kickBtn.textContent = '✕ Kick';
      kickBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({
          type: 'KICK_CLIENT',
          payload: { clientId: client.clientId }
        });
      });

      actions.appendChild(toggleRoleBtn);
      actions.appendChild(kickBtn);

      card.appendChild(info);
      card.appendChild(actions);
      devicesList.appendChild(card);
    });
  }

  // --- Session History Handling ---
  function loadHistoryCount() {
    chrome.runtime.sendMessage({ type: 'GET_SESSION_HISTORY' }, (res) => {
      const count = res && res.history ? res.history.length : 0;
      historyCountBadge.textContent = count;
    });
  }

  function loadHistory() {
    chrome.runtime.sendMessage({ type: 'GET_SESSION_HISTORY' }, (res) => {
      const history = (res && res.history) || [];
      historyCountBadge.textContent = history.length;
      historyList.innerHTML = '';

      if (history.length === 0) {
        historyList.innerHTML = `
          <div class="history-empty">
            <span>No previous sessions recorded.</span>
            <p style="margin-top:6px;font-size:11px;color:var(--text-muted)">Completed sessions will appear here with timestamps and device counts.</p>
          </div>
        `;
        return;
      }

      history.forEach(item => {
        const card = document.createElement('div');
        card.className = 'history-card';

        const topRow = document.createElement('div');
        topRow.className = 'history-card-top';

        const room = document.createElement('span');
        room.className = 'history-room';
        room.textContent = item.id;

        const date = document.createElement('span');
        date.className = 'history-date';
        date.textContent = new Date(item.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + new Date(item.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';

        topRow.appendChild(room);
        topRow.appendChild(date);

        const tabTitle = document.createElement('div');
        tabTitle.className = 'history-tab-title';
        tabTitle.textContent = item.tabTitle || 'Shared Tab';

        const metaRow = document.createElement('div');
        metaRow.className = 'history-meta';

        const m = Math.floor(item.durationSeconds / 60);
        const s = item.durationSeconds % 60;
        const durText = m > 0 ? `${m}m ${s}s` : `${s}s`;

        const durSpan = document.createElement('span');
        durSpan.textContent = `⏱️ Duration: ${durText}`;

        const devSpan = document.createElement('span');
        devSpan.textContent = `👥 ${item.totalClients} device${item.totalClients === 1 ? '' : 's'}`;

        metaRow.appendChild(durSpan);
        metaRow.appendChild(devSpan);

        card.appendChild(topRow);
        card.appendChild(tabTitle);
        card.appendChild(metaRow);
        historyList.appendChild(card);
      });
    });
  }

  clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Clear all session history records?')) {
      chrome.runtime.sendMessage({ type: 'CLEAR_SESSION_HISTORY' }, () => {
        loadHistory();
      });
    }
  });

  // Listen for real-time state changes while popup is open
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PENDING_REQUESTS_UPDATED') {
      renderPendingRequests(message.requests || []);
    } else if (message.type === 'CLIENTS_UPDATED') {
      renderConnectedDevices(message.clients || []);
      const count = message.clients ? message.clients.length : 0;
      globalStatusPill.textContent = count > 0 ? `${count} STREAMING` : 'WAITING FOR GUEST';

      // Auto-reconcile: If any device in connectedClients is still in activePendingRequests, dismiss it
      if (message.clients && message.clients.length > 0 && activePendingRequests.length > 0) {
        const connectedIds = new Set(message.clients.map(c => c.clientId));
        const remaining = activePendingRequests.filter(r => !connectedIds.has(r.clientId));
        if (remaining.length !== activePendingRequests.length) {
          renderPendingRequests(remaining);
        }
      }
    } else if (message.type === 'CLIENT_DISCONNECTED') {
      if (message.disconnectedClients) {
        renderInactiveDevices(message.disconnectedClients);
      }
      chrome.runtime.sendMessage({ type: 'GET_SESSION_STATE' }, (state) => {
        if (state) renderState(state);
      });
    } else if (message.type === 'PORTION_SETTINGS_UPDATED') {
      applyPortionSettings(message.portionSettings);
    } else if (message.type === 'SESSION_TERMINATED') {
      renderState({ active: false });
      loadHistoryCount();
    }
  });

  // Start Session button
  startSessionBtn.addEventListener('click', () => {
    if (!currentTab) return;

    // Generate room code and 4-digit PIN
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const roomId = `SPY-${randomCode}`;
    const pin = String(Math.floor(1000 + Math.random() * 9000));

    const serverUrl = webClientUrlInput ? webClientUrlInput.value.trim() : '';
    const allowControl = allowControlToggle.checked;
    const portionSettings = getPortionSettings();

    startSessionBtn.disabled = true;
    startSessionBtn.textContent = 'Starting...';

    chrome.runtime.sendMessage({
      type: 'START_HOST_SESSION',
      payload: {
        tabId: currentTab.id,
        roomId,
        pin,
        serverUrl,
        allowControl,
        portionSettings
      }
    }, (response) => {
      startSessionBtn.disabled = false;
      startSessionBtn.textContent = '🚀 Start Remote Session';

      if (response && response.success) {
        renderState({
          active: true,
          roomId,
          pin,
          startTime: Date.now(),
          pendingRequests: [],
          connectedClients: [],
          disconnectedClients: [],
          portionSettings
        });
      } else {
        alert('Failed to start session: ' + (response?.error || 'Unknown error'));
      }
    });
  });

  // Copy Link Button
  copyLinkBtn.addEventListener('click', () => {
    const roomId = displayRoomId.textContent;
    const pin = displayPin.textContent;
    let clientBase = webClientUrlInput.value.trim() || 'https://fire162.github.io/spy-extension/';
    if (!clientBase.endsWith('/')) clientBase += '/';
    const shareUrl = `${clientBase}#room=${encodeURIComponent(roomId)}&pin=${encodeURIComponent(pin)}`;

    navigator.clipboard.writeText(shareUrl).then(() => {
      copyLinkBtn.textContent = '✅ Link Copied to Clipboard!';
      setTimeout(() => {
        copyLinkBtn.textContent = '📋 Copy Controller Link';
      }, 2500);
    });
  });

  // Stop Session
  stopSessionBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_HOST_SESSION' }, () => {
      renderState({ active: false });
      loadHistoryCount();
    });
  });
});
