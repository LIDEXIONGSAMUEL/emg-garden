import type {BoardRow} from './serial';

const cues=[
  {action:'ready',seconds:3},
  {action:'relax',seconds:8},
  {action:'squeeze',seconds:4},
  {action:'relax',seconds:8},
  {action:'squeeze',seconds:4},
  {action:'relax',seconds:8},
] as const;

type Phase={
  action:typeof cues[number]['action'];
  start:number;
  end:number;
};

export const BOARD_CHECK_PHASES:Phase[]=[];
for(const cue of cues){
  const start=BOARD_CHECK_PHASES.at(-1)?.end??0;
  BOARD_CHECK_PHASES.push({action:cue.action,start,end:start+cue.seconds*1000});
}
export const BOARD_CHECK_DURATION=BOARD_CHECK_PHASES.at(-1)!.end;

type CheckRow={raw:BoardRow;notch:BoardRow};
export type BoardCheckBatch={elapsedMs:number;rows:CheckRow[];ignored:number;gapBefore:boolean};
export type BoardCheckSummary={
  id:string;
  startedAt:string;
  rows:number;
  ignored:number;
  gaps:number;
};
export type BoardCheck={
  summary:BoardCheckSummary;
  source:'board-serial';
  baudRate:115200;
  durationMs:number;
  notchPreviewRate:number;
  phases:Phase[];
  batches:BoardCheckBatch[];
};

export function boardCheckCsv(check:BoardCheck){
  const lines=['source,baud_rate,started_at_utc,batch_index,received_elapsed_ms,phase_number,cue,cue_start_ms,cue_end_ms,ignored_in_batch,gap_before,notch_assumed_rate,column_1_raw,column_2_raw,column_1_notch,column_2_notch'];
  check.batches.forEach((batch,index)=>{
    const phaseIndex=check.phases.findIndex(phase=>batch.elapsedMs<phase.end);
    const phase=check.phases[phaseIndex];
    const prefix=[
      check.source,check.baudRate,check.summary.startedAt,index,batch.elapsedMs,
      phaseIndex+1,phase.action,phase.start,phase.end,
    ];
    if(!batch.rows.length){
      lines.push([...prefix,batch.ignored,Number(batch.gapBefore),check.notchPreviewRate,'','','',''].join(','));
      return;
    }
    batch.rows.forEach(({raw,notch},row)=>{
      lines.push([...prefix,row===0?batch.ignored:'',row===0?Number(batch.gapBefore):'',check.notchPreviewRate,...raw,...notch].join(','));
    });
  });
  return lines.join('\n')+'\n';
}
