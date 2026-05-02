// backend/gateway/gateway.js

const dgram = require("dgram");
const udp = dgram.createSocket("udp4");
const WebSocket = require("ws");

const eventBus = require("./event_bus");
const registry = require("./device_registry");
const Metrics = require("./metrics");

const metrics = new Metrics(eventBus, registry);

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

    if (packet.type === "ack") {
      eventBus.emit("device.ack", {
        requestId: packet.requestId,
        deviceId: packet.deviceId,
        commandId: packet.commandId,
        execMs: packet.execMs
      });

      console.log("✅ ACK:", packet);
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
// Send Command
// -----------------------------
function dispatchCommand(deviceId, commandId, meta = {}) {
  const device = registry.get(deviceId);
  if (!device) return;

  const requestId = genRequestId();

  console.log("🚀 SENDING TO:", device.ip, device.port, "|", requestId);

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

  eventBus.emit("command.sent", {
    requestId,
    deviceId,
    commandId
  });
}

// -----------------------------
// Broadcast
// -----------------------------
function broadcastCommand(commandId, meta = {}) {
  const devices = registry.getAll();

  devices.forEach((d) => {
    const requestId = genRequestId();

    console.log("📡 BROADCAST →", d.deviceId, "|", requestId);

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
// Retry Engine (legacy - سيتم استبداله في المرحلة 2)
// -----------------------------
eventBus.on("command.sent", ({ deviceId, commandId }) => {
  let retries = 0;

  const interval = setInterval(() => {
    const device = registry.get(deviceId);
    if (!device) return;

    if (retries >= 3) {
      console.log(`❌ FAILED ${deviceId}`);
      eventBus.emit("command.timeout", { deviceId, commandId });
      clearInterval(interval);
      return;
    }

    console.log(`🔁 Retry ${retries + 1} → ${deviceId}`);

    udp.send(
      Buffer.from(JSON.stringify({ deviceId, commandId })),
      device.port,
      device.ip
    );

    retries++;
  }, 2000);

  const handler = (ack) => {
    if (ack.deviceId === deviceId && ack.commandId === commandId) {
      clearInterval(interval);
      eventBus.off("device.ack", handler);
    }
  };

  eventBus.on("device.ack", handler);
});

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
