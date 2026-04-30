/* =========================
   ALM CORE KERNEL v1 (STABLE)
========================= */

const ALM = {

  /* =========================
     WRAP
  ========================= */
  wrap(data, type = 0x02, meta = 0) {

    let payload;

    if (data instanceof Uint8Array) {
      payload = data;

    } else if (typeof data === "string") {
      payload = new TextEncoder().encode(data);

    } else {
      throw new Error("ALM.wrap: Unsupported payload type");
    }

    const header = new Uint8Array(16);
    const dv = new DataView(header.buffer);

    dv.setUint8(0, 1);                 // version
    dv.setUint8(1, type);              // type
    dv.setUint32(2, payload.length, true);
    dv.setUint32(6, meta, true);

    const checksum = crc32(payload);
    dv.setUint32(10, checksum, true);

    dv.setUint16(14, 0, true);         // reserved

    const packet = new Uint8Array(16 + payload.length);
    packet.set(header, 0);
    packet.set(payload, 16);

    return packet;
  },

  /* =========================
     UNWRAP
  ========================= */
  unwrap(packet) {

    if (!(packet instanceof Uint8Array)) {
      packet = new Uint8Array(packet);
    }

    if (packet.length < 16) {
      throw new Error("ALM.unwrap: Packet too small");
    }

    const dv = new DataView(
      packet.buffer,
      packet.byteOffset,
      packet.byteLength
    );

    const version  = dv.getUint8(0);
    const type     = dv.getUint8(1);
    const length   = dv.getUint32(2, true);
    const meta     = dv.getUint32(6, true);
    const checksum = dv.getUint32(10, true);

    if (version !== 1) {
      throw new Error("Unsupported ALM version: " + version);
    }

    if (length > (packet.length - 16)) {
      throw new Error("ALM.unwrap: Invalid payload length");
    }

    const payload = packet.slice(16, 16 + length);

    if (crc32(payload) !== checksum) {
      throw new Error("ALM checksum failed");
    }

    return {
      type,
      meta,
      data: payload
    };
  },

  /* =========================
     HELPERS
  ========================= */

  unwrapText(packet) {
    const { data } = this.unwrap(packet);
    return new TextDecoder().decode(data);
  },

  unwrapBytes(packet) {
    const { data } = this.unwrap(packet);
    return data;
  }
};


/* =========================
   CRC32 (stable)
========================= */

function crc32(data) {

  let crc = -1;

  for (let i = 0; i < data.length; i++) {

    crc ^= data[i];

    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^
        ((crc & 1) ? 0xEDB88320 : 0);
    }
  }

  return (crc ^ -1) >>> 0;
}


/* =========================
   RUNTIME ROUTER
========================= */

class ALM_RuntimeRouter {

  constructor() {
    this.handlers = new Map();
  }

  register(type, handler) {
    this.handlers.set(type, handler);
  }

  dispatch(packet) {

    const { type, meta, data } = ALM.unwrap(packet);

    const handler = this.handlers.get(type);

    if (!handler) {
      throw new Error("No handler for type: " + type);
    }

    return handler({ type, meta, data });
  }
}


/* =========================
   EXPORT (Browser)
========================= */

window.ALM = ALM;
window.ALM_RuntimeRouter = ALM_RuntimeRouter;
