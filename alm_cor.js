const ALM_CORE = {

  audio: {

    async fileToPCMBytes(file){

      const ctx = new AudioContext();
      const buf = await file.arrayBuffer();
      const audio = await ctx.decodeAudioData(buf);

      const offline = new OfflineAudioContext(
        1,
        audio.length,
        audio.sampleRate
      );

      const src = offline.createBufferSource();
      src.buffer = audio;
      src.connect(offline.destination);
      src.start();

      const rendered = await offline.startRendering();

      const channel = rendered.getChannelData(0);

      const bytes = new Uint8Array(channel.length * 2);

      let j = 0;

      for (let i = 0; i < channel.length; i++) {

        let s = Math.max(-1, Math.min(1, channel[i]));

        let v = s < 0 ? s * 0x8000 : s * 0x7FFF;

        bytes[j++] = v & 255;
        bytes[j++] = (v >> 8) & 255;
      }

      return {
        bytes,
        sampleRate: rendered.sampleRate
      };
    },

    pcmBytesToAudio(bytes, sampleRate){

      const samples = bytes.length / 2;
      const buffer = new ArrayBuffer(44 + samples * 2);
      const view = new DataView(buffer);

      let o = 0;

      const write = s => {
        for (let i = 0; i < s.length; i++)
          view.setUint8(o++, s.charCodeAt(i));
      };

      write("RIFF");
      view.setUint32(o, 36 + samples * 2, true); o += 4;
      write("WAVE");
      write("fmt ");
      view.setUint32(o, 16, true); o += 4;
      view.setUint16(o, 1, true); o += 2;
      view.setUint16(o, 1, true); o += 2;
      view.setUint32(o, sampleRate, true); o += 4;
      view.setUint32(o, sampleRate * 2, true); o += 4;
      view.setUint16(o, 2, true); o += 2;
      view.setUint16(o, 16, true); o += 2;
      write("data");
      view.setUint32(o, samples * 2, true); o += 4;

      for (let i = 0; i < bytes.length; i += 2) {
        let v = bytes[i] | (bytes[i + 1] << 8);
        view.setInt16(o, v, true);
        o += 2;
      }

      return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    }
  }
};
