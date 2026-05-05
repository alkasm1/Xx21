const dgram = require("dgram");
const crypto = require("crypto");

const socket = dgram.createSocket("udp4");

const DEVICE_ID = 101;
const GATEWAY_PORT = 5000;
const GATEWAY_IP = "127.0.0.1";

const SECRET = "alm_shared_secret";

// -----------------------------
// Stable Stringify (نفس gateway)
// -----------------------------
function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }

  return "{" +
    Object.keys(obj)
      .sort()
      .map(k => JSON.stringify(k) + ":" + stableStringify(obj[k]))
      .join(",") +
    "}";
}

// -----------------------------
function signPacket(packet) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(stableStringify(packet))
    .digest("hex");
}

function verifySignature(packet) {
  const sig = packet.sig;

  const base = { ...packet };
  delete base.sig;

  return signPacket(base) === sig;
}

// -----------------------------
function genNonce() {
  return crypto.randomBytes(8).toString("hex");
}

// -----------------------------
// Start
// -----------------------------
socket.bind(6000, () => {
  console.log("🤖 Device running (secured)");

  setInterval(() => {
    const hb = {
      type: "heartbeat",
      deviceId: DEVICE_ID,
      ts: Date.now(),
      nonce: genNonce()
    };

    const base = { ...hb };
    hb.sig = signPacket(base);

    socket.send(
      Buffer.from(JSON.stringify(hb)),
      GATEWAY_PORT,
      GATEWAY_IP
    );

    console.log("💓 heartbeat (secured)");
  }, 2000);
});

// -----------------------------
// Receive
// -----------------------------
socket.on("message", (msg) => {
  let packet;

  try {
    packet = JSON.parse(msg.toString());
  } catch {
    return;
  }

  if (!verifySignature(packet)) {
    console.log("❌ invalid signature → ignored");
    return;
  }

  console.log("📥 RECEIVED:", packet.requestId);

  const ack = {
    type: "ack",
    requestId: packet.requestId,
    deviceId: DEVICE_ID,
    commandId: packet.commandId,
    ts: Date.now(),
    nonce: genNonce(),
    execMs: Math.floor(Math.random() * 20) + 5
  };

  const base = { ...ack };
  ack.sig = signPacket(base);

  socket.send(
    Buffer.from(JSON.stringify(ack)),
    GATEWAY_PORT,
    GATEWAY_IP
  );

  console.log("✅ ACK:", ack.requestId);
});
