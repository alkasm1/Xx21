const ALM = {

  wrap(text, type = 0x02, meta = 0) {

    const payload = new TextEncoder().encode(text);

    const header = new Uint8Array(16);
    const dv = new DataView(header.buffer);

    dv.setUint8(0, 1);
    dv.setUint8(1, type);
    dv.setUint32(2, payload.length, true);
    dv.setUint32(6, meta, true);

    const checksum = crc32(payload);
    dv.setUint32(10, checksum, true);
    dv.setUint16(14, 0, true);

    const packet = new Uint8Array(16 + payload.length);
    packet.set(header, 0);
    packet.set(payload, 16);

    return packet;
  },

  unwrap(packet) {

    const view = packet instanceof Uint8Array
      ? packet
      : new Uint8Array(packet);

    const dv = new DataView(view.buffer, view.byteOffset, view.byteLength);

    const type = dv.getUint8(1);
    const length = dv.getUint32(2, true);
    const meta = dv.getUint32(6, true);
    const checksum = dv.getUint32(10, true);

    const payload = view.slice(16, 16 + length);

    if (crc32(payload) !== checksum) {
      throw new Error("ALM checksum failed");
    }

    return {
      type,
      meta,
      data: new TextDecoder().decode(payload),
      raw: payload
    };
  }
};

function crc32(data) {
  let crc = -1;

  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }

  return (crc ^ -1) >>> 0;
}

/* =========================
   ROUTER
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
