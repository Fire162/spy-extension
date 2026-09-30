/**
 * Spy Extension - Web Controller Client
 * Peer-to-peer WebRTC connection + Input Event Dispatcher
 */

(function () {
  // DOM Elements
  const joinModal = document.getElementById('joinModal');
  const waitingModal = document.getElementById('waitingModal');
  const disconnectNotice = document.getElementById('disconnectNotice');
  const disconnectReason = document.getElementById('disconnectReason');
  const joinForm = document.getElementById('joinForm');
  const roomIdInput = document.getElementById('roomIdInput');
  const pinInput = document.getElementById('pinInput');
  const serverWsInput = document.getElementById('serverWsInput');
  const joinErrorMsg = document.getElementById('joinErrorMsg');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const sessionBadge = document.getElementById('sessionBadge');
  const currentRoomText = document.getElementById('currentRoomText');
  const latencyBadge = document.getElementById('latencyBadge');
  const latencyText = document.getElementById('latencyText');
  const modeBadge = document.getElementById('modeBadge');
  const modeText = document.getElementById('modeText');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const reconnectBtn = document.getElementById('reconnectBtn');
  const remoteVideo = document.getElementById('remoteVideo');
  const streamWrapper = document.getElementById('streamWrapper');
  const interactionNotice = document.getElementById('interactionNotice');

  // Connection State
  let ws = null;
  let peerConnection = null;
  let dataChannel = null;
  let currentRoomId = null;
  let canControl = false;
  let pingInterval = null;
  let lastPingTimestamp = 0;

  // WebRTC Configuration using standard open STUN server (zero third-party proprietary services)
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // Pre-fill fields from URL query params (e.g. ?room=SPY-1234&pin=5678)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('room')) roomIdInput.value = urlParams.get('room');
  if (urlParams.has('pin')) pinInput.value = urlParams.get('pin');

  // Determine default WebSocket URL
  function getDefaultWsUrl() {
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    // If running in development or hosted directly on server
    if (loc.host) {
      return `${protocol}//${loc.host}`;
    }
    return 'ws://localhost:3000';
  }

  serverWsInput.placeholder = getDefaultWsUrl();

  function updateStatus(state, label) {
    statusIndicator.className = `connection-status ${state}`;
    statusText.textContent = label;
  }

  // --- WebSocket & WebRTC Setup ---
  function connectToSignaling(roomId, pin, wsUrl) {
    updateStatus('waiting', 'Connecting to server...');
    joinErrorMsg.textContent = '';

    const targetUrl = wsUrl || getDefaultWsUrl();

    try {
      ws = new WebSocket(targetUrl);
    } catch (err) {
      joinErrorMsg.textContent = `WebSocket connection error: ${err.message}`;
      updateStatus('', 'Disconnected');
      return;
    }

    ws.onopen = () => {
      updateStatus('waiting', 'Joining room...');
      ws.send(JSON.stringify({
        type: 'join-room',
        roomId: roomId.trim().toUpperCase(),
        pin: pin.trim(),
        clientId: 'Web Controller (' + navigator.platform + ')'
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
        case 'join-status':
          if (msg.status === 'waiting-for-approval') {
            joinModal.style.display = 'none';
            waitingModal.style.display = 'flex';
            updateStatus('waiting', 'Awaiting host consent...');
          }
          break;

        case 'permission-result':
          waitingModal.style.display = 'none';
          if (!msg.approved) {
            joinModal.style.display = 'flex';
            joinErrorMsg.textContent = 'Access request was denied by the host.';
            updateStatus('', 'Denied');
            cleanupConnection();
          } else {
            canControl = !!msg.canControl;
            currentRoomId = roomId;
            currentRoomText.textContent = roomId;
            sessionBadge.style.display = 'flex';
            modeBadge.style.display = 'inline-block';
            disconnectBtn.style.display = 'inline-flex';
            fullscreenBtn.style.display = 'inline-flex';

            if (canControl) {
              modeBadge.className = 'mode-badge control';
              modeText.textContent = 'FULL CONTROL';
              interactionNotice.textContent = '⚡ Click & type inside the frame to control host browser';
            } else {
              modeBadge.className = 'mode-badge';
              modeText.textContent = 'VIEW ONLY';
              interactionNotice.textContent = '👁️ Host granted View-Only access';
            }

            updateStatus('waiting', 'Establishing P2P stream...');
            initWebRTC();
          }
          break;

        case 'signal':
          handleSignalingMessage(msg.data);
          break;

        case 'host-disconnected':
        case 'session-ended':
          handleSessionEnded(msg.message || msg.reason || 'Host ended the session');
          break;

        case 'error':
          joinErrorMsg.textContent = msg.message;
          waitingModal.style.display = 'none';
          joinModal.style.display = 'flex';
          updateStatus('', 'Error');
          cleanupConnection();
          break;
      }
    };

    ws.onerror = () => {
      joinErrorMsg.textContent = 'Could not connect to signaling server.';
      updateStatus('', 'Error');
    };

    ws.onclose = () => {
      if (currentRoomId) {
        handleSessionEnded('Disconnected from signaling server.');
      }
    };
  }

  // WebRTC initialization (Controller side)
  function initWebRTC() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    // ICE Candidate generation
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'signal',
          data: { candidate: event.candidate }
        }));
      }
    };

    // Receive tab video stream from Host
    peerConnection.ontrack = (event) => {
      console.log('Received remote media stream', event.streams);
      if (remoteVideo.srcObject !== event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
        updateStatus('connected', 'Live Connected');
        latencyBadge.style.display = 'flex';
      }
    };

    // In WebRTC, the controller receives the dataChannel created by the Host
    peerConnection.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    peerConnection.onconnectionstatechange = () => {
      console.log('WebRTC Connection state:', peerConnection.connectionState);
      if (peerConnection.connectionState === 'connected') {
        updateStatus('connected', 'Live P2P');
      } else if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
        updateStatus('', 'Stream Lost');
      }
    };
  }

  async function handleSignalingMessage(data) {
    if (!peerConnection) return;

    if (data.offer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'signal',
          data: { answer }
        }));
      }
    } else if (data.answer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.candidate) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('Error adding ICE candidate:', e);
      }
    }
  }

  function setupDataChannel(channel) {
    dataChannel = channel;
    dataChannel.onopen = () => {
      console.log('Data channel open. Ready to send inputs.');
      // Start ping/latency measurements
      pingInterval = setInterval(() => {
        if (dataChannel && dataChannel.readyState === 'open') {
          lastPingTimestamp = performance.now();
          dataChannel.send(JSON.stringify({ type: 'ping', time: lastPingTimestamp }));
        }
      }, 2000);
    };

    dataChannel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'pong') {
          const rtt = Math.round(performance.now() - msg.time);
          latencyText.textContent = `${rtt} ms`;
        }
      } catch (e) {}
    };

    dataChannel.onclose = () => {
      if (pingInterval) clearInterval(pingInterval);
    };
  }

  // --- Input Event Capture & Dispatch ---
  function sendInput(payload) {
    if (!canControl) return;
    if (!dataChannel || dataChannel.readyState !== 'open') return;
    dataChannel.send(JSON.stringify(payload));
  }

  // Calculate coordinates normalized to host tab resolution
  function getCoordinates(event) {
    const rect = remoteVideo.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y))
    };
  }

  let lastMoveTime = 0;
  remoteVideo.addEventListener('mousemove', (e) => {
    if (!canControl) return;
    const now = performance.now();
    if (now - lastMoveTime < 16) return; // ~60fps throttle
    lastMoveTime = now;

    const coords = getCoordinates(e);
    sendInput({
      type: 'input-mouse',
      action: 'move',
      x: coords.x,
      y: coords.y
    });
  });

  remoteVideo.addEventListener('mousedown', (e) => {
    if (!canControl) return;
    const coords = getCoordinates(e);
    sendInput({
      type: 'input-mouse',
      action: 'down',
      button: e.button === 2 ? 'right' : (e.button === 1 ? 'middle' : 'left'),
      x: coords.x,
      y: coords.y
    });
  });

  remoteVideo.addEventListener('mouseup', (e) => {
    if (!canControl) return;
    const coords = getCoordinates(e);
    sendInput({
      type: 'input-mouse',
      action: 'up',
      button: e.button === 2 ? 'right' : (e.button === 1 ? 'middle' : 'left'),
      x: coords.x,
      y: coords.y
    });
  });

  remoteVideo.addEventListener('wheel', (e) => {
    if (!canControl) return;
    e.preventDefault();
    const coords = getCoordinates(e);
    sendInput({
      type: 'input-wheel',
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      x: coords.x,
      y: coords.y
    });
  }, { passive: false });

  // Prevent default right-click menu on the remote video so controller can right-click remote pages
  remoteVideo.addEventListener('contextmenu', (e) => {
    if (canControl) e.preventDefault();
  });

  // Keyboard capture when clicking on video area
  window.addEventListener('keydown', (e) => {
    if (!canControl) return;
    // Don't capture when typing in modal inputs
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

    // Send keydown
    sendInput({
      type: 'input-key',
      action: 'down',
      key: e.key,
      code: e.code,
      keyCode: e.keyCode,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey
    });

    // Prevent scrolling parent window with Space/Arrows
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace'].includes(e.code)) {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (!canControl) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

    sendInput({
      type: 'input-key',
      action: 'up',
      key: e.key,
      code: e.code,
      keyCode: e.keyCode
    });
  });

  // --- Session Cleanup ---
  function cleanupConnection() {
    if (pingInterval) clearInterval(pingInterval);
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
    canControl = false;
    sessionBadge.style.display = 'none';
    latencyBadge.style.display = 'none';
    modeBadge.style.display = 'none';
    disconnectBtn.style.display = 'none';
    fullscreenBtn.style.display = 'none';
    if (remoteVideo.srcObject) {
      remoteVideo.srcObject.getTracks().forEach(t => t.stop());
      remoteVideo.srcObject = null;
    }
  }

  function handleSessionEnded(reason) {
    cleanupConnection();
    disconnectReason.textContent = reason;
    disconnectNotice.style.display = 'flex';
    updateStatus('', 'Disconnected');
  }

  // --- UI Event Handlers ---
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const room = roomIdInput.value;
    const pin = pinInput.value;
    const serverUrl = serverWsInput.value;
    if (room && pin) {
      connectToSignaling(room, pin, serverUrl);
    }
  });

  document.getElementById('cancelJoinBtn').addEventListener('click', () => {
    cleanupConnection();
    waitingModal.style.display = 'none';
    joinModal.style.display = 'flex';
    updateStatus('', 'Disconnected');
  });

  disconnectBtn.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop-session' }));
    }
    handleSessionEnded('You disconnected from the session.');
  });

  reconnectBtn.addEventListener('click', () => {
    disconnectNotice.style.display = 'none';
    joinModal.style.display = 'flex';
  });

  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      streamWrapper.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

})();
