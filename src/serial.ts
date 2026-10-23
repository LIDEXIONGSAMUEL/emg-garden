import {parsePacket} from './signal';
export type RawPacket=ReturnType<typeof parsePacket>;
type Port={readable:ReadableStream<Uint8Array>|null;open:(options:{baudRate:number})=>Promise<void>;close:()=>Promise<void>};
type SerialNavigator=Navigator&{serial?:{requestPort:()=>Promise<Port>}};
export function serialSupported(){return !!(navigator as SerialNavigator).serial&&window.isSecureContext;}
export async function connectSerial(onPacket:(p:RawPacket)=>void,onError:(message:string)=>void){
  const api=(navigator as SerialNavigator).serial;
  if(!api||!window.isSecureContext)throw new Error('Use Chrome on localhost or HTTPS to connect an EMG device.');
  const port=await api.requestPort();await port.open({baudRate:230400});
  if(!port.readable){await port.close();throw new Error('The device has no readable serial stream.');}
  const reader=port.readable.getReader();let stopping=false;
  const finished=(async()=>{
    const decoder=new TextDecoder();let buffer='';
    try{
      while(!stopping){
        const {value,done}=await reader.read();if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        if(buffer.length>100000)throw new Error('Serial packet is too long. Check firmware and baud rate.');
        let newline:number;
        while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);if(line)onPacket(parsePacket(line));}
      }
      if(!stopping)onError('EMG device disconnected. Completed results are retained.');
    }catch(e){if(!stopping)onError((e as Error).message);}
    finally{reader.releaseLock();await port.close().catch(()=>{});}
  })();
  return {stop:async()=>{stopping=true;await reader.cancel().catch(()=>{});await finished;}};
}
