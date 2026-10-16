/* Ingestion/quantization/QR occur off the display thread.
 * The display never requests a particle-by-particle or n-body calculation.
 */
import {parseFits,normalizeQuantize} from "./fits.mjs";
import {PALETTE,buildTape,snapshot} from "./observation-core.mjs";
import {splitIndexed,reassembleIndexed,sha256Hex} from "../core.mjs";
import "../../vendor/qrgen.min.js";
let tape=null;
const rgb=PALETTE.map(h=>[1,3,5].map(o=>parseInt(h.slice(o,o+2),16)));
function quantizedRgba(indices,width,height){
  const out=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<indices.length;i++){
    const c=rgb[indices[i]],at=4*i;
    out[at]=c[0];out[at+1]=c[1];out[at+2]=c[2];out[at+3]=255;
  }
  return out;
}
export async function ingestRaw(files){
  if(!Array.isArray(files)||files.length!==3)throw Error("select exactly three independent FITS observation files");
  const observations=[];
  for(const input of files){
    if(!(input.bytes instanceof ArrayBuffer))throw Error("missing original FITS binary file");
    const rawSha256=await sha256Hex(new Uint8Array(input.bytes));
    const image=parseFits(input.bytes,{maxPixels:4000000});
    const quantized=normalizeQuantize(image.pixels,image.width,image.height);
    observations.push({...image,...quantized,name:input.name,sha256:rawSha256,
      dateObs:image.metadata.dateObs});
  }
  const model=buildTape(observations);
  const outputs=observations.map(o=>({
    width:o.width,height:o.height,source:o.name,rawSha256:o.sha256,
    histogram:o.histogram,dateObs:o.dateObs,
    pixelRgba:quantizedRgba(o.indices,o.width,o.height).buffer
  }));
  return {tape:model,observedFrames:outputs};
}
export async function encodeObservation(tapeValue,position,frameNumber,capturedAtUTC){
  if(!tapeValue)throw Error("raw observation tape has not been loaded");
  const frame=snapshot(tapeValue,position,frameNumber,capturedAtUTC);
  const bytes=new TextEncoder().encode(JSON.stringify(frame));
  const parts=splitIndexed(bytes,300);
  const digest=await sha256Hex(bytes);
  const roundtrip=reassembleIndexed(parts,bytes.length,parts.length);
  if(digest!==await sha256Hex(roundtrip))throw Error("QR indexed transport roundtrip mismatch");
  const images=[];
  for(let offset=0;offset<parts.length;offset+=3){
    const group=parts.slice(offset,offset+3);
    const codes=group.map(p=>globalThis.qrgen.QrCode.encodeText(p.base64,
      globalThis.qrgen.QrCode.Ecc.LOW));
    const side=Math.max(...codes.map(c=>c.size))+8;
    const rgba=new Uint8ClampedArray(side*side*4);
    for(let y=0;y<side;y++)for(let x=0;x<side;x++){
      const at=(y*side+x)*4;
      for(let channel=0;channel<3;channel++){
        const code=codes[channel];
        const start=code?Math.floor((side-code.size)/2):-1;
        const dark=code&&x>=start&&y>=start&&x<start+code.size&&y<start+code.size
          &&code.getModule(x-start,y-start);
        rgba[at+channel]=dark?0:255;
      }
      rgba[at+3]=255;
    }
    images.push({side,rgba:rgba.buffer,chunkIndices:group.map(p=>p.index)});
  }
  return {
    type:"snapshot",frame,
    manifest:{
      format:"asolaria-observed-qr-v1",
      inputClass:"uploaded-binary-FITS",
      rawHashes:tapeValue.frames.map(f=>f.rawSha256),
      bytes:bytes.length,chunks:parts.length,sha256:digest,
      qrImages:images.length,
      spectralStatus:"intensity-pseudocolor; FITS filter metadata retained",
      reconstructionClass:"x-y-observation-epoch",
      capturedAtUTC,frameNumber
    },
    images,packets:parts.map(p=>p.base64)
  };
}
if(typeof self!=="undefined"&&typeof self.postMessage==="function"){
  self.onmessage=async event=>{
    const m=event.data;
    try{
      if(m.type==="load"){
        const result=await ingestRaw(m.files);
        tape=result.tape;
        self.postMessage({type:"ready",...result},result.observedFrames.map(f=>f.pixelRgba));
      }else if(m.type==="snapshot"){
        const result=await encodeObservation(tape,m.position,m.frameNumber,m.capturedAtUTC);
        self.postMessage(result,result.images.map(x=>x.rgba));
      }
    }catch(error){
      self.postMessage({type:"error",operation:m.type,message:String(error?.message||error)});
    }
  };
}
