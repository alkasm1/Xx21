// backend/device_sim.js

const dgram = require("dgram");
const socket = dgram.createSocket("udp4");

const DEVICE_ID = 101;
const GATEWAY_IP = "127.0.0.1";
const GATEWAY_PORT = 5000;

// -----------------------------
// START (bind أولاً)
// -----------------------------
socket.bind(6000, () => {
  console.log("🤖 Device Simulator running on UDP 6000");

  // -----------------------------
  // Heartbeat
  // -----------------------------
  setInterval(() => {
    const hb = {
      type: "heartbeat",
      deviceId: DEVICE_ID,
      ts: Date.now()
    };

    socket.send(
      Buffer.from(JSON.stringify(hb)),
      GATEWAY_PORT,
      GATEWAY_IP
    );

    console.log("💓 sent heartbeat from 6000");
  }, 2000);
});

// -----------------------------
// Receive Commands
// -----------------------------
socket.on("message", (msg) => {
  console.log("📥 DEVICE RECEIVED:", msg.toString());

  let packet;
  try {
    packet = JSON.parse(msg.toString());
  } catch {
    console.log("❌ invalid JSON");
    return;
  }

  // ❗ تحقق من وجود commandId
  if (!packet.commandId) {
    console.log("❌ commandId missing → ignoring");
    return;
  }

  // -----------------------------
  // Send ACK
  // -----------------------------
  const ack = {
  type: "ack",
+ requestId: packet.requestId,
  deviceId: DEVICE_ID,
  commandId: packet.commandId,
  status: "ok",
  execMs: 10
};

  socket.send(
    Buffer.from(JSON.stringify(ack)),
    GATEWAY_PORT,
    GATEWAY_IP
  );

  console.log("✅ ACK sent:", ack);
});
