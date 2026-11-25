import {it,expect} from 'vitest';
import {TrainingSession,CalibrationRun,ExampleCollection} from './session';
import type {Frame} from './signal';
const c={baseline:.01,reference:.11,restThreshold:.012,noise:.001};
const frame=(time:number,a:number):Frame=>({time,centerTime:time-100,rms:c.baseline+a*(c.reference-c.baseline),mav:.1,wl:2,startIndex:Math.round(time*2)-400,endIndex:Math.round(time*2)-1,quality:'good'});
it('completes the fixed protocol without changing baseline or final conditions',()=>{
  const s=new TrainingSession(c);s.start(0);
  for(let t=50;t<180_000;t+=50){s.push(frame(t,s.phase==='contract'?s.target:0));}
  expect(s.state).toBe('running');expect(s.results).toHaveLength(14);
  s.push(frame(180_000,0));
  expect(s.state).toBe('complete');expect(s.results).toHaveLength(15);
  const pre=s.results.filter(r=>r.block==='baseline'),post=s.results.filter(r=>r.block==='final');
  expect(pre).toHaveLength(5);expect(post).toHaveLength(5);
  expect(s.results.filter(r=>r.block==='practice')).toHaveLength(5);
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
it('awards water after 300 consecutive milliseconds and scores the final two seconds separately',()=>{
  const s=new TrainingSession(c);s.start(0);
  for(let t=50;t<30000;t+=50)s.push(frame(t,0));
  s.push(frame(30000,s.target));
  for(let t=30050;t<=30150;t+=50)s.push(frame(t,t===30150?0:s.target));
  expect(s.holdFraction).toBe(.5);
  s.push(frame(30200,s.target));
  expect(s.holdFraction).toBe(0);
  for(let t=30250;t<=30450;t+=50)s.push(frame(t,s.target));
  expect(s.rewarded).toBe(false);
  s.push(frame(30500,0));
  expect(s.holdFraction).toBe(1);
  expect(s.rewarded).toBe(true);
  for(let t=30550;t<=40000;t+=50)s.push(frame(t,0));
  expect(s.results[0]).toMatchObject({rewarded:true,valid:true,inZone:0,coverage:1});
});
it.each([[.39,false],[.4,true],[.8,true],[.81,false]])('scores firmer trials at activity %s using the wider band',(effort,inTarget)=>{
  const s=new TrainingSession({...c,baseline:0,reference:1});s.start(0);
  for(let t=50;t<=50_000;t+=50){
    const rms=s.phase==='contract'?(s.trial===0?.45:effort):0;
    s.push({...frame(t,0),rms});
  }
  expect(s.results[0]).toMatchObject({target:.3,tolerance:.1,inZone:0,rewarded:false,valid:true});
  expect(s.results[1]).toMatchObject({target:.6,tolerance:.2,inZone:inTarget?1:0,rewarded:inTarget,valid:true});
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
it('acknowledges only a currently sustained relaxation without changing the saved onset',()=>{
  const s=new TrainingSession(c);s.start(0);
  for(let t=50;t<=35000;t+=50)s.push(frame(t,s.phase==='contract'?s.target:0));
  expect(s.relaxed).toBe(false);
  for(let t=35050;t<=35300;t+=50)s.push(frame(t,0));
  expect(s.relaxed).toBe(false);
  s.push(frame(35350,0));expect(s.relaxed).toBe(true);
  s.push(frame(35400,.3));expect(s.relaxed).toBe(false);
  s.push(frame(35450,.3));expect(s.relaxed).toBe(false);
  for(let t=35500;t<=35900;t+=50)s.push(frame(t,0));
  expect(s.relaxed).toBe(true);
  s.pause();expect(s.relaxed).toBe(false);s.resume(35900);expect(s.relaxed).toBe(false);
  for(let t=35950;t<=40000;t+=50)s.push(frame(t,0));
  expect(s.phase).toBe('contract');expect(s.relaxed).toBe(false);
  expect(s.results[0].relaxationMs).toBe(50);
});
it('never confirms relaxation from poor or missing signal',()=>{
  for(const fault of ['clipped','gap'] as const){
    const s=new TrainingSession(c);s.start(0);
    for(let t=50;t<=36000;t+=50)s.push(frame(t,s.phase==='contract'?s.target:0));
    expect(s.relaxed).toBe(true);
    s.push(fault==='gap'?frame(36500,0):{...frame(36050,0),quality:'clipped'});
    expect(s.state).toBe('paused');expect(s.relaxed).toBe(false);
  }
});
it('replaces an excluded labelled trial in its original split only after a good retake',()=>{
  const collection=new ExampleCollection(0);
  for(let t=50;t<=180000;t+=50)collection.push(frame(t,.3));
  expect(collection.state).toBe('complete');
  const slot=12;
  const original=collection.examples.filter(example=>example.trial==='trial-13');
  collection.reviewTrial(slot,'excluded');
  expect(collection.reviewReady).toBe(false);

  collection.startRetake(slot,180000);
  expect(collection.testing).toBe(true);
  collection.interrupt('Disconnected during retake.');
  expect(collection.state).toBe('complete');
  expect(collection.examples.filter(example=>example.trial==='trial-13')).toEqual(original);
  expect(collection.trialReviews[slot].decision).toBe('excluded');

  collection.startRetake(slot,190000);
  for(let t=190050;t<=200000;t+=50)collection.push(frame(t,.45));
  const replaced=collection.examples.filter(example=>example.trial==='trial-13');
  expect(replaced).toHaveLength(original.length);
  expect(replaced[0].startIndex).toBeGreaterThan(original.at(-1)!.endIndex!);
  expect(collection.examples.findIndex(example=>example.trial==='trial-13')).toBe(original.length*12);
  expect(collection.trialReviews[slot]).toMatchObject({decision:'pending',attempt:2});
  for(let trial=0;trial<18;trial++)collection.reviewTrial(trial,'accepted');
  expect(collection.reviewReady).toBe(true);
});
