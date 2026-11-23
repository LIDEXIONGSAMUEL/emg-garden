import type {Engine} from './engine';
import {rawCsv,type RecordingMetadata} from './signal';

export function captureRecording(engine:Engine,id:string=crypto.randomUUID()){
  // Engine only appends to raw while a source is active.
  const raw=engine.raw;
  const sampleCount=raw.length;
  const recording={id,sampleCount,firstIndex:raw[0]?.index??null,lastIndex:raw.at(-1)?.index??null};
  const session=engine.export();
  const metadata:RecordingMetadata={
    source:session.originalSource,
    referenceV:session.config.referenceV,
    adcMax:session.config.adcMax,
    notch50Hz:session.config.notch50Hz,
    ...(session.config.notch100Hz?{notch100Hz:true}:{}),
    ...(session.config.amplitudeUnit==='adc_counts'?{amplitudeUnit:'adc_counts'}:{}),
    recordingId:id,
  };
  return {
    filename:`${session.createdAt.replace(/[:.]/g,'-')}-${id}-${session.source}`,
    session:JSON.stringify({...session,recording}),
    csv:()=>rawCsv(raw.slice(0,sampleCount),metadata),
  };
}
