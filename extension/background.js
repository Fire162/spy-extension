/**
 * Spy Extension - Background Service Worker
 * Coordinates Offscreen Document, Tab Capture, and Chrome DevTools Protocol (Debugger) Input Injection.
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
  serverUrl: 'ws://localhost:3000',
  canControl: false,
  pendingRequest: null // Stores incoming request if host popup is closed
};

// Check and maintain offscreen document
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['USER_MEDIA', 'WEB_RTC'],
    justification: 'Capture tab media stream and handle WebRTC peer-to-peer connection'
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

    // Retrieve active viewport size to accurately scale coordinates
    try {
      const layout = await chrome.debugger.sendCommand({ tabId }, 'Page.getLayoutViewport');
      if (layout && layout.visualViewport) {
        sessionState.tabWidth = layout.visualViewport.clientWidth || 1920;
        sessionState.tabHeight = layout.visualViewport.clientHeight || 1080;
      }
    } catch (e) {
      // Fallback tab size
      const tab = await chrome.tabs.get(tabId);
      sessionState.tabWidth = tab.width || 1920;
      sessionState.tabHeight = tab.height || 1080;
    }
  } catch (err) {
    console.error('Failed to attach debugger:', err);
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

// Translate and dispatch input commands using Chrome DevTools Protocol (CDP)
async function handleInputEvent(input) {
  if (!sessionState.active || !sessionState.canControl || !sessionState.tabId) return;

  const tabId = sessionState.tabId;
  const targetX = Math.round(input.x * sessionState.tabWidth);
  const targetY = Math.round(input.y * sessionState.tabHeight);

  try {
    if (input.type === 'input-mouse') {
      let cdpType = 'mouseMoved';
      let button = input.button || 'none';
      let clickCount = 0;

      if (input.action === 'down') {
        cdpType = 'mousePressed';
        clickCount = 1;
      } else if (input.action === 'up') {
        cdpType = 'mouseReleased';
        clickCount = 1;
      }

      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: cdpType,
        x: targetX,
        y: targetY,
        button: button,
        clickCount: clickCount
      });
    } else if (input.type === 'input-wheel') {
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: targetX,
        y: targetY,
        deltaX: input.deltaX || 0,
        deltaY: input.deltaY || 0
      });
    } else if (input.type === 'input-key') {
      const isDown = input.action === 'down';
      await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
        type: isDown ? 'rawKeyDown' : 'keyUp',
        key: input.key,
        code: input.code,
        windowsVirtualKeyCode: input.keyCode || 0
      });

      // If printable character keydown, also send char event
      if (isDown && input.key && input.key.length === 1) {
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
          type: 'char',
          text: input.key,
          unmodifiedText: input.key
        });
      }
    }
  } catch (err) {
    // Tab might be navigating or closed
    console.warn('Failed to dispatch input via debugger:', err.message);
  }
}

// Runtime Message Router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_HOST_SESSION': {
      (async () => {
        try {
          const { tabId, roomId, pin, serverUrl, allowControl } = message.payload;
          sessionState.tabId = tabId;
          sessionState.roomId = roomId;
          sessionState.pin = pin;
          sessionState.serverUrl = serverUrl;
          sessionState.canControl = allowControl;
          sessionState.active = true;

          // 1. Get tab capture stream ID
          const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });

          // 2. Ensure Offscreen document exists
          await ensureOffscreenDocument();

          // 3. Attach Chrome debugger for input dispatch
          await attachDebugger(tabId);

          // 4. Instruct offscreen document to initiate streaming
          chrome.runtime.sendMessage({
            target: 'offscreen',
            type: 'START_SESSION',
            payload: { streamId, roomId, pin, serverUrl }
          });

          sendResponse({ success: true });
        } catch (err) {
          console.error('Error starting host session:', err);
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'GET_SESSION_STATE': {
      sendResponse(sessionState);
      return true;
    }

    case 'PERMISSION_REQUEST': {
      // Received from offscreen when controller joins
      sessionState.pendingRequest = { clientId: message.clientId };
      // Notify active popup or system notification
      chrome.action.setBadgeText({ text: 'REQ' });
      chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
      break;
    }

    case 'DECIDE_PERMISSION': {
      const { approved, canControl } = message.payload;
      sessionState.canControl = approved && canControl;
      sessionState.pendingRequest = null;
      chrome.action.setBadgeText({ text: approved ? 'ON' : '' });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981' });

      // Forward decision to offscreen document
      chrome.runtime.sendMessage({
        target: 'offscreen',
        type: 'PERMISSION_DECISION',
        payload: { approved, canControl: sessionState.canControl }
      });
      sendResponse({ success: true });
      return true;
    }

    case 'EXECUTE_INPUT': {
      handleInputEvent(message.input);
      break;
    }

    case 'STOP_HOST_SESSION': {
      (async () => {
        if (sessionState.tabId) {
          await detachDebugger(sessionState.tabId);
        }
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'STOP_SESSION'
        });
        await closeOffscreenDocument();

        sessionState.active = false;
        sessionState.tabId = null;
        sessionState.pendingRequest = null;
        chrome.action.setBadgeText({ text: '' });
        sendResponse({ success: true });
      })();
      return true;
    }

    case 'CONTROLLER_DISCONNECTED': {
      sessionState.canControl = false;
      chrome.action.setBadgeText({ text: 'IDLE' });
      chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
      break;
    }
  }
});

// Detach debugger if the user manually closes the tab
chrome.tabs.onRemoved.addListener((tabId) => {
  if (sessionState.tabId === tabId) {
    chrome.runtime.sendMessage({ type: 'STOP_HOST_SESSION' });
  }
});

// Clean up debugger if detached natively by Chrome
chrome.debugger.onDetach.addListener((source, reason) => {
  if (sessionState.tabId === source.tabId) {
    console.log('Debugger was detached natively:', reason);
  }
});
