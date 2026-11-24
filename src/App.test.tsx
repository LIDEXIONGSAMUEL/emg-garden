// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import App from './App';
import {DemoSignal} from './test/simulation';
import {loadReference,loadResults} from './records';
import {parseRecordingCsv,rawCsv} from './signal';
import {boardCheckCsv,type BoardCheck} from './boardCheck';
import * as boardCheckStore from './boardCheckStore';

let root:Root,container:HTMLDivElement,downloads:string[];
function button(name:string|RegExp){
  const found=Array.from(container.querySelectorAll('button')).find(b=>typeof name==='string'?b.textContent===name:name.test(b.textContent??''));
  if(!found)throw new Error(`Button not found: ${name}`);
  return found;
}
let input:ReturnType<typeof mockSerialPort>,signal:DemoSignal;
async function startRecording(){
  input=mockSerialPort();signal=new DemoSignal();
  await act(async()=>{button('Connect EMG').click();});
  await act(async()=>{feedSignal(1500);});
}
function feedSignal(duration:number,effort=0){
  for(let remaining=duration*2;remaining>0;remaining-=1000){
    const startIndex=signal.index;
    const samples=signal.next(Math.min(remaining,1000),effort).map(sample=>Math.round(sample.voltage!/3.3*1023));
    input.send(JSON.stringify({sampleRate:2000,adcMax:1023,referenceV:null,mode:'adc_counts',startIndex,samples})+'\n');
  }
}
function completeReference(startStep=0){
  for(const [duration,value] of [[5000,0],[5000,1]].slice(startStep)){
    feedSignal(duration,value);
  }
}
function notchToggle(){
  return Array.from(container.querySelectorAll('label')).find(label=>label.textContent?.includes('50 Hz notch for the next connection'))!.querySelector('input')!;
}
async function reopenApp(){
  await act(async()=>{root.unmount();root=createRoot(container);root.render(<App/>);});
}
beforeEach(async()=>{
  localStorage.clear();
  vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:false})));
  vi.stubGlobal('URL',{createObjectURL:vi.fn(()=>'blob:test'),revokeObjectURL:vi.fn()});
  downloads=[];vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){downloads.push(this.download);});
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  await act(async()=>{root.render(<App/>);});
});
afterEach(async()=>{
  await act(async()=>{root.unmount();});container.remove();Reflect.deleteProperty(navigator,'serial');
  vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();
});
it('saves a completed reference before any training and restores it after reopening',async()=>{
  await startRecording();
  await act(async()=>{button('Set my reference').click();});
  expect(container.querySelector('.countdown')?.getAttribute('aria-label')).toBe('5 seconds remaining');
  await act(async()=>{feedSignal(5000);});
  expect(container.querySelector('.instruction h1')?.textContent).toBe('Squeeze comfortably');
  expect(container.querySelector('.countdown')?.getAttribute('aria-label')).toBe('5 seconds remaining');
  expect(container.querySelector('.garden-stream')?.getAttribute('opacity')).toBe('0');
  await act(async()=>{feedSignal(1000,1);});
  expect(Number(container.querySelector('.garden-stream')?.getAttribute('opacity'))).toBeGreaterThan(0);
  await act(async()=>{feedSignal(4000,1);});
  expect(container.textContent).toContain('Reference saved on this browser');
  expect(loadResults()).toHaveLength(0);
  await reopenApp();
  await startRecording();
  expect(button('Use saved reference').disabled).toBe(false);
  await act(async()=>{button('Use saved reference').click();});
  expect(button('Start training').disabled).toBe(false);
  const bodies:string[]=[];
  vi.stubGlobal('Blob',class {constructor(parts:string[]){bodies.push(parts.join(''));}});
  await act(async()=>{button('Download session JSON').click();});
  const exported=JSON.parse(bodies[0]);
  expect(exported.events).toContainEqual(expect.objectContaining({
    event:'calibration_reused',
    detail:expect.objectContaining({sourceConditionId:expect.stringContaining(':reference-1'),protocol:'quick'}),
  }));
  expect(exported.verification.calibrations[0].reference).toEqual(exported.calibration);
});
it('offers a saved reference only for matching filters and keeps it if a later calibration fails',async()=>{
  await startRecording();
  await act(async()=>{button('Set my reference').click();completeReference();});
  const saved=loadReference();
  expect(saved).not.toBeNull();
  await reopenApp();
  await act(async()=>{notchToggle().click();});
  await startRecording();
  expect(container.textContent).not.toContain('Use saved reference');
  await act(async()=>{button('Set my reference').click();feedSignal(10000);});
  expect(container.textContent).toContain('Rest and contraction overlap');
  expect(container.querySelector('.instruction')?.textContent).toMatch(/Rest RMS .*Squeeze RMS .*needs to exceed/);
  expect(container.textContent).not.toContain('Start training');
  expect(loadReference()).toEqual(saved);
});
it('keeps the full research calibration with all three reference contractions',async()=>{
  await startRecording();
  await act(async()=>{button('Full reference (70 seconds)').click();});
  expect(container.querySelector('.countdown')?.getAttribute('aria-label')).toBe('15 seconds remaining');
  await act(async()=>{
    for(const [duration,effort] of [[15000,0],[5000,1],[20000,0],[5000,1],[20000,0],[5000,1]]){
      feedSignal(duration,effort);
    }
  });
  expect(button('Start training').disabled).toBe(false);
  expect(loadReference()?.protocol).toBe('full');
});
it('opens the Uno training source from the home page with the 50 Hz notch enabled',async()=>{
  expect(container.querySelector('.welcome .primary')?.textContent).toBe('Connect EMG');
  expect(container.querySelector('.welcome button')?.textContent).toBe('Connect EMG');
  expect(container.textContent).not.toMatch(/Try it yourself|Try simulation|New manual practice|Run synthetic check/);
  expect(container.querySelector('input[type="range"]')).toBeNull();
  expect(notchToggle().checked).toBe(true);
  const device=mockSerialPort();
  await act(async()=>{button('Connect EMG').click();});
  expect(device.open).toHaveBeenCalledWith({baudRate:250000});
  expect(container.querySelector('.instruction h1')?.textContent).toBe('Waiting for EMG');
  expect(container.querySelector('input[type="range"]')).toBeNull();
  expect(notchToggle().checked).toBe(true);
  expect(notchToggle().disabled).toBe(true);
  expect(button('Set my reference').disabled).toBe(true);
});
it.each([true,false])('freezes the live filter choice (%s) and preserves the original ADC counts',async notch=>{
  if(!notch)await act(async()=>{notchToggle().click();});
  const device=mockSerialPort();
  await act(async()=>{button('Connect EMG').click();});
  const adc=[307,312,320,331];
  await act(async()=>{device.send(JSON.stringify({sampleRate:2000,adcMax:1023,referenceV:4.97,startIndex:0,samples:adc})+'\n');});
  expect(notchToggle().disabled).toBe(true);
  const bodies:string[]=[];
  vi.stubGlobal('Blob',class {constructor(parts:string[]){bodies.push(parts.join(''));}});
  await act(async()=>{button('Download session JSON').click();button('Download raw CSV').click();});
  expect(JSON.parse(bodies[0]).config).toMatchObject({highpassHz:20,lowpassHz:450,notch50Hz:notch});
  const csv=parseRecordingCsv(bodies[1]);
  expect(JSON.parse(bodies[0]).config.notch100Hz).toBe(notch?true:undefined);
  expect(csv.metadata.notch100Hz).toBe(notch?true:undefined);
  expect(csv.metadata.notch50Hz).toBe(notch);
  expect(csv.samples.map(sample=>sample.adcCount)).toEqual(adc);
});
it('downloads one selected file per click without relying on multiple-download permission',async()=>{
  await startRecording();
  await act(async()=>{button(/^Download (data|session JSON)$/).click();});
  expect(downloads).toHaveLength(1);expect(downloads[0]).toMatch(/-serial-session\.json$/);
  await act(async()=>{feedSignal(1000);button('Download raw CSV').click();});
  expect(downloads).toHaveLength(2);expect(downloads[1]).toMatch(/-serial-raw\.csv$/);
  expect(downloads[0].replace(/-session\.json$/,'')).toBe(downloads[1].replace(/-raw\.csv$/,''));
  expect(downloads[0]).toMatch(/-[a-f\d]{8}-[a-f\d-]{27}-serial-session\.json$/i);
});
it('still protects the recording from replacement after a download',async()=>{
  await startRecording();
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  await act(async()=>{button(/^Download (data|session JSON)$/).click();});
  mockSerialPort();
  await act(async()=>{feedSignal(100);button('Connect device').click();});
  expect(confirm).toHaveBeenCalledOnce();
  expect(container.textContent).toContain('3,200 raw samples');
});
it('does not make the title a navigation that silently discards the recording',()=>{
  expect(container.querySelector('.brand')?.tagName).toBe('SPAN');
});
it('keeps the existing recording when serial input is unavailable',async()=>{
  await startRecording();
  Reflect.deleteProperty(navigator,'serial');
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  await act(async()=>{button('Connect device').click();});
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Chrome');
  expect(container.textContent).toContain('3,000 raw samples');expect(confirm).not.toHaveBeenCalled();
});
it('labels the completed session without showing a new first trial',async()=>{
  await startRecording();
  await act(async()=>{button('Set my reference').click();completeReference();});
  await act(async()=>{
    button('Start training').click();
    feedSignal(30000);
    for(let trial=0;trial<30;trial++){
      feedSignal(5000,trial===1?0:trial%2===0?.3:.6);
      feedSignal(5000);
    }
  });
  expect(container.textContent).toContain('30 of 30 trials completed');
  expect(container.querySelector('.panel-heading')?.textContent).toContain('Session complete');
  expect(loadResults()[0]).toMatchObject({state:'complete',originalSource:'serial'});
  expect(loadResults()[0].config).toMatchObject({amplitudeUnit:'adc_counts',adcMax:1023,referenceV:null});
  expect(loadResults()[0].results).toHaveLength(30);
  expect(loadResults()[0].results[0]).toMatchObject({rewarded:true,inZone:1});
  expect(loadResults()[0].results[1]).toMatchObject({rewarded:false,inZone:0});
  await act(async()=>{root.unmount();root=createRoot(container);root.render(<App/>);});
  await act(async()=>{button('View').click();});
  expect(container.querySelector('.saved-review')?.textContent).toContain('Read-only');
  expect(container.querySelector('.saved-review')?.textContent).toContain('ADC counts');
  expect(container.querySelector('.saved-review')?.textContent).toContain('6 / 6');
},10000);
async function chooseFile(label:string,content:string){
  const input=Array.from(container.querySelectorAll('label')).find(l=>l.textContent?.includes(label))?.querySelector('input[type="file"]');
  if(!input)throw new Error(`File input not found: ${label}`);
  const file=new File([content],'test.csv',{type:'text/csv'});Object.defineProperty(file,'text',{value:async()=>content});
  Object.defineProperty(input,'files',{configurable:true,value:[file]});
  await act(async()=>{input.dispatchEvent(new Event('change',{bubbles:true}));});
}
it('pauses, continues and restarts inspection-only replay without scoring',async()=>{
  vi.spyOn(window,'confirm').mockReturnValue(true);
  const rows=Array.from({length:4000},(_,index)=>({index,voltage:1.5+.1*Math.sin(index*.3)}));
  await chooseFile('Replay raw CSV',rawCsv(rows,{source:'simulation',referenceV:3.3,adcMax:4095,notch50Hz:false}));
  await act(async()=>{vi.advanceTimersByTime(500);button('Pause replay').click();});
  const position=()=>container.querySelector<HTMLProgressElement>('[aria-label="Replay position"]')!.value;
  expect(position()).toBe(1000);
  await act(async()=>{vi.advanceTimersByTime(1000);});expect(position()).toBe(1000);
  await act(async()=>{button('Continue replay').click();vi.advanceTimersByTime(1600);});
  expect(container.textContent).toContain('Replay complete');expect(position()).toBe(4000);
  expect(container.querySelector('.instruction')?.textContent).not.toContain('Set your reference');
  expect(loadResults()).toHaveLength(0);
  await act(async()=>{button('Replay again').click();});expect(position()).toBe(0);
  expect(container.textContent).toContain('Recorded simulation');
});
it('keeps current data when an invalid replay file is rejected',async()=>{
  await startRecording();
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
  await chooseFile('Replay raw CSV','time,value\n0,no');
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('CSV');
  expect(container.textContent).toContain('3,000 raw samples');expect(confirm).not.toHaveBeenCalled();
});
it('shows an honest warning for legacy replay with unknown provenance and ADC settings',async()=>{
  vi.spyOn(window,'confirm').mockReturnValue(true);
  await chooseFile('Replay raw CSV',rawCsv(Array.from({length:2000},(_,index)=>({index,voltage:4+.1*Math.sin(index*.3)}))));
  await act(async()=>{vi.advanceTimersByTime(1000);});
  expect(container.textContent).toContain('Source unknown');
  expect(container.textContent).toContain('ADC settings unknown');
  expect(container.textContent).not.toContain('Signal is clipped');
});
it('hides effort feedback during held-out classifier trials',async()=>{
  await startRecording();
  await act(async()=>{button('Set my reference').click();completeReference();});
  await act(async()=>{button('Session details').click();button('Collect 18 labelled trials').click();feedSignal(120000,.4);});
  expect(container.querySelector('.panel-heading')?.textContent).toContain('Test examples');
  expect(container.querySelector('.garden-panel')?.textContent).not.toContain('Target');
  expect(container.querySelector('.tools-grid dl')).toBeNull();
  const demo=container.querySelector('.demo-dashboard');
  expect(demo?.textContent).toContain('Live feedback is hidden during test examples.');
  expect(demo?.textContent).not.toContain('Current effort');
  expect(demo?.textContent).not.toContain('Classification');
  await act(async()=>{feedSignal(60000,.4);});
  const review=()=>container.querySelector<HTMLSelectElement>('[aria-label="Trial 13 review"]')!;
  expect(review().value).toBe('pending');
  await act(async()=>{button('View trial 13 waveform').click();});
  expect(container.querySelector('[aria-label="Trial 13 raw waveform"] path')?.getAttribute('d')).toMatch(/^M/);
  await act(async()=>{review().value='excluded';review().dispatchEvent(new Event('change',{bubbles:true}));});
  expect(button('Fit and test kNN').disabled).toBe(true);
  const retake=container.querySelector<HTMLButtonElement>('[aria-label="Retake trial 13"]')!;
  await act(async()=>{retake.click();});
  expect(container.querySelector('.panel-heading')?.textContent).toContain('Test examples · Trial 13 of 18');
  expect(container.querySelector('.tools-grid dl')).toBeNull();
  await act(async()=>{feedSignal(10000);});
  expect(review().value).toBe('pending');
  expect(button('Fit and test kNN').disabled).toBe(true);
});
it('keeps downloadable results when automatic local saving fails',async()=>{
  await startRecording();
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError');});
  await act(async()=>{button('Set my reference').click();completeReference();});
  await act(async()=>{button('Start training').click();feedSignal(40000);});
  await act(async()=>{button('End session').click();});
  expect(container.textContent).toContain('Could not save');
  expect(button('Download session JSON').disabled).toBe(false);
});
it('does not restore a deleted earlier round when another round saves progress',async()=>{
  await startRecording();
  vi.spyOn(window,'confirm').mockReturnValue(true);
  await act(async()=>{button('Set my reference').click();completeReference();});
  await act(async()=>{button('Start training').click();feedSignal(40000);});
  await act(async()=>{button('End session').click();});
  const deletedId=loadResults()[0].id;
  await act(async()=>{button('Delete').click();});
  expect(loadResults()).toHaveLength(0);
  await act(async()=>{button('New session').click();feedSignal(40000);});
  expect(loadResults().map(r=>r.number)).toEqual([2]);
  expect(loadResults().some(r=>r.id===deletedId)).toBe(false);
  await act(async()=>{button('End session').click();});
  expect(loadResults().map(r=>r.number)).toEqual([2]);
});
it('shows consistent hand illustrations for relax, squeeze and steady instructions',async()=>{
  await startRecording();
  await act(async()=>{button('Set my reference').click();});
  expect(container.querySelector('[data-hand-action="relax"] svg')).not.toBeNull();
  expect(container.querySelector('.instruction h1')?.textContent).toBe('Relax your hand');
  await act(async()=>{feedSignal(5000);});
  expect(container.querySelector('[data-hand-action="squeeze"] svg')).not.toBeNull();
  expect(container.querySelector('.instruction h1')?.textContent).toBe('Squeeze comfortably');
  await act(async()=>{completeReference(1);});
  await act(async()=>{button('Start training').click();feedSignal(30000,0);});
  const cue=()=>container.querySelector('.instruction h1')?.textContent;
  const garden=()=>container.querySelector('.garden-panel');
  expect(cue()).toBe('Squeeze a little more');
  expect(container.querySelector('.instruction')?.textContent).toContain('Light squeeze');
  expect(garden()?.textContent).not.toMatch(/\d+%/);
  expect(garden()?.querySelector('svg')?.getAttribute('aria-label')).not.toMatch(/percent/i);
  expect(garden()?.querySelector('[data-in-zone]')).toBeNull();
  await act(async()=>{feedSignal(1000,.3);});
  expect(cue()).toBe('That’s it! Hold it');
  expect(container.querySelector('[data-hand-action="hold"] svg')).not.toBeNull();
  expect(garden()?.querySelector('[data-in-zone]')).not.toBeNull();
  expect(garden()?.querySelector('.reward-note')).toBeNull();
  await act(async()=>{feedSignal(1600,.3);});
  expect(garden()?.querySelector('.reward-note')?.textContent).toBe('Flower watered!');
  await act(async()=>{feedSignal(1000,.9);});
  expect(cue()).toBe('Ease off a little');
  expect(garden()?.querySelector('[data-in-zone]')).toBeNull();
  await act(async()=>{feedSignal(6500,0);});
  expect(container.querySelector('.instruction')?.textContent).toContain('Firmer squeeze');
});
it('plays target feedback once per armed entry and logs the qualified sample',async()=>{
  const exported:string[]=[];
  vi.stubGlobal('Blob',class {constructor(parts:string[]){exported.push(parts.join(''));}});
  await startRecording();
  await act(async()=>{button('Set my reference').click();completeReference();});
  const splash=()=>container.querySelector('.garden-target-hit');
  expect(splash()).toBeNull();
  await act(async()=>{button('Start training').click();feedSignal(29000,.3);});
  expect(splash()).toBeNull();
  await act(async()=>{feedSignal(1000,0);});
  await act(async()=>{feedSignal(500,.3);});
  const first=splash();
  expect(first).not.toBeNull();
  expect(container.querySelector('.garden-pot-rim')).not.toBeNull();
  expect(container.querySelector('.reward-note')).toBeNull();

  await act(async()=>{feedSignal(200,.59);});
  expect(container.querySelector('[data-in-zone]')).toBeNull();
  await act(async()=>{feedSignal(250,.3);});
  expect(container.querySelector('[data-in-zone]')).not.toBeNull();
  expect(splash()).toBe(first);
  await act(async()=>{feedSignal(600,0);});
  await act(async()=>{feedSignal(500,.3);});
  expect(splash()).not.toBeNull();
  expect(splash()).not.toBe(first);

  await act(async()=>{vi.advanceTimersByTime(450);});
  expect(splash()).toBeNull();
  expect(container.querySelector('[data-in-zone]')).not.toBeNull();
  await act(async()=>{feedSignal(2050,.3);});
  expect(container.querySelector('.reward-note')?.textContent).toBe('Flower watered!');
  await act(async()=>{button('End session').click();});
  await act(async()=>{button('Download session JSON').click();});
  const {events}=JSON.parse(exported[0]) as ReturnType<import('./engine').Engine['export']>;
  const hits=events.filter(event=>event.event==='target_hit_feedback');
  expect(hits).toHaveLength(2);
  for(const hit of hits){
    const detail=hit.detail as {activity:number;sampleIndex:number;signalTime:number;wallTime:string};
    expect(detail).toMatchObject({trial:1,block:'baseline',target:.3});
    expect(detail.activity).toBeGreaterThanOrEqual(.2);
    expect(detail.activity).toBeLessThanOrEqual(.4);
    expect(detail.sampleIndex).toBeGreaterThan(0);
    expect(detail.signalTime).toBe(hit.time);
    expect(Number.isFinite(Date.parse(detail.wallTime))).toBe(true);
  }
});

