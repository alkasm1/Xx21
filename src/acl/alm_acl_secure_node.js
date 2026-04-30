/* =========================
   ACL SECURE — NODE VERSION
   Stable Organized Build
========================= */

const crypto = require("crypto");
const ALM = require("../alm_kernel_node");

/* =========================
   CONFIG (مفتاح تجريبي)
========================= */

const ACL_KEYS = {
  1: Buffer.from("super_secret_key_123")
};

/* =========================
   NONCE CACHE (Anti‑Replay)
========================= */

const NONCE_CACHE = new Set();
const NONCE_TTL_MS = 60_000;

function addNonce(nonce) {
  NONCE_CACHE.add(nonce);
  setTimeout(() => NONCE_CACHE.delete(nonce), NONCE_TTL_MS);
}

function hasNonce(nonce) {
  return NONCE_CACHE.has(nonce);
}

function randomUint32() {
  return crypto.randomBytes(4).readUInt32LE(0);
}

/* =========================
   HMAC SHA‑256
========================= */

function hmacSign(keyBytes, dataBytes) {
  return crypto
    .createHmac("sha256", keyBytes)
    .update(dataBytes)
    .digest();
}

function hmacVerify(keyBytes, dataBytes, signature) {
  const expected = hmacSign(keyBytes, dataBytes);
  return crypto.timingSafeEqual(expected, signature);
}

/* =========================
   META ENCODING
========================= */

function encodeMeta(keyId, nonce) {
  return ((keyId & 0xFFFF) << 16) | (nonce & 0xFFFF);
}

function decodeMeta(meta) {
  return {
    keyId: (meta >>> 16) & 0xFFFF,
    nonce: meta & 0xFFFF
  };
}

/* =========================
   ACL SECURE (NODE)
========================= */

const ACL_SECURE = {

  CMD: {
    DISCOVER: 0x10,
    SET_FREQ: 0x11,
    REBOOT:   0x12
  },

  /* =========================
     BUILD + SIGN
  ========================= */

  async buildSetFreqSecure({ groupId, freqMHz, bandwidth, txPower, keyId = 1 }) {

    // payload (6 bytes)
    const payload = Buffer.alloc(6);
    payload.writeUInt16LE(groupId, 0);
    payload.writeUInt16LE(freqMHz, 2);
    payload.writeUInt8(bandwidth, 4);
    payload.writeUInt8(txPower, 5);

    // meta
    const nonce = randomUint32() & 0xFFFF;
    const meta = encodeMeta(keyId, nonce);

    const metaBytes = Buffer.alloc(4);
    metaBytes.writeUInt32LE(meta, 0);

    // sign(meta + payload)
    const toSign = Buffer.concat([metaBytes, payload]);
    const key = ACL_KEYS[keyId];
    const signature = hmacSign(key, toSign);

    // final payload = [cmdId][payload][signature]
    const finalPayload = Buffer.concat([
      Buffer.from([this.CMD.SET_FREQ]),
      payload,
      signature
    ]);

    return ALM.wrap(finalPayload, this.CMD.SET_FREQ, meta);
  },

  /* =========================
     VERIFY + PARSE
  ========================= */

  async parseSecure(packet) {

    const decoded = ALM.unwrap(packet);

    if (!decoded || !decoded.data) {
      throw new Error("ACL: Invalid packet");
    }

    const { keyId, nonce } = decodeMeta(decoded.meta);

    if (hasNonce(nonce)) {
      throw new Error("ACL: Replay detected");
    }

    addNonce(nonce);

    const payload = Buffer.from(decoded.data);

    let offset = 0;

    const cmdId = payload.readUInt8(offset++);
    if (cmdId !== this.CMD.SET_FREQ) {
      throw new Error("ACL: Unknown command");
    }

    const groupId  = payload.readUInt16LE(offset); offset += 2;
    const freqMHz  = payload.readUInt16LE(offset); offset += 2;
    const bandwidth = payload.readUInt8(offset++);
    const txPower   = payload.readUInt8(offset++);

    const signature = payload.slice(offset);

    // reconstruct signed data
    const metaBytes = Buffer.alloc(4);
    metaBytes.writeUInt32LE(decoded.meta, 0);

    const toVerify = Buffer.concat([
      metaBytes,
      payload.slice(1, offset)
    ]);

    const key = ACL_KEYS[keyId];
    const ok = hmacVerify(key, toVerify, signature);

    if (!ok) {
      throw new Error("ACL: Signature verification failed");
    }

    return {
      cmd: "SET_FREQ",
      groupId,
      freqMHz,
      bandwidth,
      txPower
    };
  }
};

module.exports = ACL_SECURE;
