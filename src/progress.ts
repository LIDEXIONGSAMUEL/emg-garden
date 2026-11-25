import type {TrialResult} from './session';
import type {SavedResult} from './records';
import {mean} from './signal';

export function bandProgress(rows:TrialResult[],target:number,tolerance:number){
  const band=rows.filter(t=>t.target===target&&t.tolerance===tolerance);
  function phase(block:'baseline'|'final'){
    const all=band.filter(t=>t.block===block);
    const valid=all.filter(t=>t.valid&&t.inZone!==null);
    const releases=valid.flatMap(t=>t.relaxationMs===null?[]:[t.relaxationMs]);
    return {total:all.length,valid:valid.length,rate:valid.length?mean(valid.map(t=>t.inZone!)):null,
      releases:releases.length,relaxMs:releases.length?mean(releases):null};
  }
  const baseline=phase('baseline'),final=phase('final');
  const change=baseline.rate===null||final.rate===null?null:(final.rate-baseline.rate)*100;
  return {baseline,final,change};
}

export function trendGroups(records:SavedResult[],playerId:string){
  type Point={record:SavedResult;rate:number;count:number};
  const groups=new Map<string,{target:number;tolerance:number;settings:string;points:Point[]}>();
  for(const record of records){
    if(record.playerId!==playerId||record.source!=='serial'||record.originalSource!=='serial'||!record.protocol||
       record.config.notch50Hz===null||record.config.adcMax===null||record.config.amplitudeUnit==='module_output_volts'&&record.config.referenceV===null)continue;
    for(const target of [.3,.6]){
      const row=record.results.find(t=>t.target===target&&t.block==='final');
      if(!row)continue;
      const {final}=bandProgress(record.results,target,row.tolerance);
      if(final.rate===null)continue;
      const key=JSON.stringify([record.plannedTrials,target,row.tolerance,record.protocol,record.config,record.setup?.device??'',record.setup?.electrodePlacement??'']);
      const settings=record.plannedTrials+' trials · '+record.protocol+' reference · '+(record.config.notch100Hz?'50/100 Hz notch':record.config.notch50Hz?'50 Hz notch':'notch off')+' · ADC max '+record.config.adcMax+' · '+(record.config.referenceV===null?'counts':record.config.referenceV+' V')+' · '+(record.setup?.device||'device unspecified')+' · '+(record.setup?.electrodePlacement||'placement unspecified');
      const group=groups.get(key)??{target,tolerance:row.tolerance,settings,points:[]};
      group.points.push({record,rate:final.rate,count:final.valid});
      groups.set(key,group);
    }
  }
  for(const group of groups.values())group.points.sort((a,b)=>Date.parse(a.record.createdAt)-Date.parse(b.record.createdAt)||a.record.number-b.record.number);
  return [...groups.values()];
}
