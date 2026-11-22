/**
 * Multi-controller room integration test.
 *
 * Spawns server.js on an ephemeral port and drives the WebSocket protocol
 * end to end: two controllers join the same room, receive independent
 * permissions (control vs view-only), signals are routed only to the named
 * guest, a guest leaving does not kill the room, and the room ID can be
 * reused after stop-session.
 *
 * Run with: npm test  (or: node test/multi-controller.test.js)
 */

const {spawn} = require("child_process");
const path = require("path");
const WebSocket = require("ws");

// Queue-based socket wrapper: messages are buffered from the moment the
// socket connects, so assertions never race the server's send order.
function makeClient(url) {
  const ws = new WebSocket(url);
  const queue = [];
  const waiters = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw);
    const idx = waiters.findIndex(w => w.match(msg));
    if (idx >= 0) { const [w] = waiters.splice(idx, 1); clearTimeout(w.timer); w.resolve(msg); }
    else queue.push(msg);
  });
  return {
    ws,
    open: new Promise(r => ws.on("open", r)),
    send: (obj) => ws.send(JSON.stringify(obj)),
    next(match = () => true, timeoutMs = 3000) {
      const idx = queue.findIndex(match);
      if (idx >= 0) return Promise.resolve(queue.splice(idx, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { match, resolve };
        w.timer = setTimeout(() => {
          const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1);
          reject(new Error("timeout waiting for message"));
        }, timeoutMs);
        waiters.push(w);
      });
    },
    drain: () => queue.splice(0, queue.length),
    close: () => ws.close()
  };
}

const p = spawn("node", ["server.js"], {cwd: path.resolve(__dirname, ".."), env: {...process.env, PORT: "3998"}});
p.stderr.on("data", d => console.error("SRV-ERR", String(d).trim()));

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  (" + extra + ")" : ""}`); };

(async () => {
  await new Promise(r => setTimeout(r, 800));
  try {
    const host = makeClient("ws://127.0.0.1:3998");
    await host.open;
    host.send({type:"create-room", roomId:"SPY-M1", pin:"1234"});
    check("host creates room", (await host.next(m => m.type === "room-created")).success === true);

    const c1 = makeClient("ws://127.0.0.1:3998");
    const c2 = makeClient("ws://127.0.0.1:3998");
    await Promise.all([c1.open, c2.open]);

    c1.send({type:"join-room", roomId:"SPY-M1", pin:"1234", clientId:"laptop-A"});
    check("controller A joins", (await c1.next(m => m.type === "join-status")).status === "waiting-for-approval");
    const req1 = await host.next(m => m.type === "permission-request");
    check("host sees A's request", req1.clientId === "laptop-A", req1.clientId);

    c2.send({type:"join-room", roomId:"SPY-M1", pin:"1234", clientId:"phone-B"});
    check("controller B joins", (await c2.next(m => m.type === "join-status")).status === "waiting-for-approval");
    const req2 = await host.next(m => m.type === "permission-request");
    check("host sees B's request", req2.clientId === "phone-B", req2.clientId);

    host.send({type:"permission-response", clientId:"laptop-A", approved:true, canControl:true});
    const a = await c1.next(m => m.type === "permission-result");
    check("A approved WITH control", a.clientId === "laptop-A" && a.approved === true && a.canControl === true);

    host.send({type:"permission-response", clientId:"phone-B", approved:true, canControl:false});
    const b = await c2.next(m => m.type === "permission-result");
    check("B approved VIEW-ONLY, independent of A", b.clientId === "phone-B" && b.approved === true && b.canControl === false);

    // targeted signalling must not leak to the other controller
    c1.drain();
    host.send({type:"signal", clientId:"phone-B", data:{sdp:"x"}});
    const sig = await c2.next(m => m.type === "signal");
    await new Promise(r => setTimeout(r, 300));
    check("signal routed to B only", sig.from === "host" && c1.drain().every(m => m.type !== "signal"));

    // one controller leaving must not kill the room
    c1.close();
    const disc = await host.next(m => m.type === "controller-disconnected");
    check("host notified of A leaving", disc.clientId === "laptop-A" && disc.remaining === 1, `remaining=${disc.remaining}`);

    host.send({type:"signal", clientId:"phone-B", data:{sdp:"y"}});
    check("room survives, B still addressable", (await c2.next(m => m.type === "signal")).from === "host");

    // stop-session reaches the remaining guest
    host.send({type:"stop-session"});
    check("B receives session-ended", (await c2.next(m => m.type === "session-ended")).type === "session-ended");

    // room ID freed after host stop -> can be recreated
    host.send({type:"create-room", roomId:"SPY-M1", pin:"5678"});
    check("room ID reusable after stop", (await host.next(m => m.type === "room-created")).success === true);

    host.close(); c2.close();
  } catch (e) { fail++; console.log("ERR", e.message); }
  console.log(`\n${pass} passed, ${fail} failed`);
  p.kill(); process.exit(fail ? 1 : 0);
})();
