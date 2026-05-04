const dgram = require("dgram");
const udp = dgram.createSocket("udp4");
const WebSocket = require("ws");

const eventBus = require("./event_bus");
const registry = require("./device_registry");
const Metrics = require("./metrics");

const { saveState, loadState } = require("./storage");

const metrics = new Metrics(eventBus, registry);

// -----------------------------
// Load State
// -----------------------------
let { pendingRequests, broadcastRequests } = loadState();

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

    } catch (e) {
      console.error("WS error:", e);
    }
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
// Restore Timeouts after restart
// -----------------------------
Object.keys(pendingRequests).forEach((requestId) => {
  const request = pendingRequests[requestId];

  console.log(`♻️ Restoring request: ${requestId}`);

  request.timeout = scheduleTimeout(requestId, request.retries || 0);
});

// -----------------------------
// Helpers
// -----------------------------
function genRequestId() {
  return "req_" + Math.random().toString(36).slice(2);
}

function genBroadcastId() {
  return "bcast_" + Math.random().toString(36).slice(2);
}

// -----------------------------
// Dispatch Single
// -----------------------------
function dispatchCommand(deviceId, commandId, meta = {}) {
  const device = registry.get(deviceId);
  if (!device) return;

  const requestId = genRequestId();

  const request = createRequest(
    requestId,
    deviceId,
    commandId,
    meta,
    null
  );

  pendingRequests[requestId] = request;

  sendPacket(request);

  saveState(pendingRequests, broadcastRequests);
}

// -----------------------------
// Broadcast
// -----------------------------
function broadcastCommand(commandId, meta = {}) {
  const devices = registry.getAll();
  const broadcastId = genBroadcastId();

  const group = {
    broadcastId,
    commandId,
    meta,
    createdAt: Date.now(),
    status: "IN_PROGRESS",
    devices: {},
    completedAt: null
  };

  broadcastRequests[broadcastId] = group;

  devices.forEach((d) => {
    const requestId = genRequestId();

    group.devices[d.deviceId] = "PENDING";

    const request = createRequest(
      requestId,
      d.deviceId,
      commandId,
      meta,
      broadcastId
    );

    pendingRequests[requestId] = request;

    sendPacket(request);
  });

  console.log(`📡 BROADCAST START: ${broadcastId}`);

  saveState(pendingRequests, broadcastRequests);
}

// -----------------------------
// Request Factory
// -----------------------------
function createRequest(requestId, deviceId, commandId, meta, broadcastId) {
  return {
    requestId,
    deviceId,
    commandId,
    meta,
    broadcastId,
    retries: 0,
    state: "PENDING",
    timeout: scheduleTimeout(requestId, 0)
  };
}

// -----------------------------
// Send Packet
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

  eventBus.emit("command.sent", request);
}

// -----------------------------
// ACK Handler
// -----------------------------
function handleAck(packet) {
  const { requestId, deviceId, commandId, execMs } = packet;

  const request = pendingRequests[requestId];
  if (!request) return;

  clearTimeout(request.timeout);
  request.state = "COMPLETED";

  console.log(
    `✅ ACK: device=${deviceId} | cmd=${commandId} | req=${requestId}`
  );

  if (request.broadcastId) {
    const group = broadcastRequests[request.broadcastId];
    if (group) {
      group.devices[deviceId] = "COMPLETED";
      evaluateBroadcast(group);
    }
  }

  eventBus.emit("command.completed", {
    requestId,
    deviceId,
    commandId,
    execMs
  });

  delete pendingRequests[requestId];

  saveState(pendingRequests, broadcastRequests);
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
// Timeout Handler
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

    if (request.broadcastId) {
      const group = broadcastRequests[request.broadcastId];
      if (group) {
        group.devices[request.deviceId] = "FAILED";
        evaluateBroadcast(group);
      }
    }

    eventBus.emit("command.timeout", request);

    delete pendingRequests[requestId];

    saveState(pendingRequests, broadcastRequests);
    return;
  }

  request.retries++;
  request.state = "RETRYING";

  console.log(
    `🔁 RETRY ${request.retries}: device=${request.deviceId} | req=${requestId}`
  );

  sendPacket(request);

  request.timeout = scheduleTimeout(requestId, request.retries);

  saveState(pendingRequests, broadcastRequests);
}

// -----------------------------
// Broadcast Evaluation
// -----------------------------
function evaluateBroadcast(group) {
  const states = Object.values(group.devices);

  const allDone = states.every(
    s => s === "COMPLETED" || s === "FAILED"
  );

  if (!allDone) return;

  const success = states.filter(s => s === "COMPLETED").length;
  const failed = states.filter(s => s === "FAILED").length;

  if (success === states.length) {
    group.status = "COMPLETED";
  } else if (failed === states.length) {
    group.status = "FAILED";
  } else {
    group.status = "PARTIAL";
  }

  group.completedAt = Date.now();

  console.log(
    `📊 BROADCAST DONE: ${group.broadcastId} | status=${group.status}`
  );

  eventBus.emit("broadcast.completed", group);

  saveState(pendingRequests, broadcastRequests);
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
