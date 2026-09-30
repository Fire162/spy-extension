/**
 * Spy Extension - Offscreen Document
 * Multi-Peer WebRTC P2P (PeerJS) Streamer.
 * 1-to-Many live tab streaming with granular per-device control permissions.
 */

let mediaStream = null;
let audioCtx = null;
let peer = null;
let currentRoomId = null;
let currentPin = null;

// Multi-client pools
// connectedClients: clientId (peerId) -> { conn, call, canControl, deviceInfo, connectedAt }
const connectedClients = new Map();
// pendingClients: clientId (peerId) -> { conn, deviceInfo }
const pendingClients = new Map();

function sanitizePeerId(raw) {
  return 'spy-' + raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function notifyClientListUpdate() {
  const clients = Array.from(connectedClients.entries()).map(([id, c]) => ({
    clientId: id,
    deviceInfo: c.deviceInfo,
    canControl: c.canControl,
    connectedAt: c.connectedAt
  }));
  chrome.runtime.sendMessage({
    type: 'CLIENTS_UPDATED',
    clients
  });
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

    case 'UPDATE_CLIENT_ROLE':
      updateClientRole(message.payload);
      sendResponse({ success: true });
      break;

    case 'KICK_CLIENT':
      kickClient(message.payload);
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
          minWidth: 1280,
          maxWidth: 1920,
          minHeight: 720,
          maxHeight: 1080
        }
      }
    });

    // Optimize video track for high text clarity and detail
    const vTrack = mediaStream.getVideoTracks()[0];
    if (vTrack && 'contentHint' in vTrack) {
      vTrack.contentHint = 'detail';
    }

    console.log('Tab audio & video media stream captured successfully (Ultra-HD detail hint)');

    // Route audio to host speakers so host tab audio remains audible locally
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
            chromeMediaSourceId: streamId,
            maxFrameRate: 144,
            maxWidth: 1920,
            maxHeight: 1080
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
  console.log('Initializing multi-peer host with ID:', hostPeerId);

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

  // Listen for incoming controller connections (Multi-device support)
  peer.on('connection', (conn) => {
    console.log('Incoming connection from peer:', conn.peer);

    conn.on('data', (data) => {
      if (data.type === 'auth') {
        if (String(data.pin).trim() !== currentPin) {
          console.warn('Authentication failed: incorrect PIN from', conn.peer);
          conn.send({ type: 'auth-failed', error: 'Incorrect 4-digit PIN' });
          conn.close();
          return;
        }

        // PIN verified! Add to pending clients pool
        const clientId = conn.peer;
        const deviceInfo = data.deviceInfo || 'Remote Device';
        pendingClients.set(clientId, { conn, deviceInfo });

        console.log(`PIN verified for ${deviceInfo} (${clientId}). Awaiting host approval...`);

        conn.send({
          type: 'auth-success',
          status: 'waiting-for-approval',
          message: 'PIN verified. Waiting for host approval...'
        });

        // Notify background service worker and host popup of this specific request
        chrome.runtime.sendMessage({
          type: 'PERMISSION_REQUEST',
          clientId,
          deviceInfo
        });
      } else if (data.type === 'ping') {
        conn.send({ type: 'pong', time: data.time });
      } else if (data.type && (data.type.startsWith('input-') || data.type.startsWith('nav-') || data.type === 'remote-pointer')) {
        // Enforce per-client control permission
        const client = connectedClients.get(conn.peer);
        if (client && client.canControl) {
          chrome.runtime.sendMessage({
            type: 'EXECUTE_INPUT',
            input: data,
            clientId: conn.peer
          });
        }
      } else if (data.type === 'session-ended') {
        removeClient(conn.peer, 'Client left session');
      }
    });

    conn.on('close', () => {
      console.log('Peer connection closed:', conn.peer);
      removeClient(conn.peer, 'Connection closed');
    });

    conn.on('error', (err) => {
      console.warn('Connection error with peer:', conn.peer, err);
      removeClient(conn.peer, 'Connection error');
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

// Host clicked Approve or Deny for a specific client
async function handlePermissionDecision({ clientId, approved, canControl }) {
  const pending = pendingClients.get(clientId);
  if (!pending) {
    console.warn('Cannot decide permission: client not found in pendingClients:', clientId);
    return;
  }

  const { conn, deviceInfo } = pending;
  pendingClients.delete(clientId);

  if (approved) {
    console.log(`Host granted access to ${deviceInfo} (${clientId}). canControl: ${canControl}`);
    conn.send({
      type: 'permission-result',
      approved: true,
      canControl: !!canControl
    });

    let call = null;
    // Broadcast live media stream to this approved peer
    if (mediaStream && peer) {
      console.log('Initiating WebRTC media call to peer:', clientId);
      call = peer.call(clientId, mediaStream);
      if (call && call.peerConnection) {
        tuneBitrate(call.peerConnection);
      }
    }

    connectedClients.set(clientId, {
      conn,
      call,
      canControl: !!canControl,
      deviceInfo,
      connectedAt: Date.now()
    });

    notifyClientListUpdate();
  } else {
    console.log(`Host denied access request from ${deviceInfo} (${clientId})`);
    try {
      conn.send({
        type: 'permission-result',
        approved: false,
        message: 'Access request was denied by the host.'
      });
      conn.close();
    } catch (e) {}
    notifyClientListUpdate();
  }
}

// Dynamically change role for an active client (e.g. switch between Full Control and View Only)
function updateClientRole({ clientId, canControl }) {
  const client = connectedClients.get(clientId);
  if (client) {
    client.canControl = !!canControl;
    try {
      client.conn.send({
        type: 'role-update',
        canControl: !!canControl
      });
    } catch (e) {}
    notifyClientListUpdate();
  }
}

// Kick a specific client without stopping the entire room
function kickClient({ clientId }) {
  const client = connectedClients.get(clientId);
  if (client) {
    try {
      client.conn.send({
        type: 'session-ended',
        reason: 'Host disconnected your device'
      });
      client.conn.close();
      if (client.call) client.call.close();
    } catch (e) {}
    connectedClients.delete(clientId);
    notifyClientListUpdate();
  }
}

function removeClient(clientId, reason) {
  if (pendingClients.has(clientId)) {
    pendingClients.delete(clientId);
  }
  if (connectedClients.has(clientId)) {
    const client = connectedClients.get(clientId);
    if (client.call) {
      try { client.call.close(); } catch (e) {}
    }
    connectedClients.delete(clientId);
    notifyClientListUpdate();
  }
  chrome.runtime.sendMessage({
    type: 'CLIENT_DISCONNECTED',
    clientId,
    reason
  });
}

// Boost WebRTC video sender encoding bitrate for crisp text clarity and high FPS smoothness
async function tuneBitrate(pc) {
  if (!pc) return;
  const applySettings = async () => {
    try {
      const senders = pc.getSenders();
      for (const sender of senders) {
        if (sender.track && sender.track.kind === 'video') {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = 8000000; // 8 Mbps Ultra-HD
          params.encodings[0].networkPriority = 'high';
          if ('degradationPreference' in params) {
            params.degradationPreference = 'maintain-resolution';
          }
          await sender.setParameters(params);
          console.log('Applied 8 Mbps Ultra-HD bitrate and maintain-resolution to peer video sender');
        }
      }
    } catch (e) {
      console.warn('Bitrate tuning notice:', e);
    }
  };

  setTimeout(applySettings, 500);
  setTimeout(applySettings, 2000);
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

  // Close all connected clients
  for (const [clientId, client] of connectedClients) {
    try {
      client.conn.send({ type: 'session-ended', reason: 'Host closed session' });
      client.conn.close();
      if (client.call) client.call.close();
    } catch (e) {}
  }
  connectedClients.clear();

  // Close all pending unapproved clients
  for (const [clientId, pending] of pendingClients) {
    try {
      pending.conn.send({ type: 'session-ended', reason: 'Host closed session' });
      pending.conn.close();
    } catch (e) {}
  }
  pendingClients.clear();

  if (peer) {
    try { peer.destroy(); } catch (e) {}
    peer = null;
  }

  currentRoomId = null;
  currentPin = null;
}