it('confirms observed relaxation only during fresh running training rest',async()=>{
  await startRecording();
  await act(async()=>{button('Set my reference').click();completeReference();});
  await act(async()=>{button('Start training').click();feedSignal(35000,.3);});
  expect(container.querySelector('.instruction h1')?.textContent).toBe('Relax');
  await act(async()=>{feedSignal(1500);});
  expect(container.querySelector('.instruction h1')?.textContent).toBe('Hand relaxed');
  expect(container.querySelector('[data-hand-action="relaxed"] svg')).not.toBeNull();
  await act(async()=>{button(/^Ⅱ/).click();});
  expect(container.querySelector('.instruction h1')?.textContent).toBe('Take a break');
  expect(container.querySelector('[data-hand-action="relaxed"]')).toBeNull();
  await act(async()=>{button('Continue').click();});
  expect(container.querySelector('.instruction h1')?.textContent).toBe('Relax');
  await act(async()=>{feedSignal(1000);});
  expect(container.querySelector('.instruction h1')?.textContent).toBe('Hand relaxed');
  await act(async()=>{feedSignal(2500);});
  expect(container.querySelector('[data-hand-action="relaxed"]')).toBeNull();
});
it('uses the same short title for optional speech without repeating unchanged cues',async()=>{
  await startRecording();
  const speak=vi.fn(),cancel=vi.fn();
  vi.stubGlobal('speechSynthesis',{speak,cancel});
  vi.stubGlobal('SpeechSynthesisUtterance',class {lang='';rate=1;constructor(public text:string){}});
  const toggle=Array.from(container.querySelectorAll('label')).find(l=>l.textContent?.includes('Spoken cues'))!.querySelector('input')!;
  await act(async()=>{toggle.click();});
  expect(speak.mock.calls.at(-1)?.[0].text).toBe(container.querySelector('.instruction h1')?.textContent);
  await act(async()=>{button('Set my reference').click();});
  expect(speak.mock.calls.at(-1)?.[0].text).toBe('Relax your hand');
  const count=speak.mock.calls.length;
  await act(async()=>{feedSignal(1000);});expect(speak).toHaveBeenCalledTimes(count);
});
it('keeps serial training paused after a stall until fresh samples arrive and Continue is pressed',async()=>{
  await startRecording();
  await act(async()=>{button('Set my reference').click();completeReference();});
  await act(async()=>{button('Start training').click();feedSignal(31000,.3);});
  await act(async()=>{vi.advanceTimersByTime(550);});
  expect(container.querySelector('.instruction h1')?.textContent).toBe('Take a break');
  expect(button('Continue').disabled).toBe(true);
  expect(container.querySelector('.tools-grid dl')?.textContent).toContain('Waiting for signal');
  expect(container.querySelector('.garden-pot-rim')).toBeNull();
  expect(container.querySelector('.garden-target-hit')).toBeNull();
  expect(container.textContent).toContain('0 of 30 trials completed');
  await act(async()=>{signal.index+=1000;feedSignal(700,.3);});
  expect(container.querySelector('.instruction h1')?.textContent).toBe('Take a break');
  expect(container.textContent).toContain('0 of 30 trials completed');
  expect(button('Continue').disabled).toBe(false);
  await act(async()=>{button('Continue').click();feedSignal(4000,.3);feedSignal(5000);});
  expect(container.querySelector('.instruction h1')?.textContent).not.toBe('Take a break');
  expect(loadResults()[0].results[0]).toMatchObject({valid:false,interrupted:true});
});
it('does not reveal relaxation confirmation during held-out collection or replay',async()=>{
  await startRecording();
  await act(async()=>{button('Set my reference').click();completeReference();});
  await act(async()=>{button('Collect 18 labelled trials').click();feedSignal(126500);});
  expect(container.querySelector('[data-hand-action="relaxed"]')).toBeNull();
  await act(async()=>{button('Stop this step').click();});
  vi.spyOn(window,'confirm').mockReturnValue(true);
  await chooseFile('Replay raw CSV',rawCsv(Array.from({length:4000},(_,index)=>({index,voltage:1.5+.1*Math.sin(index*.3)}))));
  expect(container.querySelector('[data-hand-action]')).toBeNull();
});

