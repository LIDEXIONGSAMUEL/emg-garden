import {useCallback,useEffect,useState} from 'react';
import {BoardGuide} from './BoardGuide';
import {BoardRailCheck} from './BoardRailCheck';
import {BoardCheckReview,type DownloadFile} from './BoardCheckReview';
import {listBoardChecks,readBoardCheck,saveBoardCheck} from './boardCheckStore';
import type {BoardCheck,BoardCheckSummary} from './boardCheck';
import {BOARD_PREVIEW_SAMPLE_RATE,type BoardReading} from './boardSignal';

const display=new Intl.NumberFormat('en',{maximumFractionDigits:4});
const checkDate=new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'medium'});
type LatestCheck={check:BoardCheck;state:'saving'|'saved'|'failed'};

function BoardTrace({reading,filtered,column}:{reading:BoardReading;filtered:boolean;column:0|1}){
  const name=`Column ${column+1}`;
  const raw=reading.rows.map(row=>row[column]);
  const preview=reading.filteredRows.map(row=>row[column]);
  const values=filtered?preview:raw;
  const latest=values.at(-1);
  const min=values.length?Math.min(...values):0;
  const max=values.length?Math.max(...values):0;
  // Keep the same scale when toggling, so attenuation is visible.
  const floor=raw.length?Math.min(...raw,...preview):0;
  const ceiling=raw.length?Math.max(...raw,...preview):0;
  const extent=Math.max(1,Math.abs(floor),Math.abs(ceiling));
  const lower=floor/extent,upper=ceiling/extent;
  const span=upper-lower;
  const points=values.map((value,index)=>{
    const x=12+696*index/Math.max(1,values.length-1);
    const y=span>0?88-76*(value/extent-lower)/span:50;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return <figure className="board-trace" data-column={column+1}>
    <figcaption>
      <strong>{name}</strong>
      <span>{latest===undefined?'—':display.format(latest)}</span>
    </figcaption>
    <svg viewBox="0 0 720 100" preserveAspectRatio="none" role="img" aria-label={`${name} serial waveform`}>
      <path d="M12 12H708M12 50H708M12 88H708" className="board-trace-grid" vectorEffect="non-scaling-stroke"/>
      {values.length>1&&<polyline points={points} vectorEffect="non-scaling-stroke"/>}
      {values.length===1&&<circle cx="12" cy="50" r="3"/>}
    </svg>
    <p className="fine">{values.length?`Visible range ${display.format(min)} to ${display.format(max)}`:'Waiting for valid rows'}</p>
  </figure>;
}

export function BoardMonitor({reading,connected,connecting,onConnect,onClose,download}:{
  reading:BoardReading;
  connected:boolean;
  connecting:boolean;
  onConnect:()=>void;
  onClose:()=>void;
  download:DownloadFile;
}){
  const [filtered,setFiltered]=useState(false);
  const [checks,setChecks]=useState<BoardCheckSummary[]>([]);
  const [newest,setNewest]=useState<LatestCheck|null>(null);
  const [chosen,setChosen]=useState('');
  const [recalled,setRecalled]=useState<BoardCheck|null>(null);
  const [archiveError,setArchiveError]=useState('');
  const [unavailableId,setUnavailableId]=useState('');
  const currentId=chosen||newest?.check.summary.id||checks[0]?.id||'';
  const isNewest=currentId===newest?.check.summary.id;
  const review=isNewest?newest?.check:recalled?.summary.id===currentId?recalled:null;

  useEffect(()=>{
    let active=true;
    listBoardChecks().then(summaries=>{
      if(active)setChecks(current=>[...current,...summaries.filter(item=>!current.some(known=>known.id===item.id))]);
    }).catch(()=>{
      if(active)setArchiveError('Saved board checks are unavailable on this browser.');
    });
    return ()=>{active=false;};
  },[]);

  useEffect(()=>{
    if(!currentId||isNewest)return;
    let active=true;
    readBoardCheck(currentId).then(check=>{
      if(!active)return;
      if(check){setRecalled(check);setUnavailableId('');}
      else setUnavailableId(currentId);
    }).catch(()=>{if(active)setUnavailableId(currentId);});
    return ()=>{active=false;};
  },[currentId,isNewest]);

  const finish=useCallback((check:BoardCheck)=>{
    setNewest({check,state:'saving'});
    setChosen('');
    saveBoardCheck(check).then(()=>{
      setChecks(previous=>[check.summary,...previous.filter(item=>item.id!==check.summary.id)]);
      setArchiveError('');
      setNewest(current=>current?.check===check?{check,state:'saved'}:current);
    }).catch(()=>{
      setNewest(current=>current?.check===check?{check,state:'failed'}:current);
    });
  },[]);

  const {received,ignored,firstAt,lastAt}=reading;
  const live=connected&&reading.isFresh(performance.now());
  const elapsed=firstAt!==null&&lastAt!==null?lastAt-firstAt:0;
  const rate=elapsed>=1000?Math.round((received-1)*1000/elapsed):null;

  return <section className="board-monitor" aria-label="Board monitor">
    <div className="board-monitor-heading">
      <div><h1>Board monitor</h1><p>115200 baud · Two-column serial input</p></div>
      <span className="status" role="status"><i className={live?'live':''}/>{connecting?'Connecting…':live?'Receiving':connected?'Waiting for data':'Disconnected'}</span>
    </div>
    <p className="board-monitor-notice">The board does not report its sampling rate or column units. Calibration and training require the EMG JSON stream.</p>
    <div className="board-monitor-counts">
      <span>{display.format(received)} rows</span>
      <span>{rate===null?'—':display.format(rate)} rows/s received</span>
      {ignored>0&&<span>{display.format(ignored)} ignored</span>}
    </div>
    {live&&<BoardRailCheck codes={reading.rows.map(([raw])=>raw)}/>}
    <BoardGuide live={live} reading={reading} onComplete={finish}/>
    <section className="board-check-history" aria-label="Saved board checks">
      <div className="board-check-tools">
        <h2>Saved board checks</h2>
        {checks.length>0&&<select aria-label="Choose a board check" value={currentId} onChange={event=>setChosen(event.target.value)}>
          {newest&&newest.state!=='saved'&&<option value={newest.check.summary.id}>Current check</option>}
          {checks.map(item=><option key={item.id} value={item.id}>{checkDate.format(new Date(item.startedAt))}</option>)}
        </select>}
      </div>
      {isNewest&&newest&&<p className="fine" role="status">{
        newest.state==='saving'?'Saving this check…':
        newest.state==='saved'?'Saved on this browser.':
        'Automatic save failed. Download the CSV before leaving.'
      }</p>}
      {!isNewest&&archiveError&&<p className="fine" role="status">{archiveError}</p>}
      {review&&<BoardCheckReview key={review.summary.id} check={review} download={download}/>}
      {!review&&<p className="fine">{
        currentId?(unavailableId===currentId?'This recorded check could not be opened.':'Opening saved waveform…'):
        archiveError?'':'Completed checks are saved here automatically.'
      }</p>}
    </section>
    <div className="board-filter">
      <label><input type="checkbox" checked={filtered} onChange={event=>setFiltered(event.target.checked)}/> 50 Hz notch</label>
      <p className="fine">{filtered?'Filtered preview':'Raw preview'} · Assumes {BOARD_PREVIEW_SAMPLE_RATE} evenly spaced samples/s. Filtering cannot undo clipping.</p>
    </div>
    <div className="board-traces">
      <BoardTrace reading={reading} filtered={filtered} column={0}/>
      <BoardTrace reading={reading} filtered={filtered} column={1}/>
    </div>
    <div className="button-row">
      {!connected&&!connecting&&<button className="primary" onClick={onConnect}>Reconnect board</button>}
      <button className="secondary" disabled={connecting} onClick={onClose}>Close board monitor</button>
    </div>
  </section>;
}
