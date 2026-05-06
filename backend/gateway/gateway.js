const dgram = require("dgram");
const fs = require("fs");
const crypto = require("crypto");
const udp = dgram.createSocket("udp4");
const WebSocket = require("ws");
const { Client } = require("ssh2");

const eventBus = require("./event_bus");
const registry = require("./device_registry");
const Metrics = require("./metrics");

const metrics = new Metrics(eventBus, registry);

// -----------------------------
// CONFIG
// -----------------------------
const SECRET = "alm_shared_secret";
const STATE_FILE = "./state.json";

// -----------------------------
// WebSocket + sendToUI
// -----------------------------
const wss = new WebSocket.Server({ port: 5001 });

function sendToUI(obj) {
  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  });
}

wss.on("connection", ws => {
  ws.on("message", msg => {
    const data = JSON.parse(msg.toString());

    if (data.type === "ui.command") {
      dispatchCommand(data.deviceId, data.commandId, data.params);
    }

    if (data.type === "ui.broadcast") {
      broadcastCommand(data.commandId, data.params);
    }
  });
});

// -----------------------------
// Security
// -----------------------------
function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  return (
    "{" +
    Object.keys(obj)
      .sort()
      .map(k => JSON.stringify(k) + ":" + stableStringify(obj[k]))
      .join(",") +
    "}"
  );
}

function signPacket(packet) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(stableStringify(packet))
    .digest("hex");
}

function verifySignature(packet) {
  const sig = packet.sig;
  const base = { ...packet };
  delete base.sig;
  return signPacket(base) === sig;
}

function genNonce() {
  return crypto.randomBytes(8).toString("hex");
}

// -----------------------------
// STATE
// -----------------------------
let pendingRequests = {};
let broadcastRequests = {};

function serializeRequests(obj) {
  const clean = {};
  for (const id in obj) {
    const r = obj[id];
    clean[id] = {
      requestId: r.requestId,
      deviceId: r.deviceId,
      commandId: r.commandId,
      meta: r.meta,
      retries: r.retries,
      maxRetries: r.maxRetries,
      state: r.state,
      broadcastId: r.broadcastId
    };
  }
  return clean;
}

function saveState() {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({
      pendingRequests: serializeRequests(pendingRequests),
      broadcastRequests
    }, null, 2)
  );
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return;
  const state = JSON.parse(fs.readFileSync(STATE_FILE));
  pendingRequests = state.pendingRequests || {};
  broadcastRequests = state.broadcastRequests || {};
  console.log("♻️ State restored");
}

// -----------------------------
// SSH EXECUTION
// -----------------------------
function execSSH(device, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const start = Date.now();

    let timeoutRef = setTimeout(() => {
      conn.end();
      reject(new Error("SSH timeout"));
    }, 6000);

    conn.on("ready", () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timeoutRef);
          return reject(err);
        }

        stream.on("close", () => {
          clearTimeout(timeoutRef);
          conn.end();
          resolve({ execMs: Date.now() - start });
        });
      });
    });

    conn.on("error", err => {
      clearTimeout(timeoutRef);
      reject(err);
    });

    conn.connect({
      host: device.ip,
      port: device.port || 22,
      username: device.username,
      password: device.password
    });
  });
}

// -----------------------------
// DISPATCH
// -----------------------------
function genId() {
  return "req_" + Math.random().toString(36).slice(2);
}

function dispatchCommand(deviceId, commandId, meta = {}, broadcastId = null) {
  const device = registry.get(deviceId);
  if (!device) return;

  const request = {
    requestId: genId(),
    deviceId,
    commandId,
    meta,
    retries: 0,
    maxRetries: 0,
    state: "PENDING",
    broadcastId
  };

  pendingRequests[request.requestId] = request;

  if (device.method === "ssh") {
    handleSSH(request, device);
    return;
  }

  sendPacket(device, request);
  scheduleTimeout(request.requestId);
}

// -----------------------------
// SSH HANDLER
// -----------------------------
async function handleSSH(request, device) {
  let cmd = "reboot";

  if (request.commandId === 17) {
    cmd = "uname -a";
  }

  try {
    const res = await execSSH(device, cmd);

    console.log("✅ SSH OK:", request.deviceId);

    delete pendingRequests[request.requestId];
    saveState();

    if (request.broadcastId) {
      updateBroadcast(request.broadcastId, request.deviceId, "OK");
    }

    sendToUI({
      type: "cmd_completed",
      deviceId: request.deviceId,
      commandId: request.commandId,
      execMs: res.execMs
    });

  } catch (err) {
    console.log("❌ SSH FAIL:", err.message);

    delete pendingRequests[request.requestId];
    saveState();

    if (request.broadcastId) {
      updateBroadcast(request.broadcastId, request.deviceId, "FAILED");
    }

    sendToUI({
      type: "cmd_failed",
      deviceId: request.deviceId,
      commandId: request.commandId
    });
  }
}

