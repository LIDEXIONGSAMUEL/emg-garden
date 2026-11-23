import type {Calibration,OriginalSource} from './signal';
import type {CalibrationProtocol,TrialResult} from './session';
import type {AcquisitionSetup,Engine,Source} from './engine';
import type {ModelReport} from './model';
import {DEFAULT_EMG_BAUD,UNO_EMG_BAUD,type EmgBaudRate} from './serial';

type Config=ReturnType<Engine['export']>['config'];
export type SavedReference={conditionId:string;config:Config;calibration:Calibration;setup:AcquisitionSetup;baudRate:EmgBaudRate;protocol?:CalibrationProtocol};
export type SavedResult={schema:'emg-garden-result/1';id:string;createdAt:string;source:Source;originalSource:OriginalSource;state:'complete'|'stopped'|'interrupted';number:number;conditionId:string;config:Config;calibration:Calibration;results:TrialResult[];modelReport:ModelReport|null};
const KEY='emg-garden.saved-results.v1';
const REFERENCE_KEY='emg-garden.saved-reference.v1';
type Obj=Record<string,unknown>;
const invalid=()=>new Error('Invalid results file. Use an EMG Garden session export.');
function object(v:unknown):Obj{if(!v||typeof v!=='object'||Array.isArray(v))throw invalid();return v as Obj;}
function num(v:unknown,min=-Infinity,max=Infinity){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw invalid();return v;}
function text(v:unknown,max=200){if(typeof v!=='string'||!v.length||v.length>max||/[\u0000-\u001f]/.test(v))throw invalid();return v;}
function bool(v:unknown){if(typeof v!=='boolean')throw invalid();return v;}
function values(v:unknown,max:number){if(!Array.isArray(v)||v.length>max)throw invalid();return v;}
const nullable=(v:unknown,min=-Infinity,max=Infinity)=>v===null?null:num(v,min,max);
function calibration(v:unknown,max:number):Calibration{
  const c=object(v),baseline=num(c.baseline,0,max),reference=num(c.reference,0,max),restThreshold=num(c.restThreshold,0,max),noise=num(c.noise,0,max);
  if(reference<=restThreshold||restThreshold<baseline||reference-baseline<=3*noise)throw invalid();
  return {baseline,reference,restThreshold,noise};
}
function config(v:unknown):Config{
  const c=object(v);
  if(c.sampleRate!==2000||c.windowSamples!==400||c.stepSamples!==100||c.highpassHz!==20||c.lowpassHz!==450||c.referenceType!=='comfortable_not_MVC'||
    c.amplitudeUnit!=='module_output_volts'&&c.amplitudeUnit!=='adc_counts')throw invalid();
  const referenceV=nullable(c.referenceV,Number.MIN_VALUE,5.5),adcMax=nullable(c.adcMax,255,65535);
  if(adcMax!==null&&!Number.isInteger(adcMax)||c.amplitudeUnit==='adc_counts'&&(referenceV!==null||adcMax===null))throw invalid();
  if(c.notch100Hz!==undefined&&(c.notch100Hz!==true||c.notch50Hz!==true))throw invalid();
  return {sampleRate:2000,windowSamples:400,stepSamples:100,warmupSamples:num(c.warmupSamples,0,2000),highpassHz:20,lowpassHz:450,notch50Hz:c.notch50Hz===null?null:bool(c.notch50Hz),...(c.notch100Hz===true?{notch100Hz:true as const}:{}),referenceV,adcMax,amplitudeUnit:c.amplitudeUnit,referenceType:'comfortable_not_MVC'};
}
function parseReference(v:unknown):SavedReference{
  const record=object(v),settings=config(record.config),setup=object(record.setup);
  const {baudRate,protocol}=record;
  if(baudRate!==UNO_EMG_BAUD&&baudRate!==DEFAULT_EMG_BAUD)throw invalid();
  if(protocol!==undefined&&protocol!=='quick'&&protocol!=='full')throw invalid();
  if(settings.adcMax===null||settings.notch50Hz===null||
    settings.amplitudeUnit==='module_output_volts'&&settings.referenceV===null)throw invalid();
  return {
    conditionId:text(record.conditionId),config:settings,
    calibration:calibration(record.calibration,settings.amplitudeUnit==='adc_counts'?settings.adcMax:5.5),
    setup:{device:setup.device===''?'':text(setup.device,120),electrodePlacement:setup.electrodePlacement===''?'':text(setup.electrodePlacement,120)},
    baudRate,protocol,
  };
}
export function loadReference():SavedReference|null{
  try{
    const stored=localStorage.getItem(REFERENCE_KEY);
    return stored?parseReference(JSON.parse(stored)):null;
  }catch{return null;}
}
export function saveReference(value:SavedReference){
  const record=parseReference(value);
  localStorage.setItem(REFERENCE_KEY,JSON.stringify(record));
  return record;
}
export function matchesReference(value:SavedReference,settings:Config,baudRate:EmgBaudRate){
  return value.baudRate===baudRate&&value.config.notch100Hz===settings.notch100Hz&&(Object.keys(settings) as (keyof Config)[])
    .every(key=>settings[key]===value.config[key]);
}
function trial(v:unknown):TrialResult{
  const r=object(v),n=num(r.trial,1,30),block=n<=6?'baseline':n<=24?'practice':'final',round=block==='practice'?Math.floor((n-7)/6)+1:1;
  if(!Number.isInteger(n)||r.block!==block||r.round!==round||r.target!==(n%2===1?.3:.6)||r.tolerance!==.1)throw invalid();
  const result:TrialResult={trial:n,block,round,target:n%2===1?.3:.6,tolerance:.1,error:nullable(r.error,0),inZone:nullable(r.inZone,0,1),variation:nullable(r.variation,0),coverage:num(r.coverage,0,1),restCoverage:num(r.restCoverage,0,1),residual:nullable(r.residual),relaxationMs:nullable(r.relaxationMs,0,5000),rewarded:bool(r.rewarded),interrupted:bool(r.interrupted),valid:bool(r.valid)};
  if(result.valid&&(result.coverage<.8||result.restCoverage<.8||result.interrupted||result.error===null||result.inZone===null||result.variation===null))throw invalid();
  if(result.error!==null&&result.inZone!==null&&(result.error+1e-9<(1-result.inZone)*result.tolerance||result.inZone===1&&result.error>result.tolerance+1e-9))throw invalid();
  const keys=['contractStartMs','holdStartMs','holdEndMs','restStartMs','endMs'] as const;
  if(keys.some(k=>r[k]!==undefined)){
    const times=keys.map(k=>num(r[k],0));
    if(times.some((t,i)=>i>0&&t<times[i-1])||times[1]===times[2]||times[3]===times[4])throw invalid();
    if(!result.interrupted&&[times[1]-times[0]-3000,times[2]-times[1]-2000,times[3]-times[2],times[4]-times[3]-5000].some(delta=>Math.abs(delta)>1e-6))throw invalid();
    keys.forEach((k,i)=>{result[k]=times[i];});
  }
  return result;
}
function report(v:unknown):ModelReport|null{
  if(v===null||v===undefined)return null;const r=object(v);
  const trainingTrials=values(r.trainingTrials,12).map(v=>text(v,128)),testTrials=values(r.testTrials,6).map(v=>text(v,128));
  if(trainingTrials.length!==12||testTrials.length!==6||new Set([...trainingTrials,...testTrials]).size!==18)throw invalid();
  const matrix=values(r.matrix,3).map(row=>values(row,3).map(v=>{const n=num(v,0,1000000);if(!Number.isInteger(n))throw invalid();return n;}));
  if(matrix.length!==3||matrix.some(row=>row.length!==3||!row.some(Boolean)))throw invalid();
  const recall=values(r.recall,3).map(v=>num(v,0,1)),accuracy=num(r.accuracy,0,1);
  if(recall.length!==3||recall.some((v,i)=>Math.abs(v-matrix[i][i]/matrix[i].reduce((a,b)=>a+b,0))>1e-9)||Math.abs(accuracy-matrix.reduce((n,row,i)=>n+row[i],0)/matrix.flat().reduce((a,b)=>a+b,0))>1e-9)throw invalid();
  return {trainingTrials,testTrials,matrix,recall,accuracy};
}
function saved(v:unknown):SavedResult{
  const r=object(v),source=text(r.source),originalSource=text(r.originalSource),state=text(r.state),createdAt=text(r.createdAt),number=num(r.number,1,50);
  if(r.schema!=='emg-garden-result/1'||!['simulation','serial','replay'].includes(source)||!['simulation','serial','unknown'].includes(originalSource)||source!=='replay'&&source!==originalSource||!['complete','stopped','interrupted'].includes(state)||!Number.isFinite(Date.parse(createdAt))||!Number.isInteger(number))throw invalid();
  const results=values(r.results,30).map(trial);
  const settings=config(r.config);
  if(settings.amplitudeUnit==='adc_counts'&&originalSource!=='serial')throw invalid();
  if(results.some((t,i)=>t.trial!==i+1)||state==='complete'&&results.length!==30)throw invalid();
  return {schema:'emg-garden-result/1',id:text(r.id),createdAt,source:source as Source,originalSource:originalSource as OriginalSource,state:state as SavedResult['state'],number,conditionId:text(r.conditionId),config:settings,calibration:calibration(r.calibration,settings.amplitudeUnit==='adc_counts'?settings.adcMax!:5.5),results,modelReport:report(r.modelReport)};
}
export function parseResultFile(input:string):SavedResult[]{
  if(input.length>20_000_000)throw new Error('Choose a results JSON smaller than 20 MB.');
  let r:Obj;try{r=object(JSON.parse(input));}catch{throw invalid();}
  if(r.schema==='emg-garden-result/1')return [saved(r)];
  if(!['emg-garden-0.1.0','emg-garden-0.1.1','emg-garden-1.0.0'].includes(String(r.schema)))throw invalid();
  const sessions=r.sessions===undefined?[{number:1,state:r.sessionState,calibration:r.calibration,results:r.results}]:values(r.sessions,50);
  const originalSource=r.originalSource??(r.source==='replay'?'unknown':r.source);
  const records=sessions.map(value=>{
    const s=object(value);if(!['running','paused','complete','stopped'].includes(String(s.state)))throw invalid();
    return saved({schema:'emg-garden-result/1',id:`${text(r.createdAt)}:session-${num(s.number,1,50)}`,createdAt:r.createdAt,source:r.source,originalSource,state:s.state==='complete'?'complete':s.state==='stopped'?'stopped':'interrupted',number:s.number,conditionId:s.conditionId??`${text(r.createdAt)}:legacy-session-${s.number}`,config:r.config,calibration:s.calibration,results:s.results,modelReport:s.modelReport});
  });
  if(!records.length||new Set(records.map(r=>r.id)).size!==records.length)throw invalid();return records;
}
export function loadResults():SavedResult[]{
  try{const raw=localStorage.getItem(KEY);if(!raw)return [];const rows=values(JSON.parse(raw),50).map(saved);if(new Set(rows.map(r=>r.id)).size!==rows.length)throw invalid();return rows;}
  catch{throw new Error('Saved results cannot be read on this browser. Keep your downloaded backup.');}
}
export function saveResults(records:SavedResult[]):void{
  const existing=loadResults(),next=new Map(existing.map(r=>[r.id,r]));records.map(saved).forEach(r=>next.set(r.id,r));
  if(next.size>50)throw new Error('The local store has 50 results. Download and delete an old result before saving another.');
  try{localStorage.setItem(KEY,JSON.stringify([...next.values()]));}catch{throw new Error('Could not save results on this browser. Download the results before leaving.');}
}
export function deleteResult(id:string):void{
  const rows=loadResults().filter(r=>r.id!==id);
  try{localStorage.setItem(KEY,JSON.stringify(rows));}catch{throw new Error('Could not update local storage. The result was not deleted.');}
}
