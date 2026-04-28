const ALM_CORE = {

  /* =========================
     CHECKSUM
  ========================= */
  checksum(bytes){
    let s = 0;
    for(let b of bytes) s = (s + b) % 1000000007;
    return s;
  },

  /* =========================
     WRITE IMAGE (DYNAMIC SIZE)
  ========================= */
  writeImage(bytes, header, canvas){

    const total = header.payload_offset + bytes.length;
    const size = Math.ceil(Math.sqrt(total));

    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(size,size);
    const data = img.data;

    const write = (p,val)=>{
      const g = 255 - val;
      const i = p * 4;
      data[i]=data[i+1]=data[i+2]=g;
      data[i+3]=255;
    };

    const headerBytes = new TextEncoder().encode(JSON.stringify(header));
    const headerSize = headerBytes.length;

    write(0,(headerSize>>24)&255);
    write(1,(headerSize>>16)&255);
    write(2,(headerSize>>8)&255);
    write(3,headerSize&255);

    for(let i=0;i<headerBytes.length;i++){
      write(4+i,headerBytes[i]);
    }

    const offset = header.payload_offset;

    for(let i=0;i<bytes.length;i++){
      write(offset+i,bytes[i]);
    }

    ctx.putImageData(img,0,0);
  },

  /* =========================
     READ IMAGE
  ========================= */
  readImage(file, callback){

    const img = new Image();

    img.onload = ()=>{

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = img.width;
      canvas.height = img.height;

      ctx.drawImage(img,0,0);

      const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;

      const read = (p)=>255 - data[p*4];

      const headerSize =
        (read(0)<<24) |
        (read(1)<<16) |
        (read(2)<<8) |
        read(3);

      let str = "";
      for(let i=0;i<headerSize;i++){
        str += String.fromCharCode(read(4+i));
      }

      let header;
      try{
        header = JSON.parse(str);
      }catch{
        alert("Header تالف");
        return;
      }

      if(header.magic !== "ALM1"){
        alert("ليست صورة ALM");
        return;
      }

      const bytes = [];
      const offset = header.payload_offset;

      for(let i=0;i<header.length;i++){
        bytes.push(read(offset+i));
      }

      if(ALM_CORE.checksum(bytes) !== header.checksum){
        alert("⚠️ البيانات تالفة");
        return;
      }

      callback(header, new Uint8Array(bytes));
    };

    img.src = URL.createObjectURL(file);
  },

  /* =========================
     AUDIO CORE (PCM)
  ========================= */
  audio: {

    async fileToPCMBytes(file){

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
        sampleRate
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
