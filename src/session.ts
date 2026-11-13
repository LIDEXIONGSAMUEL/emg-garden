import {activity,calibrate,mean,sd,type Frame,type Calibration} from './signal';
import type {Example} from './model';
type State='ready'|'running'|'paused'|'complete'|'stopped';
export type TrialResult={trial:number;block:'baseline'|'practice'|'final';round:number;target:number;tolerance:number;error:number|null;inZone:number|null;variation:number|null;coverage:number;restCoverage:number;residual:number|null;relaxationMs:number|null;rewarded:boolean;interrupted:boolean;valid:boolean;contractStartMs?:number;holdStartMs?:number;holdEndMs?:number;restStartMs?:number;endMs?:number};
export class TrainingSession {
  state:State='ready';phase:'familiar'|'contract'|'rest'='familiar';results:TrialResult[]=[];
  phaseAt=0;lastTime=0;trial=0;rewarded=false;hold=0;message='';
  private previous:Frame|null=null;private pausedAt=0;private values:number[]=[];private weights:number[]=[];
  private rest:number[]=[];private restMs=0;private pending:TrialResult|null=null;private relaxAt:number|null=null;private relaxationMs:number|null=null;private interrupted=false;private contractStart=0;
  constructor(public calibration:Calibration){}
  get target(){return this.trial%2===0?.3:.6;}
  get remaining(){return Math.max(0,((this.phase==='familiar'?30000:5000)-(this.lastTime-this.phaseAt))/1000);}
  get block(){return this.trial<6?'baseline':this.trial<24?'practice':'final';}
  get round(){return this.trial<6||this.trial>=24?1:Math.floor((this.trial-6)/6)+1;}
  get relaxed(){return this.state==='running'&&this.phase==='rest'&&this.previous!==null&&this.previous.rms<=this.calibration.restThreshold&&this.relaxAt!==null&&this.lastTime-this.relaxAt>=300;}
  start(t:number){if(this.state!=='ready')return;this.state='running';this.phaseAt=t;this.lastTime=t;}
  pause(reason='Take a break.'){
    if(this.state!=='running')return;this.state='paused';this.pausedAt=this.lastTime;this.previous=null;this.hold=0;this.relaxAt=null;this.interrupted=true;this.message=reason;
  }
  resume(t:number){if(this.state!=='paused')return;this.phaseAt+=t-this.pausedAt;this.lastTime=t;this.previous=null;this.state='running';}
  stop(){if(['running','paused'].includes(this.state))this.state='stopped';}
  push(f:Frame){
    if(this.state!=='running')return;
    if(f.quality!=='good'){this.pause('Signal needs checking. No score is being recorded.');return;}
    if(this.previous&&f.time-this.previous.time>150){this.pause('Signal interrupted. No score is being recorded.');return;}
    if(f.time<this.lastTime)return;
    const start=this.previous?.time??f.time,end=f.time;
    if(this.phase==='contract'&&this.previous){
      const a=activity(this.previous.rms,this.calibration),dt=end-start;
      this.hold=Math.abs(a-this.target)<=.1?this.hold+dt:0;
      if(this.hold>=2000)this.rewarded=true;
      const weight=Math.max(0,Math.min(end,this.phaseAt+5000)-Math.max(start,this.phaseAt+3000));
      if(weight){this.values.push(a);this.weights.push(weight);}
    }else if(this.phase==='rest'&&this.previous){
      const a=activity(this.previous.rms,this.calibration);this.restMs+=end-start;
      if(end>this.phaseAt+3000)this.rest.push(a);
      if(this.previous.rms<=this.calibration.restThreshold){this.relaxAt??=start;if(end-this.relaxAt>=300)this.relaxationMs??=this.relaxAt-this.phaseAt;}else this.relaxAt=null;
    }
    this.lastTime=f.time;
    const duration=this.phase==='familiar'?30000:5000;
    if(f.time-this.phaseAt>=duration)this.advance(this.phaseAt+duration);
    this.previous=f;
  }
  private advance(at:number){
    if(this.phase==='familiar'){this.phase='contract';this.interrupted=false;this.contractStart=at;}
    else if(this.phase==='contract'){
      const validMs=this.weights.reduce((a,b)=>a+b,0),coverage=Math.min(1,validMs/2000),valid=coverage>=.8&&!this.interrupted;
      const weighted=(fn:(a:number)=>number)=>validMs?this.values.reduce((sum,a,i)=>sum+fn(a)*this.weights[i],0)/validMs:null;
      this.pending={trial:this.trial+1,block:this.block,round:this.round,target:this.target,tolerance:.1,error:weighted(a=>Math.abs(a-this.target)),inZone:weighted(a=>Math.abs(a-this.target)<=.1?1:0),variation:this.values.length?sd(this.values):null,coverage,restCoverage:0,residual:null,relaxationMs:null,rewarded:this.rewarded,interrupted:this.interrupted,valid,contractStartMs:this.contractStart,holdStartMs:this.phaseAt+3000,holdEndMs:at,restStartMs:at};
      this.phase='rest';this.relaxAt=null;this.rest=[];this.restMs=0;this.relaxationMs=null;
    }else{
      const r=this.pending!;r.endMs=at;r.restCoverage=Math.min(1,this.restMs/5000);r.residual=this.rest.length?mean(this.rest):null;r.relaxationMs=this.relaxationMs;r.interrupted||=this.interrupted;r.valid&&=r.restCoverage>=.8&&!r.interrupted;
      this.results.push(r);this.trial++;this.pending=null;
      if(this.trial>=30){this.state='complete';return;}
      this.phase='contract';this.contractStart=at;this.values=[];this.weights=[];this.hold=0;this.rewarded=false;this.interrupted=false;
    }
    this.phaseAt=at;
  }
}
export class CalibrationRun {
  state:'ready'|'running'|'complete'|'failed'='ready';result:Calibration|null=null;error='';step=0;phaseAt=0;lastTime=0;
  private rest:number[]=[];private contractions:number[][]=[[],[],[]];private count=0;
  readonly durations=[15000,5000,20000,5000,20000,5000];
  get instruction(){return [1,3,5].includes(this.step)?'contract':'rest';}
  get remaining(){return Math.max(0,(this.durations[this.step]-(this.lastTime-this.phaseAt))/1000);}
  start(t:number){this.state='running';this.phaseAt=t;this.lastTime=t;}
  push(f:Frame){
    if(this.state!=='running')return;
    if(f.quality!=='good'||f.time-this.lastTime>150){this.state='failed';this.error='Signal interrupted. Check contact, then repeat calibration.';return;}
    this.lastTime=f.time;this.count++;const elapsed=f.time-this.phaseAt;
    if(this.step===0&&elapsed>1000)this.rest.push(f.rms);
    if(this.instruction==='contract'&&f.startIndex/2>=this.phaseAt+1000&&elapsed<=4000)this.contractions[(this.step-1)/2].push(f.rms);
    if(elapsed>=this.durations[this.step]){
      if(this.count<this.durations[this.step]/50*.8){this.state='failed';this.error='Not enough valid signal. Repeat calibration.';return;}
      this.phaseAt+=this.durations[this.step];this.step++;this.count=0;
      if(this.step===6){try{this.result=calibrate(this.rest,this.contractions);this.state='complete';}catch(e){this.state='failed';this.error=(e as Error).message;}}
    }
  }
}

