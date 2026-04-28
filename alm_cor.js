const ALM_CORE = {

  audio: {

    async fileToBytes(file){

      const ctx = new AudioContext();
      const buf = await file.arrayBuffer();
      const audio = await ctx.decodeAudioData(buf);

      const sampleRate = 8000;

      const offline = new OfflineAudioContext(
        1,
        audio.duration * sampleRate,
        sampleRate
      );

      const src = offline.createBufferSource();
      src.buffer = audio;
      src.connect(offline.destination);
      src.start();

      const rendered = await offline.startRendering();
      const channel = rendered.getChannelData(0);

      const pcm = new Uint8Array(channel.length * 2);

      let j = 0;

      for (let i = 0; i < channel.length; i++) {
        let s = Math.max(-1, Math.min(1, channel[i]));
        let v = s < 0 ? s * 0x8000 : s * 0x7FFF;

        pcm[j++] = v & 255;
        pcm[j++] = (v >> 8) & 255;
      }

      // 🔥 إضافة Header
      const totalLength = pcm.length;

      const header = new Uint8Array(8);

      const view = new DataView(header.buffer);

      view.setUint32(0, totalLength, true);
      view.setUint32(4, sampleRate, true);

      // دمج
      const final = new Uint8Array(8 + pcm.length);
      final.set(header, 0);
      final.set(pcm, 8);

      return final;
    },

    bytesToAudio(bytes){

      const view = new DataView(bytes.buffer);

      const length = view.getUint32(0, true);
      const sampleRate = view.getUint32(4, true);

      const pcm = bytes.slice(8, 8 + length);

      const samples = pcm.length / 2;

      const buffer = new ArrayBuffer(44 + samples * 2);
      const dv = new DataView(buffer);

      let o = 0;

      const write = s => {
        for (let i = 0; i < s.length; i++)
          dv.setUint8(o++, s.charCodeAt(i));
      };

      write("RIFF");
      dv.setUint32(o, 36 + samples * 2, true); o += 4;
      write("WAVE");
      write("fmt ");
      dv.setUint32(o, 16, true); o += 4;
      dv.setUint16(o, 1, true); o += 2;
      dv.setUint16(o, 1, true); o += 2;
      dv.setUint32(o, sampleRate, true); o += 4;
      dv.setUint32(o, sampleRate * 2, true); o += 4;
      dv.setUint16(o, 2, true); o += 2;
      dv.setUint16(o, 16, true); o += 2;
      write("data");
      dv.setUint32(o, samples * 2, true); o += 4;

      for (let i = 0; i < pcm.length; i += 2) {
        let v = pcm[i] | (pcm[i + 1] << 8);
        dv.setInt16(o, v, true);
        o += 2;
      }

      return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
    }
  }
};
