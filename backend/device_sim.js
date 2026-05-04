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
// 🔥 Anti-Replay Layer
// -----------------------------
const seenNonces = new Map(); // nonce -> timestamp
const NONCE_TTL = 10000; // 10 seconds
const MAX_SKEW = 5000;   // 5 seconds

function isReplay(packet) {
  const now = Date.now();

  // 1) Time check
  if (Math.abs(now - packet.ts) > MAX_SKEW) {
    console.log("⏱️ packet expired");
    return true;
  }

  // 2) Nonce reuse
  if (seenNonces.has(packet.nonce)) {
    console.log("♻️ replay detected:", packet.nonce);
    return true;
  }

  // store nonce
  seenNonces.set(packet.nonce, now);

  return false;
}

// Cleanup loop
setInterval(() => {
  const now = Date.now();

  for (const [nonce, ts] of seenNonces.entries()) {
    if (now - ts > NONCE_TTL) {
      seenNonces.delete(nonce);
    }
  }

}, 5000);

// -----------------------------
// START
// -----------------------------
socket.bind(6000, () => {
  console.log("🤖 Device Secure Simulator (Anti-Replay)");

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

    console.log("💓 heartbeat (secured)");
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

  console.log("📥 RECEIVED:", packet.requestId);

  // 1) Signature check
  if (!verifyPacket(packet)) {
    console.log("❌ invalid signature");
    return;
  }

  // 2) Anti-replay check
  if (isReplay(packet)) {
    console.log("❌ replay blocked");
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

  console.log("✅ ACK:", packet.requestId);
});
