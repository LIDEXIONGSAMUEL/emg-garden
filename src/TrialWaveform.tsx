import {memo} from 'react';
import {samplePosition,type Sample} from './signal';

export const TrialWaveform=memo(function TrialWaveform({raw,trial,startIndex,endIndex}:{
  raw:Sample[];trial:number;startIndex:number;endIndex:number;
}){
  const samples=raw.slice(samplePosition(raw,startIndex),samplePosition(raw,endIndex+1));
  if(!samples.length)return <p>No raw waveform is available for this trial.</p>;
  const countsOnly=samples[0].voltage===null;
  const values=samples.map(sample=>sample.voltage??sample.adcCount!);
  const low=Math.min(...values),high=Math.max(...values);
  const width=720,height=100,bins=144;
  const step=(endIndex+1-startIndex)/bins;
  const y=(value:number)=>height-5-(value-low)/Math.max(high-low,1e-6)*(height-10);
  const spans=new Map<number,{min:number;max:number}>();
  for(const [i,sample] of samples.entries()){
    const bin=Math.floor((sample.index-startIndex)/step);
    const value=values[i];
    const span=spans.get(bin);
    if(span){
      span.min=Math.min(span.min,value);
      span.max=Math.max(span.max,value);
    }else spans.set(bin,{min:value,max:value});
  }
  const path=[...spans.entries()].map(([bin,{min,max}])=>
    `M${((bin+.5)*width/bins).toFixed(1)},${y(max).toFixed(2)}V${Math.max(y(max)+.3,y(min)).toFixed(2)}`
  ).join(' ');
  return <figure className="trial-waveform">
    <svg className="wave" viewBox="0 0 720 100" role="img" aria-label={`Trial ${trial} raw waveform`}>
      <path d={path} stroke="#16675b" fill="none" strokeWidth="2"/>
    </svg>
    <figcaption>Retained raw interval · ADC sample {startIndex.toLocaleString()}–{endIndex.toLocaleString()} · {low.toFixed(countsOnly?0:3)}–{high.toFixed(countsOnly?0:3)} {countsOnly?'ADC counts':'V'}</figcaption>
  </figure>;
});
