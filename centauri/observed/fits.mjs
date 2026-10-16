/* FITS image reader: parses original instrument bytes, not rendered display photos.
 * Supports primary and IMAGE-extension 2D images and first plane of 3D images.
 * Raw bytes must be retained outside this decoder for provenance checks.
 * Follows FITS 80-character cards and 2880-byte block alignment.
 */
const BLOCK=2880;
const supported=new Set([8,16,32,64,-32,-64]);
const padded=n=>Math.ceil(n/BLOCK)*BLOCK;
function safeMultiply(a,b){
  const c=a*b;
  if(!Number.isSafeInteger(c)||c<0)throw Error("FITS dimension overflow");
  return c;
}
export function parseFits(buffer,{plane=0,maxPixels=16000000}={}){
  if(!(buffer instanceof ArrayBuffer))throw Error("expected raw FITS ArrayBuffer");
  if(!Number.isSafeInteger(plane)||plane<0)throw Error("invalid FITS plane");
  const bytes=new Uint8Array(buffer),view=new DataView(buffer),decoder=new TextDecoder("ascii");
  if(bytes.byteLength<BLOCK)throw Error("FITS file shorter than header block");
  let offset=0,hdu=0,firstMeta=null;
  while(offset+80<=bytes.length&&hdu<64){
    const header={};let ended=false;let cardOffset=offset;
    while(cardOffset+80<=bytes.length){
      const card=decoder.decode(bytes.subarray(cardOffset,cardOffset+80));
      const key=card.slice(0,8).trim();
      cardOffset+=80;
      if(key==="END"){ended=true;break;}
      if(card[8]!=="=")continue;
      let value=card.slice(10).split("/")[0].trim();
      if(value.startsWith("'")){
        const match=value.match(/^'((?:[^']|'')*)'/);
        if(match)value=match[1].replace(/''/g,"'");
      }else if(value==="T")value=true;
      else if(value==="F")value=false;
      else if(value!==""&&Number.isFinite(Number(value.replace(/D/i,"E"))))
        value=Number(value.replace(/D/i,"E"));
      header[key]=value;
    }
    if(!ended)throw Error("FITS END header card missing");
    if(!firstMeta)firstMeta=header;
    const dataOffset=offset+padded(cardOffset-offset);
    if(dataOffset>bytes.length)throw Error("FITS truncated header");
    const naxis=header.NAXIS;
    if(!Number.isSafeInteger(naxis)||naxis<0||naxis>9)throw Error("unsupported FITS axis count");
    const dims=[];
    for(let i=1;i<=naxis;i++){
      const n=header["NAXIS"+i];
      if(!Number.isSafeInteger(n)||n<0)throw Error("invalid FITS NAXIS"+i);
      dims.push(n);
    }
    const bitpix=header.BITPIX;
    if(!supported.has(bitpix))throw Error("unsupported FITS BITPIX "+bitpix);
    let elements=naxis===0?0:1;
    for(const n of dims)elements=safeMultiply(elements,n);
    const pcount=Number(header.PCOUNT||0),gcount=Number(header.GCOUNT||1);
    if(!Number.isSafeInteger(pcount)||pcount<0||!Number.isSafeInteger(gcount)||gcount<1)
      throw Error("invalid FITS PCOUNT or GCOUNT");
    const logicalBytes=safeMultiply(safeMultiply(elements+pcount,gcount),Math.abs(bitpix)/8);
    if(dataOffset+logicalBytes>bytes.length)throw Error("FITS truncated image data");
    const isImage=(hdu===0||String(header.XTENSION||"").trim()==="IMAGE");
    if(isImage&&naxis>=2&&dims[0]>0&&dims[1]>0){
      const [width,height]=dims,pixels=safeMultiply(width,height);
      if(pixels>maxPixels)throw Error("FITS frame too large for interactive ingestion");
      const planeCount=dims.slice(2).reduce((a,b)=>safeMultiply(a,b),1);
      if(plane>=planeCount)throw Error("requested FITS plane absent");
      const start=dataOffset+plane*pixels*Math.abs(bitpix)/8;
      const scale=Number(header.BSCALE??1),zero=Number(header.BZERO??0);
      if(!Number.isFinite(scale)||!Number.isFinite(zero))throw Error("invalid FITS BSCALE/BZERO");
      const out=new Float32Array(pixels);
      for(let i=0;i<pixels;i++){
        const at=start+i*Math.abs(bitpix)/8;
        let value;
        switch(bitpix){
          case 8:value=view.getUint8(at);break;
          case 16:value=view.getInt16(at,false);break;
          case 32:value=view.getInt32(at,false);break;
          case 64:value=Number(view.getBigInt64(at,false));break;
          case -32:value=view.getFloat32(at,false);break;
          case -64:value=view.getFloat64(at,false);break;
        }
        const scaled=value*scale+zero;
        out[i]=Number.isFinite(scaled)?scaled:NaN;
      }
      return {width,height,pixels:out,plane,planeCount,bitpix,hdu,
        metadata:{
          dateObs:header["DATE-OBS"]||firstMeta?.["DATE-OBS"]||null,
          timeObs:header["TIME-OBS"]||null,
          object:header.OBJECT||firstMeta?.OBJECT||null,
          filter:header.FILTER||header.FILTER1||header.FILTER2||null,
          telescope:header.TELESCOP||firstMeta?.TELESCOP||null,
          instrument:header.INSTRUME||firstMeta?.INSTRUME||null,
          ctype1:header.CTYPE1||null,ctype2:header.CTYPE2||null,
          crval1:header.CRVAL1??null,crval2:header.CRVAL2??null,
          cdelt1:header.CDELT1??null,cdelt2:header.CDELT2??null
        }};
    }
    const next=dataOffset+padded(logicalBytes);
    if(next<=offset)throw Error("nonprogressing FITS HDU");
    offset=next;hdu++;
  }
  throw Error("no supported 2D FITS IMAGE found");
}
export function normalizeQuantize(pixels,width,height,bins=9){
  if(pixels.length!==width*height||bins<2||bins>256)
    throw Error("invalid pixel dimensions or quantizer bins");
  const samples=[];
  const stride=Math.max(1,Math.floor(pixels.length/8192));
  for(let i=0;i<pixels.length;i+=stride)if(Number.isFinite(pixels[i]))samples.push(pixels[i]);
  if(samples.length<2)throw Error("not enough finite observation pixels");
  samples.sort((a,b)=>a-b);
  const lo=samples[Math.floor((samples.length-1)*0.01)];
  const hi=samples[Math.floor((samples.length-1)*0.995)];
  const spread=Math.max(hi-lo,Number.EPSILON);
  const indices=new Uint8Array(pixels.length),histogram=Array(bins).fill(0);
  for(let i=0;i<pixels.length;i++){
    const v=Number.isFinite(pixels[i])?pixels[i]:lo;
    const q=Math.min(bins-1,Math.max(0,Math.floor((v-lo)/spread*(bins-1)+1e-9)));
    indices[i]=q;histogram[q]++;
  }
  return {indices,histogram,range:[lo,hi],bins};
}
