import {Processor,activity,MAX_SAMPLES,SAMPLE_RATE,type Sample,type Frame,type Calibration,type OriginalSource,type AmplitudeUnit} from './signal';
import {TrainingSession,CalibrationRun,ExampleCollection,type CalibrationProtocol,type TrialReviewDecision} from './session';
import {fitModel,PredictionHistory,type Example,type Model,type ModelReport} from './model';
export type Source='simulation'|'serial'|'replay';
export const VERSION='emg-garden-1.0.0';
type ModelEvaluation={examples:Example[];report:ModelReport};
export type AcquisitionSetup={device:string;electrodePlacement:string};
export class Engine {
  calibration:Calibration|null=null;calibrationRun:CalibrationRun|null=null;session:TrainingSession|null=null;collection:ExampleCollection|null=null;
  referenceSetup:AcquisitionSetup|null=null;
  model:Model|null=null;report:ModelReport|null=null;latest:Frame|null=null;
  raw:Sample[]=[];windows:(Frame&{activity:number|null;label:number|null;confidence:number|null;conditionId:string|null;modelId:number|null;predictionReset:boolean})[]=[];
  events:{time:number;event:string;detail:unknown}[]=[];processor:Processor;error='';private lastStage='';
  private predictions=new PredictionHistory();
  private predictionReset=true;
  private referenceHistory=new Map<string,Calibration>();
  private modelHistory=new Map<Model,{id:number;model:Model;evaluation?:ModelEvaluation}>();
  private sessions:{startedAt:number;conditionId:string;session:TrainingSession;modelReport:ModelReport|null}[]=[];private referenceNumber=0;
  originalSource:OriginalSource;originalNotch50Hz:boolean|null;
  readonly createdAt=new Date().toISOString();
  constructor(public source:Source,notch=false,public referenceV:number|null=3.3,public adcMax:number|null=4095,amplitudeUnit?:AmplitudeUnit,notch100Hz=false){this.processor=new Processor(notch,referenceV,adcMax,amplitudeUnit,notch100Hz);this.originalSource=source==='replay'?'unknown':source;this.originalNotch50Hz=source==='replay'?null:notch;}
  get time(){return this.latest?.time??0;}
  get level(){return this.calibration&&this.latest?activity(this.latest.rms,this.calibration):0;}
  get classification(){return this.predictions.current;}
  private resetPredictions(){this.predictions.reset();this.predictionReset=true;}
  private recordModel(model:Model,evaluation?:ModelEvaluation){
    const existing=this.modelHistory.get(model);
    if(existing)return existing.id;
    const id=this.modelHistory.size+1;
    this.modelHistory.set(model,{id,model:structuredClone(model),evaluation:evaluation&&structuredClone(evaluation)});
    return id;
  }
  get busy(){return this.calibrationRun?.state==='running'||this.collection?.state==='running'||this.session?.state==='running'||this.session?.state==='paused';}
  get conditionId(){return `${this.createdAt}:reference-${this.referenceNumber}`;}
  get config(){
    return {
      sampleRate:SAMPLE_RATE,windowSamples:400,stepSamples:100,warmupSamples:1000,highpassHz:20,lowpassHz:450,
      notch50Hz:this.source==='replay'?this.originalNotch50Hz:this.processor.notch,
      ...(this.processor.notch100Hz?{notch100Hz:true as const}:{}),
      referenceV:this.referenceV,adcMax:this.adcMax,amplitudeUnit:this.processor.amplitudeUnit,referenceType:'comfortable_not_MVC',
    };
  }
  requireCapacity(durationMs:number){if(this.raw.length+durationMs/1000*SAMPLE_RATE>MAX_SAMPLES)throw new Error('Not enough recording capacity for this step. Download your data and start a new signal source.');}
  event(event:string,detail:unknown=null){this.events.push({time:this.time,event,detail});}
  receive(samples:Sample[]){
    if(this.raw.length+samples.length>MAX_SAMPLES){this.interrupt('Twenty-minute recording limit reached. Export data and reconnect.');throw new Error(this.error);}
    let previousIndex=this.raw.at(-1)?.index??-1;
    for(const sample of samples){
      if(sample.index<=previousIndex){
        this.interrupt('Duplicate or reordered samples. Check the device.');
        throw new Error(this.error);
      }
      previousIndex=sample.index;
    }
    this.raw.push(...samples);const gaps=this.processor.gaps,frames=this.processor.push(samples);
    if(this.processor.gaps!==gaps)this.interrupt('Missing or reordered samples. Check the device.');
    for(const f of frames){
      this.latest=f;
      if(f.quality==='clipped'||f.quality==='flat')this.interrupt('Signal is clipped or flat. Check the sensor.');
      const calibrationWasRunning=this.calibrationRun?.state==='running';
      this.calibrationRun?.push(f);
      if(this.calibrationRun?.state==='complete'&&!this.calibration){this.calibration=this.calibrationRun.result;this.event('calibration_complete',this.calibration);}
      if(calibrationWasRunning&&this.calibrationRun?.state==='failed'&&this.calibrationRun.measured){
        this.event('calibration_overlap',{conditionId:this.conditionId,measured:this.calibrationRun.measured});
      }
      const rewarded=this.session?.rewarded;this.session?.push(f);this.collection?.push(f);
      if(this.session?.rewarded&&!rewarded)this.event('reward',{session:this.sessions.length,trial:this.session.trial+1,target:this.session.target,conditionId:this.conditionId});
      const conditionId=this.calibration?this.conditionId:null;
      if(conditionId&&this.calibration&&!this.referenceHistory.has(conditionId)){
        this.referenceHistory.set(conditionId,{...this.calibration});
      }
      const modelId=this.model?this.recordModel(this.model):null;
      if(this.model&&f.quality==='good')this.predictions.push(this.model,[f.rms,f.mav,f.wl]);
      this.windows.push({
        ...f,conditionId,modelId,predictionReset:this.predictionReset,
        activity:this.calibration?this.level:null,label:this.classification?.label??null,confidence:this.classification?.confidence??null,
      });
      this.predictionReset=false;
      const stage=JSON.stringify({calibration:this.calibrationRun?.state,calibrationStep:this.calibrationRun?.step,session:this.session?.state,sessionPhase:this.session?.phase,trial:this.session?this.session.trial+1:null,collection:this.collection?.state,collectionTrial:this.collection?this.collection.trial+1:null,conditionId:this.conditionId});
      if(stage!==this.lastStage){this.lastStage=stage;this.event('phase',JSON.parse(stage));}
    }
  }
  interrupt(message:string){
    this.error=message;this.resetPredictions();this.session?.pause(message);
    if(this.calibrationRun?.state==='running'){this.calibrationRun.state='failed';this.calibrationRun.error=message;}
    this.collection?.interrupt(message);
    this.event('interruption',message);
  }
  startCalibration(setup?:AcquisitionSetup,protocol:CalibrationProtocol='full'){
    if(this.source==='replay')throw new Error('Replay is for inspection only.');
    const run=new CalibrationRun(protocol);
    this.requireCapacity(run.totalMs);
    if(this.busy||this.latest?.quality!=='good')throw new Error('Wait for a clean signal before calibration.');
    this.calibration=null;this.model=null;this.report=null;this.resetPredictions();this.collection=null;this.session=null;
    this.referenceNumber++;this.calibrationRun=run;run.start(this.time);this.error='';
    this.referenceSetup=this.source==='serial'&&setup?{device:setup.device.trim(),electrodePlacement:setup.electrodePlacement.trim()}:null;
    const acquisition=this.referenceSetup?{
      device:this.referenceSetup.device||null,electrodePlacement:this.referenceSetup.electrodePlacement||null,
    }:null;
    this.event('calibration_started',{conditionId:this.conditionId,acquisition,protocol});
  }
  reuseReference(reference:Calibration,sourceConditionId:string,setup:AcquisitionSetup,protocol?:CalibrationProtocol){
    if(this.source!=='serial'||this.busy||this.calibration||!this.processor.ready||this.latest?.quality!=='good'){
      throw new Error('Wait for a clean EMG signal before using the saved reference.');
    }
    this.referenceNumber++;
    this.calibrationRun=null;
    this.calibration={...reference};
    this.referenceSetup={...setup};
    this.referenceHistory.set(this.conditionId,this.calibration);
    this.error='';
    this.event('calibration_reused',{conditionId:this.conditionId,sourceConditionId,acquisition:this.referenceSetup,protocol});
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
    this.collection=new ExampleCollection(this.time);
    this.model=null;this.report=null;this.resetPredictions();
    this.error='';this.event('collection_started');
  }
  reviewExampleTrial(slot:number,decision:TrialReviewDecision){
    if(!this.collection)throw new Error('Collect labelled trials before reviewing them.');
    if(this.collection.trialReviews[slot]?.decision===decision)return;
    this.collection.reviewTrial(slot,decision);
    this.model=null;this.report=null;this.resetPredictions();
    this.event('labelled_trial_reviewed',{trial:slot+1,decision});
  }
  retakeExampleTrial(slot:number){
    if(!this.collection||this.busy||this.latest?.quality!=='good'){
      throw new Error('Wait for a clean signal before retaking a trial.');
    }
    this.requireCapacity(10000);
    this.collection.startRetake(slot,this.time);
    this.model=null;this.report=null;this.resetPredictions();
    this.error='';this.event('labelled_trial_retake_started',{trial:slot+1});
  }
  train(){
    if(this.collection?.state!=='complete')throw new Error('Collect all 18 labelled trials first.');
    if(this.source==='serial'&&!this.collection.reviewReady)throw new Error('Review all 18 real trials before fitting.');
    const examples=this.collection.examples,fitted=fitModel(examples);
    this.model=fitted.model;this.report=fitted.report;
    this.recordModel(this.model,{examples,report:fitted.report});
    this.resetPredictions();this.event('model_fitted',this.report);
  }
  export(){return {schema:VERSION,source:this.source,originalSource:this.originalSource,createdAt:this.createdAt,config:this.config,calibration:this.calibration,model:this.model,modelReport:this.report,examples:this.collection?.examples??[],trialReview:this.collection?.trialReviews??[],results:this.session?.results??[],sessionState:this.session?.state??'not_started',sessions:this.sessions.map(({startedAt,conditionId,session:s,modelReport},i)=>({number:i+1,startedAt,conditionId,state:s.state,calibration:s.calibration,modelReport,results:s.results})),windows:this.windows,events:this.events,verification:{
    calibrations:[...this.referenceHistory].map(([id,reference])=>({id,reference})),
    models:[...this.modelHistory.values()],
  }};}
}
