import {expect,it} from 'vitest';
import {bandProgress} from './progress';
import type {TrialResult} from './session';

it('compares valid same-band trials and counts observed releases',()=>{
  const baseline={target:.6,tolerance:.2,block:'baseline',valid:true,inZone:.3,relaxationMs:null} as TrialResult;
  const after={...baseline,block:'final',inZone:.55,relaxationMs:700} as TrialResult;
  const result=bandProgress([baseline,after,{...after,valid:false,inZone:1}],.6,.2);
  expect(result.change).toBeCloseTo(25);
  expect(result.final).toMatchObject({valid:1,total:2,releases:1,relaxMs:700});
  expect(bandProgress([baseline],.6,.2).change).toBeNull();
  expect(bandProgress([baseline,{...after,tolerance:.1}],.6,.2).change).toBeNull();
});
