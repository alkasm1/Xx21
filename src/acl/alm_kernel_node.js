/* =========================
   ALM KERNEL — NODE VERSION
   Stable Organized Build
========================= */

function toUint8(data) {
  if (data instanceof Uint8Array) return data;
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (typeof data === "string") return new TextEncoder().encode(data);
  throw new Error("ALM: Unsupported data type");
}

const ALM = {

  /* =========================
     WRAP
  ========================= */
  wrap(data, type = 0x02, meta = 0) {

    const bytes = toUint8(data);
    const header = new Uint8Array(6);
    const dv = new DataView(header.buffer);

    dv.setUint16(0, type, true);
    dv.setUint32(2, meta, true);

    const packet = new Uint8Array(header.length + bytes.length);
    packet.set(header, 0);
    packet.set(bytes, header.length);

    return packet;
  },

  /* =========================
     UNWRAP
  ========================= */
  unwrap(packet) {

    if (!(packet instanceof Uint8Array)) {
      packet = new Uint8Array(packet);
    }

    if (packet.length < 6) {
      throw new Error("ALM: Packet too small");
    }

    const dv = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);

    const type = dv.getUint16(0, true);
    const meta = dv.getUint32(2, true);

    const data = packet.slice(6);

    return { type, meta, data };
  }
};

module.exports = ALM;
