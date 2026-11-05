// Minimal WAV reader + an AnalyserNode stand-in (windowed FFT with the same
// smoothing the browser applies), so lib/voiceAnalysis.js can run under Node
// against files instead of live audio.
import fs from "fs";

function readWav(p){const b=fs.readFileSync(p);let o=12,sr,ch,data;while(o<b.length){const id=b.toString('ascii',o,o+4),sz=b.readUInt32LE(o+4);if(id==='fmt '){ch=b.readUInt16LE(o+10);sr=b.readUInt32LE(o+12);}if(id==='data'){data=b.subarray(o+8,o+8+sz);}o+=8+sz+(sz&1);}const n=Math.floor(data.length/(2*ch));const L=new Float32Array(n),R=new Float32Array(n);for(let i=0;i<n;i++){L[i]=data.readInt16LE(i*2*ch)/32768;R[i]=data.readInt16LE((i*ch+(ch-1))*2)/32768;}return{sr,L,R};}
function fft(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){const ur=re[i+j],ui=im[i+j],vr=re[i+j+len/2]*cr-im[i+j+len/2]*ci,vi=re[i+j+len/2]*ci+im[i+j+len/2]*cr;re[i+j]=ur+vr;im[i+j]=ui+vi;re[i+j+len/2]=ur-vr;im[i+j+len/2]=ui-vi;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t;}}}}
function mkAnalyser(){return{fftSize:4096,smoothingTimeConstant:0.3,_sm:null,_sig:null,_pos:0,
 getFloatFrequencyData(out){const N=this.fftSize,re=new Float64Array(N),im=new Float64Array(N);const s=this._sig,p=this._pos;
  for(let i=0;i<N;i++){const x=s[p-N+i]||0;const w=0.42-0.5*Math.cos(2*Math.PI*i/N)+0.08*Math.cos(4*Math.PI*i/N);re[i]=x*w;}
  fft(re,im);if(!this._sm)this._sm=new Float64Array(N/2);
  for(let k=0;k<N/2;k++){const m=Math.hypot(re[k],im[k])/N;this._sm[k]=this.smoothingTimeConstant*this._sm[k]+(1-this.smoothingTimeConstant)*m;out[k]=20*Math.log10(this._sm[k]+1e-12);}
 },disconnect(){}};}


export { readWav, mkAnalyser };
