import {useEffect,useRef,useState} from 'react';
import {Engine,type Source} from './engine';
import {SimulationSignal,type SimulationScenario} from './simulation';
import {Processor,parseRecordingCsv,rawCsv,mean,MAX_CSV_BYTES,type Sample} from './signal';
import {connectSerial,serialSupported} from './serial';
import type {TrialResult} from './session';
import {parseResultFile,loadResults,saveResults,deleteResult,type SavedResult} from './records';
import {HandCue,type HandAction} from './HandCue';

const LABELS=['Relaxed','Light contraction','Stronger contraction'];
const SCENARIOS={unsteady:'Unsteady effort',drift:'Effort drift',gap:'Sample gap'};
const percent=(v:number|null)=>v===null?'Not available':`${Math.round(v*100)}%`;
const sourceName=(source:string)=>source==='simulation'?'Recorded simulation':source==='serial'?'Reported EMG recording':'Source unknown';
function download(name:string,body:string,type='application/json'){
  const url=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function Garden({level,target,active,resting,rewarded}:{level:number;target:number;active:boolean;resting:boolean;rewarded:boolean}){
  const water=Math.max(0,Math.min(1,level)),inZone=active&&Math.abs(level-target)<=.1;
  return <svg viewBox="0 0 680 390" role="img" aria-label={resting?'Water stops as you relax.':`Water level ${Math.round(water*100)} percent of your comfortable reference.`}>
    <defs><linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#459ff0"/><stop offset="1" stopColor="#a9daf6"/></linearGradient></defs>
    <ellipse cx="380" cy="358" rx="145" ry="9" fill="#e5e9e8"/>
    <path d="M380 297V170" stroke="#3c7654" strokeWidth="9" strokeLinecap="round"/>
    <path d="M379 265Q323 214 320 249Q333 275 379 280M383 240Q440 186 446 221Q430 252 383 255" fill="#6c9a72"/>
    <g className={rewarded?'bloom rewarded':'bloom'}>
      {[0,60,120,180,240,300].map(angle=><ellipse key={angle} cx="380" cy="137" rx="18" ry="31" transform={`rotate(${angle} 380 170)`} fill={rewarded?'#eeb35d':'#e2c795'}/>)}
      <circle cx="380" cy="170" r="21" fill="#916c3a"/>
    </g>
    <path d="M320 293H441L427 350H334Z" fill="#b77c63"/><rect x="313" y="284" width="135" height="18" rx="5" fill="#c68a70"/>
    <path d="M145 115H218Q230 115 230 127V166Q230 182 214 182H154Q139 182 139 167V127Q139 115 145 115Z" fill="#d7dfe5"/>
    <path d="M140 134Q103 113 105 145Q106 171 140 163" fill="none" stroke="#aebdc8" strokeWidth="9"/>
    <path d="M229 137L287 159L278 177L226 159" fill="#bdcbd5"/>
    {active&&!resting&&water>.025&&<g opacity={inZone?.95:.55} className="flow"><path d={`M281 170Q304 202 340 276`} fill="none" stroke="url(#water)" strokeWidth={4+water*13} strokeLinecap="round" strokeDasharray="3 12"/></g>}
    <g transform="translate(545 70)"><rect width="32" height="240" rx="16" fill="#e6edf2"/>
      {active&&!resting&&<><rect x="-12" y={(1-target-.1)*240} width="56" height="48" rx="8" fill="#d1e6d6"/><path d={`M-14 ${(1-target-.1)*240}H46M-14 ${(1-target+.1)*240}H46`} stroke="#49815a" strokeWidth="2"/></>}
      <rect y={(1-water)*240} width="32" height={water*240} rx="12" fill="#338ed6"/>
      <text x="16" y="267" textAnchor="middle" className="svg-label">Effort</text>
      {active&&!resting&&<text x="-28" y={(1-target)*240+6} textAnchor="end" className="svg-label">Target</text>}
    </g>
  </svg>;
}
function Wave({values}:{values:number[]}){
  const extent=Math.max(.025,...values.map(Math.abs));
  const points=values.map((v,i)=>`${i/(Math.max(1,values.length-1))*720},${50-v/extent*42}`).join(' ');
  return <svg className="wave" viewBox="0 0 720 100" role="img" aria-label="Processed EMG amplitude trend"><path d="M0 50H720" stroke="#dfe4e9"/><polyline points={points} fill="none" stroke="#2177b9" strokeWidth="2"/></svg>;
}
function Results({results,simulated}:{results:TrialResult[];simulated:boolean}){
  const groups=['baseline','practice','final'] as const;
  return <section className="results"><h2>Session results</h2><p>{simulated?'Synthetic signal only. These results do not measure a person.':'Control performance relative to a comfortable reference, not strength or a health score.'}</p>
    <div className="table-scroll"><table><thead><tr><th>Measure</th>{groups.map(g=><th key={g}>{g==='baseline'?'Before practice':g==='final'?'After practice':'Practice'}</th>)}</tr></thead><tbody>
      {['Valid trials','Time in target','Target error','Steadiness','Time to relax','Relaxation observed','Residual activity'].map((label,i)=><tr key={label}><th>{label}</th>{groups.map(g=>{
        const all=results.filter(r=>r.block===g),valid=all.filter(r=>r.valid),values=valid.flatMap(r=>{const value=i===1?r.inZone:i===2?r.error:i===3?r.variation:i===6?r.residual:r.relaxationMs;return value===null?[]:[value];});
        return <td key={g}>{i===0?`${valid.length} / ${all.length}`:i===5?`${values.length} / ${valid.length}`:!values.length?'Not available':i===4?`${(mean(values)/1000).toFixed(2)} s`:percent(mean(values))}</td>;
      })}</tr>)}
    </tbody></table></div><p className="fine">Steadiness is the activity standard deviation. Residual activity is measured near the end of rest. Time to relax includes only observed relaxations; the count is shown separately. Only uninterrupted trials with enough valid data enter this summary. Before and after use the same six targets.</p>
  </section>;
}
export default function App(){
  const engine=useRef<Engine|null>(null),demo=useRef(new SimulationSignal()),replay=useRef<Sample[]>([]),replayIndex=useRef(0);
  const transport=useRef<{stop:()=>Promise<void>}|null>(null),generation=useRef(0),lastReceived=useRef(0);
  const mode=useRef<Source|null>(null),manual=useRef(.3),follow=useRef(true),alive=useRef(true),running=useRef(false);
  const [,render]=useState(0),[connecting,setConnecting]=useState(false),[error,setError]=useState(''),[notch,setNotch]=useState(false),[reviewed,setReviewed]=useState(false),[audio,setAudio]=useState(false);
  const [auto,setAuto]=useState(true),[effort,setEffort]=useState(.3),[sourceActive,setSourceActive]=useState(false);
  const [scenarioChoice,setScenarioChoice]=useState<SimulationScenario>('unsteady');
  const [saved,setSaved]=useState<SavedResult[]>([]),[viewed,setViewed]=useState<SavedResult|null>(null),[saveError,setSaveError]=useState(''),[saveNotice,setSaveNotice]=useState('');
  useEffect(()=>{try{setSaved(loadResults());}catch(ex){setSaveError((ex as Error).message);}},[]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;running.current=false;generation.current++;void transport.current?.stop();};},[]);
  const refresh=()=>{if(alive.current)render(v=>v+1);};
  const handleError=(message:string)=>{engine.current?.interrupt(message);running.current=false;setSourceActive(false);setError(message);refresh();};
  useEffect(()=>{
    const timer=setInterval(()=>{
      const e=engine.current;if(!e)return;
      try{
        if(running.current&&mode.current==='simulation'){
          let target=manual.current;
          if(follow.current){target=e.calibrationRun?.state==='running'?(e.calibrationRun.instruction==='contract'?1:0):e.collection?.state==='running'?e.collection.target:e.session?.state==='running'?(e.session.phase==='rest'?0:e.session.target):0;}
          const scenario=demo.current.scenario,samples=demo.current.next(100,target);
          if(samples.length){e.receive(samples);lastReceived.current=performance.now();}
          if(scenario&&!demo.current.scenario)e.event('simulation_scenario_ended',{scenario});
        }else if(running.current&&mode.current==='replay'){
          const chunk=replay.current.slice(replayIndex.current,replayIndex.current+100);
          if(chunk.length){e.receive(chunk);replayIndex.current+=chunk.length;lastReceived.current=performance.now();}
          else{running.current=false;setSourceActive(false);e.event('replay_ended');}
        }
        if(running.current&&performance.now()-lastReceived.current>500){e.interrupt('No fresh signal. Check the connection before resuming.');}
      }catch(ex){handleError((ex as Error).message);}
      refresh();
    },50);
    const visibility=()=>{if(document.hidden){engine.current?.session?.pause('Paused while this page is hidden.');if(engine.current?.calibrationRun?.state==='running'||engine.current?.collection?.state==='running')engine.current.interrupt('Page was hidden. Repeat the recording step.');}};
    document.addEventListener('visibilitychange',visibility);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  async function prepare(source:Source){
    if(engine.current?.raw.length&&!window.confirm('Starting a new signal source replaces the current local recording. Download it first if needed. Continue?'))return false;
    generation.current++;running.current=false;await transport.current?.stop();transport.current=null;
    engine.current=new Engine(source,notch);mode.current=source;lastReceived.current=performance.now();setReviewed(false);setError('');setSaveNotice('');setViewed(null);setSourceActive(false);return true;
  }
  async function startDemo(){if(!await prepare('simulation'))return;demo.current=new SimulationSignal();running.current=true;setSourceActive(true);refresh();}
  async function connect(){
    if(!serialSupported()){setError('Connect using Chrome on this Mac. Open the local website directly, not an embedded browser.');return;}
    setConnecting(true);
    try{
      if(!await prepare('serial'))return;const own=generation.current;
      transport.current=await connectSerial(packet=>{
        if(own!==generation.current)return;const e=engine.current!;
        if(!e.raw.length){e.referenceV=packet.referenceV;e.adcMax=packet.adcMax;e.processor=new Processor(notch,packet.referenceV,packet.adcMax);}
        else if(e.referenceV!==packet.referenceV||e.adcMax!==packet.adcMax)throw new Error('Device settings changed. Reconnect and recalibrate.');
        e.receive(packet.samples);lastReceived.current=performance.now();refresh();
      },message=>{if(own===generation.current)handleError(message);});
      running.current=true;setSourceActive(true);
    }catch(ex){const message=(ex as Error).name==='NotFoundError'?'No device selected. You can try the labelled simulation instead.':(ex as Error).message;setError(message);}
    finally{setConnecting(false);refresh();}
  }
  async function importCsv(file:File){
    try{if(file.size>MAX_CSV_BYTES)throw new Error('Choose a CSV no larger than 240 MB.');const recording=parseRecordingCsv(await file.text());if(!await prepare('replay'))return;const m=recording.metadata;engine.current=new Engine('replay',m.notch50Hz??false,m.referenceV,m.adcMax);engine.current.originalSource=m.source;engine.current.originalNotch50Hz=m.notch50Hz;replay.current=recording.samples;replayIndex.current=0;running.current=true;setSourceActive(true);refresh();}
    catch(ex){setError((ex as Error).message);}
  }
  async function openResults(file:File){
    try{if(file.size>20_000_000)throw new Error('Choose a results JSON smaller than 20 MB.');const records=parseResultFile(await file.text());setViewed(records.at(-1)!);setError('');try{saveResults(records);setSaved(loadResults());setSaveError('');}catch(ex){setSaveError((ex as Error).message);}}
    catch(ex){setError((ex as Error).message);}
  }
  const action=(fn:()=>void)=>{try{fn();setError('');refresh();}catch(ex){setError((ex as Error).message);}};
  const e=engine.current,s=e?.session,cal=e?.calibrationRun,col=e?.collection;
  const calRunning=cal?.state==='running',collecting=col?.state==='running',training=s?.state==='running',paused=s?.state==='paused',finished=s?.state==='complete'||s?.state==='stopped';
  const completed=s?.results.length??0,heldOut=!!collecting&&col!.testing,isReplay=e?.source==='replay',replayDone=isReplay&&replayIndex.current>=replay.current.length;
  const checking=e?.source==='simulation'&&!!demo.current.scenario;
  useEffect(()=>{
    if(!e||!s||!finished&&!completed)return;
    try{const data=e.export();saveResults(parseResultFile(JSON.stringify({...data,sessions:data.sessions.slice(-1),windows:undefined,events:undefined,examples:undefined,model:undefined})));setSaved(loadResults());setSaveNotice('Completed trials saved on this browser.');setSaveError('');}
    catch(ex){setSaveError((ex as Error).message);}
  },[s,s?.state,completed]);
  const fresh=!!e?.latest&&e.processor.ready&&e.latest.quality==='good'&&sourceActive&&performance.now()-lastReceived.current<500;
  const level=fresh?e?.level??0:0,target=collecting?col!.target:s?.target??.3;
  const rest=calRunning?cal!.instruction==='rest':collecting?col!.resting||col!.label===0:training?s!.phase==='rest':true;
  let title='Practice gentle control',description='Use your forearm muscles to water a flower.',symbol='✋',remaining:number|null=null;
  if(isReplay){title=replayDone?'Replay complete':running.current?'Playing recording':'Replay paused';description='Waveform inspection only. No new training score.';symbol=replayDone?'✓':running.current?'▷':'Ⅱ';}
  else if(calRunning){title=rest?'Relax your hand':'Gently squeeze';description=rest?'Let your hand rest naturally.':'Use a comfortable effort. Do not squeeze as hard as you can.';symbol=rest?'✋':'✊';remaining=cal!.remaining;}
  else if(collecting){title=col!.resting?'Relax':LABELS[col!.label];description=col!.resting?'Let the muscles rest.':heldOut?'Follow the cue. Use a comfortable effort.':col!.label===0?'Keep your hand relaxed.':col!.label===1?'Aim for the lower target.':'Aim for the higher target, comfortably.';symbol=col!.resting||col!.label===0?'✋':'✊';remaining=col!.remaining;}
  else if(paused){title='Take a break';description=s!.message;symbol='Ⅱ';}
  else if(training){title=s!.phase==='familiar'?'Try the water':rest?fresh&&s!.relaxed?'Hand relaxed':'Relax':Math.abs(level-target)<=.1?'Keep steady':level>target+.1?'Ease a little':'Gently squeeze';description=s!.phase==='familiar'?'Gently squeeze, then relax. Watch the water change.':rest?'Let your hand rest.':'Keep the water in the target band.';symbol=rest?'✋':'✊';remaining=s!.remaining;}
  else if(finished){title=s!.state==='complete'?'Well done':'Session ended';description='Rest your hand. Your results are saved in this page.';symbol='✓';}
  else if(e?.calibration){title='You are ready';description='Start when you feel comfortable.';symbol='✓';}
  else if(e){title=cal?.state==='failed'?'Check the signal':'Set your reference';description=cal?.state==='failed'?cal.error:'Relax first, then make three comfortable squeezes.';}
  const handAction:HandAction|null=calRunning||collecting||training?title==='Hand relaxed'?'relaxed':rest?'relax':title==='Keep steady'?'hold':title==='Ease a little'?'ease':'squeeze':null;
  const spoken=useRef('');
  useEffect(()=>{if(!audio||spoken.current===title)return;spoken.current=title;if('speechSynthesis' in window){speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(title);utterance.lang='en-GB';utterance.rate=.8;speechSynthesis.speak(utterance);}},[title,audio]);
  function exportData(format:'session'|'raw'){if(!e)return;const id=e.createdAt.replace(/[:.]/g,'-');if(format==='session')download(`${id}-${e.source}-session.json`,JSON.stringify(e.export()));else download(`${id}-${e.source}-raw.csv`,rawCsv(e.raw,{source:e.originalSource,referenceV:e.referenceV,adcMax:e.adcMax,notch50Hz:e.source==='replay'?e.originalNotch50Hz:e.processor.notch}),'text/csv');}
  function restartReplay(){if(!e)return;const next=new Engine('replay',e.processor.notch,e.referenceV,e.adcMax);next.originalSource=e.originalSource;next.originalNotch50Hz=e.originalNotch50Hz;engine.current=next;replayIndex.current=0;lastReceived.current=performance.now();running.current=true;setSourceActive(true);setError('');refresh();}
  function removeSaved(record:SavedResult){if(!window.confirm('Delete this saved result from this browser? Keep a downloaded backup first.'))return;try{deleteResult(record.id);setSaved(loadResults());if(viewed?.id===record.id)setViewed(null);setSaveError('');}catch(ex){setSaveError((ex as Error).message);}}
  const phaseLabel=isReplay?'Recording replay':calRunning?`Reference · ${cal!.step===0?'rest':cal!.instruction==='contract'?`squeeze ${(cal!.step+1)/2} of 3`:'rest break'}`:collecting?`${heldOut?'Test':'Training'} examples · Trial ${col!.trial+1} of 18`:finished?s!.state==='complete'?'Session complete':'Session ended':s?`${s.block==='baseline'?'Before practice':s.block==='final'?'After practice':`Practice round ${s.round} of 3`} · Trial ${s.trial%6+1} of 6`:'Muscle control practice';
  return <main>
    <header><span className="brand"><span className="brand-mark">✳</span> EMG Garden</span><span className="status"><i className={fresh?'live':''}/>{!e?'Not connected':e.source==='simulation'?'Synthetic signal':e.source==='replay'?'CSV replay':fresh?'EMG connected':'Waiting for EMG'}</span></header>
    {e?.source==='simulation'&&<div className="source-banner" role="status"><strong>Simulation</strong> Generated data for demonstrating the software. No muscle activity is being measured.</div>}
    {isReplay&&<div className="source-banner"><strong>{sourceName(e!.originalSource)}</strong> File metadata is not independently verified. Inspection only.{(e!.referenceV===null||e!.adcMax===null)&&' ADC settings unknown; clipping cannot be checked.'}{e!.originalNotch50Hz===null&&' Original notch setting unknown; replay uses no notch.'}</div>}
    {error&&<div className="alert" role="alert">{error}</div>}
    {saveError&&<div className="alert" role="alert">{saveError}</div>}
    {!e?<section className="welcome"><div><p className="section-label">A gentle start</p><h1>A little effort.<br/>Steadier control.</h1><p>Practice squeezing, holding and relaxing with simple visual feedback.</p><div className="button-row"><button className="primary" onClick={()=>void connect()} disabled={connecting}>{connecting?'Connecting…':'Connect EMG'}</button><button className="secondary" onClick={()=>void startDemo()}>Try simulation</button></div><p className="fine">Single-channel raw EMG sensor required for real measurements.<br/>Prototype for research and demonstration.</p></div><div className="welcome-garden"><Garden level={0} target={.3} active={false} resting rewarded={false}/></div></section>:<>
      <section className="training-layout">
        <div className="garden-panel"><div className="panel-heading"><span>{phaseLabel}</span><span>{e.source==='serial'?'Live signal':e.source==='simulation'?'Simulated':'Replay'}</span></div><Garden level={heldOut?0:level} target={target} active={!heldOut&&fresh&&!!e.calibration&&(training||collecting)} resting={rest} rewarded={!!s?.rewarded&&!rest}/><p className="garden-caption">{isReplay?'View the waveform in research tools.':heldOut?'Follow the hand cue. Feedback is hidden for this test.':!fresh?'Waiting for a clean signal':!e.calibration?'First, find your comfortable reference.':rest?'Relaxation is part of the practice.':Math.abs(level-target)<=.1?'In the target band':level>target+.1?'Reduce your effort slightly':'Increase your effort gently'}</p></div>
        <div className="instruction">{handAction?<HandCue action={handAction}/>:<div className="instruction-symbol" aria-hidden="true">{symbol}</div>}<h1 aria-live="polite">{title}</h1><p>{description}</p>{remaining!==null&&<div className="countdown" aria-label={`${Math.ceil(remaining)} seconds remaining`}>{Math.ceil(remaining)}<span>seconds</span></div>}
          <div className="main-actions">
            {isReplay&&<>{!replayDone&&<button className="secondary" onClick={()=>{running.current=!running.current;lastReceived.current=performance.now();setSourceActive(running.current);refresh();}}>{running.current?'Pause replay':'Continue replay'}</button>}<button className="secondary" onClick={restartReplay}>Replay again</button></>}
            {e.source!=='replay'&&!calRunning&&!collecting&&!training&&!paused&&!finished&&(!e.calibration?<button className="primary" disabled={!fresh||checking} onClick={()=>action(()=>e.startCalibration())}>{cal?.state==='failed'?'Repeat reference':'Set my reference'}</button>:<button className="primary" disabled={!fresh} onClick={()=>action(()=>e.startTraining())}>Start training</button>)}
            {training&&<button className="secondary" onClick={()=>action(()=>{s!.pause();e.event('manual_pause');})}>Ⅱ &nbsp; Rest</button>}
            {paused&&<button className="primary" disabled={!fresh} onClick={()=>action(()=>{s!.resume(e.time);e.event('resumed');})}>Continue</button>}
            {(training||paused)&&<button className="text-button" onClick={()=>action(()=>{s!.stop();e.event('training_ended');})}>End session</button>}
            {(calRunning||collecting)&&<button className="text-button" onClick={()=>action(()=>e.interrupt('Recording step stopped. Repeat when ready.'))}>Stop this step</button>}
            {finished&&<button className="primary" disabled={!fresh} onClick={()=>action(()=>e.startTraining())}>New session</button>}
          </div><label className="audio"><input type="checkbox" checked={audio} onChange={ev=>setAudio(ev.target.checked)}/> Spoken cues</label>
        </div>
      </section>
      {isReplay&&<div className="session-progress"><span>{(replayIndex.current/2000).toFixed(1)} / {(replay.current.length/2000).toFixed(1)} seconds</span><progress aria-label="Replay position" value={replayIndex.current} max={replay.current.length}/></div>}
      {(training||paused||finished)&&<div className="session-progress"><span>{s!.results.length} of 30 trials completed</span><progress value={s!.results.length} max="30"/></div>}
      {finished&&<Results results={s!.results} simulated={e.source==='simulation'}/>}
    </>}
    <details className="research-tools"><summary>Setup &amp; research tools</summary><div className="tools-grid">
      <section><h2>Signal source</h2><p>Raw module-output voltage, 2,000 samples per second. No video is required.</p><div className="button-row"><button className="secondary" disabled={!!e?.busy||connecting} onClick={()=>void connect()}>Connect device</button><button className="secondary" disabled={!!e?.busy} onClick={()=>void startDemo()}>New simulation</button></div><label className="file-label">Replay raw CSV<input type="file" accept=".csv,text/csv" disabled={!!e?.busy} onChange={ev=>{const f=ev.target.files?.[0];if(f)void importCsv(f);ev.target.value='';}}/></label><label><input type="checkbox" checked={notch} disabled={!!e} onChange={ev=>setNotch(ev.target.checked)}/> 50 Hz notch for the next source</label><p className="fine">CSV columns: sample_index, voltage_v, sample_rate. Replay is for waveform inspection. Envelope-only sensors are not supported by this processing configuration.</p>
        {e&&<button className="text-button" disabled={!!e.busy} onClick={()=>action(()=>{running.current=false;void transport.current?.stop();setSourceActive(false);if(checking){e.event('simulation_scenario_ended',{scenario:demo.current.scenario,cancelled:true});demo.current.cancelScenario();}e.event('source_stopped');})}>Disconnect / stop signal</button>}
      </section>
      <section><h2>Signal check</h2>{heldOut?<p>Effort feedback is hidden during test examples.</p>:<><Wave values={e?.windows.slice(-100).map(f=>f.rms)??[]}/><dl><div><dt>RMS</dt><dd>{e?.latest?`${e.latest.rms.toFixed(4)} V`:'No signal'}</dd></div><div><dt>Quality</dt><dd>{fresh?'Good':e&&!e.processor.ready?'Settling signal':e?.latest?.quality==='good'?'Waiting for signal':e?.latest?.quality??'Waiting'}</dd></div><div><dt>Sample gaps</dt><dd>{e?.processor.gaps??0}</dd></div><div><dt>Activity / reference</dt><dd>{e?.calibration?fresh?percent(e.level):'Waiting for signal':'Not calibrated'}</dd></div></dl><p className="fine">RMS is the amplitude of the processed waveform at the sensor output. Relative activity is not grip strength or %MVC.</p></>}</section>
      {e?.source==='simulation'&&<section><h2>Simulation controls</h2><label><input type="checkbox" checked={auto} onChange={ev=>{follow.current=ev.target.checked;setAuto(ev.target.checked);}}/> Follow the current cue automatically</label><label className="range-label">Manual simulated effort <span>{percent(effort)}</span><input type="range" min="0" max="1.2" step=".01" value={effort} disabled={auto} onChange={ev=>{const v=Number(ev.target.value);manual.current=v;setEffort(v);}}/></label><p className="fine">Automatic following demonstrates the protocol only. It cannot validate a person's learning or the sensor.</p><label>Synthetic check<select aria-label="Synthetic check" value={scenarioChoice} disabled={checking||calRunning||collecting||!sourceActive} onChange={ev=>setScenarioChoice(ev.target.value as SimulationScenario)}>{Object.entries(SCENARIOS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button className="secondary" disabled={checking||calRunning||collecting||!sourceActive} onClick={()=>action(()=>{demo.current.startScenario(scenarioChoice);e.event('simulation_scenario_started',{scenario:scenarioChoice,durationMs:8000});})}>Run synthetic check</button>{checking&&<p className="simulation-check" role="status">{SCENARIOS[demo.current.scenario!]} · {Math.ceil(demo.current.remaining)} seconds remaining</p>}<p className="fine">Eight seconds of generated test data, then normal simulation. A sample gap pauses training. Use Continue after the signal recovers. Checks do not measure a person.</p></section>}
      <section><h2>Optional AI classifier</h2><p>Water follows continuous RMS activity. The classifier separately estimates relaxed, light and stronger contraction states.</p><p className="classifier-state">{heldOut?'Prediction hidden during test examples.':!fresh?'No fresh prediction':e?.classification?`${LABELS[e.classification.label]} · ${percent(e.classification.confidence)}`:'Classifier not trained or uncertain'}</p><button className="secondary" disabled={!e?.calibration||!fresh||e.busy||checking||e.source==='replay'} onClick={()=>action(()=>{e!.startCollection();setReviewed(false);})}>Collect 18 labelled trials</button>
        {col?.state==='failed'&&<p role="alert">{col.error}</p>}
        {col?.state==='complete'&&<><p>{col.examples.length} feature windows collected. Six trials per state. First four train; last two test.</p><label><input type="checkbox" checked={reviewed} onChange={ev=>setReviewed(ev.target.checked)}/> I reviewed the raw signal and confirm the prompted labels.</label><button className="secondary" disabled={!reviewed} onClick={()=>action(()=>e!.train())}>Fit and test kNN</button></>}
        {e?.report&&!heldOut&&<><p>Held-out window accuracy: {percent(e.report.accuracy)}</p><table><caption>Windows from six held-out trials · actual rows, predicted columns</caption><thead><tr><th>State</th><th>Rest</th><th>Light</th><th>Stronger</th><th>Recall</th></tr></thead><tbody>{e.report.matrix.map((row,i)=><tr key={i}><th>{LABELS[i]}</th>{row.map((v,j)=><td key={j}>{v}</td>)}<td>{percent(e.report!.recall[i])}</td></tr>)}</tbody></table><p className="fine">Each class reaching 80% recall is an initial debugging target, not clinical validation. Simulation results remain synthetic.</p></>}
      </section>
      <section><h2>Local recording</h2><p>{e?`${e.raw.length.toLocaleString()} raw samples · ${e.windows.length.toLocaleString()} feature windows`:'No recording yet'}</p><div className="button-row"><button className="secondary" disabled={!e?.raw.length||!!e.busy} onClick={()=>exportData('session')}>Download session JSON</button><button className="secondary" disabled={!e?.raw.length||!!e.busy} onClick={()=>exportData('raw')}>Download raw CSV</button></div><p className="fine">Download each file separately. Raw waveforms stay in memory until downloaded. Nothing is uploaded. Recording limit: 20 minutes per source.</p>{saveNotice&&<p role="status">{saveNotice}</p>}<a href="/README.md" target="_blank" rel="noreferrer">Setup and protocol guide</a></section>
      <section><h2>Saved results</h2><p className="fine">Completed trials are saved only in this browser. Raw waveforms are not saved here. Download a backup before clearing browser data.</p><label className="file-label">Open results JSON<input type="file" accept=".json,application/json" disabled={!!e?.busy} onChange={ev=>{const file=ev.target.files?.[0];if(file)void openResults(file);ev.target.value='';}}/></label>{!saved.length?<p>No saved results.</p>:<ul className="saved-list">{saved.map(record=><li key={record.id}><span>{new Date(record.createdAt).toLocaleString('en-GB')} · Round {record.number}<small>{sourceName(record.originalSource)} · {record.results.length} trials · {record.state}</small></span><button className="text-button" onClick={()=>setViewed(record)}>View</button><button className="text-button" onClick={()=>removeSaved(record)}>Delete</button></li>)}</ul>}</section>
    </div></details>
    {viewed&&<section className="saved-review"><div className="saved-heading"><h2>Saved result · Round {viewed.number}</h2><button className="text-button" onClick={()=>setViewed(null)}>Close result</button></div><p>Read-only · {sourceName(viewed.originalSource)} · {viewed.state}</p><p className="fine">Reported source is file metadata, not an independently verified measurement. Comfortable reference: {viewed.calibration.reference.toFixed(4)} V. Condition: {viewed.conditionId}</p><Results results={viewed.results} simulated={viewed.originalSource==='simulation'}/><button className="secondary" onClick={()=>download(`emg-garden-result-${viewed.number}.json`,JSON.stringify(viewed))}>Download saved result</button></section>}
    <footer>EMG biofeedback prototype · Comfortable effort, not maximum effort · Stop if uncomfortable</footer>
  </main>;
}