export class ExampleCollection {
  state:'running'|'complete'|'failed'='running';trial=0;phaseAt:number;lastTime:number;examples:Example[]=[];error='';
  constructor(t:number){this.phaseAt=t;this.lastTime=t;}
  get label(){return (this.trial%3) as 0|1|2;}
  get testing(){return this.trial>=12;}
  get resting(){return this.lastTime-this.phaseAt>=5000;}
  get target(){return this.resting?0:[0,.3,.6][this.label];}
  get remaining(){return Math.max(0,(10000-(this.lastTime-this.phaseAt))/1000);}
  push(f:Frame){
    if(this.state!=='running')return;
    if(f.quality!=='good'||f.time-this.lastTime>150){this.state='failed';this.error='Collection interrupted. Restart the labelled trials.';return;}
    this.lastTime=f.time;const elapsed=f.time-this.phaseAt;
    if(f.startIndex/2>=this.phaseAt+1000&&elapsed<=4000)this.examples.push({trial:`trial-${this.trial+1}`,label:this.label,features:[f.rms,f.mav,f.wl],startIndex:f.startIndex,endIndex:f.endIndex,centerTime:f.centerTime});
    if(elapsed>=10000){this.trial++;this.phaseAt+=10000;if(this.trial===18)this.state='complete';}
  }
}
