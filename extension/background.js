/**
 * Spy Extension - Background Service Worker
 * Coordinates Offscreen Document, Tab Capture, and Chrome DevTools Protocol (Debugger) Input Injection.
 * Supports Multi-Peer Connections, Per-Device Permissions, Request Queues, and Session History.
 */

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

// In-memory session state
let sessionState = {
  active: false,
  tabId: null,
  tabWidth: 1920,
  tabHeight: 1080,
  roomId: null,
  pin: null,
  serverUrl: null,
  startTime: null,
  tabTitle: '',
  tabUrl: '',
  pendingRequests: [], // array of { clientId, deviceInfo, timestamp }
  connectedClients: [], // array of { clientId, deviceInfo, canControl, connectedAt }
  disconnectedClients: [], // array of { clientId, deviceInfo, disconnectedAt, reason }
  portionSettings: {
    enabled: false,
    preset: 'topHalf',
    x: 0,
    y: 0,
    width: 100,
    height: 50
  }
};

// Check and maintain offscreen document
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['USER_MEDIA', 'WEB_RTC', 'AUDIO_PLAYBACK'],
    justification: 'Capture tab media stream, preserve local audio, and handle WebRTC peer-to-peer connection'
  });
}

async function closeOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  if (existingContexts.length > 0) {
    await chrome.offscreen.closeDocument();
  }
}

// Attach Chrome Debugger to inject genuine OS-level mouse and keyboard events
async function attachDebugger(tabId) {
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    console.log(`Debugger attached to tab ${tabId}`);
  } catch (err) {
    console.error('Failed to attach debugger:', err);
    throw err;
  }
}

async function detachDebugger(tabId) {
  if (!tabId) return;
  try {
    await chrome.debugger.detach({ tabId });
    console.log(`Debugger detached from tab ${tabId}`);
  } catch (e) {
    // Already detached or tab closed
  }
}

// Refresh cached tab dimensions on session start and window resize
async function refreshTabDimensions(tabId) {
  try {
    const res = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: '({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio })',
      returnByValue: true
    });
    if (res && res.result && res.result.value) {
      sessionState.tabWidth = res.result.value.w || 1920;
      sessionState.tabHeight = res.result.value.h || 1080;
      return;
    }
  } catch (e) {}

  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.width && tab.height) {
      sessionState.tabWidth = tab.width;
      sessionState.tabHeight = tab.height;
    }
  } catch (e) {}
}

// Update Extension Action Badge dynamically based on queue and client counts
function updateExtensionBadge() {
  if (!sessionState.active) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const pendingCount = sessionState.pendingRequests.length;
  const connectedCount = sessionState.connectedClients.length;

  if (pendingCount > 0) {
    chrome.action.setBadgeText({ text: pendingCount > 1 ? `${pendingCount}REQ` : 'REQ' });
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }); // Red
  } else if (connectedCount > 0) {
    chrome.action.setBadgeText({ text: connectedCount > 1 ? `${connectedCount}` : 'LIVE' });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // Green
  } else {
    chrome.action.setBadgeText({ text: 'WAIT' });
    chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' }); // Blue
  }
}

// Save completed or terminated session into persistent history
async function saveSessionToHistory(session, status = 'completed') {
  if (!session.startTime || !session.roomId) return;
  const durationSeconds = Math.max(1, Math.round((Date.now() - session.startTime) / 1000));
  const historyItem = {
    id: session.roomId,
    tabTitle: session.tabTitle || 'Shared Tab',
    tabUrl: session.tabUrl || '',
    startedAt: session.startTime,
    endedAt: Date.now(),
    durationSeconds,
    totalClients: session.connectedClients ? session.connectedClients.length : 0,
    status
  };

  try {
    const data = await chrome.storage.local.get(['sessionHistory']);
    const history = Array.isArray(data.sessionHistory) ? data.sessionHistory : [];
    history.unshift(historyItem);
    if (history.length > 30) history.pop();
    await chrome.storage.local.set({ sessionHistory: history });
    console.log('Session saved to history:', historyItem);
  } catch (err) {
    console.warn('Failed to save session to history:', err);
  }
}

