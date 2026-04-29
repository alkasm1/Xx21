/* =========================
   AUDIO DEMO (FIXED)
========================= */

window.runAudio = async function() {

  const file = document.getElementById("audioInput").files[0];

  if (!file) {
    alert("اختر ملف صوت");
    return;
  }

  const out = document.getElementById("output");
  out.textContent = "Processing audio...\n";

  try {

    const audioCtx = new AudioContext();

    // 1) decode (MP3 → PCM)
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);

    // 2) convert to WAV (PCM 16-bit)
    const wavBytes = bufferToWav(decoded);

    // 3) wrap inside ALM
    const packet = ALM.wrap(wavBytes, 0x03, decoded.sampleRate);

    // 4) transport via Xx21
    const canvas = await transportEncode(packet);
    const recovered = await transportDecode(canvas);

    // 5) unwrap
    const { data } = ALM.unwrap(recovered);

    // 6) verify byte integrity
    const ok = equalBytes(wavBytes, data);

    out.textContent += "Byte integrity: " + ok + "\n";

    // 7) play audio
    const blob = new Blob([data], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = url;

    out.innerHTML = "";
    out.appendChild(audio);

    // 8) show encoded image (debug)
    document.body.appendChild(canvas);

  } catch (e) {
    console.error(e);
    out.textContent = "ERROR:\n" + e.message;
  }
};


/* =========================
   WAV CONVERTER
========================= */

function bufferToWav(buffer) {

  const length = buffer.length * 2 + 44;
  const arr = new ArrayBuffer(length);
  const view = new DataView(arr);

  let offset = 0;

  function writeString(s) {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset++, s.charCodeAt(i));
    }
  }

  writeString("RIFF");
  view.setUint32(offset, 36 + buffer.length * 2, true); offset += 4;

  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint32(offset, buffer.sampleRate, true); offset += 4;
  view.setUint32(offset, buffer.sampleRate * 2, true); offset += 4;
  view.setUint16(offset, 2, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;

  writeString("data");
  view.setUint32(offset, buffer.length * 2, true); offset += 4;

  const channel = buffer.getChannelData(0);

  for (let i = 0; i < channel.length; i++) {
    let s = Math.max(-1, Math.min(1, channel[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Uint8Array(arr);
}
