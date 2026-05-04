// backend/device_sim.js

const dgram = require("dgram");
const crypto = require("crypto");

const socket = dgram.createSocket("udp4");

const DEVICE_ID = 101;
const GATEWAY_IP = "127.0.0.1";
const GATEWAY_PORT = 5000;

// 🔐 مفتاح سري مشترك (يجب أن يكون نفسه في gateway)
const SECRET = "alm_shared_secret";

// -----------------------------
// Security Helpers
// -----------------------------
function genNonce() {
  return crypto.randomBytes(8).toString("hex");
}

function signPacket(packet) {
  const clone = { ...packet };
  delete clone.sig;

  const payload = JSON.stringify(clone);

  return crypto
    .createHmac("sha256", SECRET)
    .update(payload)
    .digest("hex");
}

function verifyPacket(packet) {
  const receivedSig = packet.sig;
  const expectedSig = signPacket(packet);

  return receivedSig === expectedSig;
}

// -----------------------------
// START
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
      ts: Date.now(),
      nonce: genNonce()
    };

    hb.sig = signPacket(hb);

    socket.send(
      Buffer.from(JSON.stringify(hb)),
      GATEWAY_PORT,
      GATEWAY_IP
    );

    console.log("💓 sent heartbeat (secured)");
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

  // -----------------------------
  // 🔐 Security Check
  // -----------------------------
  if (!packet.sig || !verifyPacket(packet)) {
    console.log("❌ invalid signature → ignoring packet");
    return;
  }

  // -----------------------------
  // تحقق من commandId
  // -----------------------------
  if (!packet.commandId) {
    console.log("❌ commandId missing → ignoring");
    return;
  }

  // -----------------------------
  // Send ACK (secured)
  // -----------------------------
  const ack = {
    type: "ack",
    requestId: packet.requestId,
    deviceId: DEVICE_ID,
    commandId: packet.commandId,
    status: "ok",
    execMs: Math.floor(Math.random() * 20) + 5,
    ts: Date.now(),
    nonce: genNonce()
  };

  ack.sig = signPacket(ack);

  socket.send(
    Buffer.from(JSON.stringify(ack)),
    GATEWAY_PORT,
    GATEWAY_IP
  );

  console.log("✅ ACK sent (secured):", ack);
});
