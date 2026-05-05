// backend/gateway/gateway.js

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
// SECURITY
// -----------------------------
const SECRET = "alm_secret_key";

function stableStringify(obj) {
  const keys = Object.keys(obj).sort();
  const sorted = {};
  keys.forEach(k => sorted[k] = obj[k]);
  return JSON.stringify(sorted);
}

function signPacket(packet) {
  const clone = { ...packet };
  delete clone.sig;
  return crypto
    .createHmac("sha256", SECRET)
    .update(stableStringify(clone))
    .digest("hex");
}

// -----------------------------
// State Persistence
// -----------------------------
const STATE_FILE = "./state.json";

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
  const state = {
    pendingRequests: serializeRequests(pendingRequests),
    broadcastRequests
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return;

  const raw = fs.readFileSync(STATE_FILE);
  const state = JSON.parse(raw);

  pendingRequests = state.pendingRequests || {};
  broadcastRequests = state.broadcastRequests || {};

  console.log("♻️ State restored");
}

// -----------------------------
// Queue + Scheduling
// -----------------------------
let commandQueue = [];
let isProcessingQueue = false;

function enqueueCommand(fn, priority = 0, delay = 0) {
  const job = {
    fn,
    priority,
    executeAt: Date.now() + delay
  };

  commandQueue.push(job);
  commandQueue.sort((a, b) => b.priority - a.priority);

  processQueue();
}

function processQueue() {
  if (isProcessingQueue) return;

  isProcessingQueue = true;

  const loop = () => {
    if (commandQueue.length === 0) {
      isProcessingQueue = false;
      return;
    }

    const now = Date.now();
    const job = commandQueue[0];

    if (job.executeAt > now) {
      setTimeout(loop, job.executeAt - now);
      return;
    }

    commandQueue.shift();

    try {
      job.fn();
    } catch (e) {
      console.error("Queue job error:", e);
    }

    setImmediate(loop);
  };

  loop();
}

// -----------------------------
// Rate Limiter
// -----------------------------
const RATE_LIMIT = 20;
let tokens = RATE_LIMIT;
let lastRefill = Date.now();

function refillTokens() {
  const now = Date.now();
  const delta = (now - lastRefill) / 1000;

  tokens += delta * RATE_LIMIT;
  if (tokens > RATE_LIMIT) tokens = RATE_LIMIT;

  lastRefill = now;
}

function canSend() {
  refillTokens();

  if (tokens >= 1) {
    tokens -= 1;
    return true;
  }

  return false;
}

// -----------------------------
// Helpers
// -----------------------------
function genId(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2);
}

// -----------------------------
// WebSocket
// -----------------------------
const wss = new WebSocket.Server({ port: 5001 });

function broadcastToUI(data) {
  const msg = JSON.stringify(data);

  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  });
}

// -----------------------------
// Event → UI Bridge
// -----------------------------
eventBus.on("command.sent", (req) => {
  broadcastToUI({
    type: "cmd_sent",
    requestId: req.requestId,
    deviceId: req.deviceId,
    commandId: req.commandId
  });
});

eventBus.on("command.completed", (req) => {
  broadcastToUI({
    type: "cmd_completed",
    requestId: req.requestId,
    deviceId: req.deviceId,
    commandId: req.commandId,
    execMs: req.execMs
  });
});

eventBus.on("command.failed", (req) => {
  broadcastToUI({
    type: "cmd_failed",
    requestId: req.requestId,
    deviceId: req.deviceId,
    commandId: req.commandId
  });
});

eventBus.on("broadcast.done", (bc) => {
  broadcastToUI({
    type: "broadcast_done",
    broadcastId: bc.broadcastId,
    status: bc.status
  });
});

// -----------------------------
// WS INPUT
// -----------------------------
wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.type === "ui.command") {
        enqueueCommand(() => {
          dispatchCommand(data.deviceId, data.commandId, data.params || {});
        });
      }

      if (data.type === "ui.broadcast") {
        enqueueCommand(() => {
          broadcastCommand(data.commandId, data.params || {});
        });
      }

    } catch {}
  });
});