// -----------------------------
// UDP LISTENER
// -----------------------------
udp.on("message", (msg, rinfo) => {
  let packet;

  try {
    packet = JSON.parse(msg.toString());
  } catch {
    return;
  }

  if (!verifySignature(packet)) {
    console.log("❌ Invalid signature → dropped");
    return;
  }

  if (packet.type === "heartbeat") {
    registry.update(packet.deviceId, {
      deviceId: packet.deviceId,
      ip: rinfo.address,
      port: rinfo.port,
      lastSeen: Date.now(),
      status: "online"
    });
  }

  if (packet.type === "ack") {
    handleAck(packet);
  }
});

udp.bind(5000);

// -----------------------------
// SEND PACKET (UDP ONLY)
// -----------------------------
function sendPacket(device, request) {
  const packet = {
    type: "cmd",
    requestId: request.requestId,
    deviceId: request.deviceId,
    commandId: request.commandId,
    meta: request.meta,
    nonce: genNonce()
  };

  packet.sig = signPacket(packet);

  const buf = Buffer.from(JSON.stringify(packet));

  udp.send(buf, 0, buf.length, device.port, device.ip);
}

// -----------------------------
// ACK HANDLER (UDP ONLY)
// -----------------------------
function handleAck(packet) {
  const request = pendingRequests[packet.requestId];
  if (!request) return;

  clearTimeout(request._timeoutRef);

  request.state = "COMPLETED";
  request.execMs = packet.execMs || 0;

  delete pendingRequests[packet.requestId];

  console.log("✅ ACK:", packet.requestId);

  if (request.broadcastId) {
    updateBroadcast(request.broadcastId, request.deviceId, "OK");
  }

  sendToUI({
    type: "cmd_completed",
    deviceId: request.deviceId,
    commandId: request.commandId,
    execMs: request.execMs
  });

  saveState();
}

// -----------------------------
// TIMEOUT (UDP ONLY)
// -----------------------------
function scheduleTimeout(id) {
  const r = pendingRequests[id];
  if (!r) return;

  const device = registry.get(r.deviceId);
  if (!device) return;

  if (device.method === "ssh") return;

  r._timeoutRef = setTimeout(() => handleTimeout(id), 2000);
}

function handleTimeout(id) {
  const r = pendingRequests[id];
  if (!r) return;

  const device = registry.get(r.deviceId);
  if (!device) return;

  if (device.method === "ssh") {
    delete pendingRequests[id];

    if (r.broadcastId) {
      updateBroadcast(r.broadcastId, r.deviceId, "FAILED");
    }

    sendToUI({
      type: "cmd_failed",
      deviceId: r.deviceId,
      commandId: r.commandId
    });

    saveState();
    return;
  }

  if (r.retries >= r.maxRetries) {
    delete pendingRequests[id];

    if (r.broadcastId) {
      updateBroadcast(r.broadcastId, r.deviceId, "FAILED");
    }

    sendToUI({
      type: "cmd_failed",
      deviceId: r.deviceId,
      commandId: r.commandId
    });

    saveState();
    return;
  }

  r.retries++;
  sendPacket(device, r);
  scheduleTimeout(id);
}

// -----------------------------
// BROADCAST UPDATE
// -----------------------------
function updateBroadcast(broadcastId, deviceId, status) {
  const bc = broadcastRequests[broadcastId];
  if (!bc) return;

  bc.devices[deviceId] = status;

  const states = Object.values(bc.devices);

  if (states.every(s => s === "OK")) {
    bc.status = "COMPLETED";
  } else if (states.every(s => s !== "PENDING")) {
    bc.status = "PARTIAL";
  }

  if (bc.status !== "PENDING") {
    console.log("📊 BROADCAST DONE:", broadcastId, "|", bc.status);

    sendToUI({
      type: "broadcast_done",
      broadcastId,
      status: bc.status,
      devices: bc.devices
    });
  }

  saveState();
}

// -----------------------------
// BROADCAST
// -----------------------------
function broadcastCommand(commandId, meta = {}) {
  const devices = registry.getAll();
  const id = "bc_" + Math.random().toString(36).slice(2);

  console.log("📡 BROADCAST START:", id);

  broadcastRequests[id] = {
    broadcastId: id,
    commandId,
    devices: {},
    status: "PENDING"
  };

  devices.forEach(d => {
    broadcastRequests[id].devices[d.deviceId] = "PENDING";
    dispatchCommand(d.deviceId, commandId, meta, id);
  });

  saveState();
}

// -----------------------------
// SNAPSHOT
// -----------------------------
setInterval(() => {
  sendToUI({
    type: "snapshot",
    devices: registry.getAll(),
    metrics: metrics.snapshot(),
    broadcasts: broadcastRequests
  });
}, 2000);

// -----------------------------
loadState();
console.log("🚀 Gateway Phase 6 FINAL running");
