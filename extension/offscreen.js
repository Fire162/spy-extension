/**
 * Spy Extension - Offscreen Document
 * Powered by open WebRTC P2P (PeerJS).
 * Strict Two-Party Mutual Consent & Full Teardown Lifecycle.
 */

let mediaStream = null;
let audioCtx = null;
let peer = null;
let activeConn = null;
let activeCall = null;
let currentRoomId = null;
let currentPin = null;

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

async function startSession({ streamId, roomId, pin }) {
  // Always perform full teardown of any previous session first
  stopSession();

  currentRoomId = roomId;
  currentPin = String(pin).trim();

  // 1. Capture Tab Audio & Video Media Stream
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
          maxFrameRate: 144,
          maxWidth: 1920,
          maxHeight: 1080
        }
      }
    });
    console.log('Tab audio & video media stream captured successfully');

    // Route audio to host speakers so the host tab audio remains audible locally
    try {
      audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(mediaStream);
      source.connect(audioCtx.destination);
    } catch (e) {
      console.warn('AudioContext local playback error:', e);
    }
  } catch (err) {
    console.warn('Audio capture failed, falling back to video only:', err);
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
      console.log('Fallback video-only stream captured successfully');
    } catch (e) {
      console.error('Failed to get tab media stream:', e);
      chrome.runtime.sendMessage({
        type: 'SESSION_ERROR',
        error: 'Failed to capture tab: ' + e.message
      });
      return;
    }
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

        // PIN verified! Do NOT grant access or stream yet.
        // Mutual consent is mandatory: prompt host for approval.
        activeConn = conn;
        console.log('PIN verified. Awaiting explicit host permission decision...');

        conn.send({
          type: 'auth-success',
          status: 'waiting-for-approval',
          message: 'PIN verified. Waiting for host approval...'
        });

        // Notify background service worker and host popup
        chrome.runtime.sendMessage({
          type: 'PERMISSION_REQUEST',
          clientId: data.clientId || 'Remote Controller'
        });
      } else if (data.type === 'ping') {
        conn.send({ type: 'pong', time: data.time });
      } else if (data.type && data.type.startsWith('input-')) {
        // Forward input event to service worker for execution
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

// Host clicked Approve (Control or View Only) or Deny
async function handlePermissionDecision({ approved, canControl }) {
  if (!activeConn) return;

  if (approved) {
    console.log('Host granted permission. canControl:', canControl);
    activeConn.send({
      type: 'permission-result',
      approved: true,
      canControl: !!canControl
    });

    // Start streaming media only AFTER host clicked approve
    if (mediaStream && peer) {
      console.log('Calling controller with media stream:', activeConn.peer);
      activeCall = peer.call(activeConn.peer, mediaStream);
    }
  } else {
    console.log('Host denied access request.');
    activeConn.send({
      type: 'permission-result',
      approved: false,
      message: 'Access request was denied by the host.'
    });
    activeConn.close();
    activeConn = null;
  }
}

function stopSession() {
  if (audioCtx) {
    try { audioCtx.close(); } catch (e) {}
    audioCtx = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (activeCall) {
    try { activeCall.close(); } catch (e) {}
    activeCall = null;
  }
  if (activeConn) {
    try {
      activeConn.send({ type: 'session-ended', reason: 'Host closed session' });
      activeConn.close();
    } catch (e) {}
    activeConn = null;
  }
  if (peer) {
    try { peer.destroy(); } catch (e) {}
    peer = null;
  }
  currentRoomId = null;
  currentPin = null;
}
