// Accuracy harness: runs lib/voiceAnalysis.js over a full mix (live mode) and
// over its isolated vocal stem (stem mode), then compares them frame by frame.
// The stem read is the reference: it hears only the voice, so wherever the two
// disagree, the live filter is what's wrong.
import fs from "fs";
globalThis.window = globalThis;
const { createVoiceAnalyzer } = await import("../../vibe_page/lib/voiceAnalysis.js");

import { readWav, mkAnalyser } from "./wav.mjs";

function run(file, mode){
  const {sr,L,R}=readWav(file);
  const mid=mkAnalyser(), side=mkAnalyser(); let made=0;
  const node=()=>({gain:{value:1},connect(){},disconnect(){}});
  const ctx={sampleRate:sr,createGain:node,createChannelSplitter:node,createAnalyser:()=>made++===0?mid:side};
  const v=createVoiceAnalyzer(ctx); v.setMode(mode);
  mid._sig=L.map((x,i)=>(x+R[i])/2); side._sig=L.map((x,i)=>(x-R[i])/2);
  const hop=Math.round(sr/60), out=[];
  for(let p=4096;p<L.length;p+=hop){ mid._pos=side._pos=p; v.analyse();
    const f=window.__voiceFrame; out.push([f.voiced, f.pitch, f.loudness, f.brightness]); }
  return out;
}

const [mixFile, stemFile] = process.argv.slice(2);
const live = run(mixFile, "live");
const stem = run(stemFile, "stem");
const n = Math.min(live.length, stem.length);
let bothVoiced=0, stemOnly=0, liveOnly=0, neither=0;
const cents=[];
for(let i=0;i<n;i++){
  const lv=live[i][0]>0.5, sv=stem[i][0]>0.5;
  if(lv&&sv){ bothVoiced++; if(live[i][1]>0&&stem[i][1]>0) cents.push(Math.abs(1200*Math.log2(live[i][1]/stem[i][1]))); }
  else if(sv) stemOnly++; else if(lv) liveOnly++; else neither++;
}
cents.sort((a,b)=>a-b);
const q=x=>cents.length?cents[Math.floor(x*(cents.length-1))].toFixed(0):'-';
const within=c=>cents.length?(100*cents.filter(x=>x<c).length/cents.length).toFixed(0):'-';
const sungFrames=bothVoiced+stemOnly;
console.log(`frames: ${n} (${(n/60).toFixed(0)}s)`);
console.log(`voice present per the stem: ${sungFrames} frames (${(100*sungFrames/n).toFixed(0)}% of the excerpt)`);
console.log(`  live filter agreed:        ${bothVoiced} (${(100*bothVoiced/Math.max(1,sungFrames)).toFixed(0)}% of sung frames)`);
console.log(`  live filter missed:       ${stemOnly} (${(100*stemOnly/Math.max(1,sungFrames)).toFixed(0)}%)`);
console.log(`false voice where stem is silent: ${liveOnly} of ${liveOnly+neither} (${(100*liveOnly/Math.max(1,liveOnly+neither)).toFixed(0)}%)`);
console.log(`pitch gap vs stem, cents: median ${q(0.5)} | p75 ${q(0.75)} | p90 ${q(0.9)}`);
console.log(`  within a quarter-tone (50c): ${within(50)}% | within a semitone (100c): ${within(100)}%`);
