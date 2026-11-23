import type {Engine} from './engine';
import {PredictionHistory,fitModel} from './model';
import {Processor,SAMPLE_RATE,WINDOW,STEP,activity,parseRecordingCsv,samplePosition} from './signal';

type Session=ReturnType<Engine['export']>;
type PairedSession=Session&{
  recording:{id:string;sampleCount:number;firstIndex:number|null;lastIndex:number|null};
};

const close=(a:number,b:number|null)=>b!==null&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a));

export function auditRecording(csv:string,json:string,selection?:{round:number;trial:number}){
  const session=JSON.parse(json) as PairedSession|null;
  if(session?.schema!=='emg-garden-1.0.0'||!session.recording||!session.verification){
    throw new Error('Export a new paired CSV and session JSON from EMG Garden.');
  }
  const {samples,metadata}=parseRecordingCsv(csv);
  const {recording,config,verification,windows,sessions}=session;
  if(!metadata.recordingId||recording.id!==metadata.recordingId||recording.sampleCount!==samples.length||
    recording.firstIndex!==samples[0].index||recording.lastIndex!==samples.at(-1)!.index){
    throw new Error('CSV and JSON do not describe the same frozen recording.');
  }
  if(config.sampleRate!==SAMPLE_RATE||config.windowSamples!==WINDOW||config.stepSamples!==STEP||
    config.warmupSamples!==1000||config.highpassHz!==20||config.lowpassHz!==450||
    config.amplitudeUnit!==(metadata.amplitudeUnit??'module_output_volts')||
    metadata.source!==session.originalSource||metadata.referenceV!==config.referenceV||
    metadata.adcMax!==config.adcMax||metadata.notch50Hz!==config.notch50Hz||metadata.notch100Hz!==config.notch100Hz){
    throw new Error('Signal configuration does not match the CSV or this processing version.');
  }

  const processor=new Processor(config.notch50Hz??false,config.referenceV,config.adcMax,config.amplitudeUnit,config.notch100Hz);
  const frames=processor.push(samples);
  if(frames.length!==windows.length)throw new Error('The raw signal produced a different number of feature windows.');
  const calibrations=new Map(verification.calibrations.map(item=>[item.id,item.reference]));
  const models=new Map(verification.models.map(item=>[item.id,item.model]));
  const predictor=new PredictionHistory();
  let activityWindows=0,predictedWindows=0;
  frames.forEach((frame,i)=>{
    const saved=windows[i];
    if(frame.startIndex!==saved.startIndex||frame.endIndex!==saved.endIndex||frame.time!==saved.time||
      frame.centerTime!==saved.centerTime||frame.quality!==saved.quality||
      !close(frame.rms,saved.rms)||!close(frame.mav,saved.mav)||!close(frame.wl,saved.wl)){
      throw new Error(`Signal processing differs at sample ${frame.endIndex}.`);
    }
    const reference=saved.conditionId===null?null:calibrations.get(saved.conditionId);
    if(reference===undefined||reference&&!close(activity(frame.rms,reference),saved.activity)||
      reference===null&&saved.activity!==null)throw new Error(`Activity differs at sample ${frame.endIndex}.`);
    if(reference)activityWindows++;

    if(typeof saved.predictionReset!=='boolean')throw new Error('Recording is missing classifier history.');
    if(saved.predictionReset)predictor.reset();
    const model=saved.modelId===null?null:models.get(saved.modelId);
    if(model===undefined)throw new Error(`Missing model used at sample ${frame.endIndex}.`);
    if(model&&frame.quality==='good')predictor.push(model,[frame.rms,frame.mav,frame.wl]);
    const prediction=predictor.current;
    if((prediction?.label??null)!==saved.label||(prediction?.confidence??null)!==saved.confidence){
      throw new Error(`Classifier output differs at sample ${frame.endIndex}.`);
    }
    if(prediction)predictedWindows++;
  });

  const frameByEnd=new Map(frames.map(frame=>[frame.endIndex,frame]));
  let verifiedFits=0;
  for(const {model,evaluation} of verification.models){
    if(!evaluation)continue;
    for(const example of evaluation.examples){
      const frame=example.endIndex===undefined?undefined:frameByEnd.get(example.endIndex);
      if(!frame||frame.startIndex!==example.startIndex||frame.centerTime!==example.centerTime||
        ![frame.rms,frame.mav,frame.wl].every((value,i)=>close(value,example.features[i]))){
        throw new Error(`A labelled feature window differs in ${example.trial}.`);
      }
    }
    const fitted=fitModel(evaluation.examples);
    if(JSON.stringify(fitted.model)!==JSON.stringify(model)||JSON.stringify(fitted.report)!==JSON.stringify(evaluation.report)){
      throw new Error('The saved classifier fit or held-out report could not be reproduced.');
    }
    verifiedFits++;
  }

  const rounds=sessions.map(round=>({
    round:round.number,state:round.state,conditionId:round.conditionId,
    trials:round.results.map(trial=>{
      const {contractStartMs,holdStartMs,holdEndMs,restStartMs,endMs}=trial;
      if(contractStartMs===undefined||holdStartMs===undefined||holdEndMs===undefined||restStartMs===undefined||endMs===undefined){
        throw new Error(`Trial ${trial.trial} is missing phase boundaries.`);
      }
      const holdStart=samplePosition(samples,holdStartMs*SAMPLE_RATE/1000),holdEnd=samplePosition(samples,holdEndMs*SAMPLE_RATE/1000);
      return {
        trial:trial.trial,block:trial.block,valid:trial.valid,
        contractStartMs,holdStartMs,holdEndMs,restStartMs,endMs,
        holdSampleCount:holdEnd-holdStart,
        firstHoldIndex:holdStart<holdEnd?samples[holdStart].index:null,
        lastHoldIndex:holdStart<holdEnd?samples[holdEnd-1].index:null,
      };
    }),
  }));

  let trialTrace;
  if(selection){
    const round=rounds.find(item=>item.round===selection.round);
    const timing=round?.trials.find(item=>item.trial===selection.trial);
    const result=sessions.find(item=>item.number===selection.round)?.results.find(item=>item.trial===selection.trial);
    if(!round||!timing||!result)throw new Error(`No completed trial ${selection.trial} exists in round ${selection.round}.`);
    const {contractStartMs,holdStartMs,holdEndMs,restStartMs,endMs}=timing;
    if(![contractStartMs,holdStartMs,holdEndMs,restStartMs,endMs].every(Number.isFinite)||
      contractStartMs<0||contractStartMs>holdStartMs||holdStartMs>=holdEndMs||
      holdEndMs!==restStartMs||restStartMs>=endMs||!Number.isFinite(result.target)||
      !Number.isFinite(result.tolerance)||result.tolerance<=0){
      throw new Error('The selected trial has invalid phase or target metadata.');
    }
    const start=samplePosition(samples,contractStartMs*SAMPLE_RATE/1000);
    const end=samplePosition(samples,endMs*SAMPLE_RATE/1000);
    if(start===end)throw new Error('The selected trial has no raw samples.');
    trialTrace={
      round:round.round,...timing,target:result.target,tolerance:result.tolerance,
      raw:samples.slice(start,end),
      windows:windows.filter(window=>window.time>=contractStartMs&&window.time<=endMs&&window.conditionId===round.conditionId)
        .map(({time,rms,quality,activity})=>({time,rms,quality,activity})),
    };
  }

  return {
    recordingId:recording.id,source:session.source,originalSource:session.originalSource,
    sampleRate:config.sampleRate,amplitudeUnit:config.amplitudeUnit,samples:samples.length,adcSamples:samples.filter(sample=>sample.adcCount!==undefined).length,
    sequenceDiscontinuities:processor.gaps,featureWindows:frames.length,
    clippedWindows:frames.filter(frame=>frame.quality==='clipped').length,
    activityWindows,predictedWindows,modelVersions:models.size,verifiedFits,rounds,
    ...(trialTrace?{trialTrace}:{}),
  };
}
