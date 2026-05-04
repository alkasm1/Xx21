const dgram = require("dgram");
const fs = require("fs");
const udp = dgram.createSocket("udp4");
const WebSocket = require("ws");

const eventBus = require("./event_bus");
const registry = require("./device_registry");
const Metrics = require("./metrics");

const metrics = new Metrics(eventBus, registry);

// -----------------------------
// CONFIG
// -----------------------------
const STATE_FILE = "./state.json";
const RATE_LIMIT_PER_SEC = 20;

// -----------------------------
// STATE
// -----------------------------
let pendingRequests = {};
let broadcastRequests = {};
let commandQueue = [];
let lastSentTimestamps = [];

// -----------------------------
// LOAD / SAVE STATE
// -----------------------------
function saveState() {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ pendingRequests, broadcastRequests }, null, 2)
  );
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    const data = JSON.parse(fs.readFileSync(STATE_FILE));
    pendingRequests = data.pendingRequests || {};
    broadcastRequests = data.broadcastRequests || {};
    console.log("♻️ State restored");
  }
}

loadState();

// -----------------------------
// UTILS
// -----------------------------
function genRequestId() {
  return "req_" + Math.random().toString(36).slice(2);
}

function genBroadcastId() {
  return "b_" + Math.random().toString(36).slice(2);
}

// -----------------------------
// RATE LIMITER
// -----------------------------
function canSend() {
  const now = Date.now();
  lastSentTimestamps = lastSentTimestamps.filter(t => now - t < 1000);

  if (lastSentTimestamps.length < RATE_LIMIT_PER_SEC) {
    lastSentTimestamps.push(now);
    return true;
  }

  return false;
}

// -----------------------------
// QUEUE PROCESSOR
// -----------------------------
setInterval(() => {
  if (commandQueue.length === 0) return;

  if (!canSend()) return;

  const job = commandQueue.shift();
  executeCommand(job);

}, 50);

// -----------------------------
// EXECUTION ENGINE
// -----------------------------
function executeCommand({ deviceId, commandId, meta, requestId, broadcastId }) {
  const device = registry.get(deviceId);
  if (!device) return;

  const packet = { requestId, deviceId, commandId, meta };

  udp.send(
    Buffer.from(JSON.stringify(packet)),
    device.port,
    device.ip
  );

  const timeout = setTimeout(() => handleTimeout(requestId), 3000);

  pendingRequests[requestId] = {
    requestId,
    deviceId,
    commandId,
    meta,
    retries: 0,
    state: "PENDING",
    timeout,
    broadcastId
  };

  eventBus.emit("command.sent", { requestId, deviceId, commandId });
  saveState();
}

// -----------------------------
// DISPATCH (Queue-based)
// -----------------------------
function dispatchCommand(deviceId, commandId, meta = {}, delay = 0, priority = 1) {
  const requestId = genRequestId();

  const job = {
    deviceId,
    commandId,
    meta,
    requestId,
    priority
  };

  setTimeout(() => {
    commandQueue.push(job);
    commandQueue.sort((a, b) => b.priority - a.priority);
  }, delay);
}

// -----------------------------
// BROADCAST
// -----------------------------
function broadcastCommand(commandId, meta = {}) {
  const devices = registry.getAll();
  const broadcastId = genBroadcastId();

  broadcastRequests[broadcastId] = {
    broadcastId,
    commandId,
    devices: {},
    status: "PENDING"
  };

  devices.forEach(d => {
    const requestId = genRequestId();

    broadcastRequests[broadcastId].devices[d.deviceId] = "PENDING";

    commandQueue.push({
      deviceId: d.deviceId,
      commandId,
      meta,
      requestId,
      broadcastId,
      priority: 1
    });
  });

  saveState();
}

// -----------------------------
// ACK HANDLER
// -----------------------------
udp.on("message", (msg, rinfo) => {
  try {
    const packet = JSON.parse(msg.toString());

    if (packet.type === "ack") {
      const req = pendingRequests[packet.requestId];
      if (!req) return;

      clearTimeout(req.timeout);

      req.state = "COMPLETED";

      eventBus.emit("command.completed", req);

      // Broadcast tracking
      if (req.broadcastId) {
        const b = broadcastRequests[req.broadcastId];
        if (b) {
          b.devices[req.deviceId] = "DONE";

          const allDone = Object.values(b.devices).every(v => v !== "PENDING");

          if (allDone) {
            b.status = "COMPLETED";
            console.log("📊 BROADCAST DONE:", b.broadcastId);
          }
        }
      }

      delete pendingRequests[packet.requestId];
      saveState();
    }

  } catch {}
});

// -----------------------------
// TIMEOUT + RETRY
// -----------------------------
function handleTimeout(requestId) {
  const req = pendingRequests[requestId];
  if (!req) return;

  if (req.retries >= 3) {
    req.state = "FAILED";

    if (req.broadcastId) {
      const b = broadcastRequests[req.broadcastId];
      if (b) {
        b.devices[req.deviceId] = "FAILED";
      }
    }

    console.log("❌ FAILED:", requestId);

    delete pendingRequests[requestId];
    saveState();
    return;
  }

  req.retries++;
  req.state = "RETRYING";

  const delay = Math.pow(2, req.retries) * 500 + Math.random() * 200;

  setTimeout(() => {
    commandQueue.push({
      deviceId: req.deviceId,
      commandId: req.commandId,
      meta: req.meta,
      requestId: req.requestId,
      broadcastId: req.broadcastId,
      priority: 2
    });
  }, delay);

  saveState();
}

// -----------------------------
// WEBSOCKET
// -----------------------------
const wss = new WebSocket.Server({ port: 5001 });

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.type === "ui.command") {
      dispatchCommand(data.deviceId, data.commandId, data.params, data.delay || 0, data.priority || 1);
    }

    if (data.type === "ui.broadcast") {
      broadcastCommand(data.commandId, data.params);
    }
  });
});

// -----------------------------
// SNAPSHOT
// -----------------------------
setInterval(() => {
  const snapshot = {
    type: "snapshot",
    devices: registry.getAll(),
    metrics: metrics.snapshot(),
    pendingRequests,
    broadcastRequests
  };

  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(snapshot));
    }
  });

}, 2000);

// -----------------------------
udp.bind(5000);
console.log("🚀 Gateway running");