it('recalibrates on the same source and keeps previous results under their original condition',async()=>{
  await startRecording();
  await act(async()=>{button('Set my reference').click();completeReference();});
  await act(async()=>{button('Start training').click();feedSignal(40000);});
  await act(async()=>{button('End session').click();});
  const first=loadResults().find(result=>result.number===1)!;
  expect(first.results).toHaveLength(1);
  await act(async()=>{button('Recalibrate').click();});
  expect(container.querySelector('.panel-heading')?.textContent).toContain('Reference');
  expect(loadResults()).toContainEqual(first);
  await act(async()=>{completeReference();});
  await act(async()=>{button('Start training').click();feedSignal(40000);});
  await act(async()=>{button('End session').click();});
  const next=loadResults().find(result=>result.number===2)!;
  expect(next.conditionId).not.toBe(first.conditionId);
  expect(loadResults()).toContainEqual(first);
});
it('previews gentle and stronger live activity after calibration without starting a scored trial',async()=>{
  await startRecording();
  await act(async()=>{button('Set my reference').click();completeReference();});
  const width=()=>Number(container.querySelector('.garden-water-drops')?.getAttribute('stroke-width'));
  const meterHeight=()=>Number(container.querySelector('.garden-meter-fill')?.getAttribute('height'));
  const level=()=>Number(container.querySelector('.tools-grid dl div:last-child dd')?.textContent?.replace('%',''));
  await act(async()=>{feedSignal(1800);});
  const opacity=()=>container.querySelector('.garden-stream')?.getAttribute('opacity');
  expect(opacity()).toBe('0');
  expect(width()).toBe(0);
  await act(async()=>{feedSignal(1300,.35);});
  expect(Number(opacity())).toBeGreaterThan(0);
  const lightWidth=width(),light=meterHeight();
  expect(lightWidth).toBeGreaterThan(0);
  await act(async()=>{feedSignal(1300,.7);});
  expect(width()).toBeGreaterThan(lightWidth);
  expect(meterHeight()).toBeGreaterThan(light);
  expect(container.querySelector('.garden-panel')?.textContent).not.toMatch(/\d+%/);
  await act(async()=>{feedSignal(1300,1.2);});
  const aboveReferenceWidth=width();
  expect(level()).toBeGreaterThan(100);
  await act(async()=>{feedSignal(1300,1.5);});
  expect(width()).toBeGreaterThan(aboveReferenceWidth);
  await act(async()=>{feedSignal(1800);});
  expect(opacity()).toBe('0');
  expect(width()).toBe(0);
  expect(button('Start training').disabled).toBe(false);
  expect(loadResults()).toHaveLength(0);
});


