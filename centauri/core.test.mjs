import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fieldAt,project,VIEWS,WAVELENGTHS_NM,makeFrame,encodePayload,splitIndexed,reassembleIndexed,sha256Hex,verifyFrame} from "./core.mjs";
const require=createRequire(import.meta.url);
const {QrCode}=require("../vendor/qrgen.min.js");
function fixture(){
  return makeFrame(600,7,"2026-10-15T13:37:00.000Z");
}
test("three source functions and nine preserved spectral wavelengths",()=>{
  const src=fieldAt(600);
  assert.equal(src.length,3);assert.equal(VIEWS.length,3);
  assert.equal(WAVELENGTHS_NM.length,9);
  for(const b of src){
    assert.equal(b.xyz.length,3);
    assert.equal(b.spectralBins.length,9);
    assert.ok(Math.abs(b.spectralBins.reduce((a,c)=>a+c,0)-1)<0.00001);
  }
  assert.throws(()=>fieldAt(-1),/invalid elapsed/);
  assert.throws(()=>fieldAt(Infinity),/invalid elapsed/);
});
test("deterministic direct field projection and three independent virtual cameras",()=>{
  const f=fixture();
  assert.equal(f.projections.length,3);
  for(const p of f.projections)assert.equal(p.sources.length,3);
  const a=JSON.stringify(f),b=JSON.stringify(fixture());
  assert.equal(a,b);
  const pos=fieldAt(600)[0].xyz;
  assert.notDeepEqual(project(pos,VIEWS[0]),project(pos,VIEWS[1]));
  assert.notDeepEqual(project(pos,VIEWS[1]),project(pos,VIEWS[2]));
  assert.equal(f.measurementClass,"synthetic-mathematical-fixture-NOT-telescope-data");
});
test("all QR indexed chunks roundtrip in reverse order with expected digest",async()=>{
  const frame=fixture(),bytes=encodePayload(frame);
  const chunks=splitIndexed(bytes,300);
  assert.ok(chunks.length>3);
  const reversed=chunks.toReversed();
  assert.deepEqual(reassembleIndexed(reversed,bytes.length,chunks.length),bytes);
  const manifest={bytes:bytes.length,chunks:chunks.length,sha256:await sha256Hex(bytes)};
  assert.equal(await verifyFrame(frame,reversed,manifest),true);
});
test("reject missing chunk, duplicate index, changed data, corrupted manifest and byte length",async()=>{
  const frame=fixture(),bytes=encodePayload(frame),chunks=splitIndexed(bytes,300);
  const manifest={bytes:bytes.length,chunks:chunks.length,sha256:await sha256Hex(bytes)};
  assert.throws(()=>reassembleIndexed(chunks.slice(1),bytes.length,chunks.length),/missing or unexpected/);
  assert.throws(()=>reassembleIndexed([chunks[0],chunks[0],...chunks.slice(2)],bytes.length,chunks.length),/duplicate/);
  assert.throws(()=>reassembleIndexed(chunks,bytes.length+1,chunks.length),/payload length/);
  assert.rejects(()=>verifyFrame(frame,chunks,{...manifest,sha256:"0".repeat(64)}),/SHA-256 mismatch/);
  const tampered=chunks.map(p=>({...p}));
  const altered=Uint8Array.from(atob(tampered[0].base64),c=>c.charCodeAt(0));
  altered[5]^=1;
  tampered[0].base64=btoa(String.fromCharCode(...altered));
  assert.rejects(()=>verifyFrame(frame,tampered,manifest),/SHA-256 mismatch/);
});
test("real ordinary QR generator can hold indexed payload and supports three independent channels",()=>{
  const bytes=encodePayload(fixture()),chunks=splitIndexed(bytes,300);
  const codes=chunks.slice(0,3).map(x=>QrCode.encodeText(x.base64,QrCode.Ecc.LOW));
  for(const qr of codes){
    assert.ok(qr.size>=21 && qr.size<=177);
    assert.equal(typeof qr.getModule(0,0),"boolean");
    assert.ok(qr.getModule(3,3)); // center of QR top-left finder
  }
});
test("synthetic time sampling is direct: no iterative catch-up required",()=>{
  const x=fieldAt(1e9),y=fieldAt(1e9);
  assert.deepEqual(x,y);assert.equal(x.length,3);
});
