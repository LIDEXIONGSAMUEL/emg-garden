import {it,expect} from 'vitest';
import {fitModel,predict,type Example} from './model';
const examples:Example[]=Array.from({length:3},(_,label)=>Array.from({length:6},(_,trial)=>Array.from({length:8},(_,i)=>({trial:`${label}-${trial}`,label:label as 0|1|2,features:[label+1+i*.001,label*.5+.1,label*20+1+i*.01] as [number,number,number]})))).flat(2);
it('splits by whole trials and fits scaling only on training examples',()=>{
  const {model,report}=fitModel(examples);
  expect(report.trainingTrials.filter(t=>report.testTrials.includes(t))).toEqual([]);
  expect(report.testTrials).toHaveLength(6);expect(report.accuracy).toBe(1);
  expect(report.recall).toEqual([1,1,1]);expect(predict(model,[2,.6,21]).label).toBe(1);
  expect(model.mean[0]).toBeLessThan(2.1);
});
it('requires six distinct trials for each label',()=>expect(()=>fitModel(examples.filter(x=>x.trial!=='2-5'))).toThrow());
it('rejects conflicting labels within a trial',()=>expect(()=>fitModel([...examples,{...examples[0],label:1}])).toThrow());
