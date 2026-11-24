import type {Engine} from './engine';

const RAW_BATCH_SIZE=4000;
const WINDOW_BATCH_SIZE=160;
const EVENT_BATCH_SIZE=160;

type Position={samples:number;windows:number;events:number};
type PendingBatch={end:Position;body:string};

export class PlaytestLog {
  readonly id=crypto.randomUUID();
  saved:Position={samples:0,windows:0,events:0};
  error=false;
  private sequence=0;
  private batch:PendingBatch|null=null;
  private checkpointEnd:Position=this.saved;
  private active:Promise<void>|null=null;

  constructor(private engine:Engine){}

  checkpoint(){
    this.checkpointEnd={
      samples:this.engine.raw.length,
      windows:this.engine.windows.length,
      events:this.engine.events.length,
    };
    if(!this.checkpointEnd.samples)return Promise.resolve();
    this.active??=this.write().finally(()=>{this.active=null;});
    return this.active;
  }

  private nextBatch(){
    const {samples,windows,events}=this.saved;
    const end={
      samples:Math.min(samples+RAW_BATCH_SIZE,this.checkpointEnd.samples),
      windows:Math.min(windows+WINDOW_BATCH_SIZE,this.checkpointEnd.windows),
      events:Math.min(events+EVENT_BATCH_SIZE,this.checkpointEnd.events),
    };
    const {config,calibration,sessions,sessionState}=this.engine.export();
    const body=JSON.stringify({
      schema:'emg-garden-playtest/1',id:this.id,sequence:this.sequence,source:'serial',
      startedAt:this.engine.createdAt,savedAt:new Date().toISOString(),config,calibration,sessions,sessionState,
      samples:this.engine.raw.slice(samples,end.samples).map(sample=>[sample.index,sample.adcCount??null,sample.voltage]),
      windows:this.engine.windows.slice(windows,end.windows),
      events:this.engine.events.slice(events,end.events),
    });
    return {end,body};
  }

  private async write(){
    try{
      while(this.saved.samples<this.checkpointEnd.samples||
        this.saved.windows<this.checkpointEnd.windows||this.saved.events<this.checkpointEnd.events){
        const batch=this.batch??=this.nextBatch();
        const response=await fetch('/api/playtest-checkpoint',{
          method:'POST',
          signal:AbortSignal.timeout(5000),
          headers:{'Content-Type':'application/json'},
          body:batch.body,
          // Chromium limits concurrent keepalive requests to 64 KiB. A small
          // checkpoint can still arrive when the page is closing.
          keepalive:new TextEncoder().encode(batch.body).byteLength<=60*1024,
        });
        if(!response.ok)throw new Error('Local checkpoint rejected');
        this.saved=batch.end;
        this.sequence++;
        this.batch=null;
        this.error=false;
      }
    }catch{
      this.error=true;
    }
  }
}
