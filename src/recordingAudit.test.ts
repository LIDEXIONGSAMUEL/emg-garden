import {it,expect} from 'vitest';
import {Engine} from './engine';
import {DemoSignal} from './test/simulation';
import {captureRecording} from './recording';
import {auditRecording} from './recordingAudit';

it.each([false,true])('reproduces features from a paired ADC-count recording with 100 Hz notch %s',notch100Hz=>{
  const engine=new Engine('serial',true,null,1023,'adc_counts',notch100Hz);
  engine.receive(Array.from({length:2000},(_,index)=>({index,voltage:null,adcCount:Math.round(510+35*Math.sin(index*.36))})));
  const saved=captureRecording(engine,'adc-count-check');
  expect(auditRecording(saved.csv(),saved.session)).toMatchObject({
    amplitudeUnit:'adc_counts',adcSamples:2000,featureWindows:7,clippedWindows:0,
  });
});

it('freezes matching files even while the live source keeps appending data',()=>{
  const engine=new Engine('simulation'),demo=new DemoSignal();
  engine.receive(demo.next(2000,0));
  const saved=captureRecording(engine,'snapshot-1');
  engine.receive(demo.next(2000,0));
  expect(auditRecording(saved.csv(),saved.session)).toMatchObject({
    recordingId:'snapshot-1',samples:2000,source:'simulation',adcSamples:0,
  });
  const second=captureRecording(engine,'snapshot-2');
  expect(auditRecording(second.csv(),second.session).samples).toBe(4000);
  expect(()=>auditRecording(saved.csv(),second.session)).toThrow(/same frozen recording/);
});

it('recomputes calibrated activity, trial alignment, live predictions and the held-out evaluation',()=>{
  const engine=new Engine('simulation',true),demo=new DemoSignal();
  engine.receive(demo.next(2000,0));
  engine.startCalibration();
  for(let i=0;i<1420;i++)engine.receive(demo.next(100,engine.calibrationRun?.instruction==='contract'?1:0));
  engine.startCollection();
  for(let i=0;i<3600;i++)engine.receive(demo.next(100,engine.collection!.target));
  engine.train();
  engine.startTraining();
  for(let i=0;i<800;i++){
    const session=engine.session!;
    engine.receive(demo.next(100,session.phase==='rest'?0:session.target));
  }
  engine.session!.stop();
  const saved=captureRecording(engine,'reference-plus-trial');
  const csv=saved.csv();
  const result=auditRecording(csv,saved.session,{round:1,trial:1});
  expect(result).toMatchObject({originalSource:'simulation',sequenceDiscontinuities:0,verifiedFits:1});
  expect(result.activityWindows).toBeGreaterThan(500);
  expect(result.predictedWindows).toBeGreaterThan(20);
  expect(result.rounds[0].trials[0]).toMatchObject({valid:true,holdSampleCount:4000});
  const trace=result.trialTrace!;
  expect(trace).toMatchObject({round:1,trial:1,block:'baseline',valid:true,target:.3,tolerance:.1});
  expect(trace.raw).toHaveLength(20000);
  expect(trace.raw[0].index).toBe(trace.contractStartMs*2);
  expect(trace.raw.at(-1)!.index).toBe(trace.endMs*2-1);
  expect(trace.windows[0].time).toBe(trace.contractStartMs);
  expect(trace.windows.at(-1)!.time).toBe(trace.endMs);
  expect(trace.windows.some(window=>window.activity!==null)).toBe(true);
  const modified=JSON.parse(saved.session);
  modified.windows.at(-1).activity=12345;
  expect(()=>auditRecording(csv,JSON.stringify(modified))).toThrow(/Activity differs/);
},25000);
