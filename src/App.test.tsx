// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import App from './App';
import {loadResults} from './records';
import {rawCsv} from './signal';

let root:Root,container:HTMLDivElement,downloads:string[];
function button(name:string|RegExp){
  const found=Array.from(container.querySelectorAll('button')).find(b=>typeof name==='string'?b.textContent===name:name.test(b.textContent??''));
  if(!found)throw new Error(`Button not found: ${name}`);
  return found;
}
beforeEach(async()=>{
  localStorage.clear();
  vi.useFakeTimers();vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.stubGlobal('URL',{createObjectURL:vi.fn(()=>'blob:test'),revokeObjectURL:vi.fn()});
  downloads=[];vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){downloads.push(this.download);});
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  await act(async()=>{root.render(<App/>);});
  await act(async()=>{button('Try simulation').click();});
  await act(async()=>{vi.advanceTimersByTime(1500);});
});
afterEach(async()=>{
  await act(async()=>{root.unmount();});container.remove();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();
});
it('downloads one selected file per click without relying on multiple-download permission',async()=>{
  await act(async()=>{button(/^Download (data|session JSON)$/).click();});
  expect(downloads).toHaveLength(1);expect(downloads[0]).toMatch(/-simulation-session\.json$/);
  await act(async()=>{button('Download raw CSV').click();});
  expect(downloads).toHaveLength(2);expect(downloads[1]).toMatch(/-simulation-raw\.csv$/);
});
it('still protects the recording from replacement after a download',async()=>{
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  await act(async()=>{button(/^Download (data|session JSON)$/).click();});
  await act(async()=>{vi.advanceTimersByTime(100);button('New simulation').click();});
  expect(confirm).toHaveBeenCalledOnce();
  expect(container.textContent).toContain('3,200 raw samples');
});
it('does not make the title a navigation that silently discards the recording',()=>{
  expect(container.querySelector('.brand')?.tagName).toBe('SPAN');
});
it('keeps the existing recording when serial input is unavailable',async()=>{
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  await act(async()=>{button('Connect device').click();});
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Chrome');
  expect(container.textContent).toContain('3,000 raw samples');expect(confirm).not.toHaveBeenCalled();
});
it('labels the completed session without showing a new first trial',async()=>{
  await act(async()=>{button('Set my reference').click();});
  await act(async()=>{vi.advanceTimersByTime(70000);});
  await act(async()=>{button('Start training').click();});
  await act(async()=>{vi.advanceTimersByTime(330000);});
  expect(container.textContent).toContain('30 of 30 trials completed');
  expect(container.querySelector('.panel-heading')?.textContent).toContain('Session complete');
  expect(loadResults()[0]).toMatchObject({state:'complete',originalSource:'simulation'});
  expect(loadResults()[0].results).toHaveLength(30);
  await act(async()=>{root.unmount();root=createRoot(container);root.render(<App/>);});
  await act(async()=>{button('View').click();});
  expect(container.querySelector('.saved-review')?.textContent).toContain('Read-only');
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
  await act(async()=>{button('Set my reference').click();vi.advanceTimersByTime(70000);});
  await act(async()=>{button('Collect 18 labelled trials').click();vi.advanceTimersByTime(120000);});
  expect(container.querySelector('.panel-heading')?.textContent).toContain('Test examples');
  expect(container.querySelector('.garden-panel')?.textContent).not.toContain('Target');
  expect(container.querySelector('.tools-grid dl')).toBeNull();
});
it('keeps downloadable results when automatic local saving fails',async()=>{
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError');});
  await act(async()=>{button('Set my reference').click();vi.advanceTimersByTime(70000);});
  await act(async()=>{button('Start training').click();vi.advanceTimersByTime(40000);});
  await act(async()=>{button('End session').click();});
  expect(container.textContent).toContain('Could not save');
  expect(button('Download session JSON').disabled).toBe(false);
});
it('does not restore a deleted earlier round when another round saves progress',async()=>{
  vi.spyOn(window,'confirm').mockReturnValue(true);
  await act(async()=>{button('Set my reference').click();vi.advanceTimersByTime(70000);});
  await act(async()=>{button('Start training').click();vi.advanceTimersByTime(40000);});
  await act(async()=>{button('End session').click();});
  const deletedId=loadResults()[0].id;
  await act(async()=>{button('Delete').click();});
  expect(loadResults()).toHaveLength(0);
  await act(async()=>{button('New session').click();vi.advanceTimersByTime(40000);});
  expect(loadResults().map(r=>r.number)).toEqual([2]);
  expect(loadResults().some(r=>r.id===deletedId)).toBe(false);
  await act(async()=>{button('End session').click();});
  expect(loadResults().map(r=>r.number)).toEqual([2]);
});
