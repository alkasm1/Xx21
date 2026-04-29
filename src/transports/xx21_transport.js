/* =========================
   Xx21 TRANSPORT (GLOBAL)
========================= */

const Xx21 = {

  SIZE: 512,

encode(packet) {

  const canvas = document.createElement("canvas");
  canvas.width = this.SIZE;
  canvas.height = this.SIZE;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.createImageData(this.SIZE, this.SIZE);
  const data = img.data;

  // 🔴 اكتب الطول في أول 4 بايت
  const length = packet.length;

  data[0] = (length >> 24) & 255;
  data[1] = (length >> 16) & 255;
  data[2] = (length >> 8) & 255;
  data[3] = length & 255;

  // 🔴 اكتب البيانات بعده
  for (let i = 0; i < packet.length; i++) {

    const v = packet[i];
    const p = (i + 1) * 4;

    data[p]     = v;
    data[p + 1] = v;
    data[p + 2] = v;
    data[p + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}
   decode(canvas) {

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  // 🔴 اقرأ الطول
  const length =
    (data[0] << 24) |
    (data[1] << 16) |
    (data[2] << 8) |
    data[3];

  const bytes = new Uint8Array(length);

  for (let i = 0; i < length; i++) {

    const p = (i + 1) * 4;
    bytes[i] = data[p];
  }

  return bytes;
}
/* =========================
   GLOBAL EXPORTS
========================= */

window.transportEncode = async function(packet) {
  return Xx21.encode(packet);
};

window.transportDecode = async function(canvas) {
  return Xx21.decode(canvas);
};
