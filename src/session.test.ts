import {it,expect} from 'vitest';
import {TrainingSession,CalibrationRun,ExampleCollection} from './session';
import type {Frame} from './signal';
const c={baseline:.01,reference:.11,restThreshold:.012,noise:.001};
const frame=(time:number,a:number):Frame=>({time,centerTime:time-100,rms:c.baseline+a*(c.reference-c.baseline),mav:.1,wl:2,startIndex:Math.round(time*2)-400,endIndex:Math.round(time*2)-1,quality:'good'});
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
it('does not invalidate a complete trial after pausing familiarization',()=>{
  const s=new TrainingSession(c);s.start(0);
  for(let t=50;t<=1000;t+=50)s.push(frame(t,0));
  s.pause();s.resume(5000);
  for(let t=5050;t<=44000;t+=50)s.push(frame(t,s.phase==='contract'?s.target:0));
  expect(s.results).toHaveLength(1);
  expect(s.results[0].coverage).toBe(1);
  expect(s.results[0].restCoverage).toBe(1);
  expect(s.results[0].valid).toBe(true);
});
it('still invalidates a paused scored trial but accepts the next complete trial',()=>{
  const s=new TrainingSession(c);s.start(0);
  for(let t=50;t<=32000;t+=50)s.push(frame(t,s.phase==='contract'?s.target:0));
  s.pause();s.resume(36000);
  for(let t=36050;t<=54000;t+=50)s.push(frame(t,s.phase==='contract'?s.target:0));
  expect(s.results).toHaveLength(2);
  expect(s.results[0].valid).toBe(false);
  expect(s.results[1].valid).toBe(true);
});
it('keeps trial timing tied to its actual contraction and relaxation',()=>{
  const s=new TrainingSession(c);s.start(0);
  for(let t=50;t<=40000;t+=50)s.push(frame(t,s.phase==='contract'?s.target:0));
  expect(s.results[0]).toMatchObject({contractStartMs:30000,holdStartMs:33000,holdEndMs:35000,restStartMs:35000,endMs:40000});
});
it('does not include transition-overlapping windows in classifier examples',()=>{
  const col=new ExampleCollection(0);
  for(let t=50;t<=10000;t+=50)col.push(frame(t,0));
  expect(col.examples[0]).toMatchObject({startIndex:2000,endIndex:2399});
  expect(col.examples.at(-1)).toMatchObject({endIndex:7999});
  expect(col.examples).toHaveLength(57);
});
it('marks only the last two complete trials per class as held out',()=>{
  const col=new ExampleCollection(0);
  expect(col.testing).toBe(false);
  for(let t=50;t<=120000;t+=50)col.push(frame(t,.3));
  expect(col.trial).toBe(12);expect(col.testing).toBe(true);
});
