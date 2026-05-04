const dgram = require("dgram");
const udp = dgram.createSocket("udp4");
const WebSocket = require("ws");
const fs = require("fs");

const eventBus = require("./event_bus");
const registry = require("./device_registry");

const STATE_FILE = "./state.json";

let pendingRequests = {};
let broadcastRequests = {};
let queue = [];

const MAX_INFLIGHT = 5;
let inflight = 0;

// -----------------------------
// Persistence
// -----------------------------
function saveState() {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ pendingRequests, broadcastRequests }, null, 2)
  );
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return;
  const data = JSON.parse(fs.readFileSync(STATE_FILE));

  pendingRequests = data.pendingRequests || {};
  broadcastRequests = data.broadcastRequests || {};
}

loadState();

// -----------------------------
// Queue
// -----------------------------
function enqueue(job, priority = 1, delay = 0) {
  job.priority = priority;
  job.runAt = Date.now() + delay;
  queue.push(job);
}

function dequeue() {
  queue.sort((a, b) => b.priority - a.priority);
  const now = Date.now();

  for (let i = 0; i < queue.length; i++) {
    if (queue[i].runAt <= now) {
      return queue.splice(i, 1)[0];
    }
  }
  return null;
}

// -----------------------------
// Worker Loop
// -----------------------------
setInterval(() => {
  if (inflight >= MAX_INFLIGHT) return;

  const job = dequeue();
  if (!job) return;

  inflight++;

  if (job.type === "single") {
    _dispatchCommand(job.deviceId, job.commandId, job.meta);
  }

  if (job.type === "broadcast") {
    _broadcastCommand(job.commandId, job.meta);
  }

}, 50);

// -----------------------------
// RequestId
// -----------------------------
function genRequestId() {
  return "req_" + Math.random().toString(36).slice(2);
}

// -----------------------------
// Dispatch
// -----------------------------
function _dispatchCommand(deviceId, commandId, meta = {}) {
  const device = registry.get(deviceId);
  if (!device) return;

  const requestId = genRequestId();

  const request = {
    requestId,
    deviceId,
    commandId,
    retries: 0,
    state: "PENDING"
  };

  pendingRequests[requestId] = request;

  sendPacket(device, requestId, deviceId, commandId, meta);
  setupTimeout(requestId);

  saveState();
}

// -----------------------------
// Broadcast
// -----------------------------
function _broadcastCommand(commandId, meta = {}) {
  const broadcastId = "bc_" + Date.now();
  const devices = registry.getAll();

  broadcastRequests[broadcastId] = {
    broadcastId,
    devices: {},
    status: "PENDING"
  };

  devices.forEach(d => {
    const requestId = genRequestId();

    broadcastRequests[broadcastId].devices[d.deviceId] = {
      requestId,
      status: "PENDING"
    };

    const request = {
      requestId,
      deviceId: d.deviceId,
      commandId,
      retries: 0,
      broadcastId
    };

    pendingRequests[requestId] = request;

    sendPacket(d, requestId, d.deviceId, commandId, meta);
    setupTimeout(requestId);
  });

  saveState();
}

// -----------------------------
// Send Packet
// -----------------------------
function sendPacket(device, requestId, deviceId, commandId, meta) {
  udp.send(
    Buffer.from(JSON.stringify({ requestId, deviceId, commandId, meta })),
    device.port,
    device.ip
  );
}

// -----------------------------
// Timeout + Retry
// -----------------------------
function setupTimeout(requestId) {
  const request = pendingRequests[requestId];
  if (!request) return;

  request.timeout = setTimeout(() => handleTimeout(requestId), 2000);
}

function handleTimeout(requestId) {
  const request = pendingRequests[requestId];
  if (!request) return;

  if (request.retries >= 3) {
    request.state = "FAILED";
    delete pendingRequests[requestId];
    inflight--;
    saveState();
    return;
  }

  request.retries++;

  const device = registry.get(request.deviceId);
  sendPacket(device, requestId, request.deviceId, request.commandId, {});

  request.timeout = setTimeout(
    () => handleTimeout(requestId),
    2000 * Math.pow(2, request.retries)
  );
}

// -----------------------------
// ACK Handling
// -----------------------------
udp.on("message", (msg) => {
  try {
    const packet = JSON.parse(msg.toString());

    if (packet.type === "ack") {
      const req = pendingRequests[packet.requestId];
      if (!req) return;

      clearTimeout(req.timeout);

      if (req.broadcastId) {
        broadcastRequests[req.broadcastId]
          .devices[req.deviceId].status = "DONE";
      }

      delete pendingRequests[packet.requestId];
      inflight--;

      saveState();
    }
  } catch {}
});

udp.bind(5000);
