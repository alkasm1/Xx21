// backend/gateway/gateway.js

const dgram = require("dgram");
const udp = dgram.createSocket("udp4");
const WebSocket = require("ws");

const eventBus = require("./event_bus");
const registry = require("./device_registry");
const Metrics = require("./metrics");

const metrics = new Metrics(eventBus, registry);

// -----------------------------
// Pending Requests Map
// -----------------------------
let pendingRequests = {};

// -----------------------------
// WebSocket Server
// -----------------------------
const wss = new WebSocket.Server({ port: 5001 });
console.log("🌐 WS running on ws://0.0.0.0:5001");

wss.on("connection", (ws, req) => {
  console.log("🔌 WS connected:", req.socket.remoteAddress);

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      if (!data.commandId) {
        console.log("❌ Missing commandId");
        return;
      }

      if (data.type === "ui.command") {
        dispatchCommand(data.deviceId, data.commandId, data.params || {});
      }

      if (data.type === "ui.broadcast") {
        broadcastCommand(data.commandId, data.params || {});
      }

    } catch (e) {
      console.error("WS parse error:", e);
    }
  });
});

// -----------------------------
// UDP Listener
// -----------------------------
udp.on("message", (msg, rinfo) => {
  try {
    const packet = JSON.parse(msg.toString());

    // -------------------------
    // Heartbeat
    // -------------------------
    if (packet.type === "heartbeat") {
      console.log("💓", packet.deviceId);

      registry.update(packet.deviceId, {
        deviceId: packet.deviceId,
        ip: rinfo.address,
        port: rinfo.port,
        lastSeen: Date.now(),
        status: "online"
      });
    }

    // -------------------------
    // ACK Handling (Core Logic)
    // -------------------------
    if (packet.type === "ack") {
      const { requestId, deviceId, commandId, execMs } = packet;

      const request = pendingRequests[requestId];

      if (!request) {
        console.log("⚠️ ACK for unknown request:", requestId);
        return;
      }

      request.ackReceived = true;
      request.executionStatus = "completed";
      request.execMs = execMs;

      console.log(
        `✅ ACK: device=${deviceId} | command=${commandId} | request=${requestId} | exec=${execMs}ms`
      );

      // Cleanup timeout
      clearTimeout(request.timeout);

      // Emit lifecycle events
      eventBus.emit("device.ack", packet);

      eventBus.emit("command.completed", {
        requestId,
        deviceId,
        commandId,
        execMs
      });

      // Remove from map
      delete pendingRequests[requestId];
    }

  } catch (err) {
    console.error("UDP parse error:", err);
  }
});

udp.bind(5000);

// -----------------------------
// Helpers
// -----------------------------
function genRequestId() {
  return "req_" + Math.random().toString(36).slice(2);
}

// -----------------------------
// Send Command
// -----------------------------
function dispatchCommand(deviceId, commandId, meta = {}) {
  const device = registry.get(deviceId);
  if (!device) {
    console.log("❌ Device not found:", deviceId);
    return;
  }

  const requestId = genRequestId();
  const timeoutDuration = 5000;

  const request = {
    requestId,
    deviceId,
    commandId,
    meta,
    retries: 0,
    ackReceived: false,
    executionStatus: "pending",
    timeout: setTimeout(() => handleTimeout(request), timeoutDuration)
  };

  pendingRequests[requestId] = request;

  console.log(
    `🚀 SEND: device=${deviceId} | command=${commandId} | request=${requestId}`
  );

  const packet = {
    requestId,
    deviceId,
    commandId,
    meta
  };

  udp.send(
    Buffer.from(JSON.stringify(packet)),
    device.port,
    device.ip
  );

  eventBus.emit("command.sent", { requestId, deviceId, commandId });
}

// -----------------------------
// Broadcast
// -----------------------------
function broadcastCommand(commandId, meta = {}) {
  const devices = registry.getAll();

  devices.forEach((d) => {
    const requestId = genRequestId();
    const timeoutDuration = 5000;

    const request = {
      requestId,
      deviceId: d.deviceId,
      commandId,
      meta,
      retries: 0,
      ackReceived: false,
      executionStatus: "pending",
      timeout: setTimeout(() => handleTimeout(request), timeoutDuration)
    };

    pendingRequests[requestId] = request;

    console.log(
      `📡 BROADCAST: device=${d.deviceId} | command=${commandId} | request=${requestId}`
    );

    const packet = {
      requestId,
      deviceId: d.deviceId,
      commandId,
      meta
    };

    udp.send(
      Buffer.from(JSON.stringify(packet)),
      d.port,
      d.ip
    );

    eventBus.emit("command.sent", {
      requestId,
      deviceId: d.deviceId,
      commandId
    });
  });
}

// -----------------------------
// Timeout Handling
// -----------------------------
function handleTimeout(request) {
  if (request.ackReceived) return;

  console.log(
    `❌ TIMEOUT: device=${request.deviceId} | command=${request.commandId} | request=${request.requestId}`
  );

  request.executionStatus = "failed";

  eventBus.emit("command.timeout", {
    requestId: request.requestId,
    deviceId: request.deviceId,
    commandId: request.commandId
  });

  delete pendingRequests[request.requestId];
}

// -----------------------------
// Snapshot (UI + Metrics)
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
