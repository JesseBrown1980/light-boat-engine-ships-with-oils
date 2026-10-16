/* Asolaria freeze/play synthetic field fixture.
 * These are normalized test orbits, NOT measured Alpha Centauri ephemerides.
 * Model time is not CPU time, stellar observation time, or physical elapsed time.
 */
export const INTERVAL_SECONDS = 600;
export const WAVELENGTHS_NM = Object.freeze([380,425,470,515,560,605,650,695,740]);
export const VIEWS = Object.freeze([
  {id:"projection-0",yawDeg:0,pitchDeg:15},
  {id:"projection-1",yawDeg:120,pitchDeg:15},
  {id:"projection-2",yawDeg:240,pitchDeg:15}
]);
const BODIES = [
  {id:"alpha-centauri-a",base:[-0.35,0.1,0],radius:0.21,period:42,phase:0,peak:560},
  {id:"alpha-centauri-b",base:[0.35,-0.1,0],radius:0.21,period:42,phase:Math.PI,peak:650},
  {id:"proxima-centauri",base:[0.0,0.40,0.52],radius:0.08,period:143,phase:1.2,peak:695}
];
const round = n => Math.round(n*1000000)/1000000;
function spectrum(peak){
  const values=WAVELENGTHS_NM.map(w=>Math.exp(-Math.pow((w-peak)/105,2)));
  const sum=values.reduce((a,b)=>a+b,0);
  return values.map(n=>round(n/sum));
}
export function fieldAt(elapsedSeconds){
  if(!Number.isFinite(elapsedSeconds)||elapsedSeconds<0)throw Error("invalid elapsed seconds");
  return BODIES.map(b=>{
    const theta=(elapsedSeconds % b.period)/b.period*2*Math.PI+b.phase;
    return {id:b.id,
      xyz:[round(b.base[0]+b.radius*Math.cos(theta)),
           round(b.base[1]+b.radius*Math.sin(theta)*0.8),
           round(b.base[2]+b.radius*Math.sin(theta)*0.45)],
      spectralBins:spectrum(b.peak)};
  });
}
export function project(point,view){
  const yaw=view.yawDeg*Math.PI/180, pitch=view.pitchDeg*Math.PI/180;
  const [x,y,z]=point, xx=x*Math.cos(yaw)+z*Math.sin(yaw);
  const zz=-x*Math.sin(yaw)+z*Math.cos(yaw);
  return [round(xx),round(y*Math.cos(pitch)-zz*Math.sin(pitch)),round(y*Math.sin(pitch)+zz*Math.cos(pitch))];
}
export function makeFrame(elapsedSeconds,sequence,utcISOString){
  if(!Number.isSafeInteger(sequence)||sequence<0)throw Error("invalid frame sequence");
  if(!Number.isFinite(Date.parse(utcISOString)))throw Error("invalid UTC timestamp");
  const sources=fieldAt(elapsedSeconds);
  return {format:"asolaria-centauri-freeze-play-v1",
    measurementClass:"synthetic-mathematical-fixture-NOT-telescope-data",
    sequence,elapsedSeconds:round(elapsedSeconds),
    capturedAtUTC:new Date(utcISOString).toISOString(),
    wavelengthsNm:WAVELENGTHS_NM,
    cameras:VIEWS.map(v=>({...v})),
    projections:VIEWS.map(v=>({
      view:v.id,
      sources:sources.map(b=>({id:b.id,xyDepth:project(b.xyz,v),spectralBins:b.spectralBins}))
    })),
    constraint:"three virtual camera projections of a known synthetic field; not independent astrophysical observations"
  };
}
export function encodePayload(frame){return new TextEncoder().encode(JSON.stringify(frame));}
export function splitIndexed(bytes,maxBody=300){
  if(!(bytes instanceof Uint8Array)||!bytes.length||!Number.isSafeInteger(maxBody)||maxBody<1||maxBody>2100)throw Error("invalid payload or chunk size");
  const result=[];
  for(let offset=0,index=0;offset<bytes.length;offset+=maxBody,index++){
    const body=bytes.slice(offset,offset+maxBody),packet=new Uint8Array(body.length+4);
    new DataView(packet.buffer).setUint32(0,index,true);packet.set(body,4);
    // Browser Worker and Node 22 both expose btoa.
    let binary="";for(const b of packet)binary+=String.fromCharCode(b);
    result.push({index,body,base64:btoa(binary)});
  }
  return result;
}
export function reassembleIndexed(encoded,expectedBytes,expectedChunks){
  if(!Array.isArray(encoded)||!Number.isSafeInteger(expectedChunks)||expectedChunks<1
    ||encoded.length!==expectedChunks||!Number.isSafeInteger(expectedBytes)||expectedBytes<1)
    throw Error("missing or unexpected QR chunks");
  const parts=new Array(expectedChunks),seen=new Set();
  for(const item of encoded){
    const data=Uint8Array.from(atob(item.base64),c=>c.charCodeAt(0));
    if(data.length<5)throw Error("truncated QR chunk");
    const idx=new DataView(data.buffer,data.byteOffset,data.byteLength).getUint32(0,true);
    if(idx>=expectedChunks||seen.has(idx))throw Error("duplicate or invalid chunk index");
    seen.add(idx);parts[idx]=data.subarray(4);
  }
  if(parts.some(p=>!p))throw Error("missing QR index");
  const joined=new Uint8Array(expectedBytes);let offset=0;
  for(const part of parts){
    if(offset+part.length>expectedBytes)throw Error("payload overflow");
    joined.set(part,offset);offset+=part.length;
  }
  if(offset!==expectedBytes)throw Error("payload length mismatch");
  return joined;
}
export async function sha256Hex(bytes){
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join("");
}
export async function verifyFrame(frame,packets,manifest){
  const bytes=reassembleIndexed(packets,manifest.bytes,manifest.chunks);
  if(await sha256Hex(bytes)!==manifest.sha256)throw Error("snapshot SHA-256 mismatch");
  const reconstructed=JSON.parse(new TextDecoder().decode(bytes));
  if(reconstructed.sequence!==frame.sequence||reconstructed.format!==frame.format)throw Error("frame identity mismatch");
  if(JSON.stringify(reconstructed)!==JSON.stringify(frame))throw Error("frame not byte-exact");
  return true;
}
