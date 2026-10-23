import {it,expect} from 'vitest';
import {TrainingSession,CalibrationRun} from './session';
import type {Frame} from './signal';
const c={baseline:.01,reference:.11,restThreshold:.012,noise:.001};
const frame=(time:number,a:number):Frame=>({time,rms:c.baseline+a*(c.reference-c.baseline),mav:.1,wl:2,startIndex:Math.round(time*2)-400,endIndex:Math.round(time*2)-1,quality:'good'});
it('completes the fixed protocol without changing baseline or final conditions',()=>{
  const s=new TrainingSession(c);s.start(0);
  for(let t=50;t<=330_000;t+=50){s.push(frame(t,s.phase==='contract'?s.target:0));}
  expect(s.state).toBe('complete');expect(s.results).toHaveLength(30);
  const pre=s.results.filter(r=>r.block==='baseline'),post=s.results.filter(r=>r.block==='final');
  expect(pre.map(r=>[r.target,r.tolerance])).toEqual(post.map(r=>[r.target,r.tolerance]));
  expect(pre.every(r=>r.inZone!==null&&r.inZone>.9)).toBe(true);
});
it('does not score missing time and requires explicit resume',()=>{
  const s=new TrainingSession(c);s.start(0);s.push(frame(50,0));s.push(frame(1000,.3));
  expect(s.state).toBe('paused');expect(s.results).toHaveLength(0);
  s.push(frame(2000,.3));expect(s.state).toBe('paused');
  s.resume(2000);expect(s.state).toBe('running');
});
it('does not reward a trial that missed the target',()=>{
  const s=new TrainingSession(c);s.start(0);
  for(let t=50;t<=40_000;t+=50)s.push(frame(t,0));
  expect(s.results).toHaveLength(1);expect(s.results[0].inZone).toBe(0);expect(s.results[0].rewarded).toBe(false);
});
it('rejects clipped signal and does not advance the protocol',()=>{
  const s=new TrainingSession(c);s.start(0);s.push({...frame(50,.3),quality:'clipped'});
  expect(s.state).toBe('paused');expect(s.results).toHaveLength(0);
});
it('builds a reference from rest and three comfortable demonstrations',()=>{
  const run=new CalibrationRun();run.start(0);
  for(let t=50;t<=70_000;t+=50)run.push(frame(t,run.instruction==='contract'?1:0));
  expect(run.state).toBe('complete');expect(run.result!.reference).toBeCloseTo(.11,3);
});