it('automatically saves live playtest checkpoints and retries the same data before advancing',async()=>{
  const post=vi.fn()
    .mockResolvedValueOnce({ok:false})
    .mockResolvedValue({ok:true});
  vi.stubGlobal('fetch',post);
  await startRecording();
  await act(async()=>{vi.advanceTimersByTime(2000);});
  expect(post).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('Could not save a local checkpoint');
  await act(async()=>{feedSignal(600);});
  await act(async()=>{vi.advanceTimersByTime(2000);});
  expect(post.mock.calls[1][1].body).toBe(post.mock.calls[0][1].body);
  const batches=()=>post.mock.calls.slice(1).map(([url,options])=>{
    expect(url).toBe('/api/playtest-checkpoint');
    return JSON.parse(options.body);
  });
  const savedIndices=batches().flatMap(batch=>batch.samples.map(([index]:[number])=>index));
  expect(savedIndices).toHaveLength(4200);
  expect(savedIndices.every((index,position)=>index===position)).toBe(true);
  expect(container.textContent).toContain('Saved locally');
  await act(async()=>{feedSignal(600);});
  await act(async()=>{button('Set my reference').click();completeReference();});
  await act(async()=>{button('Start training').click();feedSignal(33000,.3);});
  await act(async()=>{button('End session').click();});
  const saved=batches(),last=saved.at(-1);
  expect(last.sessionState).toBe('stopped');
  expect(last.sessions).toHaveLength(1);
  expect(saved.every(batch=>batch.id===last.id&&batch.source==='serial')).toBe(true);
  expect(saved.flatMap(batch=>batch.windows).some(window=>window.activity>.2)).toBe(true);
  expect(saved.flatMap(batch=>batch.events)).toEqual(expect.arrayContaining([
    expect.objectContaining({event:'training_started'}),
    expect.objectContaining({event:'reward'}),
    expect.objectContaining({event:'training_ended'}),
    expect.objectContaining({event:'target_hit_feedback',detail:expect.objectContaining({trial:1,target:.3})}),
    expect.objectContaining({event:'player_cue',detail:expect.objectContaining({title:'Session ended'})}),
  ]));
  expect(downloads).toHaveLength(0);
});

