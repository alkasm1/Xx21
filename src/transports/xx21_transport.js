/* =========================
   Xx21 TRANSPORT (FINAL STABLE)
   Uint8Array <-> Canvas
========================= */

const Xx21 = {

  SIZE: 512, // يمكن تغييره لاحقًا

  /* =========================
     ENCODE
  ========================= */
  encode(packet) {

    if (!(packet instanceof Uint8Array)) {
      throw new Error("Xx21.encode: packet must be Uint8Array");
    }

    const capacity = (this.SIZE * this.SIZE) - 1; // أول بكسل للطول

    if (packet.length > capacity) {
      throw new Error(
        "Xx21.encode: packet too large for canvas (" +
        packet.length + " > " + capacity + ")"
      );
    }

    const canvas = document.createElement("canvas");
    canvas.width = this.SIZE;
    canvas.height = this.SIZE;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const img = ctx.createImageData(this.SIZE, this.SIZE);
    const data = img.data;

    const length = packet.length;

    /* =========================
       WRITE LENGTH (32-bit BE)
    ========================= */
    data[0] = (length >>> 24) & 255;
    data[1] = (length >>> 16) & 255;
    data[2] = (length >>> 8) & 255;
    data[3] = length & 255;

    /* =========================
       WRITE PAYLOAD
    ========================= */
    for (let i = 0; i < packet.length; i++) {

      const v = packet[i];
      const p = (i + 1) * 4;

      data[p]     = v;   // R
      data[p + 1] = v;   // G
      data[p + 2] = v;   // B
      data[p + 3] = 255; // A
    }

    ctx.putImageData(img, 0, 0);

    return canvas;
  },

  /* =========================
     DECODE
  ========================= */
  decode(canvas) {

    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Xx21.decode: input must be canvas");
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    /* =========================
       READ LENGTH
    ========================= */
    const length =
      ((data[0] << 24) >>> 0) |
      (data[1] << 16) |
      (data[2] << 8) |
      data[3];

    const maxCapacity = (canvas.width * canvas.height) - 1;

    if (length > maxCapacity) {
      throw new Error("Xx21.decode: invalid length (overflow)");
    }

    const bytes = new Uint8Array(length);

    /* =========================
       READ PAYLOAD
    ========================= */
    for (let i = 0; i < length; i++) {

      const p = (i + 1) * 4;
      bytes[i] = data[p]; // R فقط
    }

    return bytes;
  }
};


/* =========================
   GLOBAL EXPORTS
========================= */

window.transportEncode = async function (packet) {
  return Xx21.encode(packet);
};

window.transportDecode = async function (canvas) {
  return Xx21.decode(canvas);
};

window.Xx21 = Xx21;
