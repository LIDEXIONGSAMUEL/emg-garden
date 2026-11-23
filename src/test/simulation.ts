import {SAMPLE_RATE,type Sample} from '../signal';

export class DemoSignal {
  index=0;private effort=0;private seed=21;
  next(n:number,target:number):Sample[]{
    return Array.from({length:n},()=>{
      this.effort+=(target-this.effort)*.003;this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;
      const i=this.index++,t=i/2000,carrier=Math.sin(2*Math.PI*120*t)+.35*Math.sin(2*Math.PI*230*t)+.2*Math.sin(2*Math.PI*77*t);
      const voltage=1.5+(.001+.28*this.effort*(1+.018*Math.sin(2*Math.PI*.7*t)))*carrier+.003*(this.seed/4294967296-.5);
      return {index:i,voltage};
    });
  }
}

type SimulationScenario='unsteady'|'drift'|'gap';

export class SimulationSignal {
  private signal=new DemoSignal();
  private active:SimulationScenario|null=null;private startedAt=0;
  get scenario(){return this.active;}
  get remaining(){return this.active?Math.max(0,8-(this.signal.index-this.startedAt)/SAMPLE_RATE):0;}
  cancelScenario(){this.active=null;}
  startScenario(kind:SimulationScenario){
    if(this.active)throw new Error('Finish the active simulation check first.');
    this.active=kind;this.startedAt=this.signal.index;
  }
  next(n:number,target:number):Sample[]{
    if(!this.active)return this.signal.next(n,target);
    const samples:Sample[]=[];
    for(let i=0;i<n;i++){
      const elapsed=(this.signal.index-this.startedAt)/SAMPLE_RATE,kind=this.active;
      let effort=target;
      if(elapsed>=1&&elapsed<6){
        if(kind==='unsteady')effort=Math.max(0,target+.4*Math.sin(2*Math.PI*.8*(elapsed-1)));
        if(kind==='drift')effort=target+.45*(elapsed-1)/5;
      }
      const sample=this.signal.next(1,effort)[0];
      if(!(kind==='gap'&&elapsed>=2&&elapsed<2.5))samples.push(sample);
      if(this.active&&this.remaining===0)this.active=null;
    }
    return samples;
  }
}
