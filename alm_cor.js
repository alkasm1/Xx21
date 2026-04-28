// =========================
// ALM CORE (Shared Kernel)
// =========================

const ALM_CORE = {

  audio: {

    // تحويل الصوت إلى WAV ثابت
    async fileToWav(file){

      const ctx = new AudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      const sampleRate = 8000;

      const offline = new OfflineAudioContext(
        1,
        audioBuffer.duration * sampleRate,
        sampleRate
      );

      const src = offline.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(offline.destination);
      src.start();

      const rendered = await offline.startRendering();

      return this._toWav(rendered);
    },

    _toWav(buffer){

      const length = buffer.length * 2 + 44;
      const ab = new ArrayBuffer(length);
      const view = new DataView(ab);

      let offset = 0;

      const writeStr = (s) => {
        for (let i = 0; i < s.length; i++) {
          view.setUint8(offset++, s.charCodeAt(i));
        }
      };

      writeStr("RIFF");
      view.setUint32(offset, 36 + buffer.length * 2, true); offset += 4;
      writeStr("WAVE");
      writeStr("fmt ");
      view.setUint32(offset, 16, true); offset += 4;
      view.setUint16(offset, 1, true); offset += 2;
      view.setUint16(offset, 1, true); offset += 2;
      view.setUint32(offset, 8000, true); offset += 4;
      view.setUint32(offset, 16000, true); offset += 4;
      view.setUint16(offset, 2, true); offset += 2;
      view.setUint16(offset, 16, true); offset += 2;
      writeStr("data");
      view.setUint32(offset, buffer.length * 2, true); offset += 4;

      const ch = buffer.getChannelData(0);

      for (let i = 0; i < ch.length; i++) {
        let s = Math.max(-1, Math.min(1, ch[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
      }

      return new Uint8Array(ab);
    },

    // استخراج الصوت من bytes
    bytesToAudio(bytes){

      const blob = new Blob(
        [new Uint8Array(bytes)],
        { type: "audio/wav" }
      );

      return URL.createObjectURL(blob);
    }
  }
};
