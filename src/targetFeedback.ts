import {useEffect,useRef,useState} from 'react';
import type {Engine} from './engine';
import type {TrainingSession} from './session';
import type {Frame} from './signal';

const HIT_DURATION_MS=450;
const REARM_AFTER_MS=300;
type TrialEntry={session:TrainingSession;trial:number;armed:boolean;outsideSince:number|null};
type TargetHit={session:TrainingSession;trial:number;key:number};

function playDrop(context:AudioContext){
  const now=context.currentTime;
  const tone=context.createOscillator();
  const volume=context.createGain();
  tone.type='sine';
  tone.frequency.setValueAtTime(880,now);
  tone.frequency.exponentialRampToValueAtTime(440,now+.105);
  volume.gain.setValueAtTime(.001,now);
  volume.gain.exponentialRampToValueAtTime(.15,now+.018);
  volume.gain.exponentialRampToValueAtTime(.001,now+.13);
  tone.connect(volume);
  volume.connect(context.destination);
  tone.start(now);
  tone.stop(now+.14);
}

export function useTargetFeedback(engine:Engine|null,active:boolean,inTarget:boolean){
  const session=active?engine?.session??null:null;
  const trial=session?.trial;
  const sample=engine?.latest??null;
  const activity=engine?.level??0;
  const entry=useRef<TrialEntry|null>(null);
  const inactiveSample=useRef<Frame|null>(null);
  const [hit,setHit]=useState<TargetHit|null>(null);
  const context=useRef<AudioContext|null>(null);
  const [sound,setSound]=useState(false);

  function changeSound(enabled:boolean){
    if(!enabled){
      setSound(false);
      void context.current?.suspend().catch(()=>{});
      return;
    }
    try{
      context.current??=new AudioContext();
      void context.current.resume().then(()=>setSound(true)).catch(()=>setSound(false));
    }catch{
      setSound(false);
    }
  }

  useEffect(()=>()=>{void context.current?.close().catch(()=>{});},[]);
  useEffect(()=>{
    if(!session||trial===undefined||!sample){
      entry.current=null;
      inactiveSample.current=sample;
      setHit(null);
      return;
    }
    if(sample===inactiveSample.current)return;

    let current=entry.current;
    if(!current||current.session!==session||current.trial!==trial){
      current={session,trial,armed:true,outsideSince:null};
      entry.current=current;
      setHit(null);
    }
    if(!inTarget){
      current.outsideSince??=sample.time;
      return;
    }
    const rearmed=current.outsideSince!==null&&sample.time-current.outsideSince>=REARM_AFTER_MS;
    current.outsideSince=null;
    if(!current.armed&&!rearmed)return;
    current.armed=false;
    setHit({session,trial,key:sample.endIndex});
    engine?.event('target_hit_feedback',{
      trial:trial+1,block:session.block,target:session.target,activity,
      sampleIndex:sample.endIndex,signalTime:sample.time,wallTime:new Date().toISOString(),
    });
    if(sound&&context.current?.state==='running')playDrop(context.current);
  },[session,trial,sample,inTarget,engine,activity,sound]);

  useEffect(()=>{
    if(!hit)return;
    const timer=setTimeout(()=>setHit(null),HIT_DURATION_MS);
    return()=>clearTimeout(timer);
  },[hit]);

  return {
    pulse:session&&hit?.session===session&&hit.trial===trial?hit.key:null,
    sound,
    changeSound,
  };
}
