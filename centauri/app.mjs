/* Continuous display never awaits QR, SHA, network or file I/O. */
import {fieldAt,project,VIEWS,INTERVAL_SECONDS,WAVELENGTHS_NM} from "./core.mjs";
const get=id=>document.getElementById(id);
const views=VIEWS.map((v,i)=>({v,canvas:get("view"+i),ctx:get("view"+i).getContext("2d")}));
const swatches=["#8327ff","#385dff","#00a5f8","#00d89e","#c3eb35","#ffa629","#ff592d","#e43524","#b21c31"];
let running=false,worker=null,workerBusy=false,startedAt=0,lastCapturedAt=-Infinity,nextCaptureAt=0;
let frameCount=0,captures=0,skipped=0,latest=null,handle=null,handleType=null,lastStatusUpdate=0;
function show(id,value){get(id).textContent=String(value);}
function notice(message){show("notice",message);}
function updateButtons(){
  get("start").disabled=running;get("stop").disabled=!running;
  get("capture").disabled=!running;get("export").disabled=!latest;
}
function stopSchedule(){
  if(handle!==null){
    if(handleType==="raf")cancelAnimationFrame(handle);
    else clearTimeout(handle);
    handle=null;
  }
}
function schedule(){
  if(!running)return;
  if(document.hidden){handleType="timer";handle=setTimeout(()=>tick(performance.now()),250);}
  else{handleType="raf";handle=requestAnimationFrame(tick);}
}
function wavelengthRGB(w){
  if(w<=425)return [135,35,255];if(w<=470)return [55,95,255];
  if(w<=515)return [0,165,250];if(w<=560)return [55,235,140];
  if(w<=605)return [250,235,60];if(w<=650)return [255,150,35];
  if(w<=695)return [255,75,30];return [225,25,60];
}
function displayColor(bins){
  const rgb=[0,0,0];
  bins.forEach((a,i)=>wavelengthRGB(WAVELENGTHS_NM[i]).forEach((c,j)=>rgb[j]+=a*c));
  // Colored display pixels are an illustrative projection of full spectral-bin data.
  const peak=Math.max(...rgb)||1;
  return rgb.map(c=>Math.round(Math.min(255,c/peak*255)));
}
function render(elapsed){
  const field=fieldAt(elapsed);
  for(const {v,canvas,ctx} of views){
    const w=canvas.width,h=canvas.height;
    ctx.clearRect(0,0,w,h);
    const bg=ctx.createLinearGradient(0,0,w,h);
    swatches.forEach((color,i)=>bg.addColorStop(i/(swatches.length-1),color));
    ctx.globalAlpha=.16;ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);ctx.globalAlpha=1;
    ctx.strokeStyle="rgba(255,255,255,.08)";
    for(let x=0;x<w;x+=36){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let y=0;y<h;y+=29){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    for(const body of field){
      const [x,y,depth]=project(body.xyz,v),sx=w/2+x*140,sy=h/2-y*140;
      const c=displayColor(body.spectralBins),radius=Math.max(13,35+depth*5);
      const halo=ctx.createRadialGradient(sx,sy,0,sx,sy,radius);
      halo.addColorStop(0,"rgba("+c.join(",")+",0.96)");
      halo.addColorStop(.18,"rgba("+c.join(",")+",0.55)");
      halo.addColorStop(1,"rgba("+c.join(",")+",0)");
      ctx.fillStyle=halo;ctx.fillRect(sx-radius,sy-radius,2*radius,2*radius);
      ctx.fillStyle="#f8f9ff";ctx.beginPath();ctx.arc(sx,sy,2.5,0,2*Math.PI);ctx.fill();
    }
  }
}
function drawLatest(result){
  const summary=get("snapshot-info");
  summary.textContent="Frame "+result.manifest.sequence+" · "+result.manifest.bytes+
    " bytes · "+result.manifest.chunks+" indexed QR chunks · SHA-256 "+result.manifest.sha256;
  const target=get("qr-list");target.replaceChildren();
  for(let i=0;i<result.images.length;i++){
    const image=result.images[i],wrap=document.createElement("div");
    wrap.className="qr-item";
    const canvas=document.createElement("canvas"),size=image.size;
    // Keep the full-resolution QR symbols; never compress the contact sheet.
    canvas.width=size*5;canvas.height=size*5;
    const ctx=canvas.getContext("2d"),tmp=document.createElement("canvas");
    tmp.width=tmp.height=size;
    tmp.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(image.rgba),size,size),0,0);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(tmp,0,0,canvas.width,canvas.height);
    const label=document.createElement("div");
    label.textContent="Colour QR "+(i+1)+" — indices "+image.chunkIndices.join(", ");
    const button=document.createElement("button");button.textContent="SAVE FULL-RES PNG";
    button.onclick=()=>canvas.toBlob(blob=>{if(blob)downloadBlob(blob,"centauri-"+result.manifest.sequence+"-colour-qr-"+i+".png");},"image/png");
    wrap.append(label,canvas,button);target.append(wrap);
  }
}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function setupWorker(){
  const w=new Worker("./capture-worker.mjs",{type:"module"});
  w.onmessage=ev=>{
    if(worker!==w)return;workerBusy=false;
    if(ev.data.type==="error"){
      notice("QR worker error: "+ev.data.message+" — field continues. Capture again or inspect console.");
      console.error(ev.data.message);return;
    }
    latest=ev.data;captures++;
    show("captures",captures);drawLatest(latest);updateButtons();
    notice("RUNNING uninterrupted · latest worker-verified QR snapshot "+latest.manifest.sequence+
      " · next scheduled snapshot after another "+INTERVAL_SECONDS+"s checkpoint.");
  };
  w.onerror=err=>{
    if(worker!==w)return;workerBusy=false;
    notice("QR worker failed but the display continues. "+err.message);
  };
  worker=w;
}
function captureAt(elapsed){
  if(!worker||workerBusy){
    skipped++;show("skipped",skipped);return false;
  }
  const sequence=captures+skipped; // monotonic logical capture attempt sequence
  workerBusy=true;lastCapturedAt=elapsed;
  worker.postMessage({type:"capture",sequence,elapsedSeconds:elapsed,capturedAtUTC:new Date().toISOString()});
  return true;
}
function tick(now){
  handle=null;if(!running)return;
  // Analytic time, not numerical integration: a suspended tab has no catch-up loops.
  const elapsed=Math.max(0,(now-startedAt)/1000);
  if(!document.hidden){render(elapsed);frameCount++;}
  // One snapshot request at most; slow encoder never queues unbounded work.
  if(elapsed>=nextCaptureAt){
    captureAt(elapsed);
    nextCaptureAt=(Math.floor(elapsed/INTERVAL_SECONDS)+1)*INTERVAL_SECONDS;
  }
  if(now-lastStatusUpdate>250){
    show("elapsed",elapsed.toFixed(2));show("frame-count",frameCount);
    lastStatusUpdate=now;
  }
  schedule();
}
get("start").onclick=()=>{
  if(running)return;
  if(!("Worker" in window)||!crypto.subtle){
    notice("Web Worker and secure-context SHA-256 are required for verified QR frames.");return;
  }
  if(worker)worker.terminate();
  latest=null;captures=0;skipped=0;frameCount=0;nextCaptureAt=0;workerBusy=false;
  get("qr-list").replaceChildren();
  show("captures",0);show("skipped",0);show("frame-count",0);
  show("snapshot-info","Starting: immediate baseline QR snapshot will be processed off the render loop.");
  try{setupWorker();}catch(err){notice("Could not launch QR worker: "+err.message);return;}
  startedAt=performance.now();running=true;show("status","RUNNING");updateButtons();
  notice("RUNNING until STOP. The first snapshot is requested immediately.");
  stopSchedule();schedule();
};
get("stop").onclick=()=>{
  if(!running)return;running=false;stopSchedule();
  if(worker){worker.terminate();worker=null;workerBusy=false;}
  show("status","STOPPED");notice("Stopped by operator. Latest completed frame is still available for export.");
  updateButtons();
};
get("capture").onclick=()=>{
  if(!running)return;
  const t=(performance.now()-startedAt)/1000;
  if(!captureAt(t))notice("QR worker busy; skipping manual capture rather than blocking a display frame.");
};
get("export").onclick=()=>{
  if(!latest)return;
  const out={
    manifest:latest.manifest,
    frame:latest.frame,
    qrIndexedBase64Chunks:latest.packets,
    independentlyReassembleWith:"https://jessebrown1980.github.io/the-colour-qr/"
  };
  downloadBlob(new Blob([JSON.stringify(out,null,2)],{type:"application/json"}),
    "centauri-"+latest.manifest.sequence+"-"+latest.manifest.sha256.slice(0,12)+".json");
};
document.addEventListener("visibilitychange",()=>{
  if(!running)return;
  stopSchedule();schedule();
});
render(0);updateButtons();
