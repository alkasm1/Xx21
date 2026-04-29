/* =========================
   AUDIO DEMO
========================= */

window.runAudioDemo = async function () {

  const fileInput = document.getElementById("audioFile");
  const out = document.getElementById("output");

  if (!fileInput || !fileInput.files.length) {
    alert("اختر ملف صوت أولاً");
    return;
  }

  const file = fileInput.files[0];

  try {

    out.textContent = "Processing...\n";

    // 1) تحويل الملف إلى bytes
    const bytes = new Uint8Array(await file.arrayBuffer());

    // 2) تغليف ALM
    const packet = ALM.wrap(bytes, 0x03, 0);

    // 3) Xx21 encode
    const canvas = await transportEncode(packet);

    // (اختياري) عرض الصورة
    document.body.appendChild(canvas);

    // 4) decode
    const recovered = await transportDecode(canvas);

    // 5) unwrap
    const { data } = ALM.unwrap(recovered);

    // 6) تشغيل الصوت
    const blob = new Blob([data], { type: file.type || "audio/wav" });
    const url = URL.createObjectURL(blob);

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = url;

    out.innerHTML = "";
    out.appendChild(audio);

    console.log("Audio roundtrip OK");

  } catch (e) {
    console.error(e);
    alert("خطأ: " + e.message);
  }
};