// -----------------------------
// UDP Listener
// -----------------------------
udp.on("message", (msg, rinfo) => {
  try {
    const packet = JSON.parse(msg.toString());

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
      const expected = signPacket(packet);

      if (packet.sig !== expected) {
        console.log("❌ invalid ACK signature");
        return;
      }

      handleAck(packet);
    }

  } catch {}
});

udp.bind(5000);

// -----------------------------
// Dispatch
// -----------------------------
function dispatchCommand(deviceId, commandId, meta = {}, broadcastId = null) {
  const device = registry.get(deviceId);
  if (!device) return;

  const requestId = genId("req");

  const request = {
    requestId,
    deviceId,
    commandId,
    meta,
    retries: 0,
    maxRetries: 3,
    state: "PENDING",
    broadcastId
  };

  pendingRequests[requestId] = request;

  sendPacket(device, request);
  scheduleTimeout(requestId);

  eventBus.emit("command.sent", request);
  saveState();
}

// -----------------------------
// Broadcast
// -----------------------------
function broadcastCommand(commandId, meta = {}) {
  const devices = registry.getAll();
  const broadcastId = genId("bc");

  broadcastRequests[broadcastId] = {
    broadcastId,
    commandId,
    devices: {},
    status: "PENDING"
  };

  console.log("📡 BROADCAST START:", broadcastId);

  devices.forEach((d) => {
    broadcastRequests[broadcastId].devices[d.deviceId] = "PENDING";
    dispatchCommand(d.deviceId, commandId, meta, broadcastId);
  });

  saveState();
}

// -----------------------------
// Send Packet
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
      nonce: crypto.randomBytes(8).toString("hex")
    };

    packet.sig = signPacket(packet);

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
// ACK
// -----------------------------
function handleAck(packet) {
  const request = pendingRequests[packet.requestId];
  if (!request) return;

  request.state = "COMPLETED";
  request.execMs = packet.execMs;

  console.log("✅ ACK:", packet.requestId);

  clearTimeout(request._timeoutRef);
  delete pendingRequests[packet.requestId];

  if (request.broadcastId) {
    updateBroadcast(request.broadcastId, request.deviceId, "OK");
  }

  eventBus.emit("command.completed", request);
  saveState();
}

// -----------------------------
// Timeout + Retry
// -----------------------------
function scheduleTimeout(requestId) {
  const request = pendingRequests[requestId];
  if (!request) return;

  request._timeoutRef = setTimeout(() => {
    handleTimeout(requestId);
  }, 2000);
}

function handleTimeout(requestId) {
  const request = pendingRequests[requestId];
  if (!request) return;

  if (request.retries >= request.maxRetries) {
    console.log("❌ FAILED:", requestId);

    request.state = "FAILED";
    delete pendingRequests[requestId];

    if (request.broadcastId) {
      updateBroadcast(request.broadcastId, request.deviceId, "FAILED");
    }

    eventBus.emit("command.failed", request);
    saveState();
    return;
  }

  request.retries++;

  const device = registry.get(request.deviceId);
  if (!device) return;

  console.log("🔁 RETRY:", requestId, "|", request.retries);

  sendPacket(device, request);
  scheduleTimeout(requestId);

  saveState();
}

// -----------------------------
// Broadcast Update
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

    eventBus.emit("broadcast.done", bc); // 🔥 مهم
  }

  saveState();
}

// -----------------------------
// Restore
// -----------------------------
function restoreTimers() {
  Object.values(pendingRequests).forEach(req => {
    scheduleTimeout(req.requestId);
  });
}

// -----------------------------
// Snapshot
// -----------------------------
setInterval(() => {
  const snapshot = {
    type: "snapshot",
    devices: registry.getAll(),
    metrics: metrics.snapshot(),
    broadcasts: broadcastRequests
  };

  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(snapshot));
    }
  });
}, 2000);

// -----------------------------
// Init
// -----------------------------
loadState();
restoreTimers();

console.log("🚀 Gateway Phase 6 running");
