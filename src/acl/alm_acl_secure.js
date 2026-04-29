/* =========================
   ACL v1.1 SECURITY (HMAC + NONCE)
========================= */

// ⚠️ مفتاح تجريبي — غيّره في الإنتاج
const ACL_KEYS = {
  1: new TextEncoder().encode("super_secret_key_123")
};

// مخزن nonces لمنع replay (بسيط للـ demo)
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
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0];
}

/* =========================
   HMAC SHA-256
========================= */

async function hmacSign(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, dataBytes);
  return new Uint8Array(sig);
}

async function hmacVerify(keyBytes, dataBytes, signature) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  return await crypto.subtle.verify("HMAC", key, signature, dataBytes);
}

/* =========================
   ENCODE META (keyId + nonce)
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
   ACL (SECURE)
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

    const payload = new Uint8Array(6);
    const dv = new DataView(payload.buffer);

    dv.setUint16(0, groupId, true);
    dv.setUint16(2, freqMHz, true);
    dv.setUint8(4, bandwidth);
    dv.setUint8(5, txPower);

    const nonce = randomUint32() & 0xFFFF;
    const meta = encodeMeta(keyId, nonce);

    // sign(payload + meta)
    const metaBytes = new Uint8Array(4);
    new DataView(metaBytes.buffer).setUint32(0, meta, true);

    const toSign = new Uint8Array(metaBytes.length + payload.length);
    toSign.set(metaBytes, 0);
    toSign.set(payload, metaBytes.length);

    const key = ACL_KEYS[keyId];
    const signature = await hmacSign(key, toSign);

    // final payload = payload + signature
    const finalPayload = new Uint8Array(payload.length + signature.length);
    finalPayload.set(payload, 0);
    finalPayload.set(signature, payload.length);

    return ALM.wrap(finalPayload, 0x10, meta);
  },

  /* =========================
     VERIFY + PARSE
  ========================= */

  async parseSecure(packet) {

    const { type, meta, data } = ALM.unwrap(packet);

    if (type !== 0x10) {
      throw new Error("Not ACL");
    }

    const { keyId, nonce } = decodeMeta(meta);

    if (hasNonce(nonce)) {
      throw new Error("Replay attack detected");
    }

    const key = ACL_KEYS[keyId];
    if (!key) {
      throw new Error("Unknown keyId");
    }

    // split payload / signature
    const sigLen = 32; // SHA-256
    const payload = data.slice(0, data.length - sigLen);
    const signature = data.slice(data.length - sigLen);

    // rebuild signed data
    const metaBytes = new Uint8Array(4);
    new DataView(metaBytes.buffer).setUint32(0, meta, true);

    const toVerify = new Uint8Array(metaBytes.length + payload.length);
    toVerify.set(metaBytes, 0);
    toVerify.set(payload, metaBytes.length);

    const valid = await hmacVerify(key, toVerify, signature);

    if (!valid) {
      throw new Error("Invalid signature");
    }

    addNonce(nonce);

    // parse payload
    const dv = new DataView(payload.buffer);

    return {
      cmd: "SET_FREQ",
      groupId: dv.getUint16(0, true),
      freqMHz: dv.getUint16(2, true),
      bandwidth: dv.getUint8(4),
      txPower: dv.getUint8(5)
    };
  }
};

window.ACL_SECURE = ACL_SECURE;
