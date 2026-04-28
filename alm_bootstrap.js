// =========================
// AUDIO → ALM
// =========================

async function compressAudio(file){

  const ctx = new AudioContext();
  const buf = await ctx.decodeAudioData(await file.arrayBuffer());

  const sampleRate = 8000;

  const offline = new OfflineAudioContext(1, buf.duration*sampleRate, sampleRate);

  const src = offline.createBufferSource();
  src.buffer = buf;
  src.connect(offline.destination);
  src.start();

  const rendered = await offline.startRendering();

  return bufferToWav(rendered);
}

function bufferToWav(buffer){

  const length = buffer.length*2+44;
  const arr = new ArrayBuffer(length);
  const view = new DataView(arr);

  let offset=0;

  function writeString(s){
    for(let i=0;i<s.length;i++) view.setUint8(offset++,s.charCodeAt(i));
  }

  writeString("RIFF");
  view.setUint32(offset,36+buffer.length*2,true); offset+=4;
  writeString("WAVEfmt ");
  view.setUint32(offset,16,true); offset+=4;
  view.setUint16(offset,1,true); offset+=2;
  view.setUint16(offset,1,true); offset+=2;
  view.setUint32(offset,buffer.sampleRate,true); offset+=4;
  view.setUint32(offset,buffer.sampleRate*2,true); offset+=4;
  view.setUint16(offset,2,true); offset+=2;
  view.setUint16(offset,16,true); offset+=2;
  writeString("data");
  view.setUint32(offset,buffer.length*2,true); offset+=4;

  const ch = buffer.getChannelData(0);

  for(let i=0;i<ch.length;i++){
    let s=Math.max(-1,Math.min(1,ch[i]));
    view.setInt16(offset,s<0?s*0x8000:s*0x7FFF,true);
    offset+=2;
  }

  return new Uint8Array(arr);
}

// =========================
// ENCODE
// =========================
async function encode(){

  const file = document.getElementById("audioInput").files[0];
  if(!file) return alert("اختر صوت");

  const wav = await compressAudio(file);

  const header = {
    magic:"ALM1",
    type:"audio",
    length:wav.length,
    checksum:ALM.checksum(wav),
    sampleRate:8000,
    payload_offset:4096
  };

  const canvas = document.getElementById("canvas");

  ALM.writeImage(wav, header, canvas);

  alert("✔ تم التحويل");
}

// =========================
// SAVE
// =========================
function saveImage(){
  const canvas = document.getElementById("canvas");

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "alm-audio.png";
  a.click();
}

// =========================
// DECODE
// =========================
function decode(){

  const file = document.getElementById("imageInput").files[0];
  if(!file) return alert("اختر صورة");

  ALM.readImage(file,(header,bytes)=>{

    if(header.type !== "audio"){
      alert("ليست بيانات صوت");
      return;
    }

    const blob = new Blob([bytes], {type:"audio/wav"});
    const url = URL.createObjectURL(blob);

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = url;

    const out = document.getElementById("output");
    out.innerHTML = "";
    out.appendChild(audio);
  });
}
