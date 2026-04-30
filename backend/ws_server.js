// backend/ws_server.js

const WebSocket = require("ws");
const eventBus = require("./gateway/event_bus");
const registry = require("./gateway/device_registry");
const Metrics = require("./gateway/metrics");

const metrics = new Metrics(eventBus, registry);

const wss = new WebSocket.Server({ port: 8080 });

console.log("🌐 WS Dashboard running on ws://localhost:8080");

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(msg);
    }
  });
}

wss.on("connection", (ws) => {
  console.log("🟢 Dashboard connected");

  ws.send(JSON.stringify({
    type: "snapshot",
    metrics: metrics.snapshot(),
    devices: registry.getAll()
  }));

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "command") {
        eventBus.emit("ui.command", {
          command: data.command,
          deviceId: data.deviceId,
          params: data.params
        });
      }

      if (data.type === "broadcast") {
        eventBus.emit("ui.broadcast", {
          command: data.command,
          groupId: data.groupId,
          params: data.params
        });
      }

    } catch (e) {
      console.error("WS parse error:", e.message);
    }
  });
});

/* =========================
   JOB EVENTS → UI
========================= */

eventBus.on("broadcast.job.created", (job) => {
  broadcast({ type: "job.created", job });
});

eventBus.on("broadcast.job.update", (job) => {
  broadcast({ type: "job.update", job });
});

eventBus.on("broadcast.job.done", (job) => {
  broadcast({ type: "job.done", job });
});

/* =========================
   DEVICE + COMMAND EVENTS
========================= */

eventBus.on("device.ack", (ack) => {
  broadcast({ type: "ack", data: ack });
});

eventBus.on("command.timeout", (info) => {
  broadcast({ type: "timeout", data: info });
});

eventBus.on("command.sent", (cmd) => {
  broadcast({ type: "command", data: cmd });
});

/* =========================
   SNAPSHOT EVERY 3s
========================= */

setInterval(() => {
  broadcast({
    type: "snapshot",
    metrics: metrics.snapshot(),
    devices: registry.getAll()
  });
}, 3000);
