import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {parseFits,normalizeQuantize} from "./fits.mjs";
import {extractLeaves} from "./observation-core.mjs";
const file=process.argv[2];
if(!file)throw Error("Usage: node nasa-fits-smoke.mjs /path/to/nasa-source.fits");
const bytes=readFileSync(file);
if(bytes.byteLength<2880)throw Error("NASA archive FITS appears empty");
const arraybuffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const image=parseFits(arraybuffer,{maxPixels:4000000});
const quantized=normalizeQuantize(image.pixels,image.width,image.height);
const leaves=extractLeaves(quantized.indices,image.width,image.height);
if(image.width<20||image.height<20||quantized.histogram.reduce((a,b)=>a+b,0)!==image.width*image.height)
  throw Error("real NASA FITS decoded pixels have invalid dimensions");
console.log(JSON.stringify({
  marker:"NASA_RAW_FITS_OBSERVATION_INGEST_PASS",
  sha256:createHash("sha256").update(bytes).digest("hex"),
  sourceURL:"https://science.data.nasa.gov/sites/default/files/2026-06/hst-wfpc-II-800-800-4.fits",
  bytes:bytes.length,dimensions:[image.width,image.height],
  plane:image.plane,planes:image.planeCount,bitpix:image.bitpix,
  telescope:image.metadata.telescope,
  object:image.metadata.object,observationTime:image.metadata.dateObs,
  histogram:quantized.histogram,selectedLeaves:leaves.length,
  limitation:"Single real HST sample is not three distinct Centauri epochs; no astronomical motion inferred."
},null,2));
