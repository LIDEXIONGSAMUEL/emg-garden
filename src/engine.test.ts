import {it,expect} from 'vitest';
import {Engine,DemoSignal} from './engine';
it('calibrates synthetic raw waveforms and preserves simulation provenance',()=>{
  const e=new Engine('simulation'),demo=new DemoSignal();
  e.receive(demo.next(2000,0));e.startCalibration();
  for(let n=0;n<1420;n++)e.receive(demo.next(100,e.calibrationRun?.instruction==='contract'?1:0));
  expect(e.calibration).not.toBeNull();expect(e.export().source).toBe('simulation');
  expect(e.export().config.sampleRate).toBe(2000);
});
it('invalidates active control on a sequence discontinuity',()=>{
  const e=new Engine('serial'),demo=new DemoSignal();e.receive(demo.next(2000,0));
  e.calibration={baseline:.002,reference:.2,restThreshold:.003,noise:.0001};e.startTraining();
  const chunk=demo.next(100,.3).map(s=>({...s,index:s.index+1000}));e.receive(chunk);
  expect(e.session!.state).toBe('paused');expect(e.session!.results).toHaveLength(0);
});
