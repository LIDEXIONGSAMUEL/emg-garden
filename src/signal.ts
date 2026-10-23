export const SAMPLE_RATE=2000,WINDOW=400,STEP=100;
export type Sample={index:number;voltage:number};
export type Frame={time:number;startIndex:number;endIndex:number;rms:number;mav:number;wl:number;quality:'good'|'clipped'|'flat'};
export type Calibration={baseline:number;reference:number;restThreshold:number;noise:number};
export const median=(values:number[])=>quantile(values,.5);
export function quantile(values:number[],q:number){
  if(!values.length||values.some(v=>!Number.isFinite(v)))throw new Error('Not enough valid signal. Repeat this step.');
  const a=[...values].sort((x,y)=>x-y),position=(a.length-1)*q,lo=Math.floor(position);
  return a[lo]+(a[Math.ceil(position)]-a[lo])*(position-lo);
}
export const mean=(a:number[])=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
export const sd=(a:number[])=>{const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)**2)));};

class Filter {
  private x1=0;private x2=0;private y1=0;private y2=0;
  private b0:number;private b1:number;private b2:number;private a1:number;private a2:number;
  constructor(kind:'high'|'low'|'notch',frequency:number,q=Math.SQRT1_2){
    const w=2*Math.PI*frequency/SAMPLE_RATE,c=Math.cos(w),alpha=Math.sin(w)/(2*q),a0=1+alpha;
    const b=kind==='high'?[(1+c)/2,-(1+c),(1+c)/2]:kind==='low'?[(1-c)/2,1-c,(1-c)/2]:[1,-2*c,1];
    [this.b0,this.b1,this.b2]=b.map(v=>v/a0);this.a1=-2*c/a0;this.a2=(1-alpha)/a0;
  }
  next(x:number){const y=this.b0*x+this.b1*this.x1+this.b2*this.x2-this.a1*this.y1-this.a2*this.y2;
    this.x2=this.x1;this.x1=x;this.y2=this.y1;this.y1=y;return y;}
}
export class Processor {
  gaps=0;
  private filters:Filter[]=[];private values:number[]=[];private clips:boolean[]=[];
  private last=-1;private received=0;private step=0;
  constructor(public notch=false,public referenceV=3.3,public adcMax=4095){this.reset();}
  private reset(){this.filters=[new Filter('high',20),new Filter('low',450),...(this.notch?[new Filter('notch',50,25)]:[])];this.values=[];this.clips=[];this.received=0;this.step=0;}
  push(samples:Sample[]):Frame[]{
    const frames:Frame[]=[];
    for(const s of samples){
      if(!Number.isSafeInteger(s.index)||s.index<0||!Number.isFinite(s.voltage))throw new Error('Invalid raw sample.');
      if(this.last>=0&&s.index!==this.last+1){this.gaps++;this.reset();}
      this.last=s.index;this.received++;
      let value=s.voltage;for(const f of this.filters)value=f.next(value);
      if(this.received<=1000)continue; // Let causal filters settle after connection or a gap.
      this.values.push(value);this.clips.push(s.voltage<=this.referenceV/this.adcMax||s.voltage>=this.referenceV*(1-1/this.adcMax));
      if(this.values.length>WINDOW){this.values.shift();this.clips.shift();}
      this.step++;
      if(this.values.length<WINDOW||this.step%STEP!==0)continue;
      const x=this.values,rms=Math.sqrt(mean(x.map(v=>v*v)));
      frames.push({time:(s.index+1)/SAMPLE_RATE*1000,startIndex:s.index-WINDOW+1,endIndex:s.index,rms,mav:mean(x.map(Math.abs)),wl:x.slice(1).reduce((sum,v,i)=>sum+Math.abs(v-x[i]),0),quality:this.clips.some(Boolean)?'clipped':rms<1e-7?'flat':'good'});
    }
    return frames;
  }
}
export function calibrate(rest:number[],contractions:number[][]):Calibration{
  if(contractions.length!==3)throw new Error('Three comfortable reference contractions are required.');
  const baseline=median(rest),reference=median(contractions.map(median)),noise=sd(rest),restThreshold=quantile(rest,.95);
  if(reference<=restThreshold||reference-baseline<=3*noise)throw new Error('Rest and contraction overlap. Check electrode contact and repeat calibration.');
  return {baseline,reference,restThreshold,noise};
}
export const activity=(rms:number,c:Calibration)=>(rms-c.baseline)/(c.reference-c.baseline);
export function parsePacket(text:string):{samples:Sample[];referenceV:number;adcMax:number}{
  const p=JSON.parse(text);
  if(p.sampleRate!==SAMPLE_RATE||!Number.isSafeInteger(p.startIndex)||p.startIndex<0||!Number.isInteger(p.adcMax)||p.adcMax<255||p.adcMax>65535||!Number.isFinite(p.referenceV)||p.referenceV<=0||p.referenceV>5.5||!Array.isArray(p.samples)||!p.samples.length||p.samples.length>2000||p.samples.some((v:unknown)=>typeof v!=='number'||!Number.isInteger(v)||v<0||v>p.adcMax))throw new Error('Expected 2000 Hz raw EMG JSON packets. Check the device protocol.');
  return {samples:p.samples.map((v:number,i:number)=>({index:p.startIndex+i,voltage:v/p.adcMax*p.referenceV})),referenceV:p.referenceV,adcMax:p.adcMax};
}
export function rawCsv(samples:Sample[]){return 'sample_index,voltage_v,sample_rate\n'+samples.map(s=>`${s.index},${s.voltage},${SAMPLE_RATE}`).join('\n');}
export function parseCsv(text:string):Sample[]{
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/),header=lines.shift()!.split(',');
  const ix=header.indexOf('sample_index'),vx=header.indexOf('voltage_v'),fx=header.indexOf('sample_rate');
  if(ix<0||vx<0||fx<0)throw new Error('CSV must contain sample_index, voltage_v and sample_rate. Raw waveforms only.');
  if(lines.length<2||lines.length>1_200_000)throw new Error('Choose a raw recording between 2 samples and 10 minutes.');
  let last=-1;
  return lines.map((line,i)=>{const cells=line.split(','),index=Number(cells[ix]),voltage=Number(cells[vx]);
    if(!cells[ix]?.trim()||!cells[vx]?.trim()||!Number.isSafeInteger(index)||index<0||index<=last||!Number.isFinite(voltage)||voltage<0||voltage>5.5||Number(cells[fx])!==SAMPLE_RATE)throw new Error(`Invalid raw EMG at CSV row ${i+2}. Expected increasing indices and 2000 Hz module-output volts.`);
    last=index;return {index,voltage};});
}
