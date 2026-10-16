/* Real wall-clock Chrome DevTools Protocol smoke test; no npm packages. Node 22+. */
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let endpoint=null;
for(let i=0;i<80;i++){
  try{
    const response=await fetch("http://127.0.0.1:9222/json/list");
    const pages=await response.json();
    endpoint=pages.find(p=>p.type==="page"&&p.url.includes("/centauri/observed/browser-smoke.html"))?.webSocketDebuggerUrl;
    if(endpoint)break;
  }catch(_){}
  await delay(250);
}
if(!endpoint)throw Error("Headless Chrome page or debug endpoint not ready");
const socket=new WebSocket(endpoint);
const pending=new Map();let next=1;
await new Promise((resolve,reject)=>{
  socket.addEventListener("open",resolve,{once:true});
  socket.addEventListener("error",reject,{once:true});
});
socket.addEventListener("message",event=>{
  let message;try{message=JSON.parse(event.data);}catch(_){return;}
  if(!message.id||!pending.has(message.id))return;
  const {resolve,reject}=pending.get(message.id);
  pending.delete(message.id);
  if(message.error)reject(Error(JSON.stringify(message.error)));else resolve(message.result);
});
const rpc=(method,params={})=>new Promise((resolve,reject)=>{
  const id=next++;pending.set(id,{resolve,reject});
  socket.send(JSON.stringify({id,method,params}));
});
await rpc("Runtime.enable");
const expr='(()=>{const f=document.getElementById("experiment");const d=f?.contentDocument;return {result:document.getElementById("result")?.textContent,frames:d?.getElementById("frame-count")?.textContent,captures:d?.getElementById("captures")?.textContent,status:d?.getElementById("status")?.textContent,notice:d?.getElementById("notice")?.textContent,qr:d?.querySelectorAll("#qr-list canvas").length}})()';
let state={};
try{
  for(let i=0;i<100;i++){
    const out=await rpc("Runtime.evaluate",{expression:expr,returnByValue:true,awaitPromise:true});
    state=out.result?.value||{};
    if(String(state.result).startsWith("SMOKE_PASS")){
      console.log("BROWSER_START_WORKER_QR_STOP_PASS",JSON.stringify(state));
      process.exitCode=0;break;
    }
    if(String(state.result).startsWith("SMOKE_FAIL")){
      throw Error("Browser assertion failed: "+JSON.stringify(state));
    }
    if(i===99)throw Error("Timed out waiting real browser time: "+JSON.stringify(state));
    await delay(500);
  }
}finally{
  socket.close();
}
