const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// HTTP Server for serving the Controller Web Client
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, reqPath));

  // Security check: prevent path traversal. Use a separator-aware prefix
  // check — a naive startsWith() also accepts sibling dirs such as
  // "<PUBLIC_DIR>-backup", and path traversal via ../ must be normalised
  // before the check (it was checked after join, but without normalize).
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

// Rooms state: roomId -> { hostWs, controllers: Map<ws, {ws, id, canControl, joinedAt}>, pin, createdAt }
const rooms = new Map();

// WebSocket Server for WebRTC Signaling
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}

function safeSend(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

// Simple per-socket sliding-window rate limit for PIN attempts. The PIN is
// only 4 digits (10k combinations); without a cap a single socket can brute
// force a room in under a minute.
const JOIN_WINDOW_MS = 60_000;
const JOIN_MAX_ATTEMPTS = 8;

function joinRateLimited(ws) {
  const now = Date.now();
  ws.joinAttempts = (ws.joinAttempts || []).filter(t => now - t < JOIN_WINDOW_MS);
  if (ws.joinAttempts.length >= JOIN_MAX_ATTEMPTS) return true;
  ws.joinAttempts.push(now);
  return false;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.roomData = null; // { roomId, role: 'host' | 'controller' }

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return safeSend(ws, { type: 'error', message: 'Invalid JSON payload' });
    }
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
      return safeSend(ws, { type: 'error', message: 'Invalid payload shape' });
    }

    switch (msg.type) {
      case 'create-room': {
        const { roomId, pin } = msg;
        if (!roomId || !pin) {
          return safeSend(ws, { type: 'error', message: 'Room ID and PIN required' });
        }

        // Clean up any stale room with same ID
        if (rooms.has(roomId)) {
          const stale = rooms.get(roomId);
          for (const controller of stale.controllers.values()) {
            safeSend(controller.ws, { type: 'host-disconnected', message: 'Host restarted the room' });
          }
        }

        // Cap concurrent rooms per host socket so one client cannot
        // exhaust memory by opening thousands of rooms.
        let ownedRooms = 0;
        for (const r of rooms.values()) if (r.hostWs === ws) ownedRooms++;
        if (ownedRooms >= 50) {
          return safeSend(ws, { type: 'error', message: 'Too many rooms open' });
        }

        rooms.set(roomId, {
          hostWs: ws,
          controllers: new Map(), // ws -> { id, canControl, joinedAt }
          pin: String(pin),
          createdAt: Date.now()
        });

        ws.roomData = { roomId, role: 'host' };
        log(`Room created: ${roomId} (Host connected)`);
        safeSend(ws, { type: 'room-created', roomId, success: true });
        break;
      }

      case 'join-room': {
        if (joinRateLimited(ws)) {
          return safeSend(ws, { type: 'error', code: 'RATE_LIMITED', message: 'Too many attempts, try again later' });
        }
        const { roomId, pin } = msg;
        if (typeof roomId !== 'string' || roomId.length > 64) {
          return safeSend(ws, { type: 'error', message: 'Invalid room ID' });
        }
        const room = rooms.get(roomId);

        if (!room) {
          return safeSend(ws, { type: 'error', code: 'ROOM_NOT_FOUND', message: 'Room not found or host is offline' });
        }

        // Normalise before compare so numeric and string PINs both work;
        // also avoids the classic `if (!pin)` rejection of pin 0.
        const pinStr = String(pin == null ? '' : pin).trim();
        if (pinStr.length === 0 || pinStr !== String(room.pin)) {
          return safeSend(ws, { type: 'error', code: 'INVALID_PIN', message: 'Incorrect room PIN' });
        }

        // Many controllers per room: keyed by socket so each carries its own
        // permission and is addressed independently for signalling.
        const clientId = typeof msg.clientId === 'string' && msg.clientId.trim()
          ? msg.clientId.trim().slice(0, 64)
          : `controller-${room.controllers.size + 1}`;

        room.controllers.set(ws, { ws, id: clientId, canControl: false, joinedAt: Date.now() });
        ws.roomData = { roomId, role: 'controller', clientId };
        log(`Controller joining room: ${roomId} as ${clientId} (${room.controllers.size} total)`);

        // Notify Host that a remote user is requesting mutual permission
        safeSend(room.hostWs, { type: 'permission-request', clientId });

        safeSend(ws, {
          type: 'join-status',
          status: 'waiting-for-approval',
          message: 'PIN verified. Waiting for host approval...'
        });
        break;
      }

      case 'permission-response': {
        // Host approves or denies one specific controller. clientId is only
        // optional while a single guest is connected.
        if (!ws.roomData || ws.roomData.role !== 'host') return;
        const room = rooms.get(ws.roomData.roomId);
        if (!room) return;

        const { approved, canControl } = msg;
        let target = null;
        for (const entry of room.controllers.values()) {
          if (!msg.clientId || entry.id === msg.clientId) { target = entry; break; }
        }
        if (!target) {
          return safeSend(ws, { type: 'error', message: 'Unknown controller' });
        }

        target.canControl = !!approved && !!canControl;

        log(`Host decision for room ${ws.roomData.roomId} -> ${target.id}: approved=${!!approved}, canControl=${target.canControl}`);

        safeSend(target.ws, {
          type: 'permission-result',
          clientId: target.id,
          approved: !!approved,
          canControl: target.canControl
        });

        safeSend(ws, {
          type: 'session-status',
          clientId: target.id,
          status: approved ? 'connected' : 'idle',
          canControl: target.canControl
        });
        break;
      }

      case 'signal': {
        // Relay WebRTC offer / answer / ice-candidate
        if (!ws.roomData) return;
        const room = rooms.get(ws.roomData.roomId);
        if (!room) return;

        let targetWs = null;
        if (ws.roomData.role === 'host') {
          // Host must name the controller when several are connected
          for (const entry of room.controllers.values()) {
            if (!msg.clientId || entry.id === msg.clientId) { targetWs = entry.ws; break; }
          }
        } else {
          targetWs = room.hostWs;
        }
        if (targetWs) {
          safeSend(targetWs, {
            type: 'signal',
            from: ws.roomData.role === 'controller' ? ws.roomData.clientId : 'host',
            data: msg.data
          });
        }
        break;
      }

      case 'stop-session': {
        if (!ws.roomData) return;
        const room = rooms.get(ws.roomData.roomId);
        if (!room) return;

        log(`Session stopped for room ${ws.roomData.roomId} by ${ws.roomData.role}`);
        for (const controller of room.controllers.values()) {
          if (controller.ws !== ws) {
            safeSend(controller.ws, { type: 'session-ended', reason: ws.roomData.role === 'host' ? 'Host terminated session' : 'Session closed' });
          }
        }
        if (room.hostWs && room.hostWs !== ws) {
          safeSend(room.hostWs, { type: 'session-ended', reason: 'Session closed' });
        }
        // Host stopping a room should free the ID so it can be reused and
        // stale room state (including the PIN) does not linger.
        if (ws.roomData.role === 'host') {
          rooms.delete(ws.roomData.roomId);
          ws.roomData = null;
        }
        break;
      }

      default:
        log(`Unknown message type: ${msg.type}`);
    }
  });

  ws.on('close', () => {
    if (!ws.roomData) return;
    const { roomId, role } = ws.roomData;
    const room = rooms.get(roomId);

    if (room) {
      if (role === 'host') {
        log(`Host disconnected from room ${roomId}`);
        for (const controller of room.controllers.values()) {
          safeSend(controller.ws, { type: 'host-disconnected', message: 'Host left the session' });
        }
        rooms.delete(roomId);
      } else if (role === 'controller') {
        const entry = room.controllers.get(ws);
        room.controllers.delete(ws);
        log(`Controller ${entry ? entry.id : ws.roomData.clientId} disconnected from room ${roomId} (${room.controllers.size} remaining)`);
        if (room.hostWs) {
          safeSend(room.hostWs, {
            type: 'controller-disconnected',
            clientId: entry ? entry.id : ws.roomData.clientId,
            remaining: room.controllers.size
          });
        }
      }
    }
  });
});

// Periodic heartbeat
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

server.listen(PORT, () => {
  log(`Spy Extension Signaling & Controller Server running on http://localhost:${PORT}`);
  log(`Signaling WebSocket endpoint: ws://localhost:${PORT}`);
});
