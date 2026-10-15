"use strict";
const $ = id => document.getElementById(id);
const SHA_EXPECTED = "fe3f6f1adb2eb15832bd5d5fd59c2c97bc77b581c5c60f54b768545c756b38c4";
const SEED = "ASOLARIA-LIGHT-BEING-ROUND3-20261015";
const enc = new TextEncoder();
const toHex = b => Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
const digest = async b => toHex(await crypto.subtle.digest("SHA-256",b));
const Q = 1000000;
let payload=null, bank=null, missing={A:false,B:true,P:false}, corrupted={A:false,B:false,P:false};
let currentFrame=0;
function notice(id,message,kind="info"){const el=$(id);el.textContent=message;el.dataset.kind=kind;}
function xor(a,b){const r=new Uint8Array(a.length);for(let i=0;i<a.length;i++)r[i]=a[i]^b[i];return r;}
function join(a,b){const o=new Uint8Array(a.length+b.length);o.set(a);o.set(b,a.length);return o;}
async function makeFixture(){
  const b=enc.encode(SEED),out=new Uint8Array(65536),buf=new Uint8Array(b.length+4);
  buf.set(b);
  const dv=new DataView(buf.buffer);
  for(let i=0;i<2048;i++){dv.setUint32(b.length,i,true);out.set(new Uint8Array(await crypto.subtle.digest("SHA-256",buf)),i*32);}
  return out;
}
function renderSticks(){
  for(const k of ["A","B","P"]){const el=$("stick"+k);el.classList.toggle("missing",missing[k]);el.classList.toggle("corrupt",corrupted[k]);el.querySelector(".availability").textContent=missing[k]?"ERASED":corrupted[k]?"ALTERED":"READY";el.setAttribute("aria-pressed",!missing[k]);}
  $("stickCount").textContent=Object.values(missing).filter(v=>!v).length+" / 3 present";
}
async function initBank(){
  const button=$("seedMemory");button.disabled=true;button.textContent="Generating pinned source…";
  try{
    const candidate=await makeFixture(),sha=await digest(candidate);
    if(sha!==SHA_EXPECTED)throw new Error("Fixture SHA mismatch; aborting untrusted memory.");
    payload=candidate;
    const A=candidate.slice(0,32768),B=candidate.slice(32768),P=xor(A,B);
    bank={A,B,P};missing={A:false,B:true,P:false};corrupted={A:false,B:false,P:false};
    renderSticks();
    $("memorySourceSha").textContent=sha;
    notice("memoryResult","65,536-byte pinned fixture created locally. Stick B is erased. Choose Recover to reconstruct from A and parity P.","ok");
  }catch(err){notice("memoryResult","HELD — "+err.message,"bad");}
  finally{button.disabled=false;button.textContent="Reset pinned 64 KiB source";}
}
async function recover(){
  if(!bank||!payload){notice("memoryResult","Create the pinned memory fixture first.","bad");return;}
  const present=Object.keys(bank).filter(k=>!missing[k]);
  if(present.length<2){notice("memoryResult","HELD · only "+present.length+" stick present. An arbitrary 64 KiB source cannot be reconstructed uniquely.","bad");return;}
  const [a,b]=present;
  let result;
  if(a==="A"&&b==="B")result=join(bank.A,bank.B);
  else if(a==="A"&&b==="P")result=join(bank.A,xor(bank.A,bank.P));
  else result=join(xor(bank.B,bank.P),bank.B);
  const h=await digest(result);
  if(h!==SHA_EXPECTED){notice("memoryResult","HELD · recovered bytes do not match the independent anchored SHA-256. Pair "+a+b+" contains changed or untrusted bytes.","bad");return;}
  notice("memoryResult","PASS · pair "+a+" + "+b+" restored 65,536 / 65,536 bytes. SHA-256 matches the published fixture exactly. This is software memory, not photonic retention.","ok");
}
function tamper(){
  if(!bank){notice("memoryResult","Create the pinned memory fixture first.","bad");return;}
  const k=$("tamperStick").value;bank[k][11]^=1;corrupted[k]=!corrupted[k];renderSticks();
  notice("memoryResult","Fault injected into stick "+k+". Recover to test whether the independently pinned SHA detects altered data.","info");
}
function initBankEvents(){
  $("seedMemory").addEventListener("click",initBank);
  $("recoverMemory").addEventListener("click",recover);
  $("tamperMemory").addEventListener("click",tamper);
  for(const k of ["A","B","P"])$("stick"+k).addEventListener("click",()=>{missing[k]=!missing[k];renderSticks();notice("memoryResult","Stick "+k+" "+(missing[k]?"erased":"restored")+". Attempt a new two-of-three reconstruction.","info");});
  renderSticks();
}
function gcd(a,b){while(b){const t=a%b;a=b;b=t;}return Math.abs(a);}
function sig(r,g,b){const s=r+g+b,q=r*r+g*g+b*b-r*g-r*b-g*b;return {s,q,raw:[s*s,q,q]};}
function rainbowUpdate(){
  const [r,g,b]=["r","g","b"].map(k=>Number($("rain"+k).value)),address=9*r+3*g+b;
  for(const [i,v] of [r,g,b].entries()){$(["rVal","gVal","bVal"][i]).textContent=v;}
  const {s,q,raw}=sig(r,g,b),sum=raw[0]+raw[1]+raw[2];
  $("rainAddr").textContent=String(address).padStart(2,"0")+" / 26";
  $("rainVector").textContent="("+r+", "+g+", "+b+")";
  $("rainIntensities").textContent="("+raw.join(", ")+")";
  $("rainProb").textContent=sum?raw.map(x=>(100*x/sum).toFixed(2)+"%").join(" · "):"undefined at zero input";
  $("rainAnchor").textContent="S="+s+" · dR="+(3*r-s)+" · dG="+(3*g-s);
  $("rainRecovered").textContent="("+((s+(3*r-s))/3)+", "+((s+(3*g-s))/3)+", "+((s-(3*r-s)-(3*g-s))/3)+")";
  $("rainSectorNote").textContent="Sector "+address+" preserves ordered identity. Permuting the inputs may change this address without changing any intensity weight.";
  document.querySelectorAll(".sector").forEach(x=>{x.classList.toggle("active",Number(x.dataset.addr)===address);x.setAttribute("aria-pressed",Number(x.dataset.addr)===address);});
  ["r","g","b"].forEach((k,i)=>{$("bar"+k).style.width=(10+[r,g,b][i]*45)+"%";});
}
function initRainbow(){
  const g=$("sectorGrid");
  for(let r=0;r<3;r++)for(let gr=0;gr<3;gr++)for(let b=0;b<3;b++){
    const a=9*r+3*gr+b,btn=document.createElement("button");
    btn.className="sector";btn.type="button";btn.dataset.addr=a;btn.title="Ordered trits ("+[r,gr,b].join(",")+")";
    btn.textContent=String(a).padStart(2,"0");
    btn.style.setProperty("--rs",40+r*70);btn.style.setProperty("--gs",40+gr*70);btn.style.setProperty("--bs",40+b*70);
    btn.addEventListener("click",()=>{for(const [k,v] of Object.entries({r,g:gr,b}))$("rain"+k).value=v;rainbowUpdate();});
    g.appendChild(btn);
  }
  ["r","g","b"].forEach(k=>$("rain"+k).addEventListener("input",rainbowUpdate));
  $("permutation").addEventListener("click",()=>{const r=$("rainr").value,g=$("raing").value,b=$("rainb").value; $("rainr").value=g;$("raing").value=b;$("rainb").value=r;rainbowUpdate();});
  rainbowUpdate();
}
const ARMS=["dark","short","long","continuous_then_dark"];
function light(t,site,wave,arm){
  const k=t+(site%5)+(wave%7);
  if(arm==="short")return k%32<4;
  if(arm==="long")return k%64<24;
  if(arm==="continuous_then_dark")return t<120;
  return false;
}
function step3(x,L){
  const [c,o,r]=x,a=L?Math.floor(c*300000/Q):0,b=Math.floor(o*170000/Q),d=Math.floor(r*60000/Q);
  return [c-a+d,o+a-b,r+b-d];
}
function step4(x,L){
  const [c1,o1,o2,c2]=x,a=L?Math.floor(c1*300000/Q):0,b=Math.floor(o1*110000/Q),c=Math.floor(o1*80000/Q),d=Math.floor(o2*40000/Q),e=Math.floor(c2*55000/Q),f=L?Math.floor(c1*20000/Q):0,g=Math.floor(o2*25000/Q);
  return [c1-a-f+c+e,o1+a-b-c+g,o2+b-d-g,c2+d+f-e];
}
function plot(rows,model){
  const canvas=$("trace"),scale=window.devicePixelRatio||1,w=canvas.clientWidth||790,h=290;
  canvas.width=Math.floor(w*scale);canvas.height=h*scale;const ctx=canvas.getContext("2d");ctx.setTransform(scale,0,0,scale,0,0);
  ctx.clearRect(0,0,w,h);ctx.fillStyle="#101b2c";ctx.fillRect(0,0,w,h);
  const left=38,right=w-13,top=17,bottom=h-30;
  ctx.strokeStyle="#26384f";ctx.lineWidth=1;ctx.font="11px ui-monospace,monospace";ctx.fillStyle="#a1aec2";
  for(let i=0;i<=4;i++){const y=top+(bottom-top)*i/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();ctx.fillText((1-i/4).toFixed(2),3,y+4);}
  for(const t of [0,60,120,180,239]){const x=left+(right-left)*t/239;ctx.fillText(String(t),Math.min(x,right-19),h-10);}
  const colors=["#50d3af","#faab59","#aa8dfa","#6fbeff"];
  const cols=model==="3"?[0,1,2]:[0,1,2,3];
  cols.forEach((j)=>{
    ctx.beginPath();ctx.strokeStyle=colors[j];ctx.lineWidth=2.2;
    for(let t=0;t<rows.length;t++){const x=left+(right-left)*t/239,y=bottom-(bottom-top)*rows[t].state[j]/Q;if(t===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
  });
  ctx.beginPath();ctx.setLineDash([5,5]);ctx.lineWidth=1;ctx.strokeStyle="#526982";
  ctx.moveTo(left+(right-left)*120/239,top);ctx.lineTo(left+(right-left)*120/239,bottom);ctx.stroke();ctx.setLineDash([]);
}
function runModel(){
  const model=$("model").value,arm=$("arm").value,site=Number($("site").value),wave=Number($("wave").value);
  $("siteLabel").textContent=site;$("waveLabel").textContent=wave;
  let state=model==="3"?[Q,0,0]:[Q,0,0,0],conserved=0,litTicks=0;
  const rows=[];
  for(let t=0;t<240;t++){
    const L=light(t,site,wave,arm);
    if(L)litTicks++;
    state=model==="3"?step3(state,L):step4(state,L);
    if(state.reduce((a,b)=>a+b,0)===Q&&state.every(x=>x>=0))conserved++;
    rows.push({state:[...state],current:model==="3"?2000*state[1]:2000*state[1]+500*state[2]});
  }
  plot(rows,model);
  $("modelEnd").textContent=rows.at(-1).state.map(v=>(v/Q).toFixed(4)).join(" / ");
  $("modelMax").textContent=Math.max(...rows.map(row=>row.current)).toLocaleString("en-US")+" synthetic units";
  $("modelLit").textContent=String(litTicks)+" / 240";
  notice("modelResult",conserved===240?"PASS · nonnegative mass exactly conserved for all 240 steps; 240/240 checks. These are chosen integer rates, not fitted optical or biological measurements.":"FAIL · numerical conservation violated.",""+(conserved===240?"ok":"bad"));
}
function initModel(){
  ["model","arm","site","wave"].forEach(id=>$(id).addEventListener("input",runModel));
  $("rerunModel").addEventListener("click",runModel);window.addEventListener("resize",()=>runModel());
  runModel();
}
function initGallery(){
 const img=$("qrImage");
 function update(){
  $("frameCurrent").textContent=String(currentFrame+1).padStart(2,"0")+" / 11";
  img.src="assets/round3-light-being-qr-"+String(currentFrame).padStart(2,"0")+".png";
  $("qrImageLink").href=img.src;
  $("qrFrameNote").textContent=currentFrame===10?"Frame 11: R=chunk 30, G=chunk 31, B=filler.":"Frame "+(currentFrame+1)+": indexed QR symbols "+(currentFrame*3)+"–"+(currentFrame*3+2)+".";
 }
 $("framePrev").addEventListener("click",()=>{currentFrame=(currentFrame+10)%11;update();});
 $("frameNext").addEventListener("click",()=>{currentFrame=(currentFrame+1)%11;update();});
 img.addEventListener("error",()=>{$("qrFallback").hidden=false;});
 img.addEventListener("load",()=>{$("qrFallback").hidden=true;});
 $("detectQr").addEventListener("click",async()=>{
   if(!("BarcodeDetector" in window)){notice("qrDetectResult","Browser BarcodeDetector unavailable. Use the original Colour QR reader or the independently audited ZXing-C++ receipts.","info");return;}
   try{
     const formats=await BarcodeDetector.getSupportedFormats();
     if(!formats.includes("qr_code"))throw Error("QR decoding unsupported by browser.");
     const decoder=new BarcodeDetector({formats:["qr_code"]}),off=document.createElement("canvas");
     await img.decode();off.width=img.naturalWidth;off.height=img.naturalHeight;
     const ctx=off.getContext("2d",{willReadFrequently:true});ctx.drawImage(img,0,0);
     const original=ctx.getImageData(0,0,off.width,off.height),out=[];
     for(let ch=0;ch<3;ch++){
       const d=new Uint8ClampedArray(original.data);
       for(let j=0;j<d.length;j+=4){d[j]=d[j+1]=d[j+2]=original.data[j+ch];d[j+3]=255;}
       ctx.putImageData(new ImageData(d,off.width,off.height),0,0);
       const findings=await decoder.detect(off);
       if(findings.length===1){
         const bytes=Uint8Array.from(atob(findings[0].rawValue),c=>c.charCodeAt(0));
         const index=new DataView(bytes.buffer).getUint32(0,true);
         out.push("lane "+["R","G","B"][ch]+": index "+index+" / "+(bytes.length-4)+" bytes");
       }else out.push("lane "+["R","G","B"][ch]+": "+(currentFrame===10&&ch===2?"filler":"not decoded by browser"));
     }
     notice("qrDetectResult",out.join(" · "),"ok");
   }catch(e){notice("qrDetectResult","Browser decoder could not recover this frame: "+e.message+". Independent ZXing-C++ software evidence remains linked below.","bad");}
 });
 update();
}
function initTabs(){
 document.querySelectorAll("[data-scroll]").forEach(el=>el.addEventListener("click",()=>$(el.dataset.scroll).scrollIntoView({behavior:"smooth"})));
}
document.addEventListener("DOMContentLoaded",()=>{initBankEvents();initRainbow();initModel();initGallery();initTabs();});