// Zero-delay input dispatch using cached tab dimensions
async function handleInputEvent(input) {
  if (!sessionState.active || !sessionState.tabId) return;

  const tabId = sessionState.tabId;

  // 1. Remote Browser Navigation Commands
  if (input.type === 'nav-back') {
    await chrome.tabs.goBack(tabId).catch(() => {});
    return;
  }
  if (input.type === 'nav-forward') {
    await chrome.tabs.goForward(tabId).catch(() => {});
    return;
  }
  if (input.type === 'nav-reload') {
    await chrome.tabs.reload(tabId).catch(() => {});
    return;
  }
  if (input.type === 'nav-url' && input.url) {
    let targetUrl = input.url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
        targetUrl = 'https://' + targetUrl;
      } else {
        targetUrl = 'https://www.google.com/search?q=' + encodeURIComponent(targetUrl);
      }
    }
    await chrome.tabs.update(tabId, { url: targetUrl }).catch(() => {});
    return;
  }

  const targetX = Math.round(input.x * (sessionState.tabWidth || 1920));
  const targetY = Math.round(input.y * (sessionState.tabHeight || 1080));

  try {
    if (input.type === 'input-mouse') {
      const button = input.button === 'right' ? 'right' : (input.button === 'middle' ? 'middle' : 'left');
      const buttonsBit = button === 'right' ? 2 : (button === 'middle' ? 4 : 1);

      // Visual feedback: Host Laser Pointer indicator
      try {
        const isClick = input.action === 'click' || input.action === 'down';
        chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
          expression: `
            (() => {
              let dot = document.getElementById('__spy_laser__');
              if (!dot) {
                dot = document.createElement('div');
                dot.id = '__spy_laser__';
                dot.style.cssText = 'position:fixed;width:14px;height:14px;border-radius:50%;background:rgba(56,189,248,0.9);box-shadow:0 0 10px #38bdf8, 0 0 18px rgba(56,189,248,0.6);border:2px solid #ffffff;pointer-events:none;z-index:2147483647;transition:transform 0.05s ease-out, opacity 0.3s;transform:translate(-50%,-50%);';
                const lbl = document.createElement('div');
                lbl.textContent = 'Remote';
                lbl.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.85);color:#38bdf8;font-family:sans-serif;font-size:9px;font-weight:600;padding:2px 5px;border-radius:4px;border:1px solid rgba(56,189,248,0.3);white-space:nowrap;pointer-events:none;';
                dot.appendChild(lbl);
                document.documentElement.appendChild(dot);
              }
              dot.style.left = '${targetX}px';
              dot.style.top = '${targetY}px';
              dot.style.opacity = '1';
              ${isClick ? `
                dot.style.transform = 'translate(-50%, -50%) scale(1.6)';
                setTimeout(() => { if (dot) dot.style.transform = 'translate(-50%, -50%) scale(1)'; }, 150);
              ` : ''}
              clearTimeout(window.__spy_laser_timer__);
              window.__spy_laser_timer__ = setTimeout(() => { if (dot) dot.style.opacity = '0'; }, 2000);
            })()
          `
        }).catch(() => {});
      } catch (e) {}

      if (input.action === 'move') {
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: targetX,
          y: targetY
        });
      } else if (input.action === 'click' || input.action === 'down') {
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: targetX,
          y: targetY
        });

        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: targetX,
          y: targetY,
          button: button,
          buttons: buttonsBit,
          clickCount: 1
        });

        if (input.action === 'click') {
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: targetX,
            y: targetY,
            button: button,
            buttons: 0,
            clickCount: 1
          });

          // Dual-layer DOM click trigger
          try {
            await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
              expression: `
                (() => {
                  const el = document.elementFromPoint(${targetX}, ${targetY});
                  if (el) {
                    el.focus?.();
                    if (typeof el.click === 'function' && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
                      el.click();
                    }
                  }
                })()
              `
            });
          } catch (e) {}
        }
      } else if (input.action === 'up') {
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: targetX,
          y: targetY,
          button: button,
          buttons: 0,
          clickCount: 1
        });
      } else if (input.action === 'dblclick') {
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: targetX,
          y: targetY,
          button: 'left',
          buttons: 1,
          clickCount: 2
        });
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: targetX,
          y: targetY,
          button: 'left',
          buttons: 0,
          clickCount: 2
        });
      }
    } else if (input.type === 'input-wheel') {
      const deltaX = Math.round(input.deltaX || 0);
      const deltaY = Math.round(input.deltaY || 0);

      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: targetX,
        y: targetY,
        deltaX: deltaX,
        deltaY: deltaY
      });

      // Dual-layer DOM scroll fallback
      try {
        await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
          expression: `
            (() => {
              const el = document.elementFromPoint(${targetX}, ${targetY});
              if (el && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)) {
                el.scrollBy({ left: ${deltaX}, top: ${deltaY}, behavior: 'auto' });
              } else {
                window.scrollBy({ left: ${deltaX}, top: ${deltaY}, behavior: 'auto' });
              }
            })()
          `
        });
      } catch (e) {}
    } else if (input.type === 'input-key') {
      const isDown = input.action === 'down';
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: isDown ? 'rawKeyDown' : 'keyUp',
        key: input.key,
        code: input.code,
        windowsVirtualKeyCode: input.keyCode || 0
      });

      if (isDown && input.key && input.key.length === 1) {
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
          type: 'char',
          text: input.key,
          unmodifiedText: input.key
        });
      }
    }
  } catch (err) {
    console.error('Error executing input event:', err);
  }
}

