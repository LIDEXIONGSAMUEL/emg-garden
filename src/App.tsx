import {Fragment,useEffect,useRef,useState} from 'react';
import {Engine,type AcquisitionSetup} from './engine';
import {Processor,parseRecordingCsv,mean,minimumReference,MAX_CSV_BYTES,type Sample,type AmplitudeUnit} from './signal';
import {captureRecording} from './recording';
import {PlaytestLog} from './playtestLog';
import {connectBoardSerial,connectSerial,selectSerialPort,DEFAULT_EMG_BAUD,UNO_EMG_BAUD,type EmgBaudRate} from './serial';
import {LIGHT_TRAINING_TARGET,type TrainingSession,type TrialResult,type TrialReviewDecision} from './session';
import {parseResultFile,loadResults,saveResults,deleteResult,loadReference,saveReference,matchesReference,type SavedResult} from './records';
import {HandCue,StageIcon,type HandAction} from './HandCue';
import {Garden} from './Garden';
import {useTargetFeedback} from './targetFeedback';
import {DemoDashboard} from './DemoDashboard';
import {BoardMonitor} from './BoardMonitor';
import {TrialWaveform} from './TrialWaveform';
import {BoardReading} from './boardSignal';

const LABELS=['Relaxed','Light contraction','Stronger contraction'];
const SERIAL_START_TIMEOUT_MS=5000,SIGNAL_STALE_MS=500;
const percent=(v:number|null)=>v===null?'Not available':`${Math.round(v*100)}%`;
const amplitude=(value:number,unit?:AmplitudeUnit)=>unit==='adc_counts'?`${value.toFixed(2)} ADC counts`:`${value.toFixed(4)} V`;
const sourceName=(source:string)=>source==='simulation'?'Recorded simulation':source==='serial'?'Reported EMG recording':'Source unknown';
function download(name:string,body:string,type='application/json'){
  const url=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
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
        if(i===1&&values.length){
          const rate=mean(values);
          return <td key={g}><div className="result-rate"><span>{percent(rate)}</span><span className="result-bar" aria-hidden="true"><span style={{width:`${rate*100}%`}}/></span></div></td>;
        }
        return <td key={g}>{i===0?`${valid.length} / ${all.length}`:i===5?`${values.length} / ${valid.length}`:!values.length?'Not available':i===4?`${(mean(values)/1000).toFixed(2)} s`:percent(mean(values))}</td>;
      })}</tr>)}
    </tbody></table></div><p className="fine">Steadiness is the activity standard deviation. Residual activity is measured near the end of rest. Time to relax includes only observed relaxations; the count is shown separately. Only uninterrupted trials with enough valid data enter this summary. Before and after use the same six targets.</p>
  </section>;
}
export default function App(){
  const engine=useRef<Engine|null>(null),replay=useRef<Sample[]>([]),replayIndex=useRef(0);
  const board=useRef<BoardReading|null>(null);
  const playtest=useRef<PlaytestLog|null>(null);
  const pendingExport=useRef<{engine:Engine;format:'session'|'raw';pair:ReturnType<typeof captureRecording>}|null>(null);
  const transport=useRef<{stop:()=>Promise<void>}|null>(null),generation=useRef(0),lastReceived=useRef(0);
  const alive=useRef(true),running=useRef(false);
  const startDeadline=useRef<number|null>(null),stalled=useRef(false),serialBaud=useRef<EmgBaudRate>(UNO_EMG_BAUD);
  const [,render]=useState(0),[connecting,setConnecting]=useState(false),[error,setError]=useState(''),[notch,setNotch]=useState(true),[audio,setAudio]=useState(false);
  const [sourceActive,setSourceActive]=useState(false);
  const [demoView,setDemoView]=useState(false);
  const [setup,setSetup]=useState<AcquisitionSetup>({device:'',electrodePlacement:''});
  const [savedReference,setSavedReference]=useState(loadReference);
  const [referenceNotice,setReferenceNotice]=useState('');
  const [waveformSlot,setWaveformSlot]=useState<number|null>(null);
  const [sunriseSession,setSunriseSession]=useState<TrainingSession|null>(null);
  const [saved,setSaved]=useState<SavedResult[]>([]),[viewed,setViewed]=useState<SavedResult|null>(null),[saveError,setSaveError]=useState(''),[saveNotice,setSaveNotice]=useState('');
  useEffect(()=>{try{setSaved(loadResults());}catch(ex){setSaveError((ex as Error).message);}},[]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;running.current=false;generation.current++;void transport.current?.stop();};},[]);
  const refresh=()=>{if(alive.current)render(v=>v+1);};
  const saveCheckpoint=()=>{void playtest.current?.checkpoint().then(refresh);};
  const handleError=(message:string)=>{
    startDeadline.current=null;
    engine.current?.interrupt(message);
    saveCheckpoint();
    running.current=false;setSourceActive(false);setError(message);refresh();
  };
  useEffect(()=>{
    const timer=setInterval(()=>{
      const e=engine.current;
      if(board.current){if(running.current)refresh();return;}
      if(!e||!running.current)return;
      try{
        if(e.source==='replay'){
          const chunk=replay.current.slice(replayIndex.current,replayIndex.current+100);
          if(chunk.length){e.receive(chunk);replayIndex.current+=chunk.length;lastReceived.current=performance.now();}
          else{running.current=false;setSourceActive(false);e.event('replay_ended');}
        }else if(startDeadline.current!==null){
          if(performance.now()>=startDeadline.current){
            void transport.current?.stop();
            handleError('No compatible EMG data arrived. Check the acquisition firmware and reconnect.');
          }
        }else if(!stalled.current&&performance.now()-lastReceived.current>=SIGNAL_STALE_MS){
          stalled.current=true;
          e.interrupt('No fresh signal. Check the connection before resuming.');
        }
      }catch(ex){handleError((ex as Error).message);}
      refresh();
    },50);
    const checkpointTimer=setInterval(saveCheckpoint,2000);
    const visibility=()=>{
      const current=engine.current;
      if(document.hidden){
        current?.session?.pause('Paused while this page is hidden.');
        if(current?.calibrationRun?.state==='running'||current?.collection?.state==='running')current.interrupt('Page was hidden. Repeat the recording step.');
      }
      if(playtest.current){
        current?.event('page_visibility',{hidden:document.hidden,wallTime:new Date().toISOString()});
        saveCheckpoint();
      }
    };
    const pageHidden=()=>{
      if(!playtest.current)return;
      engine.current?.event('page_left',{wallTime:new Date().toISOString()});
      saveCheckpoint();
    };
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('pagehide',pageHidden);
    return()=>{
      clearInterval(timer);
      clearInterval(checkpointTimer);
      document.removeEventListener('visibilitychange',visibility);
      window.removeEventListener('pagehide',pageHidden);
    };
  },[]);
  async function prepare(source:'serial'|'replay'|'board'){
    if(engine.current?.raw.length&&!window.confirm('Starting a new signal source replaces the current local recording. Download it first if needed. Continue?'))return false;
    generation.current++;running.current=false;await transport.current?.stop();transport.current=null;
    if(playtest.current){
      engine.current?.event('source_replaced',{nextSource:source,wallTime:new Date().toISOString()});
      saveCheckpoint();
      playtest.current=null;
    }
    pendingExport.current=null;startDeadline.current=null;stalled.current=false;
    setSetup({device:'',electrodePlacement:''});setWaveformSlot(null);setReferenceNotice('');
    board.current=source==='board'?new BoardReading():null;
    engine.current=source==='board'?null:new Engine(source,notch);
    lastReceived.current=performance.now();setError('');setSaveNotice('');setViewed(null);setSourceActive(false);return true;
  }
  async function connect(source:'serial'|'board',baudRate:EmgBaudRate=UNO_EMG_BAUD){
    if(connecting||engine.current?.busy)return;
    setConnecting(true);
    try{
      const port=await selectSerialPort();
      if(!alive.current||engine.current?.busy||!await prepare(source))return;
      const own=generation.current;
      if(source==='serial')serialBaud.current=baudRate;
      let failed=false;
      const onError=(message:string)=>{
        if(own!==generation.current)return;
        failed=true;
        handleError(message);
      };
      const link=source==='board'?await connectBoardSerial(port,(rows,ignored)=>{
        if(own!==generation.current)return;
        board.current!.receive(rows,ignored,performance.now());
      },onError):await connectSerial(port,packet=>{
        if(own!==generation.current)return;
        const e=engine.current!;
        if(!e.raw.length){
          e.referenceV=packet.referenceV;e.adcMax=packet.adcMax;
          e.processor=new Processor(notch,packet.referenceV,packet.adcMax,packet.amplitudeUnit,notch);
          playtest.current=new PlaytestLog(e);
        }else if(e.referenceV!==packet.referenceV||e.adcMax!==packet.adcMax||e.processor.amplitudeUnit!==packet.amplitudeUnit){
          throw new Error('Device settings changed. Reconnect and recalibrate.');
        }
        const hadReference=!!e.calibration;
        e.receive(packet.samples);lastReceived.current=performance.now();
        if(!hadReference&&e.calibration&&e.calibrationRun?.state==='complete'&&e.referenceSetup){
          try{
            setSavedReference(saveReference({
              conditionId:e.conditionId,config:e.config,calibration:e.calibration,setup:e.referenceSetup,baudRate,
              protocol:e.calibrationRun.protocol,
            }));
            setReferenceNotice('Reference saved on this browser.');
          }catch{setReferenceNotice('Could not save the reference on this browser. You can still train on this page.');}
        }
        startDeadline.current=null;stalled.current=false;refresh();
      },onError,baudRate);
      if(own!==generation.current){await link.stop();return;}
      transport.current=link;
      if(source==='serial'&&baudRate===UNO_EMG_BAUD){
        setSetup({device:'ATmega328P-compatible Uno · 2 kHz firmware',electrodePlacement:''});
      }
      if(!failed){
        if(source==='serial'&&!engine.current?.raw.length)startDeadline.current=performance.now()+SERIAL_START_TIMEOUT_MS;
        running.current=true;setSourceActive(true);
      }
    }catch(ex){
      const failure=ex as Error;
      setError(failure.name==='NotFoundError'?'No serial port selected.':failure.message);
    }finally{setConnecting(false);refresh();}
  }
  async function closeBoard(){
    generation.current++;
    running.current=false;
    setConnecting(true);
    await transport.current?.stop();
    transport.current=null;
    board.current=null;
    setSourceActive(false);
    setConnecting(false);
    setError('');
  }
  async function importCsv(file:File){
    try{if(file.size>MAX_CSV_BYTES)throw new Error('Choose a CSV no larger than 240 MB.');const recording=parseRecordingCsv(await file.text());if(!await prepare('replay'))return;const m=recording.metadata;engine.current=new Engine('replay',m.notch50Hz??false,m.referenceV,m.adcMax,m.amplitudeUnit,m.notch100Hz);engine.current.originalSource=m.source;engine.current.originalNotch50Hz=m.notch50Hz;replay.current=recording.samples;replayIndex.current=0;running.current=true;setSourceActive(true);refresh();}
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
  useEffect(()=>{
    if(!e||!s||!finished&&!completed)return;
    try{const data=e.export();saveResults(parseResultFile(JSON.stringify({...data,sessions:data.sessions.slice(-1),windows:undefined,events:undefined,examples:undefined,model:undefined})));setSaved(loadResults());setSaveNotice('Completed trials saved on this browser.');setSaveError('');}
    catch(ex){setSaveError((ex as Error).message);}
  },[s,s?.state,completed]);
  const fresh=!!e?.latest&&e.processor.ready&&e.latest.quality==='good'&&sourceActive&&performance.now()-lastReceived.current<SIGNAL_STALE_MS;
  const needsReconnect=e?.source==='serial'&&!e.busy&&(!sourceActive||stalled.current);
  const reusableReference=e?.source==='serial'&&!e.calibration&&!e.busy&&fresh&&!connecting&&
    savedReference&&matchesReference(savedReference,e.config,serialBaud.current)?savedReference:null;
  let signalTitle='Waiting for EMG',signalHint='Connect an EMG device to begin.';
  if(e?.source==='serial'&&sourceActive&&!fresh){
    if(!e.raw.length){
      signalHint='Waiting for the first samples from the device.';
    }else if(stalled.current){
      signalTitle='Signal interrupted';
      signalHint='Samples stopped arriving. Check the serial connection.';
    }else if(!e.processor.ready){
      signalTitle='Signal settling';
      signalHint='Filters are settling. Keep the signal connected.';
    }else if(e.latest?.quality==='clipped'){
      signalTitle='Signal is clipping';
      signalHint='The raw readings reach the ADC limits. Check the sensor output before calibration.';
    }else if(e.latest?.quality==='flat'){
      signalTitle='Signal is flat';
      signalHint='The board is sending a flat signal. Check the sensor output before calibration.';
    }
  }
  const level=fresh?e?.level??0:0,target=collecting?col!.target:s?.target??.3;
  const rest=calRunning?cal!.instruction==='rest':collecting?col!.resting||col!.label===0:training?s!.phase==='rest':true;
  const trainingTarget=training&&s?.phase==='contract'
    ? target===LIGHT_TRAINING_TARGET?'Light squeeze':'Firmer squeeze'
    : null;
  const inTarget=Math.abs(level-target)<=.1;
  const referenceFeedback=fresh&&calRunning&&cal?.protocol==='quick'&&!rest;
  const referenceSqueeze=referenceFeedback&&cal.detectsSqueeze(e!.latest!.rms);
  // Use a small confirmation stream until the calibrated activity scale is available.
  const gardenLevel=referenceSqueeze ? .35 : level;
  let title='Practice gentle control',description='Use your forearm muscles to water a flower.',symbol='✋',remaining:number|null=null;
  if(isReplay){title=replayDone?'Replay complete':running.current?'Playing recording':'Replay paused';description='Waveform inspection only. No new training score.';symbol=replayDone?'✓':running.current?'▷':'Ⅱ';}
  else if(calRunning){
    title=rest?'Relax your hand':'Squeeze comfortably';
    description=rest?'Open your hand and get ready to water.':'Hold a comfortable squeeze.';
    symbol=rest?'✋':'✊';remaining=cal!.remaining;
  }
  else if(collecting){title=col!.resting?'Relax':LABELS[col!.label];description=col!.resting?'Let the muscles rest.':heldOut?'Follow the cue. Use a comfortable effort.':col!.label===0?'Keep your hand relaxed.':col!.label===1?'Aim for the lower target.':'Aim for the higher target, comfortably.';symbol=col!.resting||col!.label===0?'✋':'✊';remaining=col!.remaining;}
  else if(paused){title='Take a break';description=sourceActive?s!.message:'The EMG connection closed. End this session to reconnect.';symbol='Ⅱ';}
  else if(training){
    if(s!.phase==='familiar'){
      title='Try the water';description='Gently squeeze, then relax. Watch the water change.';
    }else if(rest){
      title=fresh&&s!.relaxed?'Hand relaxed':'Relax';description='Open your hand and take a breath.';
    }else{
      title=inTarget?'That’s it! Hold it':level>target+.1?'Ease off a little':'Squeeze a little more';
      description=trainingTarget??'';
    }
    symbol=rest?'✋':'✊';remaining=s!.remaining;
  }
  else if(finished){title=s!.state==='complete'?'Well done':'Session ended';description='Rest your hand. Review your results below.';symbol='✓';}
  else if(e?.source==='serial'&&!fresh&&cal?.state!=='failed'){
    title=signalTitle;description=signalHint;
  }
  else if(e?.calibration){title='You are ready';description='Try a gentle squeeze to check the water, then start when you are ready.';symbol='✓';}
  else if(e){title=cal?.state==='failed'?'Check the signal':'Set your reference';description=cal?.state==='failed'?cal.error:'Relax for 5 seconds, then squeeze comfortably for 5 seconds.';}
  if(reusableReference&&cal?.state!=='failed')description='Use your saved reference if the sensor and electrode placement are the same.';
  const handAction:HandAction|null=calRunning||collecting||training?title==='Hand relaxed'?'relaxed':rest?'relax':title==='That’s it! Hold it'?'hold':title==='Ease off a little'?'ease':'squeeze':null;
  const stage=heldOut?'test':calRunning?'reference':collecting||training?'training':paused?'paused':isReplay?'replay':finished?'finished':'ready';
  const gardenEffects=fresh&&!heldOut&&!isReplay&&!paused&&(!finished||!!collecting);
  const hasEffort=gardenEffects&&!!e?.calibration;
  const previewingActivity=hasEffort&&!s&&!collecting;
  const previewFlow=previewingActivity&&e!.latest!.rms>e!.calibration!.restThreshold;
  const displayedActivity=percent(Math.max(0,level));
  const hasTarget=hasEffort&&!rest&&(!!collecting||trainingTarget!==null);
  const wateringReward=hasTarget&&!!training&&!!s?.rewarded;
  const liveTarget=e?.source==='serial'&&hasTarget&&trainingTarget!==null;
  const targetFeedback=useTargetFeedback(e,liveTarget,inTarget);
  const canRecalibrate=!!e?.calibration&&!isReplay&&!e.busy;
  const signalStatus=!e?'Not connected':e.source==='replay'?'CSV replay':fresh?'EMG connected':signalTitle;
  const demoClassification=paused?'Paused':!e?.model?'Not trained':!fresh?'Waiting for signal':
    e.classification?LABELS[e.classification.label]:'Uncertain';
  const daylight=!!s&&!collecting&&!isReplay&&(wateringReward||sunriseSession===s);
  useEffect(()=>{
    if(wateringReward&&s)setSunriseSession(s);
    else if(!s)setSunriseSession(null);
  },[s,wateringReward]);
  const cueDuration=calRunning?cal!.durations[cal!.step]/1000:collecting?10:s?.phase==='familiar'?30:5;
  const guidance=isReplay?'View the waveform in research tools.':heldOut?'Follow the hand cue. Effort feedback is hidden for this test.':
    paused?'Training paused. No score is being recorded.':finished&&!collecting?'Review your trial results below.':
    !fresh?signalHint:calRunning?'A steady, comfortable squeeze is all you need.':
    !e?.calibration?'Find your comfortable reference first.':
    previewingActivity?'Relax, then gently squeeze to see the water flow.':
    trainingTarget?'The pot glows when you find the right squeeze.':
    rest?'Let the water settle.':'Watch the water follow your hand.';
  const spoken=useRef('');
  useEffect(()=>{if(!audio||spoken.current===title)return;spoken.current=title;if('speechSynthesis' in window){speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(title);utterance.lang='en-GB';utterance.rate=.8;speechSynthesis.speak(utterance);}},[title,audio]);
  function exportData(format:'session'|'raw'){
    if(!e)return;
    const previous=pendingExport.current;
    const matching=previous?.engine===e&&previous.format!==format;
    const pair=matching?previous.pair:captureRecording(e);
    if(format==='session')download(`${pair.filename}-session.json`,pair.session);
    else download(`${pair.filename}-raw.csv`,pair.csv(),'text/csv');
    pendingExport.current=matching?null:{engine:e,format,pair};
  }
  function restartReplay(){if(!e)return;pendingExport.current=null;const next=new Engine('replay',e.processor.notch,e.referenceV,e.adcMax,e.processor.amplitudeUnit,e.processor.notch100Hz);next.originalSource=e.originalSource;next.originalNotch50Hz=e.originalNotch50Hz;engine.current=next;replayIndex.current=0;lastReceived.current=performance.now();running.current=true;setSourceActive(true);setError('');refresh();}
  function removeSaved(record:SavedResult){if(!window.confirm('Delete this saved result from this browser? Keep a downloaded backup first.'))return;try{deleteResult(record.id);setSaved(loadResults());if(viewed?.id===record.id)setViewed(null);setSaveError('');}catch(ex){setSaveError((ex as Error).message);}}
  const phaseLabel=isReplay?'Recording replay':calRunning?`Reference · ${cal!.step===0?'rest':cal!.instruction==='contract'?`squeeze ${(cal!.step+1)/2} of ${cal!.contractionCount}`:'rest break'}`:collecting?`${heldOut?'Test':'Training'} examples · Trial ${col!.trial+1} of 18`:finished?s!.state==='complete'?'Session complete':'Session ended':s?`${s.block==='baseline'?'Before practice':s.block==='final'?'After practice':`Practice round ${s.round} of 3`} · Trial ${s.trial%6+1} of 6`:'Muscle control practice';
  const monitor=playtest.current;
  useEffect(()=>{
    if(!monitor||e?.source!=='serial'||!e.raw.length)return;
    e.event('player_cue',{
      title,description,stage,phase:phaseLabel,handAction,target:hasTarget?target:null,
      wateringReward,wallTime:new Date().toISOString(),
    });
  },[e,monitor,title,description,stage,phaseLabel,handAction,hasTarget,target,wateringReward]);
  useEffect(()=>{
    if(finished||paused||cal?.state==='complete'||cal?.state==='failed')saveCheckpoint();
  },[s,finished,paused,cal,cal?.state]);

  return <main>
    <header>
      <span className="brand"><span className="brand-mark">✳</span> EMG Garden</span>
      <div className="header-actions">
        {!board.current&&<span className="status"><i className={fresh?'live':''}/>{signalStatus}</span>}
        {e&&<button type="button" className="secondary demo-toggle" aria-pressed={demoView} onClick={()=>setDemoView(value=>!value)}>Session details</button>}
      </div>
    </header>
    {isReplay&&<div className="source-banner"><strong>{sourceName(e!.originalSource)}</strong> File metadata is not independently verified. Inspection only.{!e!.processor.canCheckClipping&&' ADC settings unknown; clipping cannot be checked.'}{e!.originalNotch50Hz===null&&' Original notch setting unknown; replay uses no notch.'}</div>}
    {error&&<div className="alert" role="alert">{error}</div>}
    {saveError&&<div className="alert" role="alert">{saveError}</div>}
    {board.current?<BoardMonitor reading={board.current} connected={sourceActive} connecting={connecting}
      onConnect={()=>void connect('board')} onClose={()=>void closeBoard()} download={download}/>:!e?<section className="welcome">
      <div className="welcome-copy">
        <h1>Practice steadier <em>muscle control.</em></h1>
        <p>Gently squeeze, hold steady and relax. See your effort change the water you give the flower.</p>
        <div className="button-row">
          <button className="primary" disabled={connecting} onClick={()=>void connect('serial')}>Connect EMG</button>
        </div>
      </div>
      <div className="welcome-garden"><Garden preview/></div>
    </section>:<>
      {demoView&&<DemoDashboard
        source={signalStatus}
        effort={hasEffort?displayedActivity:'Not available'}
        target={hasTarget?percent(target-.1)+'–'+percent(target+.1):'No active target'}
        classification={demoClassification}
        heldOut={heldOut}
        replay={isReplay}
        results={finished&&!collecting?s?.results:undefined}
      />}
      <section className="training-layout" data-stage={stage}>
        <div className="garden-panel">
          <div className="panel-heading"><span>{phaseLabel}</span><span className="source-chip">{isReplay?'Replay':fresh?'Live EMG':'Waiting for signal'}</span></div>
          <Garden level={gardenLevel} target={target} showEffort={hasEffort} showTarget={hasTarget} showWater={hasEffort||referenceFeedback} resting={rest&&!previewFlow} rewarded={wateringReward} effects={gardenEffects} daylight={daylight} confirmTarget={liveTarget} targetPulse={targetFeedback.pulse}/>
          <p className="garden-caption">
            {guidance}{wateringReward&&<span className="reward-note" role="status">Flower watered!</span>}
          </p>
        </div>
        <div className="instruction" data-cue={handAction??undefined}>
          {handAction?<HandCue key={handAction} action={handAction}/>:<StageIcon key={symbol} symbol={symbol}/>}<h1 aria-live="polite">{title}</h1><p>{description}</p>
          {cal?.state==='failed'&&cal.measured&&<p className="recalibration-note">
            Rest RMS {amplitude(cal.measured.baseline,e.processor.amplitudeUnit)} · Squeeze RMS {amplitude(cal.measured.reference,e.processor.amplitudeUnit)}.
            The squeeze needs to exceed {amplitude(minimumReference(cal.measured),e.processor.amplitudeUnit)}.
          </p>}
          {remaining!==null&&<div className="countdown" aria-label={`${Math.ceil(remaining)} seconds remaining`}>
            <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45"/><circle className="countdown-fill" cx="50" cy="50" r="45" pathLength="100" strokeDasharray="100" strokeDashoffset={100-100*remaining/cueDuration}/></svg>
            <div>{Math.ceil(remaining)}<span>seconds</span></div>
          </div>}
          <div className="main-actions">
            {isReplay&&<>{!replayDone&&<button className="secondary" onClick={()=>{running.current=!running.current;lastReceived.current=performance.now();setSourceActive(running.current);refresh();}}>{running.current?'Pause replay':'Continue replay'}</button>}<button className="secondary" onClick={restartReplay}>Replay again</button></>}
            {needsReconnect&&<button className="primary" disabled={connecting} onClick={()=>void connect('serial',serialBaud.current)}>Reconnect EMG</button>}
            {reusableReference&&<button className="primary" onClick={()=>action(()=>{
              e.reuseReference(reusableReference.calibration,reusableReference.conditionId,reusableReference.setup,reusableReference.protocol);
              setSetup(reusableReference.setup);
              setReferenceNotice('Using your saved reference.');
            })}>Use saved reference</button>}
            {!isReplay&&!calRunning&&!collecting&&!training&&!paused&&!finished&&(!e.calibration?
              <button className={reusableReference?'secondary':'primary'} disabled={!fresh||connecting} onClick={()=>action(()=>{
                e.startCalibration(setup,'quick');setReferenceNotice('');
              })}>{cal?.state==='failed'?'Repeat reference':'Set my reference'}</button>:
              <button className="primary" disabled={!fresh} onClick={()=>action(()=>e.startTraining())}>Start training</button>)}
            {training&&<button className="secondary" onClick={()=>action(()=>{s!.pause();e.event('manual_pause');})}>Ⅱ &nbsp; Rest</button>}
            {paused&&<button className="primary" disabled={!fresh} onClick={()=>action(()=>{s!.resume(e.time);e.event('resumed');})}>Continue</button>}
            {(training||paused)&&<button className="text-button" onClick={()=>action(()=>{s!.stop();e.event('training_ended');})}>End session</button>}
            {(calRunning||collecting)&&<button className="text-button" onClick={()=>action(()=>e.interrupt('Recording step stopped. Repeat when ready.'))}>Stop this step</button>}
            {finished&&!collecting&&<button className="primary" disabled={!fresh} onClick={()=>action(()=>e.startTraining())}>New session</button>}
            {canRecalibrate&&<>
              <button type="button" className="secondary" disabled={!fresh} onClick={()=>action(()=>{
                e.startCalibration(setup,'quick');setReferenceNotice('');
              })}>Recalibrate</button>
              {e.model&&<p className="recalibration-note">Recalibration resets the current classifier.</p>}
            </>}
          </div>
          {referenceNotice&&!training&&!collecting&&<p className="fine" role="status">{referenceNotice}</p>}
          <div className="garden-audio-options">
            <label className="audio"><input type="checkbox" checked={audio} onChange={ev=>setAudio(ev.target.checked)}/> Spoken cues</label>
            {e.source==='serial'&&typeof AudioContext!=='undefined'&&
              <label className="audio"><input type="checkbox" checked={targetFeedback.sound}
                onChange={event=>targetFeedback.changeSound(event.target.checked)}/> Water drop sound</label>}
          </div>
        </div>
      </section>
      {isReplay&&<div className="session-progress"><span>{(replayIndex.current/2000).toFixed(1)} / {(replay.current.length/2000).toFixed(1)} seconds</span><progress aria-label="Replay position" value={replayIndex.current} max={replay.current.length}/></div>}
      {(training||paused||finished)&&<div className="session-progress"><span>{s!.results.length} of 30 trials completed</span><progress aria-label="Training progress" value={s!.results.length} max="30"/></div>}
      {finished&&<Results results={s!.results} simulated={false}/>}
    </>}
    {!board.current&&<details className="research-tools"><summary>Setup &amp; research tools</summary><div className="tools-grid">
      <section><h2>Signal source</h2><p>Training uses raw EMG at 2,000 samples per second.</p>
        <div className="button-row">
          <button className="secondary" disabled={!!e?.busy||connecting} onClick={()=>void connect('serial',DEFAULT_EMG_BAUD)}>Connect device</button>
          <button className="secondary" disabled={!!e?.busy||connecting} onClick={()=>void connect('board')}>Connect board</button>
          {!e&&<button className="text-button" disabled={connecting} onClick={()=>{board.current=new BoardReading();refresh();}}>Saved board checks</button>}
        </div>
        <p className="fine">Connect device uses 230400 baud. Connect board opens diagnostics for the original two-column firmware.</p>
        <label><input type="checkbox" checked={notch} disabled={connecting||e?.source==='serial'&&sourceActive} onChange={ev=>setNotch(ev.target.checked)}/> 50 Hz notch for the next connection (includes 100 Hz)</label>
        <label className="file-label">Replay raw CSV<input type="file" accept=".csv,text/csv" disabled={!!e?.busy||connecting} onChange={ev=>{const f=ev.target.files?.[0];if(f)void importCsv(f);ev.target.value='';}}/></label>
        <p className="fine">Replay uses the saved filter setting. CSV includes sample indices, sample rate and raw ADC counts or module-output voltages.</p>
        {e&&<button className="text-button" disabled={!!e.busy||connecting} onClick={()=>action(()=>{
          startDeadline.current=null;running.current=false;void transport.current?.stop();setSourceActive(false);e.event('source_stopped');
        })}>Disconnect / stop signal</button>}
        {e?.source==='serial'&&<details className="capture-setup"><summary>Acquisition notes</summary>
          <label>Device and sensor <input type="text" value={setup.device} maxLength={120} disabled={e.busy}
            onChange={event=>setSetup({...setup,device:event.target.value})}/></label>
          <label>Electrode placement <input type="text" value={setup.electrodePlacement} maxLength={120} disabled={e.busy}
            onChange={event=>setSetup({...setup,electrodePlacement:event.target.value})}/></label>
          <p className="fine">These notes are saved with the next calibration. Use the same position throughout that condition.</p>
        </details>}
        {e?.source==='serial'&&<button className="secondary" disabled={!fresh||e.busy||connecting} onClick={()=>action(()=>{
          e.startCalibration(setup,'full');setReferenceNotice('');
        })}>Full reference (70 seconds)</button>}
      </section>
      <section><h2>Signal check</h2>{heldOut?<p>Effort feedback is hidden during test examples.</p>:<><Wave values={e?.windows.slice(-100).map(f=>f.rms)??[]}/><dl><div><dt>RMS</dt><dd>{e?.latest?amplitude(e.latest.rms,e.processor.amplitudeUnit):'No signal'}</dd></div><div><dt>Quality</dt><dd>{fresh?'Good':e&&!e.processor.ready?'Settling signal':e?.latest?.quality==='good'?'Waiting for signal':e?.latest?.quality??'Waiting'}</dd></div><div><dt>Sample gaps</dt><dd>{e?.processor.gaps??0}</dd></div><div><dt>Activity / reference</dt><dd>{e?.calibration?fresh?percent(e.level):'Waiting for signal':'Not calibrated'}</dd></div></dl><p className="fine">RMS is the amplitude of the processed waveform. Relative activity is measured against your comfortable reference.</p></>}</section>
      <section><h2>Optional AI classifier</h2><p>Water follows continuous RMS activity. The classifier separately estimates relaxed, light and stronger contraction states.</p><p className="classifier-state">{heldOut?'Prediction hidden during test examples.':!fresh?'No fresh prediction':e?.classification?`${LABELS[e.classification.label]} · ${percent(e.classification.confidence)}`:'Classifier not trained or uncertain'}</p><button className="secondary" disabled={!e?.calibration||!fresh||e.busy||isReplay} onClick={()=>action(()=>{e!.startCollection();setWaveformSlot(null);})}>Collect 18 labelled trials</button>
        {col?.error&&<p role="alert">{col.error}</p>}
        {col?.state==='complete'&&<>
          <details>
            <summary>Review labelled trials · {col.trialReviews.filter(trial=>trial.decision==='accepted').length} / 18 accepted</summary>
            <p className="fine">Compare each trial with its prompt and recording. Retake a trial in its original training or test slot.</p>
            <div className="table-scroll"><table><thead><tr><th>Trial</th><th>Prompt</th><th>Split</th><th>Median RMS</th><th>Review</th></tr></thead>
              <tbody>{col.trialReviews.map(({slot,label,medianRms,windowCount,decision,startIndex,endIndex})=><Fragment key={slot}><tr>
                <th scope="row">{slot+1}</th><td>{LABELS[label]}</td><td>{slot<12?'Train':'Test'}</td>
                <td>{medianRms===null?'—':amplitude(medianRms,e?.processor.amplitudeUnit)}<br/><small>{windowCount} windows</small></td>
                <td><select aria-label={`Trial ${slot+1} review`} value={decision} disabled={!!e?.busy}
                  onChange={ev=>action(()=>e!.reviewExampleTrial(slot,ev.target.value as TrialReviewDecision))}>
                  <option value="pending">Pending</option><option value="accepted" disabled={windowCount<5}>Accepted</option>
                  <option value="excluded">Excluded</option>
                </select>
                <button type="button" className="text-button" aria-label={`Retake trial ${slot+1}`}
                  disabled={!fresh||!!e?.busy} onClick={()=>action(()=>{e!.retakeExampleTrial(slot);setWaveformSlot(null);})}>Retake</button>
                {startIndex!==null&&endIndex!==null&&<button type="button" className="text-button" aria-expanded={waveformSlot===slot}
                  onClick={()=>setWaveformSlot(waveformSlot===slot?null:slot)}>
                  {waveformSlot===slot?'Hide':'View'} trial {slot+1} waveform
                </button>}</td>
              </tr>{waveformSlot===slot&&startIndex!==null&&endIndex!==null&&<tr><td colSpan={5}>
                <TrialWaveform raw={e!.raw} trial={slot+1} startIndex={startIndex} endIndex={endIndex}/>
              </td></tr>}</Fragment>)}</tbody>
            </table></div>
          </details>
          <button className="secondary" disabled={!col.reviewReady||!!e?.busy} onClick={()=>action(()=>e!.train())}>Fit and test kNN</button>
        </>}
        {e?.report&&!heldOut&&<><p>Held-out window accuracy: {percent(e.report.accuracy)}</p><table><caption>Windows from six held-out trials · actual rows, predicted columns</caption><thead><tr><th>State</th><th>Rest</th><th>Light</th><th>Stronger</th><th>Recall</th></tr></thead><tbody>{e.report.matrix.map((row,i)=><tr key={i}><th>{LABELS[i]}</th>{row.map((v,j)=><td key={j}>{v}</td>)}<td>{percent(e.report!.recall[i])}</td></tr>)}</tbody></table><p className="fine">Each class reaching 80% recall is an initial debugging target, not clinical validation. Simulation results remain synthetic.</p></>}
      </section>
      <section><h2>Playtest monitor</h2><p>{e?`${e.raw.length.toLocaleString()} raw samples · ${e.windows.length.toLocaleString()} feature windows`:'No recording yet'}</p><div className="button-row"><button className="secondary" disabled={!e?.raw.length||!!e.busy} onClick={()=>exportData('session')}>Download session JSON</button><button className="secondary" disabled={!e?.raw.length||!!e.busy} onClick={()=>exportData('raw')}>Download raw CSV</button></div><p className="fine">Download both files for a paired export. Recording limit: 20 minutes per source.</p>
        <p className="fine" role="status">{monitor?.error
          ? 'Could not save a local checkpoint. The monitor will retry. The download buttons remain available.'
          : monitor?.saved.samples
            ? `Saved locally · ${monitor.saved.samples.toLocaleString()} raw samples.`
            : monitor?'Starting local recording…':'Local recording starts when live EMG arrives.'}</p>
        {monitor&&<p className="fine">Playtest ID {monitor.id}</p>}
        {saveNotice&&<p role="status">{saveNotice}</p>}<a href="/README.md" target="_blank" rel="noreferrer">Setup and protocol guide</a></section>
      <section><h2>Saved results</h2><p className="fine">Completed trials are saved only in this browser. Raw waveforms are not saved here. Download a backup before clearing browser data.</p><label className="file-label">Open results JSON<input type="file" accept=".json,application/json" disabled={!!e?.busy} onChange={ev=>{const file=ev.target.files?.[0];if(file)void openResults(file);ev.target.value='';}}/></label>{!saved.length?<p>No saved results.</p>:<ul className="saved-list">{saved.map(record=><li key={record.id}><span>{new Date(record.createdAt).toLocaleString('en-GB')} · Round {record.number}<small>{sourceName(record.originalSource)} · {record.results.length} trials · {record.state}</small></span><button className="text-button" onClick={()=>setViewed(record)}>View</button><button className="text-button" onClick={()=>removeSaved(record)}>Delete</button></li>)}</ul>}</section>
    </div></details>}
    {viewed&&<section className="saved-review"><div className="saved-heading"><h2>Saved result · Round {viewed.number}</h2><button className="text-button" onClick={()=>setViewed(null)}>Close result</button></div><p>Read-only · {sourceName(viewed.originalSource)} · {viewed.state}</p><p className="fine">Reported source is file metadata, not an independently verified measurement. Comfortable reference {amplitude(viewed.calibration.reference,viewed.config.amplitudeUnit)}. Condition {viewed.conditionId}.</p><Results results={viewed.results} simulated={viewed.originalSource==='simulation'}/><button className="secondary" onClick={()=>download(`emg-garden-result-${viewed.number}.json`,JSON.stringify(viewed))}>Download saved result</button></section>}
    <footer>EMG biofeedback prototype · Comfortable effort, not maximum effort · Stop if uncomfortable</footer>
  </main>;
}
