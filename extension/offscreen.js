/**
 * Spy Extension - Offscreen Document
 * Powered by open WebRTC P2P (PeerJS). Zero API keys, zero accounts.
 */

let mediaStream = null;
let peer = null;
let activeConn = null;
let activeCall = null;
let currentRoomId = null;
let currentPin = null;
let currentAllowControl = true;

function sanitizePeerId(raw) {
  return 'spy-' + raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  switch (message.type) {
    case 'START_SESSION':
      startSession(message.payload);
      sendResponse({ success: true });
      break;

    case 'PERMISSION_DECISION':
      handlePermissionDecision(message.payload);
      sendResponse({ success: true });
      break;

    case 'STOP_SESSION':
      stopSession();
      sendResponse({ success: true });
      break;
  }
  return true;
});

async function startSession({ streamId, roomId, pin, allowControl }) {
  currentRoomId = roomId;
  currentPin = String(pin).trim();
  currentAllowControl = !!allowControl;

  // 1. Capture Tab Media Stream
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });
    console.log('Tab media stream captured successfully');
  } catch (err) {
    console.error('Failed to get tab media stream:', err);
    chrome.runtime.sendMessage({
      type: 'SESSION_ERROR',
      error: 'Failed to capture tab: ' + err.message
    });
    return;
  }

  // 2. Initialize WebRTC Host Peer
  const hostPeerId = sanitizePeerId(roomId);
  console.log('Initializing PeerJS host with ID:', hostPeerId);

  peer = new Peer(hostPeerId, {
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  });

  peer.on('open', (id) => {
    console.log('Host Peer registered and listening:', id);
    chrome.runtime.sendMessage({
      type: 'ROOM_READY',
      roomId: currentRoomId
    });
  });

  // Listen for incoming controller connections
  peer.on('connection', (conn) => {
    console.log('Controller attempting to connect:', conn.peer);

    conn.on('data', (data) => {
      if (data.type === 'auth') {
        if (String(data.pin).trim() !== currentPin) {
          console.warn('Authentication failed: incorrect PIN');
          conn.send({ type: 'auth-failed', error: 'Incorrect 4-digit PIN' });
          conn.close();
          return;
        }

        activeConn = conn;
        console.log('Controller PIN verified. Granting permission:', currentAllowControl);

        // Send permission decision to controller
        activeConn.send({
          type: 'permission-result',
          approved: true,
          canControl: currentAllowControl
        });

        // Call controller with media stream
        if (mediaStream && peer) {
          console.log('Calling controller with media stream:', activeConn.peer);
          activeCall = peer.call(activeConn.peer, mediaStream);
        }

        // Notify background
        chrome.runtime.sendMessage({
          type: 'CONTROLLER_CONNECTED',
          clientId: data.clientId || 'Remote Controller',
          canControl: currentAllowControl
        });
      } else if (data.type === 'ping') {
        conn.send({ type: 'pong', time: data.time });
      } else if (data.type && data.type.startsWith('input-')) {
        // Forward input event to service worker for CDP execution
        chrome.runtime.sendMessage({
          type: 'EXECUTE_INPUT',
          input: data
        });
      } else if (data.type === 'session-ended') {
        chrome.runtime.sendMessage({ type: 'CONTROLLER_DISCONNECTED' });
      }
    });

    conn.on('close', () => {
      console.log('Controller closed connection');
      chrome.runtime.sendMessage({ type: 'CONTROLLER_DISCONNECTED' });
    });
  });

  peer.on('error', (err) => {
    console.error('PeerJS error on host:', err);
    if (err.type === 'unavailable-id') {
      chrome.runtime.sendMessage({
        type: 'SESSION_ERROR',
        error: 'Room ID already in use. Please generate a new one.'
      });
    }
  });
}

// Host clicked Change Permissions in popup
async function handlePermissionDecision({ approved, canControl }) {
  currentAllowControl = approved && canControl;
  if (!activeConn) return;

  activeConn.send({
    type: 'permission-result',
    approved,
    canControl: currentAllowControl
  });
}

function stopSession() {
  if (activeConn) {
    activeConn.send({ type: 'session-ended', reason: 'Host closed session' });
    activeConn.close();
    activeConn = null;
  }
  if (activeCall) {
    activeCall.close();
    activeCall = null;
  }
  if (peer) {
    peer.destroy();
    peer = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  currentRoomId = null;
  currentPin = null;
}
