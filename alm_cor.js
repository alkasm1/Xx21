const ALM_CORE = {

  crypto: {
    checksum(bytes){
      let s = 0;
      for (let b of bytes) s = (s + b) % 1000000007;
      return s;
    }
  },

  encoding: {

    toBytes(data){
      return new TextEncoder().encode(data);
    },

    toText(bytes){
      return new TextDecoder().decode(new Uint8Array(bytes));
    }

  },

  audio: {

    async fileToWav(file){
      const ctx = new AudioContext();
      const buffer = await file.arrayBuffer();
      const audio = await ctx.decodeAudioData(buffer);

      const offline = new OfflineAudioContext(
        1,
        audio.duration * 8000,
        8000
      );

      const src = offline.createBufferSource();
      src.buffer = audio;
      src.connect(offline.destination);
      src.start();

      const rendered = await offline.startRendering();

      return ALM_CORE.audio.bufferToWav(rendered);
    },

    bufferToWav(buffer){
      const length = buffer.length * 2 + 44;
      const arrayBuffer = new ArrayBuffer(length);
      const view = new DataView(arrayBuffer);

      let offset = 0;

      const write = s => {
        for (let i = 0; i < s.length; i++)
          view.setUint8(offset++, s.charCodeAt(i));
      };

      write("RIFF");
      view.setUint32(offset, 36 + buffer.length * 2, true); offset += 4;
      write("WAVE");
      write("fmt ");
      view.setUint32(offset, 16, true); offset += 4;
      view.setUint16(offset, 1, true); offset += 2;
      view.setUint16(offset, 1, true); offset += 2;
      view.setUint32(offset, 8000, true); offset += 4;
      view.setUint32(offset, 16000, true); offset += 4;
      view.setUint16(offset, 2, true); offset += 2;
      view.setUint16(offset, 16, true); offset += 2;
      write("data");
      view.setUint32(offset, buffer.length * 2, true); offset += 4;

      const ch = buffer.getChannelData(0);

      for (let i = 0; i < ch.length; i++) {
        let s = Math.max(-1, Math.min(1, ch[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
      }

      return new Uint8Array(arrayBuffer);
    }
  }
};
