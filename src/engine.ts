import {Processor,activity,MAX_SAMPLES,SAMPLE_RATE,type Sample,type Frame,type Calibration,type OriginalSource} from './signal';
import {TrainingSession,CalibrationRun,ExampleCollection} from './session';
import {fitModel,predict,type Model,type ModelReport} from './model';
export type Source='simulation'|'serial'|'replay';
export const VERSION='emg-garden-1.0.0';
export class Engine {
  calibration:Calibration|null=null;calibrationRun:CalibrationRun|null=null;session:TrainingSession|null=null;collection:ExampleCollection|null=null;
  model:Model|null=null;report:ModelReport|null=null;latest:Frame|null=null;classification:{label:number;confidence:number}|null=null;
  raw:Sample[]=[];windows:(Frame&{activity:number|null;label:number|null;confidence:number|null})[]=[];
  events:{time:number;event:string;detail:unknown}[]=[];processor:Processor;error='';private votes:number[]=[];private lastStage='';
  private sessions:{startedAt:number;conditionId:string;session:TrainingSession;modelReport:ModelReport|null}[]=[];private referenceNumber=0;
  originalSource:OriginalSource;originalNotch50Hz:boolean|null;
  readonly createdAt=new Date().toISOString();
  constructor(public source:Source,notch=false,public referenceV:number|null=3.3,public adcMax:number|null=4095){this.processor=new Processor(notch,referenceV,adcMax);this.originalSource=source==='replay'?'unknown':source;this.originalNotch50Hz=source==='replay'?null:notch;}
  get time(){return this.latest?.time??0;}
  get level(){return this.calibration&&this.latest?activity(this.latest.rms,this.calibration):0;}
  get busy(){return this.calibrationRun?.state==='running'||this.collection?.state==='running'||this.session?.state==='running'||this.session?.state==='paused';}
  get conditionId(){return `${this.createdAt}:reference-${this.referenceNumber}`;}
  requireCapacity(durationMs:number){if(this.raw.length+durationMs/1000*SAMPLE_RATE>MAX_SAMPLES)throw new Error('Not enough recording capacity for this step. Download your data and start a new signal source.');}
  event(event:string,detail:unknown=null){this.events.push({time:this.time,event,detail});}
  receive(samples:Sample[]){
    if(this.raw.length+samples.length>MAX_SAMPLES){this.interrupt('Twenty-minute recording limit reached. Export data and reconnect.');throw new Error(this.error);}
    this.raw.push(...samples);const gaps=this.processor.gaps,frames=this.processor.push(samples);
    if(this.processor.gaps!==gaps)this.interrupt('Missing or reordered samples. Check the device.');
    for(const f of frames){
      this.latest=f;
      if(f.quality==='clipped'||f.quality==='flat'){this.classification=null;this.votes=[];this.interrupt('Signal is clipped or flat. Check the sensor.');}
      this.calibrationRun?.push(f);
      if(this.calibrationRun?.state==='complete'&&!this.calibration){this.calibration=this.calibrationRun.result;this.event('calibration_complete',this.calibration);}
      const rewarded=this.session?.rewarded;this.session?.push(f);this.collection?.push(f);
      if(this.session?.rewarded&&!rewarded)this.event('reward',{session:this.sessions.length,trial:this.session.trial+1,target:this.session.target,conditionId:this.conditionId});
      if(this.model&&f.quality==='good'){
        const prediction=predict(this.model,[f.rms,f.mav,f.wl]);this.votes.push(prediction.confidence>=.6?prediction.label:-1);this.votes=this.votes.slice(-3);
        const label=[0,1,2].find(l=>this.votes.filter(v=>v===l).length>=2);
        this.classification=label===prediction.label&&prediction.confidence>=.6?prediction:null;
      }
      this.windows.push({...f,activity:this.calibration?this.level:null,label:this.classification?.label??null,confidence:this.classification?.confidence??null});
      const stage=JSON.stringify({calibration:this.calibrationRun?.state,calibrationStep:this.calibrationRun?.step,session:this.session?.state,sessionPhase:this.session?.phase,trial:this.session?this.session.trial+1:null,collection:this.collection?.state,collectionTrial:this.collection?this.collection.trial+1:null,conditionId:this.conditionId});
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
    if(this.source==='replay')throw new Error('Replay is for inspection only.');
    this.requireCapacity(70000);
    if(this.busy||this.latest?.quality!=='good')throw new Error('Wait for a clean signal before calibration.');
    this.calibration=null;this.model=null;this.report=null;this.classification=null;this.collection=null;this.session=null;
    this.referenceNumber++;this.calibrationRun=new CalibrationRun();this.calibrationRun.start(this.time);this.error='';this.event('calibration_started',{conditionId:this.conditionId});
  }
  startTraining(){
    if(this.source==='replay')throw new Error('Replay is for inspection only.');
    this.requireCapacity(330000);
    if(!this.calibration||this.busy)throw new Error('Complete calibration first.');
    this.session=new TrainingSession({...this.calibration});this.session.start(this.time);this.sessions.push({startedAt:this.time,conditionId:this.conditionId,session:this.session,modelReport:structuredClone(this.report)});this.error='';this.event('training_started',{session:this.sessions.length,conditionId:this.conditionId});
  }
  startCollection(){
    if(this.source==='replay')throw new Error('Replay is for inspection only.');
    this.requireCapacity(180000);
    if(!this.calibration||this.busy)throw new Error('Complete calibration first.');
    this.collection=new ExampleCollection(this.time);this.error='';this.event('collection_started');
  }
  train(){
    if(this.collection?.state!=='complete')throw new Error('Collect all 18 labelled trials first.');
    const fitted=fitModel(this.collection.examples);this.model=fitted.model;this.report=fitted.report;this.votes=[];this.event('model_fitted',this.report);
  }
  export(){return {schema:VERSION,source:this.source,originalSource:this.originalSource,createdAt:this.createdAt,config:{sampleRate:2000,windowSamples:400,stepSamples:100,warmupSamples:1000,highpassHz:20,lowpassHz:450,notch50Hz:this.source==='replay'?this.originalNotch50Hz:this.processor.notch,referenceV:this.referenceV,adcMax:this.adcMax,amplitudeUnit:'module_output_volts',referenceType:'comfortable_not_MVC'},calibration:this.calibration,model:this.model,modelReport:this.report,examples:this.collection?.examples??[],results:this.session?.results??[],sessionState:this.session?.state??'not_started',sessions:this.sessions.map(({startedAt,conditionId,session:s,modelReport},i)=>({number:i+1,startedAt,conditionId,state:s.state,calibration:s.calibration,modelReport,results:s.results})),windows:this.windows,events:this.events};}
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
