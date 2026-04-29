const Xx21 = {

  SIZE: 512,

  encode(packet) {

    const canvas = document.createElement("canvas");
    canvas.width = this.SIZE;
    canvas.height = this.SIZE;

    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(this.SIZE, this.SIZE);
    const data = img.data;

    for (let i = 0; i < packet.length; i++) {

      const v = packet[i];
      const p = i * 4;

      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }

    ctx.putImageData(img, 0, 0);

    return canvas;
  },

  decode(canvas) {

    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    const bytes = new Uint8Array(data.length / 4);

    let j = 0;

    for (let i = 0; i < data.length; i += 4) {
      bytes[j++] = data[i];
    }

    return bytes;
  }
};

/* =========================
   ADAPTERS
========================= */

async function transportEncode(packet) {
  return Xx21.encode(packet);
}

async function transportDecode(canvas) {
  return Xx21.decode(canvas);
}
