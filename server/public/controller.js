/**
 * Spy Extension - Web Controller Client (GitHub Pages / Standalone)
 * Powered by open WebRTC P2P (PeerJS).
 * Full Mobile Touch, Virtual Keyboard, and Live Tab Audio support.
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
  const portionBadge = document.getElementById('portionBadge');

  // Audio Elements
  const audioToggleBtn = document.getElementById('audioToggleBtn');
  const audioIcon = document.getElementById('audioIcon');
  const audioNotice = document.getElementById('audioNotice');
  const unmuteNoticeBtn = document.getElementById('unmuteNoticeBtn');

  // Mobile Elements
  const mobileDock = document.getElementById('mobileDock');
  const mobileKeyboardBtn = document.getElementById('mobileKeyboardBtn');
  const mobileDockKeyboardBtn = document.getElementById('mobileDockKeyboardBtn');
  const mobileModeTapBtn = document.getElementById('mobileModeTapBtn');
  const mobileModeScrollBtn = document.getElementById('mobileModeScrollBtn');
  const mobileInputSheet = document.getElementById('mobileInputSheet');
  const mobileTextInput = document.getElementById('mobileTextInput');
  const mobileSendTextBtn = document.getElementById('mobileSendTextBtn');
  const mobilePasteBtn = document.getElementById('mobilePasteBtn');
  const closeSheetBtn = document.getElementById('closeSheetBtn');

  // Navigation Elements
  const navToolbar = document.getElementById('navToolbar');
  const navBarToggleBtn = document.getElementById('navBarToggleBtn');
  const navBackBtn = document.getElementById('navBackBtn');
  const navForwardBtn = document.getElementById('navForwardBtn');
  const navReloadBtn = document.getElementById('navReloadBtn');
  const navUrlForm = document.getElementById('navUrlForm');
  const navUrlInput = document.getElementById('navUrlInput');
  const navCloseBtn = document.getElementById('navCloseBtn');

  // Zoom Elements
  const zoomPill = document.getElementById('zoomPill');
  const zoomLevelText = document.getElementById('zoomLevelText');
  const resetZoomBtn = document.getElementById('resetZoomBtn');

  // Connection State
  let peer = null;
  let conn = null;
  let activeCall = null;
  let currentRoomId = null;
  let canControl = false;
  let pingInterval = null;
  let lastPingTimestamp = 0;
  let isMuted = false;

  // Touch & Pinch-to-Zoom State
  let touchMode = 'tap'; // 'tap' or 'scroll'
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let isTouchDragging = false;
  let currentZoom = 1.0;
  let panX = 0;
  let panY = 0;
  let isPinching = false;
  let initialPinchDist = 0;
  let initialZoom = 1.0;
  let lastPinchMidX = 0;
  let lastPinchMidY = 0;

  function sanitizePeerId(raw) {
    return 'spy-' + raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // Parse room and pin from URL
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

  function detectDeviceInfo() {
    const ua = navigator.userAgent;
    let os = 'Desktop';
    if (/iPhone/i.test(ua)) os = 'iPhone';
    else if (/iPad/i.test(ua)) os = 'iPad';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Linux/i.test(ua)) os = 'Linux';

    let browser = 'Browser';
    if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) browser = 'Chrome';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    else if (/Firefox/i.test(ua)) browser = 'Firefox';
    else if (/Edg/i.test(ua)) browser = 'Edge';

    const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
    return `${isMobile ? '📱' : '💻'} ${os} (${browser})`;
  }

  function connectToHost(roomId, pin) {
    updateStatus('waiting', 'Connecting P2P...');
    joinErrorMsg.textContent = '';
    currentRoomId = roomId;

    const targetPeerId = sanitizePeerId(roomId);

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

      conn = peer.connect(targetPeerId, { reliable: true });

      conn.on('open', () => {
        console.log('Data connection opened to host:', targetPeerId);
        updateStatus('waiting', 'Awaiting authorization...');
        const deviceInfo = detectDeviceInfo();
        conn.send({
          type: 'auth',
          pin: pin.trim(),
          deviceInfo: deviceInfo,
          clientId: deviceInfo
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

    // Receive live audio and video stream
    peer.on('call', (call) => {
      activeCall = call;
      console.log('Received media call with audio/video. Answering...');
      call.answer();

      call.on('stream', (remoteStream) => {
        console.log('Live media stream attached (tracks:', remoteStream.getTracks().length, ')');
        remoteVideo.srcObject = remoteStream;
        updateStatus('connected', 'Live Connected');
        latencyBadge.style.display = 'flex';

        // Apply low-latency hints to eliminate browser jitter-buffering
        try {
          if (call.peerConnection) {
            call.peerConnection.getReceivers().forEach((receiver) => {
              if ('playoutDelayHint' in receiver) {
                receiver.playoutDelayHint = 0; // 0 seconds = render immediately
              }
              if ('jitterBufferTarget' in receiver) {
                receiver.jitterBufferTarget = 0; // Chromium low-latency flag
              }
            });
          }
          if ('playoutDelayHint' in remoteVideo) {
            remoteVideo.playoutDelayHint = 0;
          }
        } catch (e) {
          console.warn('Low-latency playout hint not supported:', e);
        }

        // Check if stream includes audio
        const hasAudio = remoteStream.getAudioTracks().length > 0;
        if (hasAudio) {
          audioToggleBtn.style.display = 'inline-flex';
          remoteVideo.muted = false;

          // Attempt audio playback (handle browser autoplay restrictions)
          remoteVideo.play().catch((err) => {
            console.warn('Autoplay blocked with sound:', err.message);
            remoteVideo.muted = true;
            remoteVideo.play();
            isMuted = true;
            audioIcon.textContent = '🔇';
            audioNotice.style.display = 'flex';
          });
        }
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
      case 'auth-success':
        updateStatus('waiting', 'Awaiting host approval...');
        const waitingTitle = document.getElementById('waitingTitle');
        const waitingDesc = document.getElementById('waitingDesc');
        if (waitingTitle) waitingTitle.textContent = 'PIN Verified';
        if (waitingDesc) {
          waitingDesc.textContent = 'Waiting for the host to click "Allow Control" or "View Only" in their extension...';
        }
        break;

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

          if (data.portionEnabled) {
            if (portionBadge) portionBadge.style.display = 'inline-flex';
          } else {
            if (portionBadge) portionBadge.style.display = 'none';
          }

          if (canControl) {
            modeBadge.className = 'mode-badge control';
            modeText.textContent = 'FULL CONTROL';
            interactionNotice.textContent = '⚡ Click, tap, or type to control remote browser';
            if (navBarToggleBtn) navBarToggleBtn.style.display = 'inline-flex';
            if (navToolbar) {
              navToolbar.style.display = 'flex';
              navToolbar.classList.remove('collapsed');
            }
          } else {
            modeBadge.className = 'mode-badge';
            modeText.textContent = 'VIEW ONLY';
            interactionNotice.textContent = data.portionEnabled ? '🔒 Host shared a specific screen portion (View-Only)' : '👁️ Host granted View-Only access';
            if (navBarToggleBtn) navBarToggleBtn.style.display = 'none';
            if (navToolbar) navToolbar.style.display = 'none';
          }

          updateStatus('connected', 'Live P2P');
          startLatencyPing();
        }
        break;

      case 'pong':
        const rtt = Math.round(performance.now() - data.time);
        latencyText.textContent = `${rtt} ms`;
        break;

      case 'role-update':
        canControl = !!data.canControl;
        if (data.portionEnabled) {
          if (portionBadge) portionBadge.style.display = 'inline-flex';
        } else {
          if (portionBadge) portionBadge.style.display = 'none';
        }

        if (canControl) {
          modeBadge.className = 'mode-badge control';
          modeText.textContent = 'FULL CONTROL';
          interactionNotice.textContent = '⚡ Host granted Full Control to this device';
          if (navBarToggleBtn) navBarToggleBtn.style.display = 'inline-flex';
          if (navToolbar) {
            navToolbar.style.display = 'flex';
            navToolbar.classList.remove('collapsed');
          }
        } else {
          modeBadge.className = 'mode-badge';
          modeText.textContent = 'VIEW ONLY';
          interactionNotice.textContent = data.portionEnabled ? '🔒 Host shared a specific screen portion (View-Only)' : '👁️ Host changed your access to View-Only';
          if (navBarToggleBtn) navBarToggleBtn.style.display = 'none';
          if (navToolbar) navToolbar.style.display = 'none';
        }
        break;

      case 'portion-update':
        if (data.portionEnabled) {
          if (portionBadge) portionBadge.style.display = 'inline-flex';
          interactionNotice.textContent = '🔒 Host updated the shared screen portion (View-Only)';
        } else {
          if (portionBadge) portionBadge.style.display = 'none';
        }
        break;

      case 'host-tab-closed':
        handleSessionEnded(data.reason || 'Host closed the shared tab. Session has ended.');
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

  function getCoordinates(clientX, clientY) {
    const rect = remoteVideo.getBoundingClientRect();
    const videoWidth = remoteVideo.videoWidth || rect.width;
    const videoHeight = remoteVideo.videoHeight || rect.height;

    // Adjust for Pinch-to-Zoom & Pan if active
    let adjustedX = clientX;
    let adjustedY = clientY;
    if (currentZoom > 1.0) {
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      adjustedX = centerX + (clientX - centerX) / currentZoom - (panX / currentZoom);
      adjustedY = centerY + (clientY - centerY) / currentZoom - (panY / currentZoom);
    }

    if (!videoWidth || !videoHeight) {
      const x = (adjustedX - rect.left) / rect.width;
      const y = (adjustedY - rect.top) / rect.height;
      return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    }

    const videoRatio = videoWidth / videoHeight;
    const elementRatio = rect.width / rect.height;

    let renderWidth = rect.width;
    let renderHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (elementRatio > videoRatio) {
      renderWidth = rect.height * videoRatio;
      offsetX = (rect.width - renderWidth) / 2;
    } else {
      renderHeight = rect.width / videoRatio;
      offsetY = (rect.height - renderHeight) / 2;
    }

    const clickX = adjustedX - rect.left - offsetX;
    const clickY = adjustedY - rect.top - offsetY;

    const normX = Math.max(0, Math.min(1, clickX / renderWidth));
    const normY = Math.max(0, Math.min(1, clickY / renderHeight));

    return { x: normX, y: normY };
  }

  // --- Mouse Listeners (Desktop) ---
  let lastMoveTime = 0;
  remoteVideo.addEventListener('mousemove', (e) => {
    if (!canControl) return;
    const now = performance.now();
    if (now - lastMoveTime < 16) return;
    lastMoveTime = now;

    const coords = getCoordinates(e.clientX, e.clientY);
    sendInput({
      type: 'input-mouse',
      action: 'move',
      x: coords.x,
      y: coords.y
    });
  });

  remoteVideo.addEventListener('mousedown', (e) => {
    if (!canControl) return;
    const coords = getCoordinates(e.clientX, e.clientY);
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
    const coords = getCoordinates(e.clientX, e.clientY);
    sendInput({
      type: 'input-mouse',
      action: 'up',
      button: e.button === 2 ? 'right' : (e.button === 1 ? 'middle' : 'left'),
      x: coords.x,
      y: coords.y
    });
  });

  remoteVideo.addEventListener('click', (e) => {
    if (!canControl) return;
    const coords = getCoordinates(e.clientX, e.clientY);
    sendInput({
      type: 'input-mouse',
      action: 'click',
      button: e.button === 2 ? 'right' : (e.button === 1 ? 'middle' : 'left'),
      x: coords.x,
      y: coords.y
    });
  });

  remoteVideo.addEventListener('dblclick', (e) => {
    if (!canControl) return;
    const coords = getCoordinates(e.clientX, e.clientY);
    sendInput({
      type: 'input-mouse',
      action: 'dblclick',
      button: 'left',
      x: coords.x,
      y: coords.y
    });
  });

  remoteVideo.addEventListener('wheel', (e) => {
    if (!canControl) return;
    e.preventDefault();
    const coords = getCoordinates(e.clientX, e.clientY);
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

  // --- Pinch-to-Zoom & Pan Logic ---
  function updateVideoTransform() {
    if (currentZoom <= 1.02) {
      currentZoom = 1.0;
      panX = 0;
      panY = 0;
      remoteVideo.style.transform = '';
      if (zoomPill) zoomPill.style.display = 'none';
    } else {
      remoteVideo.style.transform = `scale(${currentZoom}) translate(${panX}px, ${panY}px)`;
      if (zoomPill) {
        zoomPill.style.display = 'flex';
        if (zoomLevelText) zoomLevelText.textContent = `🔍 ${currentZoom.toFixed(1)}x`;
      }
    }
  }

  function resetZoom() {
    currentZoom = 1.0;
    panX = 0;
    panY = 0;
    updateVideoTransform();
  }

  if (resetZoomBtn) {
    resetZoomBtn.addEventListener('click', resetZoom);
  }

  // --- Touch Listeners (Mobile / Tablet) ---
  remoteVideo.addEventListener('touchstart', (e) => {
    if (!canControl) return;

    if (e.touches.length === 2) {
      isPinching = true;
      isTouchDragging = false;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      initialPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      initialZoom = currentZoom;
      lastPinchMidX = (t1.clientX + t2.clientX) / 2;
      lastPinchMidY = (t1.clientY + t2.clientY) / 2;
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
      touchStartTime = performance.now();
      isTouchDragging = false;
    }
  }, { passive: true });

  remoteVideo.addEventListener('touchmove', (e) => {
    if (!canControl) return;

    // 2-Finger Pinch to Zoom & Pan
    if (e.touches.length === 2 && isPinching) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      if (initialPinchDist > 0) {
        const factor = dist / initialPinchDist;
        currentZoom = Math.min(4.0, Math.max(1.0, initialZoom * factor));
        panX += (midX - lastPinchMidX) / currentZoom;
        panY += (midY - lastPinchMidY) / currentZoom;
        lastPinchMidX = midX;
        lastPinchMidY = midY;
        updateVideoTransform();
      }
      return;
    }

    if (e.touches.length === 1 && !isPinching) {
      const touch = e.touches[0];
      const diffX = touch.clientX - lastTouchX;
      const diffY = touch.clientY - lastTouchY;
      const totalDist = Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY);

      if (totalDist > 8) {
        isTouchDragging = true;
      }

      // If mobile mode is "Tap" and zoomed in: allow 1-finger panning if dragging
      // Otherwise scroll the remote page
      if (isTouchDragging) {
        e.preventDefault();
        if (currentZoom > 1.2 && touchMode === 'tap') {
          panX += diffX / currentZoom;
          panY += diffY / currentZoom;
          updateVideoTransform();
        } else {
          const coords = getCoordinates(touch.clientX, touch.clientY);
          // Invert delta: moving finger UP scrolls DOWN
          sendInput({
            type: 'input-wheel',
            deltaX: -diffX * 3,
            deltaY: -diffY * 3,
            x: coords.x,
            y: coords.y
          });
        }
      }

      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
    }
  }, { passive: false });

  function showTouchRipple(clientX, clientY) {
    const ripple = document.createElement('div');
    ripple.className = 'touch-ripple';
    const rect = streamWrapper.getBoundingClientRect();
    ripple.style.left = (clientX - rect.left) + 'px';
    ripple.style.top = (clientY - rect.top) + 'px';
    streamWrapper.appendChild(ripple);
    setTimeout(() => ripple.remove(), 400);
  }

  remoteVideo.addEventListener('touchend', (e) => {
    if (!canControl) return;

    if (e.touches.length < 2) {
      isPinching = false;
    }

    if (e.touches.length === 0) {
      const elapsed = performance.now() - touchStartTime;

      // Quick tap without drag = Instant Click
      if (!isTouchDragging && !isPinching && elapsed < 400) {
        const coords = getCoordinates(touchStartX, touchStartY);
        showTouchRipple(touchStartX, touchStartY);
        navigator.vibrate?.(25);
        sendInput({
          type: 'input-mouse',
          action: 'click',
          button: 'left',
          x: coords.x,
          y: coords.y
        });
      }
      isTouchDragging = false;
    }
  });

  // --- Keyboard Handling (Physical & Virtual) ---
  window.addEventListener('keydown', (e) => {
    if (!canControl) return;
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      return;
    }

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
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      return;
    }

    sendInput({
      type: 'input-key',
      action: 'up',
      key: e.key,
      code: e.code,
      keyCode: e.keyCode
    });
  });

  // Mobile Text Send
  function sendMobileText(text) {
    if (!text || !canControl) return;
    for (let char of text) {
      sendInput({
        type: 'input-key',
        action: 'down',
        key: char,
        code: 'Key' + char.toUpperCase(),
        keyCode: char.charCodeAt(0)
      });
      sendInput({
        type: 'input-key',
        action: 'up',
        key: char,
        code: 'Key' + char.toUpperCase(),
        keyCode: char.charCodeAt(0)
      });
    }
  }

  mobileSendTextBtn.addEventListener('click', () => {
    const val = mobileTextInput.value;
    if (val) {
      sendMobileText(val);
      mobileTextInput.value = '';
    }
  });

  mobileTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = mobileTextInput.value;
      if (val) {
        sendMobileText(val);
        mobileTextInput.value = '';
      }
      sendInput({ type: 'input-key', action: 'down', key: 'Enter', code: 'Enter', keyCode: 13 });
      sendInput({ type: 'input-key', action: 'up', key: 'Enter', code: 'Enter', keyCode: 13 });
    }
  });

  // Key chips for mobile sheet
  document.querySelectorAll('.key-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const keyName = btn.dataset.key;
      let keyCode = 0;
      if (keyName === 'Enter') keyCode = 13;
      if (keyName === 'Backspace') keyCode = 8;
      if (keyName === 'Tab') keyCode = 9;
      if (keyName === 'Escape') keyCode = 27;

      sendInput({ type: 'input-key', action: 'down', key: keyName, code: keyName, keyCode });
      sendInput({ type: 'input-key', action: 'up', key: keyName, code: keyName, keyCode });
      navigator.vibrate?.(15);
    });
  });

  // Mobile mode buttons
  mobileModeTapBtn.addEventListener('click', () => {
    touchMode = 'tap';
    mobileModeTapBtn.className = 'dock-btn active';
    mobileModeScrollBtn.className = 'dock-btn';
    interactionNotice.textContent = '👆 Tap mode: Touch anywhere to click';
  });

  mobileModeScrollBtn.addEventListener('click', () => {
    touchMode = 'scroll';
    mobileModeScrollBtn.className = 'dock-btn active';
    mobileModeTapBtn.className = 'dock-btn';
    interactionNotice.textContent = '📜 Scroll mode: Drag finger to scroll page';
  });

  function toggleMobileKeyboard() {
    const isHidden = mobileInputSheet.style.display === 'none';
    mobileInputSheet.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) {
      mobileTextInput.focus();
    }
  }

  mobileKeyboardBtn.addEventListener('click', toggleMobileKeyboard);
  mobileDockKeyboardBtn.addEventListener('click', toggleMobileKeyboard);
  closeSheetBtn.addEventListener('click', () => {
    mobileInputSheet.style.display = 'none';
  });

  // Audio Toggle Button
  function toggleAudio() {
    isMuted = !isMuted;
    remoteVideo.muted = isMuted;
    audioIcon.textContent = isMuted ? '🔇' : '🔊';
    audioNotice.style.display = 'none';
    if (!isMuted) {
      remoteVideo.play().catch(() => {});
    }
  }

  audioToggleBtn.addEventListener('click', toggleAudio);
  unmuteNoticeBtn.addEventListener('click', () => {
    remoteVideo.muted = false;
    isMuted = false;
    audioIcon.textContent = '🔊';
    audioNotice.style.display = 'none';
    remoteVideo.play().catch(() => {});
  });

  // Navigation Event Handlers
  if (navBackBtn) {
    navBackBtn.addEventListener('click', () => {
      sendInput({ type: 'nav-back' });
    });
  }
  if (navForwardBtn) {
    navForwardBtn.addEventListener('click', () => {
      sendInput({ type: 'nav-forward' });
    });
  }
  if (navReloadBtn) {
    navReloadBtn.addEventListener('click', () => {
      sendInput({ type: 'nav-reload' });
    });
  }
  if (navUrlForm) {
    navUrlForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = navUrlInput.value.trim();
      if (url) {
        sendInput({ type: 'nav-url', url });
      }
    });
  }
  if (navCloseBtn) {
    navCloseBtn.addEventListener('click', () => {
      navToolbar.classList.toggle('collapsed');
    });
  }
  if (navBarToggleBtn) {
    navBarToggleBtn.addEventListener('click', () => {
      if (navToolbar.style.display === 'none') {
        navToolbar.style.display = 'flex';
        navToolbar.classList.remove('collapsed');
      } else {
        navToolbar.classList.toggle('collapsed');
      }
    });
  }

  // Mobile Clipboard Paste & Send
  if (mobilePasteBtn) {
    mobilePasteBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          mobileTextInput.value = text;
          sendMobileText(text);
          navigator.vibrate?.(20);
        }
      } catch (err) {
        console.warn('Clipboard read notice:', err);
      }
    });
  }

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
    audioToggleBtn.style.display = 'none';
    audioNotice.style.display = 'none';
    mobileDock.style.display = 'none';
    mobileInputSheet.style.display = 'none';
    if (navToolbar) {
      navToolbar.style.display = 'none';
      navToolbar.classList.remove('collapsed');
    }
    if (navBarToggleBtn) navBarToggleBtn.style.display = 'none';
    if (portionBadge) portionBadge.style.display = 'none';
    resetZoom();
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

  // Instant disconnection awareness when controller closes the window or tab
  window.addEventListener('beforeunload', () => {
    if (conn && conn.open) {
      try {
        conn.send({ type: 'session-ended', reason: 'Controller closed tab' });
      } catch (e) {}
    }
  });

  window.addEventListener('pagehide', () => {
    if (conn && conn.open) {
      try {
        conn.send({ type: 'session-ended', reason: 'Controller navigated away' });
      } catch (e) {}
    }
  });

})();
