/* =========================
   ACL v1.1 SECURITY (HMAC + NONCE)
   Stable Organized Build
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
   ACL SECURE
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
    const payload = new Uint8Array(6);
    const dv = new DataView(payload.buffer);

    dv.setUint16(0, groupId, true);
    dv.setUint16(2, freqMHz, true);
    dv.setUint8(4, bandwidth);
    dv.setUint8(5, txPower);

    // meta (keyId + nonce)
    const nonce = randomUint32() & 0xFFFF;
    const meta = encodeMeta(keyId, nonce);

    // sign(meta + payload)
    const metaBytes = new Uint8Array(4);
    new DataView(metaBytes.buffer).setUint32(0, meta, true);

    const toSign = new Uint8Array(metaBytes.length + payload.length);
    toSign.set(metaBytes, 0);
    toSign.set(payload, metaBytes.length);

    const key = ACL_KEYS[keyId];
    const signature = await hmacSign(key, toSign);

    // final payload = [cmdId][payload][signature]
    const finalPayload = new Uint8Array(1 + payload.length + signature.length);
    finalPayload[0] = this.CMD.SET_FREQ;
    finalPayload.set(payload, 1);
    finalPayload.set(signature, 1 + payload.length);

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

    const payload = decoded.data;
    const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

    let offset = 0;

    const cmdId = dv.getUint8(offset); 
    offset += 1;

    if (cmdId !== this.CMD.SET_FREQ) {
      throw new Error("ACL: Unknown command");
    }

    const groupId  = dv.getUint16(offset, true); offset += 2;
    const freqMHz  = dv.getUint16(offset, true); offset += 2;
    const bandwidth = dv.getUint8(offset); offset += 1;
    const txPower   = dv.getUint8(offset); offset += 1;

    // signature
    const signature = payload.slice(offset);

    // reconstruct signed data
    const metaBytes = new Uint8Array(4);
    new DataView(metaBytes.buffer).setUint32(0, decoded.meta, true);

    const toVerify = new Uint8Array(metaBytes.length + (offset - 1));
    toVerify.set(metaBytes, 0);
    toVerify.set(payload.slice(1, offset), metaBytes.length);

    const key = ACL_KEYS[keyId];
    const ok = await hmacVerify(key, toVerify, signature);

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

window.ACL_SECURE = ACL_SECURE;
