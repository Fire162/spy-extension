/**
 * Spy Extension - On-Screen Snipping Tool
 * Injected into the host's active tab to allow intuitive, interactive
 * drag-and-select cropping for View-Only remote viewers (similar to Windows Snipping Tool).
 */

(function () {
  const OVERLAY_ID = 'spy-snipper-host-overlay';
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) {
    existing.remove();
  }

  const container = document.createElement('div');
  container.id = OVERLAY_ID;
  container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:auto;';

  const shadow = container.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      user-select: none;
      -webkit-user-select: none;
    }

    .overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      cursor: crosshair;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.35);
      transition: background 0.2s ease;
    }

    .top-banner {
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(56, 189, 248, 0.4);
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 0 15px rgba(56, 189, 248, 0.25);
      border-radius: 30px;
      padding: 8px 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: #f8fafc;
      font-size: 13px;
      font-weight: 500;
      z-index: 10;
      backdrop-filter: blur(8px);
      pointer-events: auto;
      cursor: default;
    }

    .top-banner .icon {
      font-size: 16px;
    }

    .top-banner .key-hint {
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      padding: 2px 6px;
      font-size: 11px;
      font-family: monospace;
      color: #38bdf8;
    }

    .btn-close-banner {
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 15px;
      padding: 2px 6px;
      border-radius: 50%;
      transition: all 0.15s;
    }

    .btn-close-banner:hover {
      color: #f87171;
      background: rgba(239, 68, 68, 0.15);
    }

    /* Selection Box with Infinite Scrim Cutout */
    .snip-box {
      position: absolute;
      display: none;
      border: 2px solid #38bdf8;
      box-shadow: 0 0 0 99999px rgba(10, 15, 30, 0.65), 0 0 20px rgba(56, 189, 248, 0.6);
      cursor: move;
      z-index: 5;
    }

    .snip-dimensions {
      position: absolute;
      top: -30px;
      left: 0;
      background: #0284c7;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      font-family: monospace;
      padding: 3px 8px;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    }

    /* Resize Handles */
    .handle {
      position: absolute;
      width: 10px;
      height: 10px;
      background: #ffffff;
      border: 2px solid #0284c7;
      border-radius: 2px;
      box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
    }

    .handle.nw { top: -6px; left: -6px; cursor: nwse-resize; }
    .handle.ne { top: -6px; right: -6px; cursor: nesw-resize; }
    .handle.sw { bottom: -6px; left: -6px; cursor: nesw-resize; }
    .handle.se { bottom: -6px; right: -6px; cursor: nwse-resize; }
    .handle.n { top: -6px; left: calc(50% - 5px); cursor: ns-resize; }
    .handle.s { bottom: -6px; left: calc(50% - 5px); cursor: ns-resize; }
    .handle.w { top: calc(50% - 5px); left: -6px; cursor: ew-resize; }
    .handle.e { top: calc(50% - 5px); right: -6px; cursor: ew-resize; }

    /* Action Toolbar docked below selection */
    .action-bar {
      position: absolute;
      bottom: -46px;
      right: 0;
      display: none;
      align-items: center;
      gap: 6px;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(56, 189, 248, 0.4);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.7);
      border-radius: 8px;
      padding: 5px 8px;
      backdrop-filter: blur(8px);
      z-index: 10;
      cursor: default;
    }

    .action-bar.top-dock {
      bottom: auto;
      top: -46px;
    }

    .snip-btn {
      border: none;
      border-radius: 5px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s;
    }

    .btn-apply {
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: #ffffff;
      box-shadow: 0 2px 10px rgba(2, 132, 199, 0.4);
    }

    .btn-apply:hover {
      background: linear-gradient(135deg, #0369a1, #1d4ed8);
      transform: translateY(-1px);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.18);
    }

    .btn-cancel {
      background: transparent;
      color: #94a3b8;
    }

    .btn-cancel:hover {
      color: #f87171;
      background: rgba(239, 68, 68, 0.15);
    }

    /* Floating Toast */
    .snip-toast {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      background: #0284c7;
      color: #ffffff;
      padding: 10px 20px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      z-index: 100;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: toastIn 0.25s ease-out;
    }

    @keyframes toastIn {
      from { transform: translate(-50%, 20px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }
  `;

  shadow.appendChild(style);

  // Overlay container
  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  // Top instructions banner
  const topBanner = document.createElement('div');
  topBanner.className = 'top-banner';
  topBanner.innerHTML = `
    <span class="icon">✂️</span>
    <span>Drag to select the screen area to share</span>
    <span class="key-hint">Enter</span> to apply
    <span class="key-hint">Esc</span> to cancel
    <button class="btn-close-banner" title="Cancel Snipping">✕</button>
  `;
  overlay.appendChild(topBanner);

  // Selection Box
  const snipBox = document.createElement('div');
  snipBox.className = 'snip-box';

  const dimBadge = document.createElement('div');
  dimBadge.className = 'snip-dimensions';
  dimBadge.textContent = '0 × 0 px';
  snipBox.appendChild(dimBadge);

  // Handles
  ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].forEach(pos => {
    const handle = document.createElement('div');
    handle.className = `handle ${pos}`;
    handle.dataset.direction = pos;
    snipBox.appendChild(handle);
  });

  // Action Bar
  const actionBar = document.createElement('div');
  actionBar.className = 'action-bar';
  actionBar.innerHTML = `
    <button class="snip-btn btn-apply">✅ Share Selected Area</button>
    <button class="snip-btn btn-secondary btn-redraw">🔄 Redraw</button>
    <button class="snip-btn btn-cancel">✕ Cancel</button>
  `;
  snipBox.appendChild(actionBar);

  overlay.appendChild(snipBox);
  shadow.appendChild(overlay);
  document.documentElement.appendChild(container);

  // State
  let isDrawing = false;
  let isMoving = false;
  let isResizing = false;
  let resizeDir = '';
  let startX = 0, startY = 0;
  let moveOffsetX = 0, moveOffsetY = 0;
  let currentRect = { left: 0, top: 0, width: 0, height: 0 };

  function updateBoxDOM() {
    snipBox.style.display = 'block';
    snipBox.style.left = `${currentRect.left}px`;
    snipBox.style.top = `${currentRect.top}px`;
    snipBox.style.width = `${currentRect.width}px`;
    snipBox.style.height = `${currentRect.height}px`;

    const pctW = Math.round((currentRect.width / window.innerWidth) * 100);
    const pctH = Math.round((currentRect.height / window.innerHeight) * 100);
    dimBadge.textContent = `📐 ${Math.round(currentRect.width)} × ${Math.round(currentRect.height)} px (${pctW}% × ${pctH}%)`;

    // Dock action bar on top if selection is near bottom of viewport
    if (currentRect.top + currentRect.height + 60 > window.innerHeight) {
      actionBar.classList.add('top-dock');
    } else {
      actionBar.classList.remove('top-dock');
    }
  }

  function finishDrawing() {
    isDrawing = false;
    isMoving = false;
    isResizing = false;

    // Minimum size check (must be at least 25x25 px)
    if (currentRect.width < 25 || currentRect.height < 25) {
      snipBox.style.display = 'none';
      actionBar.style.display = 'none';
      return;
    }

    actionBar.style.display = 'flex';
  }

  function applySelection() {
    if (currentRect.width < 25 || currentRect.height < 25) {
      cleanup();
      return;
    }

    const x = Math.max(0, Math.min(95, Math.round((currentRect.left / window.innerWidth) * 100)));
    const y = Math.max(0, Math.min(95, Math.round((currentRect.top / window.innerHeight) * 100)));
    const width = Math.max(5, Math.min(100 - x, Math.round((currentRect.width / window.innerWidth) * 100)));
    const height = Math.max(5, Math.min(100 - y, Math.round((currentRect.height / window.innerHeight) * 100)));

    chrome.runtime.sendMessage({
      type: 'APPLY_SCREEN_PORTION',
      payload: {
        enabled: true,
        preset: 'custom',
        x,
        y,
        width,
        height
      }
    });

    const toast = document.createElement('div');
    toast.className = 'snip-toast';
    toast.textContent = `🔒 Portion Applied: ${width}% × ${height}% (X: ${x}%, Y: ${y}%)`;
    shadow.appendChild(toast);

    setTimeout(() => {
      cleanup();
    }, 750);
  }

  function cleanup() {
    window.removeEventListener('keydown', onKeyDown);
    container.remove();
  }

  // --- Mouse Listeners ---
  overlay.addEventListener('mousedown', (e) => {
    // If clicked inside action bar, banner or handles, don't initiate canvas drag
    if (e.composedPath().some(el => el === actionBar || el === topBanner)) {
      return;
    }

    const target = e.target;

    // Check if clicked a resize handle
    if (target.classList && target.classList.contains('handle')) {
      isResizing = true;
      resizeDir = target.dataset.direction;
      startX = e.clientX;
      startY = e.clientY;
      e.stopPropagation();
      return;
    }

    // Check if clicked inside existing box to move it
    if (target === snipBox || snipBox.contains(target)) {
      isMoving = true;
      moveOffsetX = e.clientX - currentRect.left;
      moveOffsetY = e.clientY - currentRect.top;
      e.stopPropagation();
      return;
    }

    // Otherwise start fresh selection drag
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    currentRect = { left: startX, top: startY, width: 0, height: 0 };
    actionBar.style.display = 'none';
    updateBoxDOM();
  });

  window.addEventListener('mousemove', (e) => {
    if (isDrawing) {
      const curX = e.clientX;
      const curY = e.clientY;

      currentRect.left = Math.min(startX, curX);
      currentRect.top = Math.min(startY, curY);
      currentRect.width = Math.abs(curX - startX);
      currentRect.height = Math.abs(curY - startY);

      updateBoxDOM();
    } else if (isMoving) {
      let nextLeft = e.clientX - moveOffsetX;
      let nextTop = e.clientY - moveOffsetY;

      // Constrain within viewport
      nextLeft = Math.max(0, Math.min(window.innerWidth - currentRect.width, nextLeft));
      nextTop = Math.max(0, Math.min(window.innerHeight - currentRect.height, nextTop));

      currentRect.left = nextLeft;
      currentRect.top = nextTop;
      updateBoxDOM();
    } else if (isResizing) {
      const curX = e.clientX;
      const curY = e.clientY;

      if (resizeDir.includes('e')) {
        currentRect.width = Math.max(25, curX - currentRect.left);
      }
      if (resizeDir.includes('s')) {
        currentRect.height = Math.max(25, curY - currentRect.top);
      }
      if (resizeDir.includes('w')) {
        const diffX = curX - startX;
        const newW = currentRect.width - diffX;
        if (newW > 25) {
          currentRect.left += diffX;
          currentRect.width = newW;
          startX = curX;
        }
      }
      if (resizeDir.includes('n')) {
        const diffY = curY - startY;
        const newH = currentRect.height - diffY;
        if (newH > 25) {
          currentRect.top += diffY;
          currentRect.height = newH;
          startY = curY;
        }
      }
      updateBoxDOM();
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDrawing || isMoving || isResizing) {
      finishDrawing();
    }
  });

  // Action buttons
  shadow.querySelector('.btn-apply').addEventListener('click', applySelection);

  shadow.querySelector('.btn-redraw').addEventListener('click', () => {
    currentRect = { left: 0, top: 0, width: 0, height: 0 };
    snipBox.style.display = 'none';
    actionBar.style.display = 'none';
  });

  shadow.querySelector('.btn-cancel').addEventListener('click', cleanup);
  shadow.querySelector('.btn-close-banner').addEventListener('click', cleanup);

  // Keyboard controls
  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cleanup();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentRect.width >= 25 && currentRect.height >= 25) {
        applySelection();
      }
    }
  }

  window.addEventListener('keydown', onKeyDown);
})();
