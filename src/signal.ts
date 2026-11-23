export const SAMPLE_RATE=2000,WINDOW=400,STEP=100;
export const MAX_SAMPLES=2_400_000,MAX_CSV_BYTES=240_000_000;
export type OriginalSource='simulation'|'serial'|'unknown';
export type AmplitudeUnit='module_output_volts'|'adc_counts';
export type RecordingMetadata={source:OriginalSource;referenceV:number|null;adcMax:number|null;notch50Hz:boolean|null;notch100Hz?:true;recordingId?:string;amplitudeUnit?:'adc_counts'};
export type Sample={index:number;voltage:number|null;adcCount?:number};
export type Frame={time:number;centerTime:number;startIndex:number;endIndex:number;rms:number;mav:number;wl:number;quality:'good'|'clipped'|'flat'|'unverified'};
export type Calibration={baseline:number;reference:number;restThreshold:number;noise:number};
export function samplePosition(samples:Sample[],index:number){
  let low=0,high=samples.length;
  while(low<high){
    const middle=Math.floor((low+high)/2);
    if(samples[middle].index<index)low=middle+1;
    else high=middle;
  }
  return low;
}

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
  constructor(kind:'high'|'low'|'notch',frequency:number,q=Math.SQRT1_2,sampleRate=SAMPLE_RATE,initial=0){
    this.x1=this.x2=this.y1=this.y2=initial;
    const w=2*Math.PI*frequency/sampleRate,c=Math.cos(w),alpha=Math.sin(w)/(2*q),a0=1+alpha;
    const b=kind==='high'?[(1+c)/2,-(1+c),(1+c)/2]:kind==='low'?[(1-c)/2,1-c,(1-c)/2]:[1,-2*c,1];
    [this.b0,this.b1,this.b2]=b.map(v=>v/a0);this.a1=-2*c/a0;this.a2=(1-alpha)/a0;
  }
  next(x:number){const y=this.b0*x+this.b1*this.x1+this.b2*this.x2-this.a1*this.y1-this.a2*this.y2;
    this.x2=this.x1;this.x1=x;this.y2=this.y1;this.y1=y;return y;}
}
export function createNotchFilter(sampleRate:number,q:number,initial=0){
  return new Filter('notch',50,q,sampleRate,initial);
}
export class Processor {
  gaps=0;
  private filters:Filter[]=[];private values:number[]=[];private clips:boolean[]=[];
  private last=-1;private received=0;private step=0;
  constructor(public notch=false,public referenceV:number|null=3.3,public adcMax:number|null=4095,public amplitudeUnit:AmplitudeUnit='module_output_volts',public notch100Hz=false){this.reset();}
  get canCheckClipping(){return this.adcMax!==null&&(this.amplitudeUnit==='adc_counts'||this.referenceV!==null);}
  get ready(){return this.values.length===WINDOW;}
  private reset(){
    this.filters=[new Filter('high',20),new Filter('low',450)];
    if(this.notch)this.filters.push(new Filter('notch',50,25));
    if(this.notch100Hz)this.filters.push(new Filter('notch',100,35));
    this.values=[];this.clips=[];this.received=0;this.step=0;
  }
  push(samples:Sample[]):Frame[]{
    const frames:Frame[]=[];
    const countsOnly=this.amplitudeUnit==='adc_counts',verified=this.canCheckClipping;
    for(const s of samples){
      const raw=countsOnly?s.adcCount:s.voltage;
      if(!Number.isSafeInteger(s.index)||s.index<0||!Number.isSafeInteger(s.index+1)||
        typeof raw!=='number'||!Number.isFinite(raw)||
        countsOnly&&(!Number.isInteger(raw)||raw<0||this.adcMax===null||raw>this.adcMax))throw new Error('Invalid raw sample.');
      if(this.last>=0&&s.index!==this.last+1){this.gaps++;this.reset();}
      this.last=s.index;this.received++;
      let value=raw;for(const f of this.filters)value=f.next(value);
      if(this.received<=1000)continue; // Let causal filters settle after connection or a gap.
      const clipped=verified&&(countsOnly?raw<=1||raw>=this.adcMax!-1:
        raw<=this.referenceV!/this.adcMax!||raw>=this.referenceV!*(1-1/this.adcMax!));
      this.values.push(value);this.clips.push(clipped);
      if(this.values.length>WINDOW){this.values.shift();this.clips.shift();}
      this.step++;
      if(this.values.length<WINDOW||this.step%STEP!==0)continue;
      const x=this.values,rms=Math.sqrt(mean(x.map(v=>v*v)));
      frames.push({time:(s.index+1)/SAMPLE_RATE*1000,centerTime:(s.index+1-WINDOW/2)/SAMPLE_RATE*1000,startIndex:s.index-WINDOW+1,endIndex:s.index,rms,mav:mean(x.map(Math.abs)),wl:x.slice(1).reduce((sum,v,i)=>sum+Math.abs(v-x[i]),0),quality:this.clips.some(Boolean)?'clipped':rms<1e-7?'flat':verified?'good':'unverified'});
    }
    return frames;
  }
}
export function measureCalibration(rest:number[],contractions:number[][],requiredContractions:1|3=3):Calibration{
  if(contractions.length!==requiredContractions)throw new Error(requiredContractions===1?
    'One comfortable reference contraction is required.':'Three comfortable reference contractions are required.');
  const baseline=median(rest),reference=median(contractions.map(median)),noise=sd(rest),restThreshold=quantile(rest,.95);
  return {baseline,reference,restThreshold,noise};
}
export const minimumReference=(c:Calibration)=>Math.max(c.restThreshold,c.baseline+3*c.noise);
export const activity=(rms:number,c:Calibration)=>(rms-c.baseline)/(c.reference-c.baseline);
export function parsePacket(text:string):{samples:Sample[];referenceV:number|null;adcMax:number;amplitudeUnit:AmplitudeUnit}{
  const p=JSON.parse(text);
  const countsOnly=p?.mode==='adc_counts';
  const validReference=countsOnly?p.referenceV===null:p?.mode===undefined&&Number.isFinite(p?.referenceV)&&p.referenceV>0&&p.referenceV<=5.5;
  if(!validReference||p.sampleRate!==SAMPLE_RATE||!Number.isSafeInteger(p.startIndex)||p.startIndex<0||
    !Number.isInteger(p.adcMax)||p.adcMax<255||p.adcMax>65535||
    !Array.isArray(p.samples)||!p.samples.length||p.samples.length>2000||!Number.isSafeInteger(p.startIndex+p.samples.length)||
    p.samples.some((v:unknown)=>typeof v!=='number'||!Number.isInteger(v)||v<0||v>p.adcMax))throw new Error('Expected 2000 Hz raw EMG JSON packets. Check the device protocol.');
  const {startIndex,referenceV,adcMax}=p;
  return {samples:p.samples.map((adcCount:number,i:number)=>({index:startIndex+i,voltage:countsOnly?null:adcCount/adcMax*referenceV,adcCount})),
    referenceV,adcMax,amplitudeUnit:countsOnly?'adc_counts':'module_output_volts'};
}
export function rawCsv(samples:Sample[],metadata?:RecordingMetadata){
  const suffix=metadata?`,${metadata.source},${metadata.referenceV??''},${metadata.adcMax??''},${metadata.notch50Hz??''}`:'';
  const countsOnly=metadata?.amplitudeUnit==='adc_counts';
  const withAdc=countsOnly||samples.some(sample=>sample.adcCount!==undefined);
  const header=(countsOnly?'sample_index,sample_rate':'sample_index,voltage_v,sample_rate')+(metadata?',origin_source,reference_v,adc_max,notch_50hz':'')+
    (metadata?.notch100Hz?',notch_100hz':'')+
    (withAdc?',adc_count':'')+(metadata?.recordingId?',recording_id':'');
  return header+'\n'+samples.map((sample,index)=>
    (countsOnly?`${sample.index},${SAMPLE_RATE}`:`${sample.index},${sample.voltage},${SAMPLE_RATE}`)+suffix+
    (metadata?.notch100Hz?',true':'')+
    (withAdc?`,${sample.adcCount??''}`:'')+
    (metadata?.recordingId?`,${index===0?metadata.recordingId:''}`:'')
  ).join('\n');
}
export function parseRecordingCsv(text:string):{samples:Sample[];metadata:RecordingMetadata}{
  if(text.length>MAX_CSV_BYTES||(text.length>MAX_CSV_BYTES/3&&new TextEncoder().encode(text).byteLength>MAX_CSV_BYTES))throw new Error('Choose a CSV no larger than 240 MB.');
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/),header=lines.shift()!.split(',');
  const ix=header.indexOf('sample_index'),vx=header.indexOf('voltage_v'),fx=header.indexOf('sample_rate');
  const adcIndex=header.indexOf('adc_count'),recordingIndex=header.indexOf('recording_id'),countsOnly=vx<0&&adcIndex>=0;
  if(ix<0||fx<0||vx<0&&!countsOnly)throw new Error('CSV must contain sample_index, sample_rate and voltage_v or adc_count. Raw waveforms only.');
  if(lines.length<2||lines.length>MAX_SAMPLES)throw new Error('Choose a raw recording between 2 samples and 20 minutes.');
  const columns=['origin_source','reference_v','adc_max','notch_50hz'],positions=columns.map(name=>header.indexOf(name));
  const harmonicIndex=header.indexOf('notch_100hz');
  const hasMetadata=positions.some(position=>position>=0);
  if(hasMetadata&&positions.some(position=>position<0)||new Set(header).size!==header.length)throw new Error('CSV recording metadata columns must be complete and unique.');
  if((countsOnly||harmonicIndex>=0)&&!hasMetadata)throw new Error('Raw ADC recordings and filter settings require device metadata.');
  let metadata:RecordingMetadata={source:'unknown',referenceV:null,adcMax:null,notch50Hz:null};
  let last=-1;
  const samples=lines.map((line,i)=>{const cells=line.split(','),index=Number(cells[ix]),voltage=countsOnly?null:Number(cells[vx]);
    if(!cells[ix]?.trim()||!Number.isSafeInteger(index)||!Number.isSafeInteger(index+1)||index<0||index<=last||
      voltage!==null&&(!cells[vx]?.trim()||!Number.isFinite(voltage)||voltage<0||voltage>5.5)||
      Number(cells[fx])!==SAMPLE_RATE)throw new Error(`Invalid raw EMG at CSV row ${i+2}. Expected increasing indices and 2000 Hz samples.`);
    if(hasMetadata){
      const [source,reference,adc,notch]=positions.map(position=>cells[position]?.trim());
      const referenceV=reference===''?null:Number(reference),adcMax=adc===''?null:Number(adc),notch50Hz=notch===''?null:notch==='true';
      if(!['simulation','serial','unknown'].includes(source)||referenceV!==null&&(!Number.isFinite(referenceV)||referenceV<=0||referenceV>5.5)||adcMax!==null&&(!Number.isInteger(adcMax)||adcMax<255||adcMax>65535)||!['','true','false'].includes(notch))throw new Error(`Invalid recording metadata at CSV row ${i+2}.`);
      if(countsOnly&&(source!=='serial'||referenceV!==null||adcMax===null))throw new Error('Raw ADC recordings require a serial source and ADC maximum.');
      if(harmonicIndex>=0&&(cells[harmonicIndex]!=='true'||notch50Hz!==true))throw new Error(`Invalid 100 Hz notch metadata at CSV row ${i+2}.`);
      const rowMetadata:RecordingMetadata={source:source as OriginalSource,referenceV,adcMax,notch50Hz,
        ...(countsOnly?{amplitudeUnit:'adc_counts'}:{}),...(harmonicIndex>=0?{notch100Hz:true}:{})};
      if(i&&(rowMetadata.source!==metadata.source||referenceV!==metadata.referenceV||adcMax!==metadata.adcMax||notch50Hz!==metadata.notch50Hz))throw new Error('Conflicting recording metadata at CSV row '+(i+2));
      if(!i)metadata=rowMetadata;
    }
    if(recordingIndex>=0){
      const id=cells[recordingIndex];
      if(!i&&id&&/^[a-zA-Z0-9_-]{1,100}$/.test(id))metadata.recordingId=id;
      else if(!i||id!==''&&id!==metadata.recordingId)throw new Error(`Invalid recording ID at CSV row ${i+2}.`);
    }
    last=index;
    const count=adcIndex>=0?cells[adcIndex]:'';
    if(count===''&&!countsOnly)return {index,voltage};
    const adcCount=Number(count);
    const {referenceV,adcMax}=metadata;
    if(!/^\d+$/.test(count??'')||!Number.isSafeInteger(adcCount)||adcMax===null||adcCount>adcMax||
      voltage!==null&&(referenceV===null||Math.abs(adcCount/adcMax*referenceV-voltage)>1e-9))throw new Error(`Invalid ADC count or voltage at CSV row ${i+2}.`);
    return {index,voltage,adcCount};
  });
  return {samples,metadata};
}
