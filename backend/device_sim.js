const dgram = require("dgram");
const crypto = require("crypto");

const socket = dgram.createSocket("udp4");

const DEVICE_ID = 101;
const GATEWAY_IP = "127.0.0.1";
const GATEWAY_PORT = 5000;

const SECRET = "alm_shared_secret";

// -----------------------------
// SECURITY
// -----------------------------
function stableStringify(obj) {
  return JSON.stringify(
    Object.keys(obj)
      .sort()
      .reduce((acc, key) => {
        acc[key] = obj[key];
        return acc;
      }, {})
  );
}

function signPacket(packet) {
  const clone = { ...packet };
  delete clone.sig;

  return crypto
    .createHmac("sha256", SECRET)
    .update(stableStringify(clone))
    .digest("hex");
}

function verifyPacket(packet) {
  const expected = signPacket(packet);
  return expected === packet.sig;
}

function genNonce() {
  return crypto.randomBytes(8).toString("hex");
}

// -----------------------------
// START
// -----------------------------
socket.bind(6000, () => {
  console.log("🤖 Device Secure Simulator running");

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
// RECEIVE
// -----------------------------
socket.on("message", (msg) => {
  let packet;

  try {
    packet = JSON.parse(msg.toString());
  } catch {
    return;
  }

  console.log("📥 DEVICE RECEIVED:", packet);

  if (!verifyPacket(packet)) {
    console.log("❌ invalid signature → ignoring packet");
    return;
  }

  // -----------------------------
  // ACK
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

  console.log("✅ ACK sent:", ack.requestId);
});
