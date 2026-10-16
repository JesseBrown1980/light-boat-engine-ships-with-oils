/* Off-main-thread QR snapshot encoder. No clock or QR operation belongs to the draw loop. */
import {makeFrame,encodePayload,splitIndexed,reassembleIndexed,sha256Hex} from "./core.mjs";
import "../vendor/qrgen.min.js";

export async function produceCapture(sequence,elapsedSeconds,capturedAtUTC){
  const frame=makeFrame(elapsedSeconds,sequence,capturedAtUTC);
  const bytes=encodePayload(frame);
  const parts=splitIndexed(bytes,300);
  const digest=await sha256Hex(bytes);
  const roundtrip=reassembleIndexed(parts.map(p=>({base64:p.base64})),bytes.length,parts.length);
  if(await sha256Hex(roundtrip)!==digest)throw Error("independent QR transport roundtrip mismatch");
  const manifest={
    schema:"asolaria-centauri-qr-transport-v1",sequence,
    captureUTC:frame.capturedAtUTC,elapsedSeconds:frame.elapsedSeconds,
    measurementClass:frame.measurementClass,
    bytes:bytes.length,chunks:parts.length,images:Math.ceil(parts.length/3),sha256:digest,
    qrChannelOrder:["R","G","B"],indexEndian:"little",maxChunkBodyBytes:300,
    encoding:"base64(uint32LE(index) || raw_chunk)",qrEcc:"LOW",
    wavelengthsNm:frame.wavelengthsNm
  };
  // Use the same ordinary QR specification as the existing Colour QR reader.
  // Each RGB plane is an independent black/white QR at common canvas dimensions.
  const frames=[];
  for(let offset=0;offset<parts.length;offset+=3){
    const group=parts.slice(offset,offset+3);
    const qr=group.map(p=>globalThis.qrgen.QrCode.encodeText(p.base64,globalThis.qrgen.QrCode.Ecc.LOW));
    const side=Math.max(...qr.map(c=>c.size))+8;
    const rgba=new Uint8ClampedArray(side*side*4);
    for(let y=0;y<side;y++)for(let x=0;x<side;x++){
      const p=(y*side+x)*4;
      for(let channel=0;channel<3;channel++){
        const code=qr[channel];
        const start=code?Math.floor((side-code.size)/2):-1;
        const dark=code&&x>=start&&x<start+code.size
          &&y>=start&&y<start+code.size&&code.getModule(x-start,y-start);
        rgba[p+channel]=dark?0:255;
      }
      rgba[p+3]=255;
    }
    frames.push({size:side,rgba:rgba.buffer,chunkIndices:group.map(p=>p.index)});
  }
  return {type:"capture",frame,manifest,images:frames,
    // Packed as base64 indexed payloads for reproducible machine-level tests/readback.
    packets:parts.map(p=>p.base64)};
}
if(typeof self!=="undefined" && typeof self.postMessage==="function"){
  self.onmessage=async ev=>{
    const request=ev.data;
    if(request.type!=="capture")return;
    try{
      const result=await produceCapture(request.sequence,request.elapsedSeconds,request.capturedAtUTC);
      self.postMessage(result,result.images.map(img=>img.rgba));
    }catch(error){
      self.postMessage({type:"error",sequence:request.sequence,message:String(error.message||error)});
    }
  };
}
