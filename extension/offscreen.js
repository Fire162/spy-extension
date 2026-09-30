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

// Portion Cropping Engine for View-Only privacy sharing
let portionSettings = { enabled: false, preset: 'topHalf', x: 0, y: 0, width: 100, height: 50 };
let cropVideoEl = null;
let cropCanvasEl = null;
let cropCtx = null;
let cropStream = null;
let isCropLoopActive = false;
let cropAnimFrameId = null;

function getCroppedStream() {
  if (cropStream) return cropStream;

  if (!cropVideoEl) {
    cropVideoEl = document.createElement('video');
    cropVideoEl.autoplay = true;
    cropVideoEl.muted = true;
    cropVideoEl.playsInline = true;
  }

  if (mediaStream && cropVideoEl.srcObject !== mediaStream) {
    cropVideoEl.srcObject = mediaStream;
    cropVideoEl.play().catch(() => {});
  }

  if (!cropCanvasEl) {
    cropCanvasEl = document.createElement('canvas');
    cropCanvasEl.width = 1280;
    cropCanvasEl.height = 720;
    cropCtx = cropCanvasEl.getContext('2d', { alpha: false, desynchronized: true });
  }

  cropStream = cropCanvasEl.captureStream(60);

  // Attach tab audio track to cropped stream if audio is present
  if (mediaStream && mediaStream.getAudioTracks().length > 0) {
    cropStream.addTrack(mediaStream.getAudioTracks()[0].clone());
  }

  startCropRendering();
  return cropStream;
}

function startCropRendering() {
  if (isCropLoopActive) return;
  isCropLoopActive = true;

  function renderCropFrame() {
    if (!isCropLoopActive || !mediaStream) return;

    if (cropVideoEl && cropVideoEl.readyState >= 2) {
      const vw = cropVideoEl.videoWidth || 1920;
      const vh = cropVideoEl.videoHeight || 1080;

      const xPct = Math.max(0, Math.min(90, (portionSettings.x || 0))) / 100;
      const yPct = Math.max(0, Math.min(90, (portionSettings.y || 0))) / 100;
      const wPct = Math.max(10, Math.min(100 - (portionSettings.x || 0), (portionSettings.width || 100))) / 100;
      const hPct = Math.max(10, Math.min(100 - (portionSettings.y || 0), (portionSettings.height || 100))) / 100;

      const sx = Math.round(vw * xPct);
      const sy = Math.round(vh * yPct);
      const sw = Math.round(vw * wPct);
      const sh = Math.round(vh * hPct);

      if (cropCanvasEl.width !== sw || cropCanvasEl.height !== sh) {
        cropCanvasEl.width = Math.max(320, sw);
        cropCanvasEl.height = Math.max(180, sh);
      }

      cropCtx.drawImage(cropVideoEl, sx, sy, sw, sh, 0, 0, cropCanvasEl.width, cropCanvasEl.height);
    }

    if ('requestVideoFrameCallback' in cropVideoEl) {
      cropVideoEl.requestVideoFrameCallback(renderCropFrame);
    } else {
      cropAnimFrameId = requestAnimationFrame(renderCropFrame);
    }
  }

  if ('requestVideoFrameCallback' in cropVideoEl) {
    cropVideoEl.requestVideoFrameCallback(renderCropFrame);
  } else {
    cropAnimFrameId = requestAnimationFrame(renderCropFrame);
  }
}

function updatePortionSettings(settings) {
  portionSettings = { ...portionSettings, ...settings };
  console.log('Offscreen updated portion settings:', portionSettings);

  // Switch video track for all active View-Only clients dynamically
  for (const [clientId, client] of connectedClients) {
    if (!client.canControl && client.call && client.call.peerConnection) {
      const targetStream = portionSettings.enabled ? getCroppedStream() : mediaStream;
      const targetTrack = targetStream ? targetStream.getVideoTracks()[0] : null;
      const senders = client.call.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender && targetTrack) {
        videoSender.replaceTrack(targetTrack).catch(err => {
          console.warn('Track replacement notice:', err);
        });
      }
      try {
        if (client.conn && client.conn.open) {
          client.conn.send({
            type: 'portion-update',
            portionEnabled: portionSettings.enabled,
            portion: portionSettings
          });
        }
      } catch (e) {}
    }
  }
}

function setupPeerConnectionListeners(clientId, pc) {
  if (!pc) return;
  pc.addEventListener('connectionstatechange', () => {
    console.log(`PeerConnection state for ${clientId}:`, pc.connectionState);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      removeClient(clientId, `WebRTC ${pc.connectionState}`);
    }
  });
  pc.addEventListener('iceconnectionstatechange', () => {
    console.log(`ICE state for ${clientId}:`, pc.iceConnectionState);
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
      removeClient(clientId, `Network ${pc.iceConnectionState}`);
    }
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

    case 'UPDATE_PORTION_SETTINGS':
      updatePortionSettings(message.payload);
      sendResponse({ success: true });
      break;

    case 'KICK_CLIENT':
      kickClient(message.payload);
      sendResponse({ success: true });
      break;

    case 'STOP_SESSION':
      stopSession(message.payload?.reason || 'Host closed session');
      sendResponse({ success: true });
      break;
  }
  return true;
});

