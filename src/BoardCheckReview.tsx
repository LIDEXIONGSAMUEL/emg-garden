import {memo,useMemo,useState} from 'react';
import {boardCheckCsv,type BoardCheck} from './boardCheck';
import {BoardRailCheck} from './BoardRailCheck';

const BIN_MS=100;
const CHART_WIDTH=720;
const display=new Intl.NumberFormat('en',{maximumFractionDigits:4});
export type DownloadFile=(name:string,body:string,type?:string)=>void;

function WholeTrace({check,column,filtered}:{check:BoardCheck;column:0|1;filtered:boolean}){
  const {durationMs,phases,batches}=check;
  const bins:(readonly [number,number]|undefined)[]=Array(Math.ceil(durationMs/BIN_MS)).fill(undefined);
  let low=Infinity,high=-Infinity,visibleLow=Infinity,visibleHigh=-Infinity;
  for(const batch of batches){
    const bin=Math.floor(batch.elapsedMs/BIN_MS);
    for(const row of batch.rows){
      const value=(filtered?row.notch:row.raw)[column];
      const previous=bins[bin];
      bins[bin]=previous?[Math.min(value,previous[0]),Math.max(value,previous[1])]:[value,value];
      visibleLow=Math.min(visibleLow,value);
      visibleHigh=Math.max(visibleHigh,value);
      low=Math.min(low,row.raw[column],row.notch[column]);
      high=Math.max(high,row.raw[column],row.notch[column]);
    }
  }
  const extent=Math.max(1,Math.abs(low),Math.abs(high));
  const floor=low/extent;
  const span=high/extent-floor;
  const y=(value:number)=>span>0?72-64*(value/extent-floor)/span:40;
  const x=(ms:number)=>ms*CHART_WIDTH/durationMs;
  const path=bins.map((bin,i)=>bin
    ? `M${x((i+.5)*BIN_MS).toFixed(2)} ${y(bin[0]).toFixed(2)}V${(Math.min(y(bin[0])-.45,y(bin[1]))).toFixed(2)}`
    : '').join('');
  const name=`Column ${column+1}`;

  return <figure className="board-trace board-check-trace" data-column={column+1}>
    <figcaption><strong>{name}</strong><span className="fine">{display.format(visibleLow)} to {display.format(visibleHigh)}</span></figcaption>
    <svg viewBox="0 0 720 80" preserveAspectRatio="none" role="img" aria-label={`${name} whole-check waveform`}>
      {phases.map(({action,start,end})=><rect key={start} x={x(start)} y="0" width={x(end-start)} height="80" data-action={action}/>)}
      <path d="M0 40H720" className="board-trace-grid" vectorEffect="non-scaling-stroke"/>
      <path d={path} className="board-check-wave" vectorEffect="non-scaling-stroke"/>
    </svg>
  </figure>;
}

export const BoardCheckReview=memo(function BoardCheckReview({check,download}:{check:BoardCheck;download:DownloadFile}){
  const [filtered,setFiltered]=useState(false);
  const {summary,durationMs,notchPreviewRate}=check;
  const adcCodes=useMemo(()=>check.batches.flatMap(batch=>batch.rows.map(row=>row.raw[0])),[check]);
  const traces=useMemo(()=>[0,1].map(column=><WholeTrace key={column} check={check} column={column as 0|1} filtered={filtered}/>),[check,filtered]);

  return <div className="board-check-review">
    <div className="board-check-tools">
      <span>{display.format(summary.rows)} rows · {durationMs/1000} s{summary.ignored>0?` · ${summary.ignored} ignored`:''}{summary.gaps>0?` · ${summary.gaps} receive gaps`:''}</span>
      <button type="button" className="secondary" onClick={()=>download(
        `emg-board-check-${summary.startedAt.replace(/[:.]/g,'-')}.csv`,boardCheckCsv(check),'text/csv;charset=utf-8'
      )}>Download check CSV</button>
    </div>
    <div className="board-check-tools">
      <label><input type="checkbox" checked={filtered} onChange={event=>setFiltered(event.target.checked)}/> Show 50 Hz notch</label>
      <p className="fine"><span className="board-check-squeeze-key"/> Squeeze cue</p>
    </div>
    <BoardRailCheck codes={adcCodes}/>
    <div className="board-traces">{traces}</div>
    <div className="board-check-axis">
      {[0,10,20,30,durationMs/1000].map(second=><span key={second} style={{left:`${second*100000/durationMs}%`}}>{second}s</span>)}
    </div>
    <p className="fine">Ranges per {BIN_MS} ms of browser receive time. Column units are unknown.
      {filtered&&` Notch preview assumes ${notchPreviewRate} samples/s.`}</p>
  </div>;
});
