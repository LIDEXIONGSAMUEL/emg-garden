export type Example={trial:string;label:0|1|2;features:[number,number,number];startIndex?:number;endIndex?:number;centerTime?:number};
export type Model={mean:number[];scale:number[];training:Example[];k:5};
export type ModelReport={trainingTrials:string[];testTrials:string[];matrix:number[][];recall:number[];accuracy:number};

export class PredictionHistory {
  private votes:number[]=[];
  current:{label:number;confidence:number}|null=null;

  reset(){this.votes=[];this.current=null;}

  push(model:Model,features:number[]){
    const prediction=predict(model,features);
    this.votes.push(prediction.confidence>=.6?prediction.label:-1);
    this.votes=this.votes.slice(-3);
    const label=[0,1,2].find(value=>this.votes.filter(vote=>vote===value).length>=2);
    this.current=label===prediction.label&&prediction.confidence>=.6?prediction:null;
  }
}
export function predict(model:Model,features:number[]){
  const distances=model.training.map(e=>({label:e.label,d:e.features.reduce((sum,x,i)=>sum+((x-features[i])/model.scale[i])**2,0)})).sort((a,b)=>a.d-b.d).slice(0,model.k);
  const votes=[0,0,0];distances.forEach(e=>votes[e.label]++);
  const confidence=Math.max(...votes)/model.k,label=votes.indexOf(Math.max(...votes)) as 0|1|2;
  return {label,confidence};
}
export function fitModel(examples:Example[]):{model:Model;report:ModelReport}{
  const trials=new Map<string,0|1|2>();
  for(const e of examples){
    if(![0,1,2].includes(e.label)||e.features.length!==3||e.features.some(v=>!Number.isFinite(v)))throw new Error('Invalid labelled features.');
    if(trials.has(e.trial)&&trials.get(e.trial)!==e.label)throw new Error('Conflicting labels within a trial.');
    trials.set(e.trial,e.label);
  }
  const trainingTrials:string[]=[],testTrials:string[]=[];
  for(const label of [0,1,2]){
    const ids=[...trials].filter(([,l])=>l===label).map(([id])=>id);
    if(ids.length!==6)throw new Error('Six distinct trials per label are required.');
    trainingTrials.push(...ids.slice(0,4));testTrials.push(...ids.slice(4));
  }
  const training=examples.filter(e=>trainingTrials.includes(e.trial)),test=examples.filter(e=>testTrials.includes(e.trial));
  if([...trials.keys()].some(id=>examples.filter(e=>e.trial===id).length<5))throw new Error('Not enough valid windows in a trial.');
  const mean=[0,1,2].map(i=>training.reduce((sum,e)=>sum+e.features[i],0)/training.length);
  const scale=mean.map((m,i)=>Math.sqrt(training.reduce((sum,e)=>sum+(e.features[i]-m)**2,0)/training.length)||1);
  const model:Model={mean,scale,training,k:5},matrix=Array.from({length:3},()=>[0,0,0]);
  test.forEach(e=>matrix[e.label][predict(model,e.features).label]++);
  const recall=matrix.map((row,i)=>row[i]/row.reduce((a,b)=>a+b,0));
  return {model,report:{trainingTrials,testTrials,matrix,recall,accuracy:matrix.reduce((sum,row,i)=>sum+row[i],0)/test.length}};
}
