import {it,expect,vi} from 'vitest';
import {Engine,DemoSignal} from './engine';
import {MAX_SAMPLES} from './signal';
function classifierEngine(){
  const e=new Engine('simulation');
  e.model={mean:[0,0,0],scale:[1,1,1],k:5,training:([[0,0,0,0,0],[1,1,1,1,0],[0,0,1,1,2]] as const).flatMap((labels,cluster)=>labels.map((label,i)=>({trial:`${cluster}-${i}`,label,features:[cluster+1,cluster+1,cluster+1] as [number,number,number]})))};
  const push=vi.spyOn(e.processor,'push');
  const receive=(rms:number)=>{
    const startIndex=e.windows.length*100,endIndex=startIndex+399;
    push.mockReturnValueOnce([{time:(endIndex+1)/2,centerTime:(startIndex+200)/2,startIndex,endIndex,rms,mav:rms,wl:rms,quality:'good'}]);
    e.receive([]);
  };
  return {e,receive};
}
it('shows uncertainty during a class change and exports only matching label confidence pairs',()=>{
  const {e,receive}=classifierEngine();
  receive(1);expect(e.classification).toBeNull();
  receive(1);expect(e.classification).toEqual({label:0,confidence:1});
  receive(2);expect(e.classification).toBeNull();
  receive(2);expect(e.classification).toEqual({label:1,confidence:.8});
  expect(e.export().windows.map(({label,confidence})=>({label,confidence}))).toEqual([
    {label:null,confidence:null},{label:0,confidence:1},{label:null,confidence:null},{label:1,confidence:.8}
  ]);
});
it('shows uncertainty when current confidence falls below the threshold despite an older majority',()=>{
  const {e,receive}=classifierEngine();
  receive(1);receive(1);expect(e.classification).toEqual({label:0,confidence:1});
  receive(3);expect(e.classification).toBeNull();
  expect(e.export().windows.at(-1)).toMatchObject({label:null,confidence:null});
  receive(1);expect(e.classification).toEqual({label:0,confidence:1});
});
it('calibrates synthetic raw waveforms and preserves simulation provenance',()=>{
  const e=new Engine('simulation'),demo=new DemoSignal();
  e.receive(demo.next(2000,0));e.startCalibration();
  for(let n=0;n<1420;n++)e.receive(demo.next(100,e.calibrationRun?.instruction==='contract'?1:0));
  expect(e.calibration).not.toBeNull();expect(e.export().source).toBe('simulation');
  expect(e.export().config.sampleRate).toBe(2000);
});
it('completes the full calibrated protocol with 30 scored synthetic trials',()=>{
  const e=new Engine('simulation'),demo=new DemoSignal();e.receive(demo.next(2000,0));e.startCalibration();
  for(let n=0;n<1420;n++)e.receive(demo.next(100,e.calibrationRun?.instruction==='contract'?1:0));
  e.startTraining();
  for(let n=0;n<6600;n++)e.receive(demo.next(100,e.session!.phase==='rest'?0:e.session!.target));
  const saved=e.export();
  expect(saved.sessionState).toBe('complete');expect(saved.results).toHaveLength(30);
  expect(saved.results.every(r=>r.valid)).toBe(true);
  expect(saved.results.slice(0,6).map(r=>r.target)).toEqual(saved.results.slice(-6).map(r=>r.target));
  expect(saved.sessions[0].results).toEqual(saved.results);
});
it('invalidates active control on a sequence discontinuity',()=>{
  const e=new Engine('serial'),demo=new DemoSignal();e.receive(demo.next(2000,0));
  e.calibration={baseline:.002,reference:.2,restThreshold:.003,noise:.0001};e.startTraining();
  const chunk=demo.next(100,.3).map(s=>({...s,index:s.index+1000}));e.receive(chunk);
  expect(e.session!.state).toBe('paused');expect(e.session!.results).toHaveLength(0);
});
it('keeps completed round results and their reference when another round starts',()=>{
  const e=new Engine('simulation'),demo=new DemoSignal();e.receive(demo.next(2000,0));
  e.calibration={baseline:.002,reference:.2,restThreshold:.003,noise:.0001};e.startTraining();
  for(let n=0;n<800;n++)e.receive(demo.next(100,e.session!.phase==='contract'?e.session!.target:0));
  e.session!.stop();const previous=e.export().results.map(r=>({...r}));
  expect(previous).toHaveLength(1);
  e.startTraining();
  const saved=e.export();
  expect(saved.sessions).toHaveLength(2);
  expect(saved.sessions[0]).toMatchObject({number:1,startedAt:1000,state:'stopped',results:previous,calibration:{baseline:.002,reference:.2}});
  expect(saved.sessions[1].state).toBe('running');
  expect(saved.results).toEqual([]);
});
it('rejects a step that cannot fit without erasing its previous calibration',()=>{
  const e=new Engine('simulation'),demo=new DemoSignal();e.receive(demo.next(2000,0));
  const reference={baseline:.002,reference:.2,restThreshold:.003,noise:.0001};e.calibration=reference;
  e.raw.length=MAX_SAMPLES-100000;
  expect(()=>e.startCalibration()).toThrow(/capacity|room|limit/i);
  expect(()=>e.startCollection()).toThrow(/capacity|room|limit/i);
  expect(()=>e.startTraining()).toThrow(/capacity|room|limit/i);
  expect(e.calibration).toBe(reference);expect(e.session).toBeNull();
});
it('retains the full bounded recording rather than stopping at ten minutes',()=>{
  const e=new Engine('simulation'),demo=new DemoSignal();e.raw.length=MAX_SAMPLES-100;
  expect(()=>e.receive(demo.next(100,0))).not.toThrow();
  expect(()=>e.receive(demo.next(100,0))).toThrow(/limit/);
  expect(e.raw).toHaveLength(MAX_SAMPLES);
});
it('does not call unknown ADC metadata a clipped sensor',()=>{
  const e=new Engine('replay',false,null,null),demo=new DemoSignal();e.receive(demo.next(2000,.3));
  expect(e.latest!.quality).toBe('unverified');
  expect(e.events.some(v=>v.event==='interruption')).toBe(false);
  expect(e.export().originalSource).toBe('unknown');
});
it('records named phases, a condition reference and the watering reward',()=>{
  const e=new Engine('simulation'),demo=new DemoSignal();e.receive(demo.next(2000,0));
  e.calibration={baseline:.002,reference:.2,restThreshold:.003,noise:.0001};e.startTraining();
  for(let n=0;n<800;n++)e.receive(demo.next(100,e.session!.phase==='contract'?e.session!.target:0));
  expect(e.export().sessions[0].conditionId).toEqual(expect.any(String));
  expect(e.events.find(v=>v.event==='reward')?.detail).toMatchObject({trial:1,target:.3});
  expect(e.events.filter(v=>v.event==='phase').at(-1)?.detail).toMatchObject({sessionPhase:'contract',trial:2});
});
it('does not score or relabel a replay through live-input actions',()=>{
  const e=new Engine('replay'),d=new DemoSignal();e.receive(d.next(2000,0));
  e.calibration={baseline:.002,reference:.2,restThreshold:.003,noise:.0001};
  expect(()=>e.startCalibration()).toThrow(/replay|inspection/i);
  expect(()=>e.startCollection()).toThrow(/replay|inspection/i);
  expect(()=>e.startTraining()).toThrow(/replay|inspection/i);
});
it('snapshots each round model report without borrowing later fits or mutable arrays',()=>{
  const e=new Engine('simulation'),d=new DemoSignal();e.receive(d.next(2000,0));
  e.calibration={baseline:.002,reference:.2,restThreshold:.003,noise:.0001};
  e.startTraining();e.session!.stop();
  const report={trainingTrials:Array.from({length:12},(_,i)=>`train-${i}`),testTrials:Array.from({length:6},(_,i)=>`test-${i}`),matrix:[[2,0,0],[0,2,0],[0,0,2]],recall:[1,1,1],accuracy:1};
  e.report=report;e.startTraining();e.session!.stop();
  report.matrix[0][0]=99;report.trainingTrials[0]='changed';
  e.report={...report,accuracy:.5};
  expect(e.export().sessions[0]).toHaveProperty('modelReport',null);
  expect(e.export().sessions[1]).toMatchObject({modelReport:{accuracy:1,matrix:[[2,0,0],[0,2,0],[0,0,2]],trainingTrials:['train-0',...Array.from({length:11},(_,i)=>`train-${i+1}`)]}});
});
