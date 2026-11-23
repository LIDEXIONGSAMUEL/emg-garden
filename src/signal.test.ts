import {describe,it,expect} from 'vitest';
import {Processor,activity,measureCalibration,minimumReference,parsePacket,parseRecordingCsv,rawCsv} from './signal';

const samples=(n=8000,amplitude=.1,offset=1.5)=>Array.from({length:n},(_,index)=>({index,voltage:offset+amplitude*Math.sin(2*Math.PI*120*index/2000)}));
describe('raw EMG processing',()=>{
  it('qualifies sequenced ADC count packets with an unknown voltage reference',()=>{
    const signal=Array.from({length:1500},(_,i)=>Math.round(510+35*Math.sin(2*Math.PI*120*i/2000)));
    const packet=parsePacket(JSON.stringify({sampleRate:2000,referenceV:null,mode:'adc_counts',adcMax:1023,startIndex:0,samples:signal}));
    const p=new Processor(true,packet.referenceV,packet.adcMax,packet.amplitudeUnit);
    expect(packet.amplitudeUnit).toBe('adc_counts');
    expect(packet.samples[0]).toEqual({index:0,voltage:null,adcCount:510});
    expect(p.push(packet.samples).at(-1)?.quality).toBe('good');
    const nearRail={index:1500,voltage:null,adcCount:1022};
    expect(p.push([nearRail,...packet.samples.slice(0,99).map((sample,i)=>({...sample,index:1501+i}))]).at(-1)?.quality).toBe('clipped');
  });
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
  it('suppresses 50 Hz while retaining a 120 Hz component',()=>{
    const tone=(frequency:number)=>Array.from({length:8000},(_,index)=>({
      index,voltage:1.5+.12*Math.sin(2*Math.PI*frequency*index/2000),
    }));
    const lastRms=(frequency:number,notch:boolean)=>new Processor(notch).push(tone(frequency)).at(-1)!.rms;
    expect(lastRms(50,true)).toBeLessThan(.01*lastRms(50,false));
    expect(lastRms(120,true)).toBeCloseTo(lastRms(120,false),3);
  });
  it('can reject the 100 Hz mains harmonic while retaining a 120 Hz component',()=>{
    function measured(frequency:number,notch100Hz:boolean){
      const tone=Array.from({length:8000},(_,index)=>({
        index,voltage:1.5+.12*Math.sin(2*Math.PI*frequency*index/2000),
      }));
      return new Processor(true,3.3,4095,'module_output_volts',notch100Hz).push(tone).at(-1)!.rms;
    }
    expect(measured(100,true)).toBeLessThan(.01*measured(100,false));
    expect(measured(120,true)/measured(120,false)).toBeGreaterThan(.99);
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
    const data=samples(50);expect(parseRecordingCsv(rawCsv(data)).samples).toEqual(data);
    expect(()=>parseRecordingCsv('time,value\n0,1')).toThrow();
    expect(()=>parseRecordingCsv('sample_index,voltage_v,sample_rate\n0,NaN,2000')).toThrow();
    expect(()=>parseRecordingCsv('sample_index,voltage_v,sample_rate\n1,1.5,2000\n1,1.5,2000')).toThrow();
  });
});
describe('recording provenance and safe replay',()=>{
  it('preserves count-only recordings and reproduces RMS without claiming voltages',()=>{
    const data=Array.from({length:1600},(_,index)=>({index,voltage:null,adcCount:Math.round(510+35*Math.sin(index*.36))}));
    const metadata={source:'serial' as const,amplitudeUnit:'adc_counts' as const,referenceV:null,adcMax:1023,notch50Hz:true,recordingId:'adc-test'};
    const csv=rawCsv(data,metadata);
    expect(csv.split('\n')[0]).not.toContain('voltage_v');
    const saved=parseRecordingCsv(csv);
    expect(saved).toEqual({samples:data,metadata});
    const replay=new Processor(true,saved.metadata.referenceV,saved.metadata.adcMax,saved.metadata.amplitudeUnit).push(saved.samples);
    expect(replay).toEqual(new Processor(true,null,1023,'adc_counts').push(data));
    expect(replay.at(-1)?.quality).toBe('good');
    expect(()=>parseRecordingCsv(csv.replace(',510,adc-test',',1024,adc-test'))).toThrow(/ADC count/);
  });
  it.each(['serial','simulation'] as const)('preserves %s provenance and ADC configuration through CSV',source=>{
    const metadata={source,referenceV:5,adcMax:1023,notch50Hz:true},data=samples(1600,.2,4);
    const recording=parseRecordingCsv(rawCsv(data,metadata));
    expect(recording).toEqual({samples:data,metadata});
    const replay=new Processor(recording.metadata.notch50Hz??false,recording.metadata.referenceV,recording.metadata.adcMax).push(recording.samples);
    expect(replay).toEqual(new Processor(true,5,1023).push(data));
    expect(replay.at(-1)!.quality).toBe('good');
  });
  it('preserves device ADC counts and a recording identifier and rejects conflicting volts',()=>{
    const packet=parsePacket(JSON.stringify({sampleRate:2000,adcMax:1023,referenceV:4.97,startIndex:42,samples:[301,302]}));
    expect(packet.samples.map(sample=>sample.adcCount)).toEqual([301,302]);
    const metadata={source:'serial' as const,referenceV:4.97,adcMax:1023,notch50Hz:true,recordingId:'capture-1'};
    const csv=rawCsv(packet.samples,metadata);
    expect(parseRecordingCsv(csv)).toEqual({samples:packet.samples,metadata});
    expect(()=>parseRecordingCsv(csv.replace(',301,',',633,'))).toThrow(/ADC|voltage/);
    expect(()=>parseRecordingCsv(csv.replace(/,302,$/,',302,other-recording'))).toThrow(/recording/i);
  });
  it('keeps legacy files unknown without inventing ADC configuration',()=>{
    const data=samples(2);
    expect(rawCsv(data).split('\n')[0]).toBe('sample_index,voltage_v,sample_rate');
    expect(parseRecordingCsv(rawCsv(data))).toEqual({samples:data,metadata:{source:'unknown',referenceV:null,adcMax:null,notch50Hz:null}});
    expect(parseRecordingCsv(rawCsv(data,{source:'unknown',referenceV:null,adcMax:null,notch50Hz:null})).metadata).toEqual({source:'unknown',referenceV:null,adcMax:null,notch50Hz:null});
  });
  it('rejects partial metadata columns',()=>{
    expect(()=>parseRecordingCsv('sample_index,voltage_v,sample_rate,origin_source\n0,1,2000,serial\n1,1,2000,serial')).toThrow();
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
    expect(()=>parseRecordingCsv(`sample_index,voltage_v,sample_rate,origin_source,reference_v,adc_max,notch_50hz\n0,1,2000,${first}\n1,1,2000,${second}`)).toThrow();
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
    expect(parseRecordingCsv(text).samples).toHaveLength(2_400_000);
  },15000);
  it('rejects recordings above the sample limit before reading rows',()=>{
    expect(()=>parseRecordingCsv('sample_index,voltage_v,sample_rate\n'+'0,1,2000\n'.repeat(2_400_001))).toThrow(/20 minutes/);
  });
  it('rejects oversized CSV before splitting or parsing it',()=>{
    expect(()=>parseRecordingCsv(' '.repeat(240_000_001))).toThrow(/240 MB/);
  });
  it('rejects unsafe indices in CSV, packets and processing',()=>{
    expect(()=>parseRecordingCsv('sample_index,voltage_v,sample_rate\n0,1,2000\n9007199254740992,1,2000')).toThrow();
    expect(()=>parsePacket(JSON.stringify({sampleRate:2000,referenceV:5,adcMax:1023,startIndex:Number.MAX_SAFE_INTEGER,samples:[1,2]}))).toThrow();
    expect(()=>new Processor().push([{index:Number.MAX_SAFE_INTEGER,voltage:1}])).toThrow();
  });
});
describe('comfortable reference',()=>{
  it('uses the median of three contractions and preserves above-reference activity',()=>{
    const c=measureCalibration([.01,.011,.009,.01],[[.1,.11,.1],[.2,.21,.2],[.11,.12,.11]]);
    expect(c.reference).toBe(.11);expect(activity(.21,c)).toBeGreaterThan(1);
  });
  it('sets the minimum accepted reference above an overlapping contraction',()=>{
    const measured=measureCalibration([.01,.012,.011],[[.011],[.012],[.011]]);
    expect(measured.reference).toBeLessThanOrEqual(minimumReference(measured));
  });
});
