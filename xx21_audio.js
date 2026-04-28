async function encodeAudioToImage(file){

  const wav = await ALM_CORE.audio.fileToWav(file);
  const bytes = wav;

  const size = Math.ceil(Math.sqrt(bytes.length));
  const canvas = document.getElementById("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);

  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i];
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
}
