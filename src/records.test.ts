// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from 'vitest';
import {Engine} from './engine';
import {DemoSignal} from './test/simulation';
import {parseResultFile,loadResults,saveResults,deleteResult} from './records';

function recording(){
  const e=new Engine('simulation'),d=new DemoSignal();e.receive(d.next(2000,0));
  e.calibration={baseline:.002,reference:.2,restThreshold:.003,noise:.0001};e.startTraining();
  for(let n=0;n<800;n++)e.receive(d.next(100,e.session!.phase==='contract'?e.session!.target:0));
  e.session!.stop();return e;
}
beforeEach(()=>{localStorage.clear();vi.restoreAllMocks();});
it('saves and reopens completed results without persisting raw waveforms',()=>{
  const [record]=parseResultFile(JSON.stringify(recording().export()));saveResults([record]);
  expect(loadResults()[0]).toMatchObject({originalSource:'simulation',state:'stopped',results:[{trial:1,valid:true}]});
  expect(JSON.stringify(loadResults())).not.toContain('windows');expect(JSON.stringify(loadResults())).not.toContain('voltage');
});
it('upserts a round but keeps another round and its own calibration separate',()=>{
  const e=recording(),first=parseResultFile(JSON.stringify(e.export()));saveResults(first);
  e.calibration={baseline:.003,reference:.3,restThreshold:.004,noise:.0001};e.startTraining();e.session!.stop();
  const both=parseResultFile(JSON.stringify(e.export()));saveResults(both);saveResults(both);
  expect(loadResults()).toHaveLength(2);
  expect(loadResults().map(r=>r.calibration.reference).sort()).toEqual([.2,.3]);
  deleteResult(first[0].id);expect(loadResults()).toHaveLength(1);
});
it('keeps progress as read-only interrupted results rather than resumable scoring',()=>{
  const e=recording();e.startTraining();
  const latest=e.export();latest.sessions[0].state='running';
  const records=parseResultFile(JSON.stringify(latest));expect(records[0].state).toBe('interrupted');
});
it('opens legacy session exports and portable saved results without inventing missing metadata',()=>{
  const e=recording().export();const old={...e,schema:'emg-garden-0.1.0',sessions:undefined,originalSource:undefined};
  const [record]=parseResultFile(JSON.stringify(old));expect(record.originalSource).toBe('simulation');
  expect(parseResultFile(JSON.stringify(record))).toEqual([record]);
  expect(parseResultFile(JSON.stringify({...old,source:'replay'}))[0].originalSource).toBe('unknown');
});
it('rejects malformed, impossible or oversized result files before changing saved records',()=>{
  const good=recording().export();saveResults(parseResultFile(JSON.stringify(good)));
  const bad=JSON.parse(JSON.stringify(good));bad.sessions[0].results[0].coverage=-1;
  expect(()=>parseResultFile(JSON.stringify(bad))).toThrow();
  expect(()=>parseResultFile('{')).toThrow();
  expect(()=>parseResultFile(' '.repeat(20_000_001))).toThrow();
  expect(()=>parseResultFile(JSON.stringify({...good,schema:'untrusted-app'}))).toThrow();
  expect(loadResults()).toHaveLength(1);
});
it('does not silently evict older records when the local store is full',()=>{
  const [record]=parseResultFile(JSON.stringify(recording().export()));
  saveResults(Array.from({length:50},(_,i)=>({...record,id:`record-${i}`})));
  expect(()=>saveResults([{...record,id:'record-51'}])).toThrow(/50|full|limit/i);
  expect(loadResults()).toHaveLength(50);
});
it('surfaces storage failure while keeping the current result usable',()=>{
  const [record]=parseResultFile(JSON.stringify(recording().export()));
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError');});
  expect(()=>saveResults([record])).toThrow(/save|storage|download/i);
  expect(record.results[0].trial).toBe(1);
});
it('rejects shortened uninterrupted protocol timings',()=>{
  const good=recording().export(),bad=structuredClone(good),r=bad.sessions[0].results[0];
  Object.assign(r,{contractStartMs:0,holdStartMs:1,holdEndMs:2,restStartMs:3,endMs:4});
  expect(()=>parseResultFile(JSON.stringify(bad))).toThrow();
  expect(()=>parseResultFile(JSON.stringify(good))).not.toThrow();
});
it('rejects error metrics that contradict the reported time in target',()=>{
  const bad=recording().export(),r=bad.sessions[0].results[0];
  r.inZone=1;r.error=1e100;
  expect(()=>parseResultFile(JSON.stringify(bad))).toThrow();
  r.inZone=0;r.error=0;
  expect(()=>parseResultFile(JSON.stringify(bad))).toThrow();
});
it('keeps interrupted timing ranges and legacy results without timestamps readable',()=>{
  const interrupted=recording().export(),r=interrupted.sessions[0].results[0];
  r.interrupted=true;r.valid=false;r.endMs!+=2000;
  expect(()=>parseResultFile(JSON.stringify(interrupted))).not.toThrow();
  const old=recording().export(),legacy=old.sessions[0].results[0];
  for(const key of ['contractStartMs','holdStartMs','holdEndMs','restStartMs','endMs'] as const)delete legacy[key];
  expect(()=>parseResultFile(JSON.stringify({...old,schema:'emg-garden-0.1.1'}))).not.toThrow();
});
it('uses per-round model evidence and leaves missing historical reports unknown',()=>{
  const exported=recording().export();
  const modelReport={trainingTrials:Array.from({length:12},(_,i)=>`train-${i}`),testTrials:Array.from({length:6},(_,i)=>`test-${i}`),matrix:[[2,0,0],[0,2,0],[0,0,2]],recall:[1,1,1],accuracy:1};
  const input={...exported,modelReport,sessions:[{...exported.sessions[0],modelReport:null},{...exported.sessions[0],number:2,modelReport}]};
  const records=parseResultFile(JSON.stringify(input));
  expect(records[0].modelReport).toBeNull();expect(records[1].modelReport).toEqual(modelReport);
  for(const schema of ['emg-garden-0.1.0','emg-garden-0.1.1','emg-garden-1.0.0']){
    expect(parseResultFile(JSON.stringify({...exported,schema,modelReport,sessions:[{...exported.sessions[0],modelReport:undefined}]}))[0].modelReport).toBeNull();
  }
});
