import {it,expect} from 'vitest';
import {Engine,DemoSignal} from './engine';
import {SimulationSignal} from './simulation';
import {mean,sd} from './signal';

function calibrated(){
  const engine=new Engine('simulation'),signal=new SimulationSignal();
  engine.receive(signal.next(2000,0));engine.startCalibration();
  for(let i=0;i<1420;i++)engine.receive(signal.next(100,engine.calibrationRun?.instruction==='contract'?1:0));
  expect(engine.calibration).not.toBeNull();expect(engine.model).toBeNull();
  return {engine,signal};
}
function advance(engine:Engine,signal:SimulationSignal,seconds:number,target:number){
  for(let i=0;i<seconds*20;i++)engine.receive(signal.next(100,target));
}

it('preserves every normal DemoSignal waveform sample and its continuous indices',()=>{
  const simulation=new SimulationSignal(),normal=new DemoSignal();
  for(const [n,target] of [[2000,0],[100,.3],[791,.6],[1309,0]]){
    const samples=simulation.next(n,target);
    expect(samples).toEqual(normal.next(n,target));
    expect(samples.every((sample,i)=>i===0||sample.index===samples[i-1].index+1)).toBe(true);
  }
});

it.each(['unsteady','drift','gap'] as const)('times a %s check from its current raw index and allows a later check',kind=>{
  const simulation=new SimulationSignal();
  expect(simulation.scenario).toBeNull();expect(simulation.remaining).toBe(0);
  simulation.next(12345,.3);simulation.startScenario(kind);
  expect(simulation.scenario).toBe(kind);expect(simulation.remaining).toBe(8);
  expect(()=>simulation.startScenario('gap')).toThrow(/active|running|finish/i);
  simulation.next(2000,.3);expect(simulation.remaining).toBe(7);
  simulation.next(13999,.3);expect(simulation.remaining).toBeCloseTo(.0005,8);
  simulation.next(1,.3);expect(simulation.scenario).toBeNull();expect(simulation.remaining).toBe(0);
  simulation.startScenario(kind);expect(simulation.remaining).toBe(8);
});

it.each(['unsteady','drift','gap'] as const)('reproduces a %s check independent of packet sizes',kind=>{
  const whole=new SimulationSignal(),split=new SimulationSignal();
  whole.next(333,.3);split.next(333,.3);whole.startScenario(kind);split.startScenario(kind);
  const packets=[];
  for(let n=0;n<17000;n+=137)packets.push(...split.next(Math.min(137,17000-n),.3));
  expect(packets).toEqual(whole.next(17000,.3));
  expect(whole.scenario).toBeNull();expect(split.scenario).toBeNull();
});

it.each(['unsteady','drift'] as const)('changes calibrated %s activity and target performance, then recovers',kind=>{
  const normal=calibrated(),check=calibrated();
  advance(normal.engine,normal.signal,2,.3);advance(check.engine,check.signal,2,.3);
  const startedAt=check.engine.time,first=check.engine.windows.length;
  check.signal.startScenario(kind);
  advance(normal.engine,normal.signal,8,.3);advance(check.engine,check.signal,8,.3);
  const active=(engine:Engine)=>engine.windows.slice(first).filter(frame=>frame.time>startedAt+1500&&frame.time<=startedAt+6000).map(frame=>frame.activity!);
  const usual=active(normal.engine),changed=active(check.engine);
  expect(mean(usual.map(a=>Math.abs(a-.3)))).toBeLessThan(.02);
  expect(mean(changed.map(a=>Math.abs(a-.3)))).toBeGreaterThan(.1);
  expect(mean(changed.map(a=>Math.abs(a-.3)<=.1?1:0))).toBeLessThan(.8);
  if(kind==='unsteady')expect(sd(changed)).toBeGreaterThan(sd(usual)+.1);
  else expect(mean(changed.slice(-20))).toBeGreaterThan(mean(changed.slice(0,20))+.15);
  const recovered=check.engine.windows.filter(frame=>frame.time>startedAt+7500);
  expect(mean(recovered.map(frame=>Math.abs(frame.activity!-.3)))).toBeLessThan(.02);
  expect(check.engine.windows.slice(first).every(frame=>frame.quality==='good')).toBe(true);
  expect(check.engine.processor.gaps).toBe(0);expect(check.signal.scenario).toBeNull();
});

it('omits exactly 500 ms at second two while preserving the continuing raw waveform',()=>{
  const simulation=new SimulationSignal(),normal=new DemoSignal(),start=12345;
  simulation.next(start,.3);normal.next(start,.3);simulation.startScenario('gap');
  expect(simulation.next(4000,.3)).toEqual(normal.next(4000,.3));
  expect(simulation.remaining).toBe(6);
  expect(simulation.next(1000,.3)).toEqual([]);normal.next(1000,.3);
  expect(simulation.remaining).toBe(5.5);
  const after=simulation.next(11000,.3);
  expect(after).toEqual(normal.next(11000,.3));expect(after[0].index).toBe(start+5000);
  expect(simulation.scenario).toBeNull();expect(simulation.next(4000,.3)).toEqual(normal.next(4000,.3));
});
it('can cancel a check without resetting or losing the continuing waveform',()=>{
  const simulation=new SimulationSignal(),normal=new DemoSignal();
  simulation.startScenario('gap');
  expect(simulation.next(2000,.3)).toEqual(normal.next(2000,.3));
  simulation.cancelScenario();expect(simulation.scenario).toBeNull();expect(simulation.remaining).toBe(0);
  expect(simulation.next(16000,.3)).toEqual(normal.next(16000,.3));
});

it('pauses real Engine training across a gap until explicit resume without adding paused results',()=>{
  const {engine,signal}=calibrated();engine.startTraining();
  advance(engine,signal,31,.3);
  expect(engine.session!.phase).toBe('contract');expect(engine.session!.state).toBe('running');
  signal.startScenario('gap');advance(engine,signal,3,.3);
  expect(engine.session!.state).toBe('paused');expect(engine.processor.gaps).toBe(1);
  const results=engine.session!.results.map(result=>({...result})),lastTime=engine.session!.lastTime;
  advance(engine,signal,12,.3);
  expect(engine.session!.state).toBe('paused');expect(engine.session!.lastTime).toBe(lastTime);
  expect(engine.session!.results).toEqual(results);expect(signal.scenario).toBeNull();
  engine.session!.resume(engine.time);
  for(let i=0;i<220;i++)engine.receive(signal.next(100,engine.session!.phase==='rest'?0:engine.session!.target));
  expect(engine.session!.state).toBe('running');expect(engine.session!.results.length).toBeGreaterThan(results.length);
  expect(engine.session!.results[0]).toMatchObject({interrupted:true,valid:false});
});
