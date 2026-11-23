import {useEffect,useState} from 'react';
import {HandCue,StageIcon} from './HandCue';
import {BOARD_CHECK_DURATION,BOARD_CHECK_PHASES,type BoardCheck} from './boardCheck';
import type {BoardReading} from './boardSignal';

const [ready,...actionPhases]=BOARD_CHECK_PHASES;

type Run=
  | {state:'idle'|'complete'|'interrupted'|'hidden'}
  | {state:'running';startedAt:number;elapsed:number};

export function BoardGuide({live,reading,onComplete}:{
  live:boolean;reading:BoardReading;onComplete:(check:BoardCheck)=>void;
}){
  const [run,setRun]=useState<Run>({state:'idle'});
  const startedAt=run.state==='running'?run.startedAt:null;

  useEffect(()=>()=>reading.cancelCheck(),[reading]);

  useEffect(()=>{
    if(startedAt===null)return;
    if(!live){reading.cancelCheck();setRun({state:'interrupted'});return;}

    function stop(state:'hidden'|'interrupted'){
      window.clearInterval(timer);
      reading.cancelCheck();
      setRun({state});
    }
    const timer=window.setInterval(()=>{
      const now=performance.now();
      const elapsed=now-startedAt;
      if(!reading.checkIsLive(now)){stop('interrupted');return;}
      if(elapsed<BOARD_CHECK_DURATION){setRun({state:'running',startedAt,elapsed});return;}

      window.clearInterval(timer);
      const check=reading.finishCheck(now);
      setRun({state:check?'complete':'interrupted'});
      if(check)onComplete(check);
    },50);
    const visibility=()=>{
      if(document.hidden)stop('hidden');
    };
    document.addEventListener('visibilitychange',visibility);

    return ()=>{
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',visibility);
    };
  },[startedAt,live,reading,onComplete]);

  function toggle(){
    if(run.state==='running'){
      reading.cancelCheck();
      setRun({state:'idle'});
      return;
    }
    const startedAt=performance.now();
    if(reading.startCheck(startedAt))setRun({state:'running',startedAt,elapsed:0});
    else setRun({state:'interrupted'});
  }

  const running=run.state==='running';
  const elapsed=running?run.elapsed:0;
  const index=running?actionPhases.findIndex(phase=>elapsed>=phase.start&&elapsed<phase.end):-1;
  const phase=actionPhases[index];
  const preparing=running&&elapsed<ready.end;
  const remaining=phase?phase.end-elapsed:preparing?ready.end-elapsed:null;
  const phaseLength=phase?phase.end-phase.start:ready.end;
  const squeeze=phase?.action==='squeeze';

  let title='Ready to follow', description=live?'Support your forearm and keep it still.':'Wait for the board to show Receiving.';
  if(preparing){title='Get ready';description='Rest your forearm with your hand open.';}
  if(phase){
    title=squeeze?'Gently squeeze':'Relax your hand';
    description=squeeze?'Make a comfortable fist and hold it steady.':'Open your hand and let your fingers rest.';
  }
  if(run.state==='complete'){title='Check complete';description='Relax your hand.';}
  if(run.state==='interrupted'){title='Signal interrupted';description='Wait for the board to receive data, then restart.';}
  if(run.state==='hidden'){title='Check stopped';description='Keep this tab visible while following the cues.';}

  const buttonText=running?'Stop check':run.state==='complete'?'Run again':
    run.state==='interrupted'||run.state==='hidden'?'Restart check':'Start guided check';

  return <section className="board-guide" aria-label="Guided signal check" data-cue={phase?.action}>
    <div className="board-guide-heading">
      <h2>Guided signal check</h2>
      <button type="button" className={running?'secondary':'primary'} disabled={!live&&!running} onClick={toggle}>
        {buttonText}
      </button>
    </div>
    <div className="board-guide-cue">
      {phase?<HandCue action={squeeze?'squeeze':'relax'}/>:<StageIcon symbol={run.state==='complete'?'✓':'▷'}/>}
      <div className="board-guide-description">
        <h3 aria-live="polite">{title}</h3>
        <p>{description}</p>
        {running&&<p className="board-recording-state">Recording · Saves on completion</p>}
      </div>
      {remaining!==null&&<div className="countdown" role="timer" aria-label={`${Math.ceil(remaining/1000)} seconds remaining`}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="45"/>
          <circle className="countdown-fill" cx="50" cy="50" r="45" pathLength="100"
            strokeDasharray="100" strokeDashoffset={100-100*remaining/phaseLength}/>
        </svg>
        <div>{Math.ceil(remaining/1000)}<span>seconds</span></div>
      </div>}
    </div>
    <ol className="board-guide-phases" aria-label="Action sequence">
      {actionPhases.map((step,i)=><li key={step.start} data-action={step.action}
        data-done={run.state==='complete'||running&&elapsed>=step.end||undefined} aria-current={i===index?'step':undefined}>
        <strong>{step.action==='squeeze'?'Squeeze':'Relax'}</strong> <span>{(step.end-step.start)/1000}s</span>
      </li>)}
    </ol>
  </section>;
}
