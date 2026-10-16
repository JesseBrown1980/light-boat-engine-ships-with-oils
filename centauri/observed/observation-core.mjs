/* Observe -> quantize -> identify measured leaves -> stack x,y,t -> reproject.
 * No individual particle simulations, n-body integration or manufactured sky data.
 * Depth axis of this tape is OBSERVATION TIME, not inferred physical distance.
 */
export const PALETTE=["#5a00a8","#6030ee","#245aff","#00a7ee","#00d4ad",
 "#b5eb3a","#ffbf2b","#ff7932","#ed2745"];
const round=n=>Math.round(n*1e5)/1e5;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
export function extractLeaves(indices,width,height,{tile=8,maxLeaves=243,threshold=5}={}){
  if(!(indices instanceof Uint8Array)||indices.length!==width*height)
    throw Error("invalid quantized image");
  if(tile<2||maxLeaves<1)throw Error("invalid feature settings");
  const pool=[];
  for(let y0=0;y0<height;y0+=tile)for(let x0=0;x0<width;x0+=tile){
    let value=-1,xBest=x0,yBest=y0;
    for(let y=y0;y<Math.min(height,y0+tile);y++)
      for(let x=x0;x<Math.min(width,x0+tile);x++){
        const v=indices[y*width+x];
        if(v>value){value=v;xBest=x;yBest=y;}
      }
    if(value>=threshold)pool.push({x:xBest,y:yBest,intensityBin:value});
  }
  pool.sort((a,b)=>b.intensityBin-a.intensityBin||a.y-b.y||a.x-b.x);
  return pool.slice(0,maxLeaves);
}
function median(values){
  if(!values.length)return 0;
  const ordered=values.slice().sort((a,b)=>a-b);
  return ordered[Math.floor(ordered.length/2)];
}
function framePair(first,second,maxShift){
  // Correspondences are hypotheses until WCS registration/calibration is available.
  const used=new Set(),matched=[];
  const motions=[];
  for(const a of first.slice(0,Math.min(27,first.length))){
    let candidate=null,score=Infinity;
    for(let j=0;j<second.length;j++){
      const b=second[j],dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;
      if(d2<score){score=d2;candidate={a,b};}
    }
    if(candidate&&score<maxShift*maxShift)motions.push([candidate.b.x-a.x,candidate.b.y-a.y]);
  }
  const dx=median(motions.map(p=>p[0])),dy=median(motions.map(p=>p[1]));
  for(const a of first){
    let best=-1,bestScore=maxShift*maxShift;
    for(let j=0;j<second.length;j++){
      if(used.has(j))continue;
      const b=second[j],vx=b.x-a.x-dx,vy=b.y-a.y-dy;
      const score=vx*vx+vy*vy+Math.abs(b.intensityBin-a.intensityBin)*2;
      if(score<bestScore){bestScore=score;best=j;}
    }
    if(best!==-1){used.add(best);matched.push({a,b:second[best]});}
  }
  return {matched,estimatedRegistrationPx:[dx,dy]};
}
export function buildTape(frames,{maxLeaves=243,maxShiftPx=25}={}){
  if(!Array.isArray(frames)||frames.length!==3)throw Error("exactly three raw observations required");
  const [a,b,c]=frames;
  if(frames.some(f=>f.width!==a.width||f.height!==a.height))
    throw Error("frames have different image geometry; register before playback");
  if(frames.some(f=>!(f.indices instanceof Uint8Array)||f.indices.length!==a.width*a.height))
    throw Error("each observation requires quantized pixels");
  const leafSets=frames.map(f=>extractLeaves(f.indices,f.width,f.height,{maxLeaves,threshold:5}));
  const ab=framePair(leafSets[0],leafSets[1],maxShiftPx);
  const bc=framePair(leafSets[1],leafSets[2],maxShiftPx);
  const right=new Map(bc.matched.map(p=>[p.a,p.b]));
  const tracks=[];
  for(const pair of ab.matched){
    const last=right.get(pair.b);
    if(!last)continue;
    tracks.push({positions:[pair.a,pair.b,last].map(x=>[x.x,x.y,x.intensityBin])});
  }
  const timestamps=frames.map(f=>f.dateObs||f.metadata?.dateObs||null);
  const numeric=timestamps.map(x=>x?Date.parse(x):NaN);
  const temporal= numeric.every(Number.isFinite)&&numeric[0]<numeric[1]&&numeric[1]<numeric[2];
  return {
    schema:"asolaria-observed-leaf-tape-v1",
    measurementClass:"uploaded-raw-FITS-observations-no-calibrated-depth",
    axis3:"observation-epoch-not-physical-depth",
    width:a.width,height:a.height,
    frames:frames.map((f,i)=>({
      slot:i,source:f.name||"file-"+i,rawSha256:f.sha256||null,
      dateObs:timestamps[i],metadata:f.metadata||{},histogram:f.histogram,
      pixels:f.width*f.height,leaves:leafSets[i].length
    })),
    timeMode:temporal?"observed-UTC":"ordered-frames-no-measured-velocity",
    registration:"unverified-nearest-bright-tile-match",
    tracking:{registeredAB:ab.estimatedRegistrationPx,registeredBC:bc.estimatedRegistrationPx,
      threeFrameTrackCount:tracks.length,possibleAmbiguity:true},
    tracks
  };
}
export function interpolateTape(tape,position){
  if(!tape||!Array.isArray(tape.tracks)||!Number.isFinite(position))throw Error("invalid tape position");
  const p=clamp(position,0,2);
  const segment=Math.min(1,Math.floor(p)),blend=p-segment;
  return tape.tracks.map((track,index)=>{
    const l=track.positions[segment],r=track.positions[segment+1];
    return {leaf:index,x:round(l[0]+(r[0]-l[0])*blend),
      y:round(l[1]+(r[1]-l[1])*blend),
      intensityBin:Math.round(l[2]+(r[2]-l[2])*blend),t:round(p)};
  });
}
export function projectStack(tape,position,{yawDegrees=0}={}){
  const yaw=yawDegrees*Math.PI/180;
  if(!Number.isFinite(yaw))throw Error("invalid camera yaw");
  return interpolateTape(tape,position).map(p=>{
    const x=2*p.x/Math.max(1,tape.width-1)-1;
    const y=2*p.y/Math.max(1,tape.height-1)-1;
    const epoch=p.t-1;
    return {leaf:p.leaf,xy:[round(x*Math.cos(yaw)+epoch*.5*Math.sin(yaw)),round(y)],
      intensityBin:p.intensityBin,
      originalXY:[p.x,p.y],epoch:round(epoch)};
  });
}
export function pingPongPosition(seconds,secondsPerEdge=3){
  if(!Number.isFinite(seconds)||seconds<0||!Number.isFinite(secondsPerEdge)||secondsPerEdge<=0)
    throw Error("invalid playback clock");
  const d=(seconds/secondsPerEdge)%4;
  return d<=2?d:4-d;
}
export function snapshot(tape,position,frameNumber,isoTime){
  if(!Number.isSafeInteger(frameNumber)||frameNumber<0)throw Error("invalid playback frame number");
  return {
    schema:"asolaria-observed-reprojection-snapshot-v1",
    frameNumber,capturedAtUTC:isoTime,position:round(position),
    sourceHashes:tape.frames.map(f=>f.rawSha256),
    timeMode:tape.timeMode,axis3:tape.axis3,
    registration:tape.registration,
    tracking:tape.tracking,
    colorQuantizer:{bins:PALETTE.length,meaning:"measured intensity quantization not wavelength spectroscopy",
      palette:PALETTE},
    viewpoints:[0,120,240].map(yaw=>({
      yawDegrees:yaw,projectedLeaves:projectStack(tape,position,{yawDegrees:yaw}).slice(0,27)
    }))
  };
}
