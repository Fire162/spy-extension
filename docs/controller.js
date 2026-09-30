/**
 * Spy Extension - Web Controller Client (GitHub Pages / Standalone)
 * Powered by open WebRTC P2P (PeerJS). Zero API keys, zero auth, zero config.
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
  let peer = null;
  let conn = null;
  let activeCall = null;
  let currentRoomId = null;
  let canControl = false;
  let pingInterval = null;
  let lastPingTimestamp = 0;

  function sanitizePeerId(raw) {
    return 'spy-' + raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // Parse room and pin from either URL Hash (#room=...&pin=...) or Query string (?room=...&pin=...)
  function parseUrlParams() {
    let params = new URLSearchParams(window.location.search);
    if (!params.has('room') && window.location.hash) {
      const hashStr = window.location.hash.startsWith('#') ? window.location.hash.substring(1) : window.location.hash;
      params = new URLSearchParams(hashStr);
    }

    if (params.has('room')) roomIdInput.value = params.get('room');
    if (params.has('pin')) pinInput.value = params.get('pin');
  }

  parseUrlParams();

  function updateStatus(state, label) {
    statusIndicator.className = `connection-status ${state}`;
    statusText.textContent = label;
  }

  function connectToHost(roomId, pin) {
    updateStatus('waiting', 'Connecting P2P...');
    joinErrorMsg.textContent = '';
    currentRoomId = roomId;

    const targetPeerId = sanitizePeerId(roomId);

    // Initialize WebRTC Peer using standard open STUN server (zero API keys)
    peer = new Peer({
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });

    peer.on('open', (id) => {
      console.log('Controller Peer initialized with ID:', id);
      joinModal.style.display = 'none';
      waitingModal.style.display = 'flex';
      updateStatus('waiting', 'Reaching host browser...');

      // Connect data channel to host
      conn = peer.connect(targetPeerId, { reliable: true });

      conn.on('open', () => {
        console.log('Data connection opened to host:', targetPeerId);
        updateStatus('waiting', 'Awaiting host consent...');
        // Send authentication PIN
        conn.send({
          type: 'auth',
          pin: pin.trim(),
          clientId: 'Web Controller (' + (navigator.platform || 'Browser') + ')'
        });
      });

      conn.on('data', (data) => {
        handleIncomingData(data);
      });

      conn.on('close', () => {
        handleSessionEnded('Host closed connection.');
      });

      conn.on('error', (err) => {
        console.error('Connection error:', err);
        handleSessionEnded('Connection error: ' + err.message);
      });
    });

    // Listen for incoming live media stream from Host
    peer.on('call', (call) => {
      activeCall = call;
      console.log('Received media call from host. Answering...');
      call.answer(); // Answer without sending audio/video back

      call.on('stream', (remoteStream) => {
        console.log('Live video stream attached!');
        remoteVideo.srcObject = remoteStream;
        updateStatus('connected', 'Live Connected');
        latencyBadge.style.display = 'flex';
      });

      call.on('close', () => {
        handleSessionEnded('Live media stream closed.');
      });
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'peer-unavailable') {
        joinErrorMsg.textContent = 'Room not found. Make sure host has session active.';
      } else {
        joinErrorMsg.textContent = 'Connection error: ' + err.type;
      }
      waitingModal.style.display = 'none';
      joinModal.style.display = 'flex';
      updateStatus('', 'Disconnected');
      cleanupConnection();
    });
  }

  function handleIncomingData(data) {
    switch (data.type) {
      case 'auth-failed':
        joinErrorMsg.textContent = data.error || 'Incorrect PIN';
        waitingModal.style.display = 'none';
        joinModal.style.display = 'flex';
        updateStatus('', 'Auth Failed');
        cleanupConnection();
        break;

      case 'permission-result':
        waitingModal.style.display = 'none';
        if (!data.approved) {
          joinModal.style.display = 'flex';
          joinErrorMsg.textContent = 'Access request was denied by the host.';
          updateStatus('', 'Access Denied');
          cleanupConnection();
        } else {
          canControl = !!data.canControl;
          currentRoomText.textContent = currentRoomId;
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

          updateStatus('connected', 'Streaming...');
          startLatencyPing();
        }
        break;

      case 'pong':
        const rtt = Math.round(performance.now() - data.time);
        latencyText.textContent = `${rtt} ms`;
        break;

      case 'session-ended':
        handleSessionEnded(data.reason || 'Host ended session');
        break;
    }
  }

  function startLatencyPing() {
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (conn && conn.open) {
        lastPingTimestamp = performance.now();
        conn.send({ type: 'ping', time: lastPingTimestamp });
      }
    }, 2000);
  }

  // --- Input Event Capture & Dispatch ---
  function sendInput(payload) {
    if (!canControl) return;
    if (!conn || !conn.open) return;
    conn.send(payload);
  }

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

  remoteVideo.addEventListener('contextmenu', (e) => {
    if (canControl) e.preventDefault();
  });

  window.addEventListener('keydown', (e) => {
    if (!canControl) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

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
    if (conn) {
      conn.close();
      conn = null;
    }
    if (activeCall) {
      activeCall.close();
      activeCall = null;
    }
    if (peer) {
      peer.destroy();
      peer = null;
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
    if (room && pin) {
      connectToHost(room, pin);
    }
  });

  document.getElementById('cancelJoinBtn').addEventListener('click', () => {
    cleanupConnection();
    waitingModal.style.display = 'none';
    joinModal.style.display = 'flex';
    updateStatus('', 'Disconnected');
  });

  disconnectBtn.addEventListener('click', () => {
    if (conn && conn.open) {
      conn.send({ type: 'session-ended', reason: 'Controller disconnected' });
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
