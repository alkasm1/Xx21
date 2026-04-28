// =========================
// Xx21 AUDIO MODULE
// =========================

let lastBytes = null;

// ---------- ENCODE ----------
async function encodeAudio(){

  const file = document.getElementById("audioInput").files[0];
  if (!file) return alert("اختر ملف صوت");

  const wavBytes = await ALM_CORE.audio.fileToWav(file);

  lastBytes = wavBytes;

  const size = Math.ceil(Math.sqrt(wavBytes.length));

  const canvas = document.getElementById("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);

  for (let i = 0; i < wavBytes.length; i++) {
    const v = wavBytes[i];
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);

  alert("تم تحويل الصوت إلى صورة بنجاح");
}

// ---------- SAVE ----------
function saveImage(){

  const canvas = document.getElementById("canvas");
  if (!canvas.width) return alert("لا توجد صورة");

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "audio.png";
  a.click();
}

// ---------- DECODE ----------
function decodeAudio(){

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  const data = ctx.getImageData(
    0, 0,
    canvas.width,
    canvas.height
  ).data;

  const bytes = [];

  for (let i = 0; i < data.length; i += 4) {
    bytes.push(data[i]);
  }

  const url = ALM_CORE.audio.bytesToAudio(bytes);

  const audio = new Audio(url);
  audio.play();

  alert("تم استرجاع وتشغيل الصوت");
}