it('shows labelled session metrics during training and valid before-and-after comparisons at the end',async()=>{
  await startRecording();
  expect(container.querySelector('.demo-dashboard')).toBeNull();
  await act(async()=>{button('Session details').click();button('Set my reference').click();completeReference();});
  await act(async()=>{button('Start training').click();feedSignal(31000,.3);});
  const dashboard=()=>container.querySelector('.demo-dashboard')?.textContent;
  expect(dashboard()).toContain('EMG connected');
  expect(dashboard()).toContain('Current effort');
  expect(dashboard()).toContain('20%–40%');
  expect(dashboard()).toContain('Not trained');
  await act(async()=>{feedSignal(299000);});
  expect(dashboard()).toContain('Before practice');
  expect(dashboard()).toContain('After practice');
  expect(dashboard()).toContain('Time in target');
  expect(dashboard()?.match(/6 \/ 6/g)).toHaveLength(2);
  await act(async()=>{button('Session details').click();});
  expect(container.querySelector('.demo-dashboard')).toBeNull();
},10000);

function mockSerialPort(){
  let controller!:ReadableStreamDefaultController<Uint8Array>;
  const readable=new ReadableStream<Uint8Array>({start(value){controller=value;}});
  const open=vi.fn(async()=>{});
  const close=vi.fn(async()=>{});
  const requestPort=vi.fn(async()=>({open,close,readable}));
  vi.stubGlobal('isSecureContext',true);
  Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort}});
  return {open,close,requestPort,send:(data:string)=>controller.enqueue(new TextEncoder().encode(data))};
}

