/* The browser is the tape projector, not an N-body particle engine.
 * No FITS parsing, quantization, SHA or QR encoding inside the display callback.
 */
import {PALETTE,pingPongPosition,projectStack} from "./observation-core.mjs";
const $=id=>document.getElementById(id);
const pictureIds=["source0","source1","source2"];
const filesInput=$("files");
const playCanvas=$("playback"),playCtx=playCanvas.getContext("2d");
const stackCanvases=[0,1,2].map(i=>$("stack"+i));
const stackContexts=stackCanvases.map(c=>c.getContext("2d"));
let worker=null,loaded=false,running=false,busy=false,lastReceipt=null,tape=null;
let bitmaps=[],elapsedOrigin=0,handle=null,kind=null,framesDrawn=0,snapshots=0,skipped=0;
let nextCapture=0,lastUI=0;
function status(message){$("status").textContent=message;}
function count(id,n){$(id).textContent=String(n);}
function buttons(){
  $("start").disabled=!loaded||running;
  $("stop").disabled=!running;
  $("freeze").disabled=!running;
  $("export").disabled=!lastReceipt;
  $("show-qr").disabled=!lastReceipt;
}
function stopSchedule(){
  if(handle===null)return;
  if(kind==="raf")cancelAnimationFrame(handle);else clearTimeout(handle);
  handle=null;
}
function schedule(){
  if(!running||handle!==null)return;
  if(document.hidden){
    kind="timer";handle=setTimeout(()=>{handle=null;tick(performance.now());},250);
  }else{
    kind="raf";handle=requestAnimationFrame(now=>{handle=null;tick(now);});
  }
}
const drawImage=(ctx,img,w,h,alpha=1)=>{
  ctx.globalAlpha=alpha;
  const scale=Math.min(w/img.width,h/img.height);
  const dx=(w-img.width*scale)/2,dy=(h-img.height*scale)/2;
  ctx.drawImage(img,dx,dy,img.width*scale,img.height*scale);
  ctx.globalAlpha=1;
};
function drawSource(img,index){
  const c=$(pictureIds[index]),ctx=c.getContext("2d");
  ctx.clearRect(0,0,c.width,c.height);drawImage(ctx,img,c.width,c.height);
}
function drawPlayback(position){
  if(bitmaps.length!==3)return;
  const segment=Math.min(1,Math.floor(position)),alpha=position-segment;
  playCtx.clearRect(0,0,playCanvas.width,playCanvas.height);
  drawImage(playCtx,bitmaps[segment],playCanvas.width,playCanvas.height,1);
  // GPU compositing of the two measured quantized image frames.
  drawImage(playCtx,bitmaps[segment+1],playCanvas.width,playCanvas.height,alpha);
  playCtx.font="12px monospace";playCtx.fillStyle="#ffffff";
  playCtx.fillText("source "+segment+" ↔ "+(segment+1)+"   blend "+alpha.toFixed(3),9,19);
}
function drawStack(position){
  if(!tape)return;
  const w=tape.width,h=tape.height;
  stackContexts.forEach((ctx,i)=>{
    const canvas=stackCanvases[i],cw=canvas.width,ch=canvas.height;
    ctx.clearRect(0,0,cw,ch);
    const gradient=ctx.createLinearGradient(0,0,cw,ch);
    PALETTE.forEach((c,j)=>gradient.addColorStop(j/(PALETTE.length-1),c));
    ctx.globalAlpha=.15;ctx.fillStyle=gradient;ctx.fillRect(0,0,cw,ch);ctx.globalAlpha=1;
    const pts=projectStack(tape,position,{yawDegrees:i*120});
    for(const p of pts){
      const x=cw*(p.xy[0]+1)/2, y=ch*(p.xy[1]+1)/2;
      if(x<0||x>cw||y<0||y>ch)continue;
      ctx.fillStyle=PALETTE[p.intensityBin]||"#fff";
      ctx.beginPath();ctx.arc(x,y,2.0,0,Math.PI*2);ctx.fill();
    }
    ctx.fillStyle="#c5d3e0";ctx.font="11px monospace";
    ctx.fillText("x,y,epoch | not physical depth | "+pts.length+" tracked leaves",8,ch-10);
  });
}
function capture(position){
  if(!worker||!loaded||busy){skipped++;return;}
  busy=true;
  worker.postMessage({type:"snapshot",position,frameNumber:snapshots+skipped,
    capturedAtUTC:new Date().toISOString()});
}
function tick(now){
  if(!running)return;
  const elapsed=Math.max(0,(now-elapsedOrigin)/1000);
  const p=pingPongPosition(elapsed,5.3);
  if(!document.hidden){
    drawPlayback(p);drawStack(p);framesDrawn++;
  }
  if(elapsed>=nextCapture){
    capture(p);
    nextCapture=(Math.floor(elapsed/600)+1)*600;
  }
  if(now-lastUI>250){
    count("elapsed",elapsed.toFixed(1));count("painted",framesDrawn);lastUI=now;
  }
  schedule();
}
function download(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);
}
async function drawQR(message){
  const target=$("qr-list");target.replaceChildren();
  for(let i=0;i<message.images.length;i++){
    // The screen owns the animation cadence; draw optional previews only in idle slots.
    await new Promise(resolve=>typeof requestIdleCallback==="function"
      ?requestIdleCallback(resolve,{timeout:1500}):setTimeout(resolve,20));
    if(lastReceipt!==message)return;
    const im=message.images[i],c=document.createElement("canvas");
    const tmp=document.createElement("canvas");tmp.width=tmp.height=im.side;
    tmp.getContext("2d").putImageData(
      new ImageData(new Uint8ClampedArray(im.rgba),im.side,im.side),0,0);
    c.width=c.height=im.side*5;
    const ctx=c.getContext("2d");ctx.imageSmoothingEnabled=false;
    ctx.drawImage(tmp,0,0,c.width,c.height);
    const box=document.createElement("div");box.className="qr";
    const title=document.createElement("div");
    title.textContent="QR "+i+" indices "+im.chunkIndices.join(",");
    const button=document.createElement("button");button.textContent="Save PNG";
    button.onclick=()=>c.toBlob(b=>b&&download(b,
      "raw-observed-"+message.manifest.frameNumber+"-qr-"+i+".png"),"image/png");
    box.append(title,c,button);target.append(box);
  }
}
async function onWorker(data){
  if(data.type==="error"){
    busy=false;status("Worker "+data.operation+" error: "+data.message);
    $("mode").textContent="ERROR";return;
  }
  if(data.type==="ready"){
    tape=data.tape;
    const images=[];
    try{
      for(const im of data.observedFrames){
        const raw=new Uint8ClampedArray(im.pixelRgba);
        images.push(await createImageBitmap(new ImageData(raw,im.width,im.height)));
      }
    }catch(error){status("Rendering setup failed: "+error.message);return;}
    bitmaps.forEach(b=>b.close?.());bitmaps=images;
    bitmaps.forEach((image,i)=>{
      drawSource(image,i);
      const f=tape.frames[i];
      $( "source-info"+i ).textContent=f.source+" · "+(f.dateObs||"no FITS DATE-OBS")+
        " · "+image.width+"×"+image.height+" · "+f.leaves+" observed bright tiles";
    });
    count("leaf-count",tape.tracking.threeFrameTrackCount);
    $("provenance").textContent=JSON.stringify({
      scope:tape.measurementClass,
      thirdCoordinate:tape.axis3,timeMode:tape.timeMode,registration:tape.registration,
      tracking:tape.tracking,
      sources:tape.frames.map(f=>({name:f.source,sha256:f.rawSha256,
        dateObs:f.dateObs,filter:f.metadata.filter,
        telescope:f.metadata.telescope,instrument:f.metadata.instrument}))
    },null,2);
    loaded=true;busy=false;
    $("mode").textContent="READY";buttons();
    status("Real FITS images ingested. START replays observations until STOP; no duration limit.");
    drawPlayback(0);drawStack(0);
  }else if(data.type==="snapshot"){
    busy=false;lastReceipt=data;snapshots++;count("snapshots",snapshots);
    $("qr-info").textContent="Worker-verified observation projection: "+
      data.manifest.bytes+" B | "+data.manifest.chunks+" indexed QR chunks | SHA-256 "+
      data.manifest.sha256;
    $("qr-list").replaceChildren();buttons();
    status("Tape playback "+(running?"RUNNING":"STOPPED")+
      "; frozen measurement-derived QR receipt "+data.manifest.frameNumber+" saved in memory.");
  }
}
filesInput.onchange=async()=>{
  if(running)$("stop").click();
  loaded=false;busy=true;lastReceipt=null;buttons();
  $("mode").textContent="LOADING";
  const files=[...filesInput.files];
  if(files.length!==3){busy=false;status("Choose exactly THREE FITS files in earliest-to-latest order.");return;}
  if(worker){worker.terminate();worker=null;}
  let inputs;
  try{
    inputs=await Promise.all(files.map(async f=>({name:f.name,bytes:await f.arrayBuffer()})));
  }catch(error){status("Cannot read supplied FITS bytes: "+error.message);return;}
  worker=new Worker("./observation-worker.mjs",{type:"module"});
  worker.onmessage=event=>onWorker(event.data);
  worker.onerror=event=>{busy=false;status("FITS/QR worker crashed: "+event.message);};
  worker.postMessage({type:"load",files:inputs},inputs.map(x=>x.bytes));
};
$("start").onclick=()=>{
  if(!loaded||running)return;
  elapsedOrigin=performance.now();nextCapture=0;framesDrawn=0;
  lastUI=0;running=true;count("painted",0);
  $("mode").textContent="RUNNING";buttons();
  status("Real observation tape RUNNING until you press STOP. Quantization is already completed.");
  stopSchedule();schedule();
};
$("stop").onclick=()=>{
  if(!running)return;running=false;stopSchedule();
  $("mode").textContent="STOPPED";buttons();
  status("Stopped by operator. Captures remain available. START can replay again.");
};
$("freeze").onclick=()=>{
  if(!running)return;
  const t=Math.max(0,(performance.now()-elapsedOrigin)/1000);
  capture(pingPongPosition(t,5.3));
};
$("show-qr").onclick=()=>{
  if(lastReceipt)void drawQR(lastReceipt);
};
$("export").onclick=()=>{
  if(!lastReceipt)return;
  const out={manifest:lastReceipt.manifest,frame:lastReceipt.frame,
    qrIndexedBase64Chunks:lastReceipt.packets};
  download(new Blob([JSON.stringify(out,null,2)],{type:"application/json"}),
    "raw-observed-"+lastReceipt.manifest.sha256.slice(0,12)+".json");
};
document.addEventListener("visibilitychange",()=>{
  if(!running)return;stopSchedule();schedule();
});
buttons();
