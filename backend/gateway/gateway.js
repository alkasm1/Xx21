// gateway/gateway.js

const dgram = require("dgram");
const eventBus = require("./event_bus");
const registry = require("./device_registry");
const handlePacket = require("./ack_handler");
const { dispatchCommand, buildSetFreq, buildReboot } = require("./command_dispatcher");
const { broadcastToGroup } = require("./broadcast_engine");
const Metrics = require("./metrics");

const PORT = 5001;

const udp = dgram.createSocket("udp4");

// METRICS
const metrics = new Metrics(eventBus, registry);

// استقبال ACK / رسائل من الأجهزة
udp.on("message", (msg, rinfo) => {
  handlePacket(msg, rinfo);
});

// تشغيل الـGateway
udp.bind(PORT, () => {
  console.log(`[GATEWAY] Listening on ${PORT}`);
});

// أوامر من الـUI (Unicast)
eventBus.on("ui.command", async ({ command, deviceId, params }) => {
  const device = registry.get(deviceId);

  if (!device) {
    console.log("❌ Device not found:", deviceId);
    return;
  }

  if (command === "SET_FREQ") {
    await dispatchCommand(udp, {
      deviceId,
      ip: device.ip,
      port: device.port,
      commandId: 0x11,
      build: () =>
        buildSetFreq({
          groupId: 1,
          freqMHz: params.freqMHz,
          bandwidth: params.bandwidth,
          txPower: params.txPower,
          keyId: 1
        }),
      meta: {}
    });
  }

  if (command === "REBOOT") {
    await dispatchCommand(udp, {
      deviceId,
      ip: device.ip,
      port: device.port,
      commandId: 0x12,
      build: () =>
        buildReboot({
          delay: params.delay,
          keyId: 1
        }),
      meta: {}
    });
  }
});

// أوامر من الـUI (Broadcast / Group)
eventBus.on("ui.broadcast", ({ command, groupId, params }) => {
  if (command === "SET_FREQ") {
    broadcastToGroup({
      groupId,
      commandId: 0x11,
      build: () =>
        buildSetFreq({
          groupId,
          freqMHz: params.freqMHz,
          bandwidth: params.bandwidth,
          txPower: params.txPower,
          keyId: 1
        }),
      udp
    });
  }

  if (command === "REBOOT") {
    broadcastToGroup({
      groupId,
      commandId: 0x12,
      build: () =>
        buildReboot({
          delay: params.delay,
          keyId: 1
        }),
      udp
    });
  }
});

// مراقبة الأجهزة
setInterval(() => {
  registry.markOffline(5000);
  console.log("\n📡 DEVICES:");
  console.table(registry.getAll());
}, 3000);
