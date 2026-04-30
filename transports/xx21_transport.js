// src/transports/xx21_transport.js
//
// Xx21 Transport (Canvas-based)
// Encodes Uint8Array → Canvas
// Decodes Canvas → Uint8Array
//

class Xx21Transport {

  static encode(packet) {
    if (!(packet instanceof Uint8Array)) {
      throw new Error("Xx21.encode expects Uint8Array");
    }

    const length = packet.length;
    const size = Math.ceil(Math.sqrt(length));

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(size, size);

    let p = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      const v = p < length ? packet[p++] : 0;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }

    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  static decode(canvas) {
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;

    const img = ctx.getImageData(0, 0, width, height);
    const out = new Uint8Array(width * height);

    let p = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      out[p++] = img.data[i];
    }

    return out;
  }
}

module.exports = Xx21Transport;
