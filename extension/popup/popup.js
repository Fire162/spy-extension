/**
 * Spy Extension - Popup Script
 * UI logic for Host session management, PIN generation, and mutual consent handling.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const setupView = document.getElementById('setupView');
  const activeView = document.getElementById('activeView');
  const globalStatusPill = document.getElementById('globalStatusPill');
  const activeTabTitle = document.getElementById('activeTabTitle');
  const activeTabUrl = document.getElementById('activeTabUrl');
  const allowControlToggle = document.getElementById('allowControlToggle');
  const serverSettingsHeader = document.getElementById('serverSettingsHeader');
  const serverSettingsBody = document.getElementById('serverSettingsBody');
  const serverUrlInput = document.getElementById('serverUrlInput');
  const webClientUrlInput = document.getElementById('webClientUrlInput');
  const startSessionBtn = document.getElementById('startSessionBtn');
  const stopSessionBtn = document.getElementById('stopSessionBtn');
  const displayRoomId = document.getElementById('displayRoomId');
  const displayPin = document.getElementById('displayPin');
  const copyLinkBtn = document.getElementById('copyLinkBtn');
  const consentCard = document.getElementById('consentCard');
  const requestNoticeText = document.getElementById('requestNoticeText');
  const grantControlBtn = document.getElementById('grantControlBtn');
  const grantViewBtn = document.getElementById('grantViewBtn');
  const denyBtn = document.getElementById('denyBtn');
  const activeBannerText = document.getElementById('activeBannerText');

  let currentTab = null;

  // Toggle server settings accordion
  serverSettingsHeader.addEventListener('click', () => {
    const isHidden = serverSettingsBody.style.display === 'none';
    serverSettingsBody.style.display = isHidden ? 'flex' : 'none';
    serverSettingsHeader.querySelector('.arrow').textContent = isHidden ? '▴' : '▾';
  });

  // 1. Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTab = tab;
    activeTabTitle.textContent = tab.title || 'Untitled Tab';
    activeTabUrl.textContent = tab.url || '';
  }

  // 2. Check current session state from background service worker
  chrome.runtime.sendMessage({ type: 'GET_SESSION_STATE' }, (state) => {
    if (chrome.runtime.lastError || !state) return;
    renderState(state);
  });

  function renderState(state) {
    if (state.active) {
      setupView.style.display = 'none';
      activeView.style.display = 'flex';
      activeView.style.flexDirection = 'column';
      activeView.style.gap = '12px';

      globalStatusPill.textContent = 'BROADCASTING';
      globalStatusPill.className = 'status-pill active';

      displayRoomId.textContent = state.roomId || '---';
      displayPin.textContent = state.pin || '---';

      if (state.pendingRequest) {
        consentCard.style.display = 'flex';
        requestNoticeText.textContent = `User (${state.pendingRequest.clientId || 'Remote'}) requested access to this tab.`;
        activeBannerText.textContent = 'Waiting for your decision...';
      } else if (state.canControl) {
        consentCard.style.display = 'none';
        activeBannerText.textContent = '🟢 Controller Active (Full Control)';
      } else {
        consentCard.style.display = 'none';
        activeBannerText.textContent = 'Waiting for controller to join...';
      }
    } else {
      setupView.style.display = 'block';
      activeView.style.display = 'none';
      globalStatusPill.textContent = 'IDLE';
      globalStatusPill.className = 'status-pill';
    }
  }

  // Listen for real-time state changes while popup is open
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PERMISSION_REQUEST') {
      consentCard.style.display = 'flex';
      requestNoticeText.textContent = `User (${message.clientId || 'Remote'}) requested access.`;
      activeBannerText.textContent = 'Waiting for your decision...';
    } else if (message.type === 'CONTROLLER_DISCONNECTED') {
      consentCard.style.display = 'none';
      activeBannerText.textContent = 'Controller disconnected. Waiting for join...';
    }
  });

  // Start Session button
  startSessionBtn.addEventListener('click', () => {
    if (!currentTab) return;

    // Generate room code and 4-digit PIN
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const roomId = `SPY-${randomCode}`;
    const pin = String(Math.floor(1000 + Math.random() * 9000));

    const serverUrl = serverUrlInput.value.trim() || 'ws://localhost:3000';
    const allowControl = allowControlToggle.checked;

    startSessionBtn.disabled = true;
    startSessionBtn.textContent = 'Starting...';

    chrome.runtime.sendMessage({
      type: 'START_HOST_SESSION',
      payload: {
        tabId: currentTab.id,
        roomId,
        pin,
        serverUrl,
        allowControl
      }
    }, (response) => {
      startSessionBtn.disabled = false;
      startSessionBtn.textContent = '🚀 Start Remote Session';

      if (response && response.success) {
        renderState({
          active: true,
          roomId,
          pin,
          serverUrl,
          canControl: false,
          pendingRequest: null
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

  // Consent Actions
  grantControlBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'DECIDE_PERMISSION',
      payload: { approved: true, canControl: true }
    }, () => {
      consentCard.style.display = 'none';
      activeBannerText.textContent = '🟢 Controller Active (Full Control)';
    });
  });

  grantViewBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'DECIDE_PERMISSION',
      payload: { approved: true, canControl: false }
    }, () => {
      consentCard.style.display = 'none';
      activeBannerText.textContent = '👁️ Controller Active (View Only)';
    });
  });

  denyBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'DECIDE_PERMISSION',
      payload: { approved: false, canControl: false }
    }, () => {
      consentCard.style.display = 'none';
      activeBannerText.textContent = 'Request Denied. Waiting for join...';
    });
  });

  // Stop Session
  stopSessionBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_HOST_SESSION' }, () => {
      renderState({ active: false });
    });
  });
});
