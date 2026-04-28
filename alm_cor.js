const ALM = {

  /* =========================
     CHECKSUM
  ========================= */
  checksum(bytes){
    let s = 0;
    for(let b of bytes){
      s = (s + b) % 1000000007;
    }
    return s;
  },

  /* =========================
     CREATE HEADER
  ========================= */
  createHeader(type, encoding, bytes, extra = {}){

    return {
      magic: "ALM1",
      version: "1.0",
      type: type,                 // text | program | audio | file
      encoding: encoding || "",   // utf-8 | wav | bin
      length: bytes.length,
      checksum: this.checksum(bytes),
      payload_offset: 4096,

      // 🔥 extensible
      ...extra
    };
  },

  /* =========================
     WRITE IMAGE
  ========================= */
  writeImage(canvas, bytes, header){

    const size = 512;

    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(size, size);
    const data = img.data;

    const write = (p, val) => {
      const g = 255 - val;
      const i = p * 4;
      data[i] = data[i+1] = data[i+2] = g;
      data[i+3] = 255;
    };

    // header
    const headerBytes = new TextEncoder().encode(JSON.stringify(header));
    const headerSize = headerBytes.length;

    write(0, (headerSize >> 24) & 255);
    write(1, (headerSize >> 16) & 255);
    write(2, (headerSize >> 8) & 255);
    write(3, headerSize & 255);

    for(let i=0;i<headerBytes.length;i++){
      write(4+i, headerBytes[i]);
    }

    // payload
    const offset = header.payload_offset || 4096;

    for(let i=0;i<bytes.length;i++){
      write(offset+i, bytes[i] || 0);
    }

    ctx.putImageData(img,0,0);
  },

  /* =========================
     READ IMAGE
  ========================= */
  readImage(canvas){

    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;

    const read = (p) => 255 - data[p*4];

    // header size
    const headerSize =
      (read(0)<<24) |
      (read(1)<<16) |
      (read(2)<<8) |
      read(3);

    // header string
    let headerStr = "";
    for(let i=0;i<headerSize;i++){
      headerStr += String.fromCharCode(read(4+i));
    }

    let header;
    try {
      header = JSON.parse(headerStr);
    } catch {
      throw new Error("Header تالف");
    }

    if(header.magic !== "ALM1"){
      throw new Error("ليست صورة ALM");
    }

    // payload
    const bytes = [];
    const offset = header.payload_offset || 4096;

    for(let i=0;i<header.length;i++){
      bytes.push(read(offset+i));
    }

    return {
      header,
      bytes: new Uint8Array(bytes)
    };
  }

};
