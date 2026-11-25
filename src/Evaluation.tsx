import {memo,useMemo,useState} from 'react';
import {bandProgress,trendGroups} from './progress';
import type {TrialResult} from './session';
import type {SavedResult} from './records';
import type {Engine} from './engine';
import {auditRecording} from './recordingAudit';
import {samplePosition,MAX_CSV_BYTES} from './signal';

const pct=(n:number)=>Math.round(n*1000)/10+'%';
const bandName=(target:number)=>target===.3?'Light squeeze':'Firmer squeeze';
const range=(target:number,tol:number)=>pct(target-tol)+'–'+pct(target+tol);
const points=(delta:number)=>String(Math.round(Math.abs(delta)*10)/10);
export function BandResults({rows,compact=false}:{rows:TrialResult[];compact?:boolean}){
  return <section aria-label="Control by target"><h3>Control by target</h3><div className="band-grid">{[.3,.6].map(target=>{
    const trial=rows.find(t=>t.target===target);
    if(!trial)return <article key={target}><h4>{bandName(target)}</h4><p>No scored trials yet.</p></article>;
    const {baseline,final,change}=bandProgress(rows,target,trial.tolerance);
    return <article key={target}><h4>{bandName(target)} · {range(target,trial.tolerance)}</h4>
      {[baseline,final].map((phase,i)=>{
        return <p key={i}><strong>{i===0?'Before':'After'}: {phase.rate===null?'—':pct(phase.rate)}</strong> in target · {phase.valid}/{phase.total} valid
          {!compact&&<small>Relaxation observed in {phase.releases}/{phase.valid} valid trials{phase.relaxMs!==null?' · average '+(phase.relaxMs/1000).toFixed(2)+' s':''}</small>}</p>;
      })}
      <b>{change===null?(!baseline.valid?'Awaiting valid baseline trials.':'Awaiting valid final trials.'):points(change)==='0'?'Same time in target to the displayed precision.':(change>0?'Increased':'Decreased')+' by '+points(change)+' percentage points.'}</b>
    </article>;
  })}</div></section>;
}
export function Trends({records,playerId}:{records:SavedResult[];playerId:string}){
  const groups=trendGroups(records,playerId);
  return <section><h3>Progress over time</h3>{!groups.length&&<p>Complete final trials with a recorded calibration method to see your trend.</p>}
    {groups.map((group,i)=><article className="trend-block" key={i}><h4>{bandName(group.target)} · {range(group.target,group.tolerance)}</h4><small>{group.settings}</small><p>{group.points.length===1?'First comparable round. A second round will show the change.':'Final-block time in target changed from '+pct(group.points[0].rate)+' to '+pct(group.points.at(-1)!.rate)+' across '+group.points.length+' rounds.'}</p>
      {group.points.map((p,index)=><div className="trend-point" key={p.record.id}><span>{new Date(p.record.createdAt).toLocaleString()} · Round {p.record.number}</span><meter min={0} max={1} value={p.rate}/><b>{pct(p.rate)}</b><span>{p.count} valid{index?' · '+(Math.round((p.rate-group.points[index-1].rate)*1000)/10)+' pp':''}</span></div>)}</article>)}</section>;
}

type Trace={raw:{x:number;y:number}[];activity:{x:number;y:number}[];unit:string};
const TracePlot=memo(function TracePlot({data,row}:{data:Trace;row:TrialResult}){
  const duration=(row.endMs!-row.contractStartMs!)/1000;
  const t0=(row.holdStartMs!-row.contractStartMs!)/1000,t1=(row.restStartMs!-row.contractStartMs!)/1000;
  const x=(t:number)=>64+600*t/duration;
  function plot(series:Trace['raw'],top:number,title:string,band:boolean){
    if(!series.length)return null;
    let lo=band?0:Infinity,hi=band?row.target+row.tolerance:-Infinity;
    for(const p of series){lo=Math.min(lo,p.y);hi=Math.max(hi,p.y);}
    const y=(n:number)=>top+80-80*(n-lo)/(hi-lo||1);
    // Preserve the extremes of each horizontal bin so short peaks remain visible.
    const bins=new Map<number,{min:number;max:number}>();
    for(const p of series){const pixel=Math.round(x(p.x)),b=bins.get(pixel);
      bins.set(pixel,{min:Math.min(b?.min??p.y,p.y),max:Math.max(b?.max??p.y,p.y)});}
    const path=band?series.map((p,i)=>(i&&p.x-series[i-1].x<.076?'L':'M')+x(p.x).toFixed(1)+' '+y(p.y).toFixed(1)).join(' '):
      [...bins].map(([p,b])=>'M'+p+' '+y(b.min)+'V'+(y(b.max)-.5)).join(' ');
    return <g><text x="64" y={top-7}>{title}</text><rect x={x(t0)} y={top} width={x(t1)-x(t0)} height="80" fill="#f4e6c5"/>
      {band&&<rect x={x(t0)} y={y(row.target+row.tolerance)} width={x(t1)-x(t0)} height={y(row.target-row.tolerance)-y(row.target+row.tolerance)} fill="#9fd4ab"/>}
      <path d={path} fill="none" stroke="#166857" strokeWidth="1.4"/><text x="5" y={top+9}>{hi.toFixed(2)}</text><text x="5" y={top+79}>{lo.toFixed(2)}</text></g>;
  }
  return <figure className="trial-plot"><svg viewBox="0 0 700 252" role="img" aria-label="Raw EMG and normalized activity on a shared time axis">
    {plot(data.raw,24,'Raw EMG ('+data.unit+')',false)}{plot(data.activity,140,'Normalized activity',true)}
    {[0,t0,t1,duration].map((t,i)=><text key={i} x={x(t)} y="244" textAnchor="middle">{t.toFixed(1)} s</text>)}</svg>
    <figcaption>Amber: scored hold. Green: target band. Relaxation begins at {t1.toFixed(1)} s.</figcaption></figure>;
});