// Fully teardown host session, notify offscreen to inform guests, and detach debugger
async function stopHostSession(reason = 'completed') {
  if (!sessionState.active) return;

  await saveSessionToHistory(sessionState, reason);

  if (sessionState.tabId) {
    try {
      await chrome.debugger.sendCommand({ tabId: sessionState.tabId }, 'Runtime.evaluate', {
        expression: `(() => { const el = document.getElementById('__spy_laser__'); if (el) el.remove(); })()`
      }).catch(() => {});
    } catch (e) {}
    await detachDebugger(sessionState.tabId);
  }

  // Instruct offscreen document to broadcast host-tab-closed and tear down WebRTC peers
  try {
    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'STOP_SESSION',
      payload: { reason: reason === 'tab-closed' ? 'Host closed the shared tab' : 'Host ended the session' }
    });
  } catch (e) {}

  await closeOffscreenDocument();

  sessionState.active = false;
  sessionState.tabId = null;
  sessionState.startTime = null;
  sessionState.pendingRequests = [];
  sessionState.connectedClients = [];
  updateExtensionBadge();

  // Broadcast termination to open popup if active
  chrome.runtime.sendMessage({
    type: 'SESSION_TERMINATED',
    reason
  }).catch(() => {});
}

// Main message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_HOST_SESSION': {
      (async () => {
        try {
          const { tabId, roomId, pin, serverUrl, portionSettings } = message.payload;

          // Full teardown of any previous session first
          if (sessionState.active) {
            await stopHostSession('restarted');
          }

          const tab = await chrome.tabs.get(tabId);

          if (portionSettings) {
            sessionState.portionSettings = portionSettings;
          }

          sessionState.tabId = tabId;
          sessionState.tabTitle = tab.title || 'Untitled Tab';
          sessionState.tabUrl = tab.url || '';
          sessionState.roomId = roomId;
          sessionState.pin = pin;
          sessionState.serverUrl = serverUrl;
          sessionState.startTime = Date.now();
          sessionState.pendingRequests = [];
          sessionState.connectedClients = [];
          sessionState.disconnectedClients = [];
          sessionState.active = true;

          // 1. Get tab capture stream ID
          const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });

          // 2. Ensure Offscreen document exists
          await ensureOffscreenDocument();

          // 3. Attach Chrome debugger for input dispatch & cache dimensions
          await attachDebugger(tabId);
          await refreshTabDimensions(tabId);

          // 4. Instruct offscreen document to initiate session with portion settings
          chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'START_SESSION',
            payload: {
              streamId,
              roomId,
              pin,
              portionSettings: sessionState.portionSettings
            }
          });

          updateExtensionBadge();
          sendResponse({ success: true });
        } catch (err) {
          console.error('Error starting host session:', err);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'GET_SESSION_STATE': {
      sendResponse({
        ...sessionState,
        durationSeconds: sessionState.startTime ? Math.round((Date.now() - sessionState.startTime) / 1000) : 0
      });
      return true;
    }

    case 'GET_SESSION_HISTORY': {
      chrome.storage.local.get(['sessionHistory'], (res) => {
        sendResponse({ history: res.sessionHistory || [] });
      });
      return true;
    }

    case 'CLEAR_SESSION_HISTORY': {
      chrome.storage.local.set({ sessionHistory: [] }, () => {
        sendResponse({ success: true });
      });
      return true;
    }

    case 'PERMISSION_REQUEST': {
      // Incoming connection request from a device
      const { clientId, deviceInfo } = message;
      const exists = sessionState.pendingRequests.some(r => r.clientId === clientId);
      if (!exists) {
        sessionState.pendingRequests.push({
          clientId,
          deviceInfo: deviceInfo || 'Remote Device',
          timestamp: Date.now()
        });
      }

      updateExtensionBadge();

      // Native desktop notification for instant awareness
      try {
        chrome.notifications.create(`perm-request-${clientId}`, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Remote Access Request',
          message: `${deviceInfo || 'A device'} entered the PIN and requested access. Click extension icon to decide.`,
          priority: 2
        });
      } catch (e) {}

      // Broadcast to popup if open
      chrome.runtime.sendMessage({
        type: 'PENDING_REQUESTS_UPDATED',
        requests: sessionState.pendingRequests
      });
      break;
    }

    case 'DECIDE_PERMISSION': {
      const { clientId, approved, canControl } = message.payload;
      sessionState.pendingRequests = sessionState.pendingRequests.filter(r => r.clientId !== clientId);

      // Clear any pending desktop notification for this client
      try {
        chrome.notifications.clear(`perm-request-${clientId}`);
      } catch (e) {}

      // Forward host decision to offscreen document
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'PERMISSION_DECISION',
        payload: { clientId, approved, canControl }
      });

      updateExtensionBadge();

      // Broadcast updated pending requests to popup so request card disappears immediately
      chrome.runtime.sendMessage({
        type: 'PENDING_REQUESTS_UPDATED',
        requests: sessionState.pendingRequests
      }).catch(() => {});

      sendResponse({ success: true, pendingRequests: sessionState.pendingRequests });
      return true;
    }

    case 'UPDATE_CLIENT_ROLE': {
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'UPDATE_CLIENT_ROLE',
        payload: message.payload
      });
      sendResponse({ success: true });
      return true;
    }

    case 'KICK_CLIENT': {
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'KICK_CLIENT',
        payload: message.payload
      });
      sendResponse({ success: true });
      return true;
    }

    case 'CLIENTS_UPDATED': {
      sessionState.connectedClients = message.clients || [];
      updateExtensionBadge();
      // Broadcast to popup
      chrome.runtime.sendMessage({
        type: 'CLIENTS_UPDATED',
        clients: sessionState.connectedClients
      });
      break;
    }

    case 'UPDATE_PORTION_SETTINGS': {
      sessionState.portionSettings = { ...sessionState.portionSettings, ...message.payload };
      chrome.storage.local.set({ defaultPortionSettings: sessionState.portionSettings }).catch(() => {});
      if (sessionState.active) {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'UPDATE_PORTION_SETTINGS',
          payload: sessionState.portionSettings
        });
      }
      chrome.runtime.sendMessage({
        type: 'PORTION_SETTINGS_UPDATED',
        portionSettings: sessionState.portionSettings
      }).catch(() => {});
      sendResponse({ success: true });
      return true;
    }

    case 'START_SCREEN_SELECTION': {
      (async () => {
        try {
          let targetTabId = message.payload?.tabId || sessionState.tabId;
          if (!targetTabId) {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            targetTabId = activeTab?.id;
          }
          if (targetTabId) {
            await chrome.scripting.executeScript({
              target: { tabId: targetTabId },
              files: ['snipper.js']
            });
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'No active tab found' });
          }
        } catch (err) {
          console.error('Failed to inject snipper.js:', err);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'APPLY_SCREEN_PORTION': {
      sessionState.portionSettings = {
        ...sessionState.portionSettings,
        ...message.payload,
        enabled: true,
        preset: 'custom'
      };
      chrome.storage.local.set({ defaultPortionSettings: sessionState.portionSettings }).catch(() => {});
      if (sessionState.active) {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'UPDATE_PORTION_SETTINGS',
          payload: sessionState.portionSettings
        });
      }
      chrome.runtime.sendMessage({
        type: 'PORTION_SETTINGS_UPDATED',
        portionSettings: sessionState.portionSettings
      }).catch(() => {});
      sendResponse({ success: true });
      return true;
    }

    case 'CLIENT_DISCONNECTED': {
      const client = sessionState.connectedClients.find(c => c.clientId === message.clientId);
      const devInfo = (client && client.deviceInfo) || message.deviceInfo || 'Remote Device';
      sessionState.connectedClients = sessionState.connectedClients.filter(c => c.clientId !== message.clientId);
      sessionState.pendingRequests = sessionState.pendingRequests.filter(r => r.clientId !== message.clientId);

      // Track in disconnectedClients roster so host is always aware of inactive sessions
      sessionState.disconnectedClients.unshift({
        clientId: message.clientId,
        deviceInfo: devInfo,
        disconnectedAt: Date.now(),
        reason: message.reason || 'Left session'
      });
      if (sessionState.disconnectedClients.length > 10) {
        sessionState.disconnectedClients.pop();
      }

      try {
        chrome.notifications.clear(`perm-request-${message.clientId}`);
        chrome.notifications.create(`client-disconnect-${message.clientId}`, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Guest Disconnected',
          message: `${devInfo} has left the session (${message.reason || 'closed tab'}).`,
          priority: 1
        });
      } catch (e) {}

      updateExtensionBadge();
      chrome.runtime.sendMessage({
        type: 'PENDING_REQUESTS_UPDATED',
        requests: sessionState.pendingRequests
      }).catch(() => {});
      chrome.runtime.sendMessage({
        type: 'CLIENTS_UPDATED',
        clients: sessionState.connectedClients
      }).catch(() => {});
      chrome.runtime.sendMessage({
        type: 'CLIENT_DISCONNECTED',
        clientId: message.clientId,
        deviceInfo: devInfo,
        disconnectedClients: sessionState.disconnectedClients,
        reason: message.reason
      }).catch(() => {});
      break;
    }

    case 'EXECUTE_INPUT': {
      handleInputEvent(message.input);
      break;
    }

    case 'STOP_HOST_SESSION': {
      (async () => {
        await stopHostSession('user-stopped');
        sendResponse({ success: true });
      })();
      return true;
    }
  }
});

// Immediately teardown session and notify guests if host closes the shared tab
chrome.tabs.onRemoved.addListener((tabId) => {
  if (sessionState.tabId === tabId) {
    stopHostSession('tab-closed');
  }
});

// Clean up session if debugger detached natively by Chrome
chrome.debugger.onDetach.addListener((source, reason) => {
  if (sessionState.tabId === source.tabId) {
    console.log('Debugger was detached natively:', reason);
    stopHostSession('debugger-detached');
  }
});