it('reads the connected board’s two columns at 115200 without creating a training source',async()=>{
  const board=mockSerialPort();
  try{
    vi.spyOn(window,'confirm').mockReturnValue(true);
    await act(async()=>{button('Connect board').click();});
    expect(board.open).toHaveBeenCalledWith({baudRate:115200});
    await act(async()=>{
      board.send('549,-8.16\r\nboot message\r\n507,7.');
      board.send('74\r\n492,18.26\r\n');
      vi.advanceTimersByTime(100);
    });
    await act(async()=>{vi.advanceTimersByTime(100);});
    const monitor=container.querySelector('[aria-label="Board monitor"]')!;
    expect(monitor.textContent).toContain('3 rows');
    expect(monitor.textContent).toContain('1 ignored');
    expect(monitor.textContent).toContain('492');
    expect(monitor.textContent).toContain('18.26');
    expect(monitor.querySelectorAll('polyline')).toHaveLength(2);
    expect(container.textContent).not.toContain('Set my reference');
    await act(async()=>{board.send('0,2\n1023,-2\n');await vi.advanceTimersByTimeAsync(100);});
    const railCheck=monitor.querySelector('[aria-label="10-bit ADC rail check"]')!;
    expect(railCheck.textContent).toContain('Possible clipping');
    expect(railCheck.textContent).toContain('2 / 5 near limits (40%)');
    await act(async()=>{vi.advanceTimersByTime(1100);});
    expect(monitor.textContent).toContain('Waiting for data');
    await act(async()=>{button('Close board monitor').click();});
    expect(board.close).toHaveBeenCalledOnce();
    expect(container.querySelector('[aria-label="Board monitor"]')).toBeNull();
  }finally{Reflect.deleteProperty(navigator,'serial');}
});

it('leaves the current recording in place when the board picker is cancelled',async()=>{
  await startRecording();
  const board=mockSerialPort();
  try{
    board.requestPort.mockRejectedValueOnce(new DOMException('No port','NotFoundError'));
    const confirm=vi.spyOn(window,'confirm');
    await act(async()=>{button('Connect board').click();});
    expect(confirm).not.toHaveBeenCalled();
    expect(board.open).not.toHaveBeenCalled();
    expect(container.textContent).toContain('3,000 raw samples');
  }finally{Reflect.deleteProperty(navigator,'serial');}
});

