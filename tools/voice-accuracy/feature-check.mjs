import fs from "fs";
globalThis.window = globalThis;
const { createVoiceAnalyzer } = await import("../../vibe_page/lib/voiceAnalysis.js");
import { readWav, mkAnalyser } from "./wav.mjs";

function run(file, mode){
  const {sr,L,R}=readWav(file); const mid=mkAnalyser(), side=mkAnalyser(); let made=0;
  const node=()=>({gain:{value:1},connect(){},disconnect(){}});
  const ctx={sampleRate:sr,createGain:node,createChannelSplitter:node,createAnalyser:()=>made++===0?mid:side};
  const v=createVoiceAnalyzer(ctx); v.setMode(mode);
  mid._sig=L.map((x,i)=>(x+R[i])/2); side._sig=L.map((x,i)=>(x-R[i])/2);
  const hop=Math.round(sr/60); const out=[];
  for(let p=4096;p<L.length;p+=hop){ mid._pos=side._pos=p; v.analyse(); const f=window.__voiceFrame;
    out.push({voiced:f.voiced, pitch:f.pitch}); }
  return out;
}
function wander(rows,i,win=30){
  const seg=[]; for(let k=Math.max(0,i-win);k<=i;k++) if(rows[k].pitch>0) seg.push(Math.log2(rows[k].pitch)*1200);
  if(seg.length<win*0.6) return null;
  const m=seg.reduce((a,b)=>a+b,0)/seg.length;
  return Math.sqrt(seg.reduce((a,b)=>a+(b-m)*(b-m),0)/seg.length);
}
// node feature-check.mjs mix1.wav vocals1.wav [mix2.wav vocals2.wav ...]
const args = process.argv.slice(2);
const pairs = [];
for (let i = 0; i + 1 < args.length; i += 2) pairs.push([`pair${i/2+1}`, args[i], args[i+1]]);
if (!pairs.length) { console.error("usage: node feature-check.mjs <mix.wav> <vocals.wav> [...]"); process.exit(1); }
const all={v:[],s:[]};
for (const [tag,mix,voc] of pairs) {
  const live=run(mix,"live"), stem=run(voc,"stem"); const n=Math.min(live.length,stem.length);
  for(let i=0;i<n;i++){ if(live[i].voiced<=0.5) continue; const w=wander(live,i); if(w===null) continue;
    (stem[i].voiced>0.5?all.v:all.s).push(w); }
}
console.log("MAX wander gate — drop the tracked note when its pitch wanders more than this over 0.5s");
console.log("(applies only to frames the live filter currently calls voiced)\n");
console.log("threshold  keeps real voice  rejects false voice   net");
for(const t of [150,200,250,300,400,500,650,800]){
  const keep=100*all.v.filter(a=>a<=t).length/all.v.length;
  const rej =100*all.s.filter(a=>a> t).length/all.s.length;
  console.log(`  ${String(t).padStart(4)}c         ${keep.toFixed(0).padStart(3)}%              ${rej.toFixed(0).padStart(3)}%          ${(keep+rej-100>=0?"+":"")}${(keep+rej-100).toFixed(0)}`);
}
