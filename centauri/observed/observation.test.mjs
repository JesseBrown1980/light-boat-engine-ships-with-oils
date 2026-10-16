import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {parseFits,normalizeQuantize} from "./fits.mjs";
import {extractLeaves,buildTape,interpolateTape,projectStack,
  pingPongPosition,snapshot,PALETTE} from "./observation-core.mjs";
import {reassembleIndexed,sha256Hex} from "../core.mjs";
const require=createRequire(import.meta.url);
globalThis.qrgen=require("../../vendor/qrgen.min.js");
const {ingestRaw,encodeObservation}=await import("./observation-worker.mjs");

export function fitsFixture(shift=0,stamp="2026-01-01T00:00:00"){
  const w=48,h=48;
  const pixels=new Int16Array(w*h);pixels.fill(2);
  for(const [x0,y0] of [[8,8],[23,8],[33,18],[9,31],[24,31],[39,39]]){
    for(let y=y0-1;y<=y0+1;y++)
      for(let x=x0+shift-1;x<=x0+shift+1;x++)
        if(x>=0&&x<w&&y>=0&&y<h)pixels[y*w+x]=x===x0+shift&&y===y0?1200:300;
  }
  const card=(key,value)=>(
    value===null?key:
    key.padEnd(8)+"= "+(typeof value==="string"?"'"+value+"'":String(value))
  ).padEnd(80," ");
  let head=[
    card("SIMPLE",true),card("BITPIX",16),card("NAXIS",2),
    card("NAXIS1",w),card("NAXIS2",h),
    card("DATE-OBS",stamp),card("TELESCOP","TEST-ONLY"),
    card("OBJECT","SYNTHETIC"),card("END",null)
  ].join("");
  head=head.padEnd(Math.ceil(head.length/2880)*2880," ");
  const raw=new Uint8Array(head.length+Math.ceil(w*h*2/2880)*2880);
  raw.set(new TextEncoder().encode(head));
  const view=new DataView(raw.buffer);
  for(let i=0;i<pixels.length;i++)view.setInt16(head.length+i*2,pixels[i],false);
  return raw.buffer;
}
test("parse real FITS numerical rules: 80-byte cards, BE 16-bit and original header",()=>{
  const data=parseFits(fitsFixture(1),{maxPixels:3000});
  assert.equal(data.width,48);assert.equal(data.height,48);
  assert.equal(data.pixels[8*48+9],1200);
  assert.equal(data.metadata.object,"SYNTHETIC");
  assert.equal(data.metadata.dateObs,"2026-01-01T00:00:00");
  assert.throws(()=>parseFits(new ArrayBuffer(20)),/header/);
  assert.throws(()=>parseFits(fitsFixture(0),{maxPixels:100}),/too large/);
});
test("quantize each image independently, preserving nine quantizer bins",()=>{
  const f=parseFits(fitsFixture());
  const q=normalizeQuantize(f.pixels,48,48);
  assert.equal(q.indices.length,2304);
  assert.equal(q.histogram.reduce((a,b)=>a+b,0),2304);
  assert.equal(q.bins,9);
  assert.equal(PALETTE.length,9);
  assert.ok(extractLeaves(q.indices,48,48).length>=4);
});
test("three different measured frames create x,y,epoch stack, no calculated particles",()=>{
  const input=[0,2,4].map((dx,i)=>{
    const f=parseFits(fitsFixture(dx,"2026-01-0"+(i+1)+"T00:00:00"));
    const q=normalizeQuantize(f.pixels,48,48);
    return {...f,...q,sha256:"test-hash-"+i};
  });
  const tape=buildTape(input);
  assert.equal(tape.frames.length,3);
  assert.equal(tape.axis3,"observation-epoch-not-physical-depth");
  assert.equal(tape.timeMode,"observed-UTC");
  assert.ok(tape.tracking.threeFrameTrackCount>=1);
  const leaves=interpolateTape(tape,0.5);
  assert.equal(leaves.length,tape.tracks.length);
  const pv=projectStack(tape,0.5,{yawDegrees:120});
  assert.equal(pv.length,tape.tracks.length);
  assert.notDeepEqual(pv,projectStack(tape,0.5,{yawDegrees:0}));
  assert.deepEqual(projectStack(tape,0.5),projectStack(tape,0.5));
  assert.equal(pingPongPosition(0,3),0);
  assert.equal(pingPongPosition(3,3),1);
  assert.equal(pingPongPosition(6,3),2);
  assert.equal(pingPongPosition(9,3),1);
  assert.equal(pingPongPosition(12,3),0);
  assert.equal(snapshot(tape,1,4,"2026-01-01T00:00:00Z").viewpoints.length,3);
});
test("different frame dimensions and unsupported images are rejected",()=>{
  const f=parseFits(fitsFixture());
  const q=normalizeQuantize(f.pixels,48,48);
  assert.throws(()=>buildTape([q,q]),/exactly three/);
  assert.throws(()=>buildTape([
    {...q,width:48,height:48},
    {...q,width:48,height:48},
    {...q,width:1,height:2304}]),/different image geometry/);
});
test("actual Web Worker observation ingestion, source SHA and color QR exact roundtrip",async()=>{
  const files=[0,2,4].map((dx,i)=>({
    name:"fixture-"+i+".fits",
    bytes:fitsFixture(dx,"2026-01-0"+(i+1)+"T00:00:00")
  }));
  const original=await sha256Hex(new Uint8Array(files[0].bytes));
  const {tape,observedFrames}=await ingestRaw(files);
  assert.equal(tape.frames[0].rawSha256,original);
  assert.equal(observedFrames.length,3);
  assert.equal(observedFrames[0].pixelRgba.byteLength,48*48*4);
  assert.ok(tape.tracking.threeFrameTrackCount>0);
  const encoded=await encodeObservation(tape,0.5,7,"2026-01-03T01:01:01Z");
  assert.equal(encoded.manifest.inputClass,"uploaded-binary-FITS");
  assert.equal(encoded.manifest.qrImages,Math.ceil(encoded.manifest.chunks/3));
  assert.equal(encoded.manifest.rawHashes.length,3);
  const reconstructed=reassembleIndexed(encoded.packets.map(base64=>({base64})),
    encoded.manifest.bytes,encoded.manifest.chunks);
  assert.equal(await sha256Hex(reconstructed),encoded.manifest.sha256);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(reconstructed)),encoded.frame);
  assert.ok(encoded.images.length>0);
  assert.ok(encoded.images.every(img=>img.rgba.byteLength===img.side*img.side*4));
  assert.notEqual(encoded.frame.axis3,"physical-depth");
});
