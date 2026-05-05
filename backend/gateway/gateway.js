const dgram = require("dgram");
const fs = require("fs");
const crypto = require("crypto");
const udp = dgram.createSocket("udp4");
const WebSocket = require("ws");

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
// Security (CRITICAL)
// -----------------------------
function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }

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

// -----------------------------
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
// QUEUE + SCHEDULER
// -----------------------------
let commandQueue = [];
let isProcessing = false;

function enqueue(fn, priority = 0, delay = 0) {
  commandQueue.push({
    fn,
    priority,
    executeAt: Date.now() + delay
  });

  commandQueue.sort((a, b) => b.priority - a.priority);
  processQueue();
}

function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  const loop = () => {
    if (commandQueue.length === 0) {
      isProcessing = false;
      return;
    }

    const job = commandQueue[0];
    const now = Date.now();

    if (job.executeAt > now) {
      setTimeout(loop, job.executeAt - now);
      return;
    }

    commandQueue.shift();

    try {
      job.fn();
    } catch (e) {
      console.error("Queue error:", e);
    }

    setImmediate(loop);
  };

  loop();
}

// -----------------------------
// RATE LIMIT
// -----------------------------
const RATE_LIMIT = 20;
let tokens = RATE_LIMIT;
let lastRefill = Date.now();

function refill() {
  const now = Date.now();
  const delta = (now - lastRefill) / 1000;

  tokens += delta * RATE_LIMIT;
  if (tokens > RATE_LIMIT) tokens = RATE_LIMIT;

  lastRefill = now;
}

function canSend() {
  refill();
  if (tokens >= 1) {
    tokens--;
    return true;
  }
  return false;
}

// -----------------------------
// HELPERS
// -----------------------------
function genId() {
  return "req_" + Math.random().toString(36).slice(2);
}

// -----------------------------
// WebSocket (UI)
// --------------------------
const wss = new WebSocket.Server({
  port: 5001
});

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
      enqueue(() => {
        dispatchCommand(data.deviceId, data.commandId, data.params);
      }, data.priority || 0, data.delay || 0);
    }

    if (data.type === "ui.broadcast") {
      enqueue(() => {
        broadcastCommand(data.commandId, data.params);
      });
    }
  });
});

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
// SEND PACKET (SIGNED)
// -----------------------------
function sendPacket(device, request) {
  const trySend = () => {
    if (!canSend()) {
      setTimeout(trySend, 50);
      return;
    }

    const packet = {
      requestId: request.requestId,
      deviceId: request.deviceId,
      commandId: request.commandId,
      meta: request.meta,
      ts: Date.now(),
      nonce: genNonce()
    };

    const base = { ...packet };
    packet.sig = signPacket(base);

    udp.send(
      Buffer.from(JSON.stringify(packet)),
      device.port,
      device.ip
    );

    console.log("🚀 SEND:", request.requestId, "| retry:", request.retries);
  };

  trySend();
}

// -----------------------------
// DISPATCH
// -----------------------------
function dispatchCommand(deviceId, commandId, meta = {}, broadcastId = null) {
  const device = registry.get(deviceId);
  if (!device) return;

  const request = {
    requestId: genId(),
    deviceId,
    commandId,
    meta,
    retries: 0,
    maxRetries: 3,
    state: "PENDING",
    broadcastId
  };

  pendingRequests[request.requestId] = request;

  sendPacket(device, request);
  scheduleTimeout(request.requestId);

  eventBus.emit("command.sent", request);
  saveState();
}

// -----------------------------
// BROADCAST UPDATE (NEW)
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

    eventBus.emit("broadcast.done", bc);
  }

  saveState();
}

// -----------------------------
// ACK
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
// TIMEOUT
// -----------------------------
function scheduleTimeout(id) {
  const r = pendingRequests[id];
  if (!r) return;

  r._timeoutRef = setTimeout(() => handleTimeout(id), 2000);
}

function handleTimeout(id) {
  const r = pendingRequests[id];
  if (!r) return;

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

    return;
  }

  r.retries++;
  sendPacket(registry.get(r.deviceId), r);
  scheduleTimeout(id);
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
