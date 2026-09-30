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
  canControl: false,
  pendingRequest: null
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

// Dynamically query target tab viewport size
async function getTabDimensions(tabId) {
  try {
    const res = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: '({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio })',
      returnByValue: true
    });
    if (res && res.result && res.result.value) {
      return {
        width: res.result.value.w || 1920,
        height: res.result.value.h || 1080,
        dpr: res.result.value.dpr || 1
      };
    }
  } catch (e) {}

  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab && tab.width && tab.height) {
      return { width: tab.width, height: tab.height, dpr: 1 };
    }
  } catch (e) {}

  return { width: sessionState.tabWidth || 1920, height: sessionState.tabHeight || 1080, dpr: 1 };
}

// Translate and dispatch input commands using Chrome DevTools Protocol (CDP) + DOM fallback
async function handleInputEvent(input) {
  if (!sessionState.active || !sessionState.canControl || !sessionState.tabId) return;

  const tabId = sessionState.tabId;
  const dims = await getTabDimensions(tabId);
  sessionState.tabWidth = dims.width;
  sessionState.tabHeight = dims.height;

  const targetX = Math.round(input.x * dims.width);
  const targetY = Math.round(input.y * dims.height);

  try {
    if (input.type === 'input-mouse') {
      const button = input.button === 'right' ? 'right' : (input.button === 'middle' ? 'middle' : 'left');
      const buttonsBit = button === 'right' ? 2 : (button === 'middle' ? 4 : 1);

      if (input.action === 'move') {
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: targetX,
          y: targetY
        });
      } else if (input.action === 'click' || input.action === 'down') {
        // Move to target
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: targetX,
          y: targetY
        });

        // Mouse pressed with proper buttons bitmask
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: targetX,
          y: targetY,
          button: button,
          buttons: buttonsBit,
          clickCount: 1
        });

        if (input.action === 'click') {
          // Mouse released
          await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: targetX,
            y: targetY,
            button: button,
            buttons: 0,
            clickCount: 1
          });

          // Dual-layer DOM trigger: ensures clicks register on elements, inputs, and links
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
    console.warn('Failed to dispatch input via debugger:', err.message);
  }
}

// Runtime Message Router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_HOST_SESSION': {
      (async () => {
        try {
          const { tabId, roomId, pin, allowControl } = message.payload;

          const tab = await chrome.tabs.get(tabId);
          if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.includes('chromewebstore.google.com')) {
            throw new Error('Chrome security prohibits remote control on chrome:// and extension store pages. Please share a standard website (e.g. google.com, wikipedia.org, github.com).');
          }

          sessionState.tabId = tabId;
          sessionState.roomId = roomId;
          sessionState.pin = pin;
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
            payload: { streamId, roomId, pin, allowControl }
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

    case 'CONTROLLER_CONNECTED': {
      sessionState.canControl = !!message.canControl;
      chrome.action.setBadgeText({ text: sessionState.canControl ? 'CTRL' : 'VIEW' });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
      break;
    }

    case 'DECIDE_PERMISSION': {
      const { approved, canControl } = message.payload;
      sessionState.canControl = approved && canControl;
      sessionState.pendingRequest = null;
      chrome.action.setBadgeText({ text: approved ? (sessionState.canControl ? 'CTRL' : 'VIEW') : '' });
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
