import {describe,it,expect} from 'vitest';
import {Processor,calibrate,activity,parsePacket,parseCsv,rawCsv} from './signal';

const samples=(n=8000,amplitude=.1,offset=1.5)=>Array.from({length:n},(_,index)=>({index,voltage:offset+amplitude*Math.sin(2*Math.PI*120*index/2000)}));
describe('raw EMG processing',()=>{
  it('rejects DC offset and measures the AC signal',()=>{
    const a=new Processor(),b=new Processor();
    const x=a.push(samples()),y=b.push(samples(8000,.1,2));
    expect(x.at(-1)!.rms).toBeGreaterThan(.05);
    expect(x.at(-1)!.rms).toBeLessThan(.08);
    expect(x.at(-1)!.rms).toBeCloseTo(y.at(-1)!.rms,5);
  });
  it('retains filter state across packet boundaries',()=>{
    const data=samples(),a=new Processor(),b=new Processor();
    const whole=a.push(data),parts=data.flatMap((_,i)=>i%50===0?b.push(data.slice(i,i+50)):[]);
    expect(whole.length).toBeGreaterThan(10);
    expect(parts).toEqual(whole);
  });
  it('marks clipping invalid and resets after a sample gap',()=>{
    const p=new Processor();p.push(samples());
    expect(p.push([{index:8000,voltage:3.3},...samples(99).map(s=>({...s,index:s.index+8001}))]).at(-1)!.quality).toBe('clipped');
    expect(p.push(samples(400).map(s=>({...s,index:s.index+10000})))).toHaveLength(0);
    expect(p.gaps).toBe(1);
  });
  it('validates raw packets rather than treating arbitrary serial numbers as EMG',()=>{
    expect(()=>parsePacket('{"samples":[5]}')).toThrow();
    expect(()=>parsePacket(JSON.stringify({sampleRate:1000,adcMax:1023,referenceV:5,startIndex:0,samples:[20]}))).toThrow();
    expect(parsePacket(JSON.stringify({sampleRate:2000,adcMax:1023,referenceV:5,startIndex:8,samples:[307,308]})).samples[0].index).toBe(8);
  });
  it('round trips raw CSV and rejects envelope-like or malformed data',()=>{
    const data=samples(50);expect(parseCsv(rawCsv(data))).toEqual(data);
    expect(()=>parseCsv('time,value\n0,1')).toThrow();
    expect(()=>parseCsv('sample_index,voltage_v,sample_rate\n0,NaN,2000')).toThrow();
    expect(()=>parseCsv('sample_index,voltage_v,sample_rate\n1,1.5,2000\n1,1.5,2000')).toThrow();
  });
});
describe('comfortable reference',()=>{
  it('uses the median of three contractions and preserves above-reference activity',()=>{
    const c=calibrate([.01,.011,.009,.01],[[.1,.11,.1],[.2,.21,.2],[.11,.12,.11]]);
    expect(c.reference).toBe(.11);expect(activity(.21,c)).toBeGreaterThan(1);
  });
  it('rejects an overlapping reference',()=>expect(()=>calibrate([.01,.012,.011],[[.011],[.012],[.011]])).toThrow());
});
