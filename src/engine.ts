import {Processor,activity,type Sample,type Frame,type Calibration} from './signal';
import {TrainingSession,CalibrationRun,ExampleCollection} from './session';
import {fitModel,predict,type Model,type ModelReport} from './model';
export type Source='simulation'|'serial'|'replay';
export const VERSION='emg-garden-0.1.0';
export class Engine {
  calibration:Calibration|null=null;calibrationRun:CalibrationRun|null=null;session:TrainingSession|null=null;collection:ExampleCollection|null=null;
  model:Model|null=null;report:ModelReport|null=null;latest:Frame|null=null;classification:{label:number;confidence:number}|null=null;
  raw:Sample[]=[];windows:(Frame&{activity:number|null;label:number|null;confidence:number|null})[]=[];
  events:{time:number;event:string;detail:unknown}[]=[];processor:Processor;error='';private votes:number[]=[];private lastStage='';
  readonly createdAt=new Date().toISOString();
  constructor(public source:Source,notch=false,public referenceV=3.3,public adcMax=4095){this.processor=new Processor(notch,referenceV,adcMax);}
  get time(){return this.latest?.time??0;}
  get level(){return this.calibration&&this.latest?activity(this.latest.rms,this.calibration):0;}
  get busy(){return this.calibrationRun?.state==='running'||this.collection?.state==='running'||this.session?.state==='running'||this.session?.state==='paused';}
  event(event:string,detail:unknown=null){this.events.push({time:this.time,event,detail});}
  receive(samples:Sample[]){
    if(this.raw.length+samples.length>1_200_000){this.interrupt('Ten-minute recording limit reached. Export data and reconnect.');throw new Error(this.error);}
    this.raw.push(...samples);const gaps=this.processor.gaps,frames=this.processor.push(samples);
    if(this.processor.gaps!==gaps)this.interrupt('Missing or reordered samples. Check the device.');
    for(const f of frames){
      this.latest=f;
      if(f.quality!=='good'){this.classification=null;this.votes=[];this.interrupt('Signal is clipped or flat. Check the sensor.');}
      this.calibrationRun?.push(f);
      if(this.calibrationRun?.state==='complete'&&!this.calibration){this.calibration=this.calibrationRun.result;this.event('calibration_complete',this.calibration);}
      this.session?.push(f);this.collection?.push(f);
      if(this.model&&f.quality==='good'){
        const prediction=predict(this.model,[f.rms,f.mav,f.wl]);this.votes.push(prediction.confidence>=.6?prediction.label:-1);this.votes=this.votes.slice(-3);
        const label=[0,1,2].find(l=>this.votes.filter(v=>v===l).length>=2);
        this.classification=label===undefined?null:{label,confidence:prediction.confidence};
      }
      this.windows.push({...f,activity:this.calibration?this.level:null,label:this.classification?.label??null,confidence:this.classification?.confidence??null});
      const stage=JSON.stringify([this.calibrationRun?.state,this.calibrationRun?.step,this.session?.state,this.session?.phase,this.session?.trial,this.collection?.state,this.collection?.trial]);
      if(stage!==this.lastStage){this.lastStage=stage;this.event('phase',JSON.parse(stage));}
    }
  }
  interrupt(message:string){
    this.error=message;this.classification=null;this.votes=[];this.session?.pause(message);
    if(this.calibrationRun?.state==='running'){this.calibrationRun.state='failed';this.calibrationRun.error=message;}
    if(this.collection?.state==='running'){this.collection.state='failed';this.collection.error=message;}
    this.event('interruption',message);
  }
  startCalibration(){
    if(this.busy||this.latest?.quality!=='good')throw new Error('Wait for a clean signal before calibration.');
    this.calibration=null;this.model=null;this.report=null;this.classification=null;this.collection=null;this.session=null;
    this.calibrationRun=new CalibrationRun();this.calibrationRun.start(this.time);this.error='';this.event('calibration_started');
  }
  startTraining(){
    if(!this.calibration||this.busy)throw new Error('Complete calibration first.');
    this.session=new TrainingSession({...this.calibration});this.session.start(this.time);this.error='';this.event('training_started');
  }
  startCollection(){
    if(!this.calibration||this.busy)throw new Error('Complete calibration first.');
    this.collection=new ExampleCollection(this.time);this.error='';this.event('collection_started');
  }
  train(){
    if(this.collection?.state!=='complete')throw new Error('Collect all 18 labelled trials first.');
    const fitted=fitModel(this.collection.examples);this.model=fitted.model;this.report=fitted.report;this.votes=[];this.event('model_fitted',this.report);
  }
  export(){return {schema:VERSION,source:this.source,createdAt:this.createdAt,config:{sampleRate:2000,windowSamples:400,stepSamples:100,warmupSamples:1000,highpassHz:20,lowpassHz:450,notch50Hz:this.processor.notch,referenceV:this.referenceV,adcMax:this.adcMax,amplitudeUnit:'module_output_volts',referenceType:'comfortable_not_MVC'},calibration:this.calibration,model:this.model,modelReport:this.report,examples:this.collection?.examples??[],results:this.session?.results??[],sessionState:this.session?.state??'not_started',windows:this.windows,events:this.events};}
}
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
