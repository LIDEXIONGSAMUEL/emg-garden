import {createNotchFilter} from './signal';
import type {BoardRow} from './serial';
import {BOARD_CHECK_DURATION,BOARD_CHECK_PHASES,type BoardCheck,type BoardCheckBatch} from './boardCheck';

export const BOARD_PREVIEW_SAMPLE_RATE=500;
const BOARD_HISTORY=250;
const BOARD_GAP_MS=150;
const BOARD_LIVE_MS=1000;

type Capture={check:BoardCheck;start:number;lastAt:number};

export class BoardReading {
  rows:BoardRow[]=[];
  filteredRows:BoardRow[]=[];
  received=0;
  ignored=0;
  firstAt:number|null=null;
  lastAt:number|null=null;
  private capture:Capture|null=null;
  private filters:[ReturnType<typeof createNotchFilter>,ReturnType<typeof createNotchFilter>]|null=null;

  isFresh(now:number){
    return this.lastAt!==null&&now-this.lastAt<BOARD_LIVE_MS;
  }

  startCheck(now:number){
    if(!this.isFresh(now))return false;
    this.capture={
      start:now,lastAt:now,
      check:{
        summary:{id:crypto.randomUUID(),startedAt:new Date().toISOString(),rows:0,ignored:0,gaps:0},
        source:'board-serial',baudRate:115200,durationMs:BOARD_CHECK_DURATION,
        notchPreviewRate:BOARD_PREVIEW_SAMPLE_RATE,phases:BOARD_CHECK_PHASES,batches:[],
      },
    };
    return true;
  }

  checkIsLive(now:number){
    const capture=this.capture;
    return capture!==null&&Math.min(now,capture.start+BOARD_CHECK_DURATION)-capture.lastAt<BOARD_LIVE_MS;
  }

  cancelCheck(){this.capture=null;}

  finishCheck(now:number){
    const capture=this.capture;
    const finished=capture&&now-capture.start>=BOARD_CHECK_DURATION&&this.checkIsLive(now)&&capture.check.summary.rows>0;
    this.cancelCheck();
    return finished?capture.check:null;
  }

  private captureBatch(rowCount:number,ignored:number,now:number):BoardCheckBatch|undefined{
    const capture=this.capture;
    if(!capture||now>=capture.start+BOARD_CHECK_DURATION)return;
    if(!this.checkIsLive(now)){this.cancelCheck();return;}
    const gapBefore=rowCount>0&&now-capture.lastAt>BOARD_GAP_MS;
    const batch:BoardCheckBatch={elapsedMs:now-capture.start,ignored,gapBefore,rows:[]};
    if(rowCount)capture.lastAt=now;
    capture.check.batches.push(batch);
    capture.check.summary.rows+=rowCount;
    capture.check.summary.ignored+=ignored;
    if(gapBefore)capture.check.summary.gaps++;
    return batch;
  }

  receive(rows:BoardRow[],ignored:number,now:number){
    const batch=this.captureBatch(rows.length,ignored,now);
    this.ignored+=ignored;
    if(ignored||(this.lastAt!==null&&now-this.lastAt>BOARD_GAP_MS)){
      this.rows=[];
      this.filteredRows=[];
      this.filters=null;
    }
    if(!rows.length)return;
    this.firstAt??=now;
    this.lastAt=now;
    this.received+=rows.length;

    for(const row of rows){
      const [first,second]=row;
      const filters=this.filters??=[
        createNotchFilter(BOARD_PREVIEW_SAMPLE_RATE,10,first),
        createNotchFilter(BOARD_PREVIEW_SAMPLE_RATE,10,second),
      ];
      const filtered:BoardRow=[filters[0].next(first),filters[1].next(second)];
      this.rows.push(row);
      const valid=filtered.every(Number.isFinite);
      const preview=valid?filtered:row;
      this.filteredRows.push(preview);
      if(!valid)this.filters=null;
      batch?.rows.push({raw:row,notch:preview});
    }
    if(this.rows.length>BOARD_HISTORY){
      const excess=this.rows.length-BOARD_HISTORY;
      this.rows.splice(0,excess);
      this.filteredRows.splice(0,excess);
    }
  }
}