export function Evidence({record,engine}:{record:SavedResult;engine?:Engine|null}){
  const [trial,setTrial]=useState(1),[pair,setPair]=useState<{csv:File;json:File}|null>(null);
  const [loaded,setLoaded]=useState<{trial:number;data:Trace}|null>(null),[error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const row=record.results.find(t=>t.trial===trial);
  const live=useMemo(()=>{
    if(!engine||engine.createdAt!==record.createdAt||!row||row.contractStartMs===undefined||row.endMs===undefined)return null;
    const origin=row.contractStartMs;
    const samples=engine.raw.slice(samplePosition(engine.raw,origin*2),samplePosition(engine.raw,row.endMs*2));
    if(!samples.length)return null;
    return {raw:samples.map(s=>({x:(s.index/2-origin)/1000,y:s.adcCount??s.voltage!})),unit:samples[0].adcCount===undefined?'V':'counts',
      activity:engine.windows.filter(w=>w.quality==='good'&&w.conditionId===record.conditionId&&w.time>=origin&&w.time<=row.endMs!&&w.activity!==null).map(w=>({x:(w.time-origin)/1000,y:w.activity!}))};
  },[engine,record.createdAt,record.conditionId,row]);
  async function readPair(files:{csv:File;json:File},trialNumber:number){
    setBusy(true);setError('');setPair(null);setLoaded(null);
    try{
      if(files.csv.size>MAX_CSV_BYTES||files.json.size>MAX_CSV_BYTES)throw Error('The selected recording exceeds the size limit.');
      const [csv,json]=await Promise.all([files.csv.text(),files.json.text()]);
      const session=JSON.parse(json),round=session.sessions?.find((s:{number:number})=>s.number===record.number);
      const matched=round?.results?.find((r:TrialResult)=>r.trial===trialNumber);
      const saved=record.results.find(r=>r.trial===trialNumber);
      const sameFields=(stored:object,exported:Record<string,unknown>|undefined)=>!!exported&&Object.entries(stored).every(([key,value])=>exported[key]===value);
      if(!saved||session.createdAt!==record.createdAt||session.source!==record.source||session.originalSource!==record.originalSource||round?.conditionId!==record.conditionId||
        !sameFields(record.config,session.config)||!sameFields(record.calibration,round?.calibration)||!sameFields(saved,matched))
        throw Error('Choose the paired export for this round and trial.');
      const trace=auditRecording(csv,json,{round:record.number,trial:trialNumber}).trialTrace;
      if(!trace)throw Error('No trial trace is available.');
      setLoaded({trial:trialNumber,data:{raw:trace.raw.map(s=>({x:(s.index/2-trace.contractStartMs)/1000,y:s.adcCount??s.voltage!})),
        unit:trace.raw[0].adcCount===undefined?'V':'counts',activity:trace.windows.filter(w=>w.quality==='good'&&w.activity!==null).map(w=>({x:(w.time-trace.contractStartMs)/1000,y:w.activity!}))}});
      setPair(files);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const data=live??(loaded?.trial===trial?loaded.data:null),report=record.modelReport;
  return <section className="evidence"><h3>Signal &amp; feedback</h3><p>{record.originalSource==='simulation'?'Simulation':record.originalSource==='serial'?'Reported serial acquisition':'Unknown source'} · {record.config.sampleRate} Hz · {record.protocol??'Unspecified'} reference · Rest RMS {record.calibration.baseline.toPrecision(3)} / comfortable squeeze RMS {record.calibration.reference.toPrecision(3)} ({record.config.amplitudeUnit})</p>
    {row&&<label>Trial <select aria-label="Trial" disabled={busy} value={trial} onChange={e=>{const n=Number(e.target.value);setTrial(n);if(pair)void readPair(pair,n);}}>{record.results.map(r=><option key={r.trial} value={r.trial}>{r.trial} · {r.block} · {bandName(r.target)}</option>)}</select></label>}
    {row&&<p>{row.valid?'Valid':'Invalid'} trial · target {range(row.target,row.tolerance)} · time in target {row.inZone===null?'unavailable':pct(row.inZone)}</p>}
    {data&&row&&row.holdStartMs!==undefined&&<TracePlot row={row} data={data}/>}
    {!live&&row&&<label className="file-label">Load matching raw CSV and session JSON<input type="file" multiple accept=".csv,.json" disabled={busy} onChange={e=>{
      const files=Array.from(e.target.files??[]),csv=files.find(f=>/\.csv$/i.test(f.name)),json=files.find(f=>/\.json$/i.test(f.name));e.target.value='';
      if(csv&&json)void readPair({csv,json},trial);else setError('Select both files together.');
    }}/></label>}{error&&<p role="alert">{error}</p>}
    <h3>AI classification</h3><p>Water follows RMS relative to the relaxed baseline and comfortable squeeze reference. A value of 1.0 corresponds to that reference. The kNN model uses RMS, mean absolute value and waveform length to estimate the contraction state.</p>
    {report?<><p>Held-out window accuracy: {pct(report.accuracy)}</p><table><caption>Actual state by predicted state</caption><thead><tr>{['State','Rest','Light','Firmer','Recall'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{report.matrix.map((r,i)=><tr key={i}><th>{['Rest','Light','Firmer'][i]}</th>{r.map((v,j)=><td key={j}>{v}</td>)}<td>{pct(report.recall[i])}</td></tr>)}</tbody></table></>:<p>No classifier evaluation was saved for this round. To include one, collect 18 labelled trials, review them and fit the classifier before starting training.</p>}</section>;
}
