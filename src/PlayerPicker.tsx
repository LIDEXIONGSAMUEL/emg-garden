import {useState} from 'react';
import {createPlayer,players,type Player} from './profiles';
import {Garden} from './Garden';

export function PlayerPicker({onChoose}:{onChoose:(p:Player)=>void}){
  const [nickname,setNickname]=useState(''),[error,setError]=useState('');
  let list:Player[]=[];
  try{list=players();}catch{return <main><p role="alert">Browser storage is unavailable. Enable local storage to open your garden.</p></main>;}
  function choose(p:Player){try{onChoose(p);}catch(e){setError((e as Error).message);}}
  return <main><header><span className="brand">✳ EMG Garden</span></header>
    <section className="welcome"><div className="welcome-copy"><h1>My <em>garden</em></h1>
    {list.length>0&&<section><h3>Choose a gardener</h3><div className="button-row">{list.map(p=><button key={p.id} className="secondary" onClick={()=>choose(p)}>{p.name}{list.some(other=>other.id!==p.id&&other.name===p.name)?' · '+p.id.slice(0,4):''}</button>)}</div></section>}
    <form onSubmit={e=>{e.preventDefault();try{choose(createPlayer(nickname));}catch(err){setError((err as Error).message);}}}><label>New gardener nickname<input required maxLength={40} value={nickname} onChange={e=>setNickname(e.target.value)}/></label><button className="primary">Plant my seed</button></form>
    {error&&<p role="alert">{error}</p>}</div><div className="welcome-garden"><Garden preview/></div></section></main>;
}
