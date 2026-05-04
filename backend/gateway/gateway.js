// backend/gateway/gateway.js

const dgram = require("dgram");
const udp = dgram.createSocket("udp4");
const WebSocket = require("ws");

const eventBus = require("./event_bus");
const registry = require("./device_registry");
const Metrics = require("./metrics");

const metrics = new Metrics(eventBus, registry);

let pendingRequests = {};

// -----------------------------
// Config
// -----------------------------
const MAX_RETRIES = 3;
const BASE_TIMEOUT = 2000;

// -----------------------------
// WebSocket
// -----------------------------
const wss = new WebSocket.Server({ port: 5001 });

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (!data.commandId) return;

      if (data.type === "ui.command") {
        dispatchCommand(data.deviceId, data.commandId, data.params || {});
      }

      if (data.type === "ui.broadcast") {
        broadcastCommand(data.commandId, data.params || {});
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
      handleAck(packet);
    }

  } catch {}
});

udp.bind(5000);

// -----------------------------
// Helpers
// -----------------------------
function genRequestId() {
  return "req_" + Math.random().toString(36).slice(2);
}

// -----------------------------
// Dispatch
// -----------------------------
function dispatchCommand(deviceId, commandId, meta = {}) {
  const device = registry.get(deviceId);
  if (!device) return;

  const requestId = genRequestId();

  const request = createRequest(requestId, deviceId, commandId, meta);

  pendingRequests[requestId] = request;

  sendPacket(request);
}

// -----------------------------
// Broadcast
// -----------------------------
function broadcastCommand(commandId, meta = {}) {
  const devices = registry.getAll();

  devices.forEach((d) => {
    const requestId = genRequestId();

    const request = createRequest(requestId, d.deviceId, commandId, meta);

    pendingRequests[requestId] = request;

    sendPacket(request);
  });
}

// -----------------------------
// Request Factory
// -----------------------------
function createRequest(requestId, deviceId, commandId, meta) {
  return {
    requestId,
    deviceId,
    commandId,
    meta,
    retries: 0,
    state: "PENDING",
    timeout: scheduleTimeout(requestId, 0)
  };
}

// -----------------------------
// Send
// -----------------------------
function sendPacket(request) {
  const device = registry.get(request.deviceId);
  if (!device) return;

  console.log(
    `🚀 SEND: device=${request.deviceId} | cmd=${request.commandId} | req=${request.requestId} | retry=${request.retries}`
  );

  const packet = {
    requestId: request.requestId,
    deviceId: request.deviceId,
    commandId: request.commandId,
    meta: request.meta
  };

  udp.send(
    Buffer.from(JSON.stringify(packet)),
    device.port,
    device.ip
  );

  eventBus.emit("command.sent", {
    requestId: request.requestId,
    deviceId: request.deviceId,
    commandId: request.commandId
  });
}

// -----------------------------
// ACK Handler
// -----------------------------
function handleAck(packet) {
  const { requestId, deviceId, commandId, execMs } = packet;

  const request = pendingRequests[requestId];
  if (!request) {
    console.log("⚠️ Unknown ACK:", requestId);
    return;
  }

  clearTimeout(request.timeout);

  request.state = "COMPLETED";

  console.log(
    `✅ ACK: device=${deviceId} | cmd=${commandId} | req=${requestId}`
  );

  eventBus.emit("command.completed", {
    requestId,
    deviceId,
    commandId,
    execMs
  });

  delete pendingRequests[requestId];
}

// -----------------------------
// Timeout Scheduler
// -----------------------------
function scheduleTimeout(requestId, retryCount) {
  const jitter = Math.random() * 300;
  const delay = BASE_TIMEOUT * Math.pow(2, retryCount) + jitter;

  return setTimeout(() => handleTimeout(requestId), delay);
}

// -----------------------------
// Timeout Handler (Retry Engine)
// -----------------------------
function handleTimeout(requestId) {
  const request = pendingRequests[requestId];
  if (!request) return;

  if (request.state === "COMPLETED") return;

  if (request.retries >= MAX_RETRIES) {
    request.state = "FAILED";

    console.log(
      `❌ FAILED: device=${request.deviceId} | cmd=${request.commandId} | req=${requestId}`
    );

    eventBus.emit("command.timeout", {
      requestId,
      deviceId: request.deviceId,
      commandId: request.commandId
    });

    delete pendingRequests[requestId];
    return;
  }

  request.retries++;
  request.state = "RETRYING";

  console.log(
    `🔁 RETRY ${request.retries}: device=${request.deviceId} | req=${requestId}`
  );

  sendPacket(request);

  request.timeout = scheduleTimeout(requestId, request.retries);
}

// -----------------------------
// Snapshot
// -----------------------------
setInterval(() => {
  const snapshot = {
    type: "snapshot",
    devices: registry.getAll(),
    metrics: metrics.snapshot()
  };

  wss.clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(snapshot));
    }
  });

}, 2000);
