// =========================
// ALM CORE (مشترك)
// =========================

const ALM = {

  checksum(bytes){
    let s = 0;
    for(let b of bytes) s = (s + b) % 1000000007;
    return s;
  },

  writeImage(bytes, header, canvas){

    const size = 512;

    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(size, size);
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

    const offset = header.payload_offset || 4096;

    for(let i=0;i<bytes.length;i++){
      write(offset+i,bytes[i]);
    }

    ctx.putImageData(img,0,0);
  },

  readImage(file, callback){

    const img = new Image();

    img.onload = ()=>{

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = img.width;
      canvas.height = img.height;

      ctx.drawImage(img,0,0);

      const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;

      const read = (p)=>255-data[p*4];

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
      try {
        header = JSON.parse(str);
      } catch {
        alert("Header تالف");
        return;
      }

      if(header.magic !== "ALM1"){
        alert("ليست صورة ALM");
        return;
      }

      const bytes = [];
      const offset = header.payload_offset || 4096;

      for(let i=0;i<header.length;i++){
        bytes.push(read(offset+i));
      }

      if(ALM.checksum(bytes) !== header.checksum){
        alert("⚠️ البيانات تالفة");
        return;
      }

      callback(header, new Uint8Array(bytes));
    };

    img.src = URL.createObjectURL(file);
  }

};
