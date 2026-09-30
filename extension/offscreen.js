/**
 * Spy Extension - Offscreen Document
 * Handles tab audio/video capture, WebRTC PeerConnection, and DataChannel input relay.
 */

let mediaStream = null;
let peerConnection = null;
let dataChannel = null;
let ws = null;
let currentRoomId = null;
let currentPin = null;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

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

async function startSession({ streamId, roomId, pin, serverUrl }) {
  currentRoomId = roomId;
  currentPin = pin;

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
  } catch (err) {
    console.error('Failed to get tab media stream:', err);
    chrome.runtime.sendMessage({
      type: 'SESSION_ERROR',
      error: 'Failed to capture tab: ' + err.message
    });
    return;
  }

  // 2. Connect to Signaling Server
  const wsUrl = serverUrl || 'ws://localhost:3000';
  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    console.error('Failed to connect to signaling server:', err);
    chrome.runtime.sendMessage({
      type: 'SESSION_ERROR',
      error: 'Cannot connect to signaling server at ' + wsUrl
    });
    return;
  }

  ws.onopen = () => {
    // Register as host
    ws.send(JSON.stringify({
      type: 'create-room',
      roomId: currentRoomId,
      pin: currentPin
    }));
  };

  ws.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'room-created':
        chrome.runtime.sendMessage({
          type: 'ROOM_READY',
          roomId: currentRoomId
        });
        break;

      case 'permission-request':
        // Controller is knocking on the door: ask host for mutual approval
        chrome.runtime.sendMessage({
          type: 'PERMISSION_REQUEST',
          clientId: msg.clientId
        });
        break;

      case 'signal':
        handleSignalingMessage(msg.data);
        break;

      case 'controller-disconnected':
      case 'session-ended':
        chrome.runtime.sendMessage({
          type: 'CONTROLLER_DISCONNECTED'
        });
        break;
    }
  };

  ws.onerror = (e) => {
    console.error('Offscreen WebSocket error', e);
  };

  ws.onclose = () => {
    chrome.runtime.sendMessage({ type: 'SIGNALING_CLOSED' });
  };
}

// Host clicked Approve or Deny in popup
async function handlePermissionDecision({ approved, canControl }) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // Inform signaling server
  ws.send(JSON.stringify({
    type: 'permission-response',
    approved,
    canControl
  }));

  if (approved) {
    // Initiate WebRTC PeerConnection as Host
    setupPeerConnection();
  }
}

async function setupPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);

  // Send ICE Candidates to controller via signaling
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'signal',
        data: { candidate: event.candidate }
      }));
    }
  };

  // Add the tab media stream tracks to WebRTC
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, mediaStream);
    });
  }

  // Create DataChannel for low-latency input event relay
  dataChannel = peerConnection.createDataChannel('control-channel', {
    ordered: true
  });

  dataChannel.onopen = () => {
    console.log('WebRTC DataChannel open with remote controller');
  };

  dataChannel.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'ping') {
        dataChannel.send(JSON.stringify({ type: 'pong', time: msg.time }));
      } else if (msg.type.startsWith('input-')) {
        // Forward input event to background service worker for CDP execution
        chrome.runtime.sendMessage({
          type: 'EXECUTE_INPUT',
          input: msg
        });
      }
    } catch (e) {
      console.error('Error handling data channel message:', e);
    }
  };

  // Create WebRTC Offer
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    ws.send(JSON.stringify({
      type: 'signal',
      data: { offer }
    }));
  } catch (err) {
    console.error('Error creating WebRTC offer:', err);
  }
}

async function handleSignalingMessage(data) {
  if (!peerConnection) return;

  if (data.answer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  } else if (data.candidate) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
      console.error('Error adding ICE candidate:', e);
    }
  }
}

function stopSession() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
  currentRoomId = null;
  currentPin = null;
}
