import type {SavedResult} from './records';

export type Player={id:string;name:string};
const PLAYER='emg-garden.player.';
const ACTIVE='emg-garden.current-player';
export function players():Player[]{
  return Object.keys(localStorage).filter(key=>key.startsWith(PLAYER)).map(key=>({
    id:key.slice(PLAYER.length),name:localStorage.getItem(key)??''
  })).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
export function activePlayerId(){return localStorage.getItem(ACTIVE)??'';}
export function selectPlayer(id:string){localStorage.setItem(ACTIVE,id);}
export function createPlayer(name:string){
  name=name.trim();
  if(!name||name.length>40)throw new Error('Enter a nickname of 1–40 characters.');
  const player={id:crypto.randomUUID(),name};
  localStorage.setItem(PLAYER+player.id,name);
  return player;
}
const dropPrefix=(id:string)=>'emg-garden.water.'+id+'.';
export function collectWater(record:SavedResult){
  if(!record.playerId||record.source!=='serial'||record.originalSource!=='serial')return;
  for(const trial of record.results){
    if(!trial.valid||!trial.rewarded)continue;
    const key=dropPrefix(record.playerId)+record.id+'.'+trial.trial;
    if(localStorage.getItem(key)===null)localStorage.setItem(key,'1');
  }
}
export function waterCount(id:string){
  return Object.keys(localStorage).filter(key=>key.startsWith(dropPrefix(id))).length;
}
export function plantGrowth(drops:number){return drops>0?(drops-1)%6+1:0;}
export function plantStage(drops:number){
  const current=plantGrowth(drops);
  if(current===6)return 'In bloom';
  return current>=3?'Leafy plant':current>=1?'Sprout':'Seed';
}