it('continues to route 230400 baud JSON packets into the training input',async()=>{
  const device=mockSerialPort();
  try{
    vi.spyOn(window,'confirm').mockReturnValue(true);
    await act(async()=>{button('Connect device').click();});
    expect(device.open).toHaveBeenCalledWith({baudRate:230400});
    const samples=Array.from({length:1500},(_,i)=>Math.round(510+40*Math.sin(i*.36)));
    await act(async()=>{device.send(JSON.stringify({sampleRate:2000,adcMax:1023,referenceV:5,startIndex:0,samples})+'\n');});
    expect(button('Set my reference').disabled).toBe(false);
    expect(container.querySelector('[aria-label="Board monitor"]')).toBeNull();
    expect(container.querySelector('#manual-effort')).toBeNull();
  }finally{Reflect.deleteProperty(navigator,'serial');}
});

it('uses the UNO firmware rate and gates calibration on unclipped sequenced samples',async()=>{
  const device=mockSerialPort();
  try{
    vi.spyOn(window,'confirm').mockReturnValue(true);
    await act(async()=>{button('Connect EMG').click();});
    expect(device.open).toHaveBeenCalledWith({baudRate:250000});
    const send=(startIndex:number,samples:number[])=>device.send(JSON.stringify({
      sampleRate:2000,adcMax:1023,referenceV:null,mode:'adc_counts',startIndex,samples,
    })+'\n');
    await act(async()=>{
      device.send('510,511]}\r\n');
      send(0,Array.from({length:1500},(_,i)=>i%2?1023:0));
    });
    expect(button('Set my reference').disabled).toBe(true);
    expect(container.querySelector('.instruction h1')?.textContent).toBe('Signal is clipping');
    expect(container.querySelector('.garden-caption')?.textContent).toContain('readings reach the ADC limits');
    expect(container.querySelector('.tools-grid')?.textContent).toContain('clipped');
    const clean=Array.from({length:600},(_,i)=>Math.round(505+40*Math.sin(i*.36)));
    await act(async()=>{send(1500,clean);});
    expect(button('Set my reference').disabled).toBe(false);
    await act(async()=>{send(2200,clean);});
    expect(button('Set my reference').disabled).toBe(true);
    expect(container.querySelector('.garden-caption')?.textContent).toContain('Filters are settling');
    expect(container.querySelector('.tools-grid')?.textContent).toContain('Sample gaps1');
  }finally{Reflect.deleteProperty(navigator,'serial');}
});

it('reports an unconfigured UNO reference from the firmware',async()=>{
  const device=mockSerialPort();
  try{
    vi.spyOn(window,'confirm').mockReturnValue(true);
    await act(async()=>{button('Connect EMG').click();});
    await act(async()=>{device.send('{"status":"reference_unset"}\r\n');});
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Configure the measured ADC reference');
    expect(button('Set my reference').disabled).toBe(true);
  }finally{Reflect.deleteProperty(navigator,'serial');}
});