async function startSession({ streamId, roomId, pin, portionSettings: initialPortion }) {
  // Always perform full teardown of any previous session first
  stopSession();

  if (initialPortion) {
    portionSettings = { ...portionSettings, ...initialPortion };
  }

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
    const isPortion = !canControl && portionSettings.enabled;
    const streamToShare = isPortion ? getCroppedStream() : mediaStream;

    console.log(`Host granted access to ${deviceInfo} (${clientId}). canControl: ${canControl}, isPortion: ${isPortion}`);
    if (conn && conn.open) {
      try {
        conn.send({
          type: 'permission-result',
          approved: true,
          canControl: !!canControl,
          portionEnabled: isPortion,
          portion: isPortion ? portionSettings : null
        });
      } catch (e) {
        console.warn('Failed to send permission-result:', e);
      }
    }

    let call = null;
    // Broadcast live media stream to this approved peer
    if (streamToShare && peer) {
      console.log('Initiating WebRTC media call to peer:', clientId, isPortion ? '(Cropped Portion)' : '(Full Screen)');
      call = peer.call(clientId, streamToShare);
      if (call && call.peerConnection) {
        tuneBitrate(call.peerConnection);
        setupPeerConnectionListeners(clientId, call.peerConnection);
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
      if (conn && conn.open) {
        conn.send({
          type: 'permission-result',
          approved: false,
          message: 'Access request was denied by the host.'
        });
      }
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
    const isPortion = !client.canControl && portionSettings.enabled;

    // Dynamically replace the video track on the WebRTC peer connection
    if (client.call && client.call.peerConnection) {
      const targetStream = isPortion ? getCroppedStream() : mediaStream;
      const targetTrack = targetStream ? targetStream.getVideoTracks()[0] : null;
      const senders = client.call.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender && targetTrack) {
        videoSender.replaceTrack(targetTrack).catch(err => {
          console.warn('Track replacement notice:', err);
        });
      }
    }

    try {
      if (client.conn && client.conn.open) {
        client.conn.send({
          type: 'role-update',
          canControl: !!canControl,
          portionEnabled: isPortion,
          portion: isPortion ? portionSettings : null
        });
      }
    } catch (e) {}
    notifyClientListUpdate();
  }
}

// Kick a specific client without stopping the entire room
function kickClient({ clientId }) {
  const client = connectedClients.get(clientId);
  if (client) {
    try {
      if (client.conn && client.conn.open) {
        client.conn.send({
          type: 'session-ended',
          reason: 'Host disconnected your device'
        });
      }
      client.conn.close();
      if (client.call) client.call.close();
    } catch (e) {}
    connectedClients.delete(clientId);
    notifyClientListUpdate();
  }
}

function removeClient(clientId, reason) {
  let devInfo = 'Remote Device';
  if (pendingClients.has(clientId)) {
    devInfo = pendingClients.get(clientId).deviceInfo || devInfo;
    pendingClients.delete(clientId);
  }
  if (connectedClients.has(clientId)) {
    const client = connectedClients.get(clientId);
    devInfo = client.deviceInfo || devInfo;
    if (client.call) {
      try { client.call.close(); } catch (e) {}
    }
    connectedClients.delete(clientId);
    notifyClientListUpdate();
  }
  chrome.runtime.sendMessage({
    type: 'CLIENT_DISCONNECTED',
    clientId,
    deviceInfo: devInfo,
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

function stopSession(reason = 'Host ended session') {
  isCropLoopActive = false;
  if (cropAnimFrameId) {
    cancelAnimationFrame(cropAnimFrameId);
    cropAnimFrameId = null;
  }
  if (cropStream) {
    cropStream.getTracks().forEach(t => t.stop());
    cropStream = null;
  }
  if (cropVideoEl) {
    cropVideoEl.srcObject = null;
  }

  if (audioCtx) {
    try { audioCtx.close(); } catch (e) {}
    audioCtx = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }

  // Broadcast termination notice to all connected clients BEFORE closing connections
  for (const [clientId, client] of connectedClients) {
    try {
      if (client.conn && client.conn.open) {
        client.conn.send({ type: 'host-tab-closed', reason });
        client.conn.send({ type: 'session-ended', reason });
      }
      client.conn.close();
      if (client.call) client.call.close();
    } catch (e) {}
  }
  connectedClients.clear();

  // Close all pending unapproved clients
  for (const [clientId, pending] of pendingClients) {
    try {
      if (pending.conn && pending.conn.open) {
        pending.conn.send({ type: 'host-tab-closed', reason });
        pending.conn.send({ type: 'session-ended', reason });
      }
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
