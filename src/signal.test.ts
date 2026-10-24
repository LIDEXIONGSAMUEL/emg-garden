import {describe,it,expect} from 'vitest';
import {Processor,calibrate,activity,parsePacket,parseCsv,rawCsv} from './signal';
import * as signal from './signal';

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
describe('recording provenance and safe replay',()=>{
  it.each(['serial','simulation'] as const)('preserves %s provenance and ADC configuration through CSV',source=>{
    const metadata={source,referenceV:5,adcMax:1023,notch50Hz:true},data=samples(1600,.2,4);
    const recording=signal.parseRecordingCsv(rawCsv(data,metadata));
    expect(recording).toEqual({samples:data,metadata});
    const replay=new Processor(recording.metadata.notch50Hz??false,recording.metadata.referenceV,recording.metadata.adcMax).push(recording.samples);
    expect(replay).toEqual(new Processor(true,5,1023).push(data));
    expect(replay.at(-1)!.quality).toBe('good');
  });
  it('keeps legacy files unknown without inventing ADC configuration',()=>{
    const data=samples(2);
    expect(rawCsv(data).split('\n')[0]).toBe('sample_index,voltage_v,sample_rate');
    expect(signal.parseRecordingCsv(rawCsv(data))).toEqual({samples:data,metadata:{source:'unknown',referenceV:null,adcMax:null,notch50Hz:null}});
    expect(signal.parseRecordingCsv(rawCsv(data,{source:'unknown',referenceV:null,adcMax:null,notch50Hz:null})).metadata).toEqual({source:'unknown',referenceV:null,adcMax:null,notch50Hz:null});
  });
  it('rejects partial metadata columns',()=>{
    expect(()=>parseCsv('sample_index,voltage_v,sample_rate,origin_source\n0,1,2000,serial\n1,1,2000,serial')).toThrow();
  });
  it.each([
    ['serial,5,1023,true','simulation,5,1023,true'],
    ['serial,5,1023,true','serial,3.3,1023,true'],
    ['serial,5,1023,true','serial,5,4095,true'],
    ['serial,5,1023,true','serial,5,1023,false'],
    ['replay,5,1023,true','replay,5,1023,true'],
    ['serial,0,1023,true','serial,0,1023,true'],
    ['serial,5,12,true','serial,5,12,true'],
    ['serial,5,1023,yes','serial,5,1023,yes'],
    ['serial,NaN,1023,true','serial,NaN,1023,true'],
  ])('rejects conflicting or invalid metadata %s / %s',(first,second)=>{
    expect(()=>parseCsv(`sample_index,voltage_v,sample_rate,origin_source,reference_v,adc_max,notch_50hz\n0,1,2000,${first}\n1,1,2000,${second}`)).toThrow();
  });
  it('reports unknown quality when either ADC setting is missing',()=>{
    expect(new Processor(false,null,null).push(samples()).at(-1)!.quality).toBe('unverified');
    expect(new Processor(false,5,null).push(samples(1600,.1,0)).at(-1)!.quality).toBe('unverified');
    expect(new Processor(false,null,1023).push(samples(1600)).at(-1)!.quality).toBe('unverified');
    expect(new Processor(false,null,null).push(samples(4000,0)).at(-1)!.quality).toBe('flat');
  });
  it('places the feature at the center while preserving the window endpoint',()=>{
    const frame=new Processor().push(samples(1400))[0];
    expect(frame.startIndex).toBe(1000);expect(frame.endIndex).toBe(1399);
    expect(frame.time).toBe(700);expect(frame.centerTime).toBe(600);
  });
  it('accepts longer recordings up to the twenty minute bound',()=>{
    const text='sample_index,voltage_v,sample_rate\n'+Array.from({length:2_400_000},(_,i)=>`${i},1,2000`).join('\n');
    expect(parseCsv(text)).toHaveLength(2_400_000);
  },15000);
  it('rejects recordings above the sample limit before reading rows',()=>{
    expect(()=>parseCsv('sample_index,voltage_v,sample_rate\n'+'0,1,2000\n'.repeat(2_400_001))).toThrow(/20 minutes/);
  });
  it('rejects oversized CSV before splitting or parsing it',()=>{
    expect(()=>parseCsv(' '.repeat(240_000_001))).toThrow(/240 MB/);
  });
  it('rejects unsafe indices in CSV, packets and processing',()=>{
    expect(()=>parseCsv('sample_index,voltage_v,sample_rate\n0,1,2000\n9007199254740992,1,2000')).toThrow();
    expect(()=>parsePacket(JSON.stringify({sampleRate:2000,referenceV:5,adcMax:1023,startIndex:Number.MAX_SAFE_INTEGER,samples:[1,2]}))).toThrow();
    expect(()=>new Processor().push([{index:Number.MAX_SAFE_INTEGER,voltage:1}])).toThrow();
  });
});
describe('comfortable reference',()=>{
  it('uses the median of three contractions and preserves above-reference activity',()=>{
    const c=calibrate([.01,.011,.009,.01],[[.1,.11,.1],[.2,.21,.2],[.11,.12,.11]]);
    expect(c.reference).toBe(.11);expect(activity(.21,c)).toBeGreaterThan(1);
  });
  it('rejects an overlapping reference',()=>expect(()=>calibrate([.01,.012,.011],[[.011],[.012],[.011]])).toThrow());
});