it.each([
  ['510,-8.5\r\n','Received legacy two-column data'],
  ['{"sampleRate":500,"samples":[510]}\r\n','Incompatible EMG data'],
] as const)('offers reconnection after rejecting incoming serial line %s',async(line,message)=>{
  const device=mockSerialPort();
  await act(async()=>{button('Connect EMG').click();});
  await act(async()=>{device.send(line);});
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(message);
  expect(button('Set my reference').disabled).toBe(true);
  expect(device.close).toHaveBeenCalledOnce();
  const next=mockSerialPort();
  await act(async()=>{button('Reconnect EMG').click();});
  expect(next.open).toHaveBeenCalledWith({baudRate:250000});
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it('closes a silent serial port after the startup timeout and lets the user reconnect',async()=>{
  const device=mockSerialPort();
  await act(async()=>{button('Connect EMG').click();});
  await act(async()=>{vi.advanceTimersByTime(4900);});
  expect(container.querySelector('[role="alert"]')).toBeNull();
  await act(async()=>{vi.advanceTimersByTime(150);});
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('No compatible EMG data arrived');
  expect(device.close).toHaveBeenCalledOnce();
  expect(button('Reconnect EMG').disabled).toBe(false);
  expect(button('Set my reference').disabled).toBe(true);
});

it('switches the board monitor between raw rows and a 50 Hz filtered preview',async()=>{
  const device=mockSerialPort();
  try{
    vi.spyOn(window,'confirm').mockReturnValue(true);
    await act(async()=>{button('Connect board').click();});
    const count=1000;
    const records=Array.from({length:count},(_,index)=>{
      const mains=Math.sin(2*Math.PI*50*index/500);
      const detail=Math.sin(2*Math.PI*95*index/500);
      return Math.round(500+150*mains+20*detail)+','+(30*mains+7*detail).toFixed(5);
    });
    await act(async()=>{device.send(records.join('\n')+'\n');});
    await act(async()=>{vi.advanceTimersByTime(100);});
    const monitor=container.querySelector('.board-monitor')!;
    const points=()=>Array.from(monitor.querySelectorAll('polyline'),line=>line.getAttribute('points'));
    const raw=points();
    expect(raw).toHaveLength(2);
    expect(monitor.textContent).toContain('1,000 rows');
    const toggle=Array.from(monitor.querySelectorAll('label')).find(label=>label.textContent?.includes('50 Hz notch'))?.querySelector('input');
    expect(toggle).toBeDefined();
    await act(async()=>{toggle!.click();});
    expect(monitor.textContent).toContain('Filtered preview');
    expect(points()).not.toEqual(raw);
    await act(async()=>{toggle!.click();});
    expect(points()).toEqual(raw);
    expect(monitor.textContent).toContain('1,000 rows');
  }finally{Reflect.deleteProperty(navigator,'serial');}
});

it('auto-saves a complete board check with both grip intervals and reopens it after closing the monitor',async()=>{
  const device=mockSerialPort();
  const checks:BoardCheck[]=[];
  const save=vi.spyOn(boardCheckStore,'saveBoardCheck').mockImplementation(async check=>{checks.push(check);});
  vi.spyOn(boardCheckStore,'listBoardChecks').mockImplementation(async()=>checks.map(check=>check.summary));
  vi.spyOn(boardCheckStore,'readBoardCheck').mockImplementation(async id=>checks.find(check=>check.summary.id===id));
  try{
    vi.spyOn(window,'confirm').mockReturnValue(true);
    await act(async()=>{button('Connect board').click();});
    expect(button('Start guided check').disabled).toBe(true);
    const feed=()=>device.send('510,-8.16\n514,7.74\n');
    let stream:ReturnType<typeof setInterval>;
    await act(async()=>{device.send('111,-111\n');stream=setInterval(feed,100);await vi.advanceTimersByTimeAsync(100);});
    const guide=container.querySelector('[aria-label="Guided signal check"]')!;
    const cue=()=>guide.querySelector('h3')?.textContent;
    const advance=async(ms:number)=>{await act(async()=>{await vi.advanceTimersByTimeAsync(ms);});};
    await act(async()=>{button('Start guided check').click();});
    expect(cue()).toBe('Get ready');
    await advance(3000);
    expect(cue()).toBe('Relax your hand');
    expect(guide.querySelector('[role="timer"]')?.textContent).toBe('8seconds');
    await advance(8000);
    expect(cue()).toBe('Gently squeeze');
    await advance(4000);
    expect(cue()).toBe('Relax your hand');
    await advance(8000);
    expect(cue()).toBe('Gently squeeze');
    await advance(4000);
    expect(cue()).toBe('Relax your hand');
    await advance(8000);
    expect(cue()).toBe('Check complete');
    expect(container.querySelector('[aria-label="Saved board checks"]')).not.toBeNull();
    expect(container.querySelectorAll('[aria-label$="whole-check waveform"]')).toHaveLength(2);
    expect(container.textContent).toContain('Saved on this browser.');
    expect(save).toHaveBeenCalledOnce();
    const [check]=checks;
    const rows=check.batches.flatMap(batch=>batch.rows);
    expect(check.summary.rows).toBe(rows.length);
    expect(rows.length).toBeGreaterThan(250);
    expect(rows.every(row=>row.raw[0]===510||row.raw[0]===514)).toBe(true);
    expect(check.batches.every(batch=>batch.elapsedMs>=0&&batch.elapsedMs<35000)).toBe(true);
    expect(check.phases.filter(phase=>phase.action==='squeeze').map(phase=>[phase.start,phase.end])).toEqual([[11000,15000],[23000,27000]]);
    const csv=boardCheckCsv(check).trimEnd().split('\n');
    expect(csv).toHaveLength(rows.length+1);
    const squeezeRows=csv.filter(line=>line.includes(',squeeze,'));
    expect(squeezeRows[0]).toContain(',11000,15000,');
    expect(squeezeRows.at(-1)).toContain(',23000,27000,');
    await act(async()=>{button('Download check CSV').click();});
    expect(downloads).toEqual([expect.stringMatching(/^emg-board-check-.*\.csv$/)]);
    expect(loadResults()).toHaveLength(0);
    expect(container.textContent).not.toContain('Set my reference');
    await act(async()=>{button('Run again').click();clearInterval(stream);});
    await advance(1400);
    expect(cue()).toBe('Signal interrupted');
    expect(button('Restart check').disabled).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    await act(async()=>{button('Close board monitor').click();});
    await act(async()=>{button('Saved board checks').click();});
    expect(container.textContent).toContain('Disconnected');
    expect(container.querySelectorAll('[aria-label$="whole-check waveform"]')).toHaveLength(2);
    expect(container.querySelector('[aria-label="10-bit ADC rail check"]')?.textContent).toMatch(/0 \/ [0-9,]+ near limits \(0%\)/);
    expect(device.open).toHaveBeenCalledOnce();
  }finally{Reflect.deleteProperty(navigator,'serial');}
});

it('keeps a completed board check downloadable if automatic storage fails',async()=>{
  const device=mockSerialPort();
  vi.spyOn(boardCheckStore,'saveBoardCheck').mockRejectedValue(new Error('Quota exceeded'));
  vi.spyOn(boardCheckStore,'listBoardChecks').mockResolvedValue([]);
  let stream:ReturnType<typeof setInterval>|undefined;
  try{
    vi.spyOn(window,'confirm').mockReturnValue(true);
    await act(async()=>{button('Connect board').click();});
    const feed=()=>device.send('511,9.5\n511,8.2\n');
    await act(async()=>{feed();stream=setInterval(feed,100);await vi.advanceTimersByTimeAsync(100);});
    await act(async()=>{button('Start guided check').click();});
    await act(async()=>{await vi.advanceTimersByTimeAsync(35000);});
    expect(container.textContent).toContain('Automatic save failed');
    expect(container.querySelectorAll('[aria-label$="whole-check waveform"]')).toHaveLength(2);
    await act(async()=>{button('Download check CSV').click();});
    expect(downloads).toHaveLength(1);
  }finally{
    clearInterval(stream);
    Reflect.deleteProperty(navigator,'serial');
  }
});
