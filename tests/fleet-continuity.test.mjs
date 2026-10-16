import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
test("Fleet inlines a syntactically valid JS runtime",()=>{
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,1);
  assert.doesNotThrow(()=>new Function(scripts[0][1]));
});
test("Fleet links the Centauri run-until-Stop experiment",()=>{
  assert.match(html,/href="\.\/centauri\/"/);
  assert.match(html,/RUN THE FLEET/);
});
test("single-owner browser loop has no nested duplicate schedules",()=>{
  assert.match(html,/document\.addEventListener\("visibilitychange",onVisibilityChange\)/);
  assert.match(html,/if\(pending!==null\)return;/);
  assert.match(html,/cancelAnimationFrame\(pending\)/);
  assert.match(html,/clearTimeout\(pending\)/);
  assert.match(html,/pending=setTimeout\(/);
  assert.match(html,/pending=requestAnimationFrame\(/);
  const loop=html.split("function loop(ts){")[1].split('document.addEventListener("visibilitychange"',1)[0];
  assert.doesNotMatch(loop,/await |fetch\(|readPixels\(|toBlob\(/);
  assert.match(loop,/scheduleNext\(\);/);
});
