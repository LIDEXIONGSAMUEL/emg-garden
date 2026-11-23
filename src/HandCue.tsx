export type HandAction='relax'|'squeeze'|'hold'|'ease'|'relaxed';

export function HandCue({action}:{action:HandAction}){
  const open=action==='relax'||action==='ease'||action==='relaxed';
  return <div className="instruction-symbol hand-symbol" data-hand-action={action} aria-hidden="true">
    <svg viewBox="0 0 120 110" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <g className="cue-hand">
        <path fill="var(--cue-fill)" d={open?'M45 100V82C34 77 30 70 26 62L16 43Q12 35 18 33Q23 31 27 37L35 49V25Q35 18 41 18Q47 18 47 25V44V14Q47 7 53 7Q59 7 59 14V43V18Q59 11 65 11Q71 11 71 18V45V29Q71 22 77 22Q83 22 83 29V61Q83 76 73 83V100':'M42 100V81Q28 74 27 59L25 43Q24 36 30 35Q36 34 38 42L40 49V32Q40 25 46 25Q52 25 52 32V41V28Q52 21 58 21Q64 21 64 28V41V31Q64 24 70 24Q76 24 76 31V44V38Q76 31 82 31Q88 31 88 38V64Q88 77 76 83V100'}/>
        {open?<path d="M45 62Q56 55 66 61"/>:<path d="M40 49L62 49Q69 49 69 55Q69 61 62 61H49M52 41V48M64 41V48M76 44V53"/>}
      </g>
      {action==='hold'&&<path className="cue-accent" d="M99 36V62M109 36V62"/>}
      {action==='squeeze'&&<path className="cue-accent" d="m29 22 5 5m15-15 2 7m26-6-2 7"/>}
      {action==='relax'&&<path className="cue-accent" d="M94 38q8 9 0 18m8-22q10 13 0 26"/>}
      {action==='ease'&&<path className="cue-accent" d="M102 32V62m-8-8 8 8 8-8"/>}
      {action==='relaxed'&&<path className="cue-confirm" d="M92 49l8 8 13-17" pathLength="1" strokeWidth="4"/>}
    </svg>
  </div>;
}

export function StageIcon({symbol}:{symbol:string}){
  const glyph=symbol==='✓'?'M19 32l9 9 17-19':symbol==='Ⅱ'?'M27 22v20m10-20v20':
    symbol==='▷'?'M26 21l17 11-17 11Z':'M20 32h6l4-9 5 18 4-9h5';
  return <div className="instruction-symbol stage-icon" aria-hidden="true">
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="32" r="28" className="stage-orbit"/>
      <circle cx="32" cy="32" r="23" opacity=".3"/>
      <path d={glyph}/>
    </svg>
  </div>;
}
