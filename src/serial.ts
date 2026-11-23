import {parsePacket} from './signal';

export type RawPacket=ReturnType<typeof parsePacket>;
export type BoardRow=[first:number,second:number];
export const DEFAULT_EMG_BAUD=230400;
export const UNO_EMG_BAUD=250000;
export type EmgBaudRate=typeof DEFAULT_EMG_BAUD|typeof UNO_EMG_BAUD;

type Port={
  readable:ReadableStream<Uint8Array>|null;
  open:(options:{baudRate:number})=>Promise<void>;
  close:()=>Promise<void>;
};
type SerialNavigator=Navigator&{serial?:{requestPort:()=>Promise<Port>}};

const BOARD_ROW=/^([+-]?\d+)\s*,\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)$/i;
const MAX_LINE_LENGTH=100_000;

export function selectSerialPort(){
  const serial=(navigator as SerialNavigator).serial;
  if(!serial||!window.isSecureContext)throw new Error('Open the local website directly in Chrome to connect a serial device.');
  return serial.requestPort();
}

function parseBoardRow(line:string):BoardRow|null{
  const fields=BOARD_ROW.exec(line);
  if(!fields)return null;
  const first=Number(fields[1]),second=Number(fields[2]);
  return Number.isSafeInteger(first)&&Number.isFinite(second)?[first,second]:null;
}

async function readSerialLines(
  port:Port,
  baudRate:number,
  onLines:(lines:string[])=>void,
  onError:(message:string)=>void,
){
  await port.open({baudRate});
  let reader:ReadableStreamDefaultReader<Uint8Array>;
  try{
    if(!port.readable)throw new Error('The device has no readable serial stream.');
    reader=port.readable.getReader();
  }catch(error){
    await port.close().catch(()=>{});
    throw error;
  }

  let stopping=false;
  const finished=(async()=>{
    const decoder=new TextDecoder();
    let pending='';
    try{
      while(!stopping){
        const {value,done}=await reader.read();
        if(stopping||done)break;
        const lines=(pending+decoder.decode(value,{stream:true})).split('\n');
        pending=lines.pop()!;
        if(pending.length>MAX_LINE_LENGTH)throw new Error('Serial line is too long. Check firmware and baud rate.');
        if(lines.some(line=>line.length>MAX_LINE_LENGTH))throw new Error('Serial line is too long. Check firmware and baud rate.');
        const complete=lines.map(line=>line.trim()).filter(Boolean);
        if(complete.length)onLines(complete);
      }
      if(!stopping)onError('Serial device disconnected.');
    }catch(error){
      if(!stopping)onError((error as Error).message);
    }finally{
      reader.releaseLock();
      await port.close().catch(()=>{});
    }
  })();

  return {stop:async()=>{
    if(!stopping){
      stopping=true;
      await reader.cancel().catch(()=>{});
    }
    await finished;
  }};
}

export function connectSerial(
  port:Port,onPacket:(packet:RawPacket)=>void,onError:(message:string)=>void,baudRate:EmgBaudRate=DEFAULT_EMG_BAUD,
){
  let mayStartMidPacket=baudRate===UNO_EMG_BAUD;
  return readSerialLines(port,baudRate,lines=>{
    for(const line of lines){
      if(parseBoardRow(line)){
        throw new Error('Received legacy two-column data. Use the 2 kHz acquisition firmware for training.');
      }
      if(mayStartMidPacket){
        mayStartMidPacket=false;
        if(!line.startsWith('{'))continue;
      }
      if(line==='{"status":"reference_unset"}')throw new Error('Configure the measured ADC reference or update the Uno training firmware.');
      if(line.includes('"mode":"bench_counts"'))throw new Error('Bench firmware is running. Load the Uno training firmware.');
      let packet:RawPacket;
      try{packet=parsePacket(line);}
      catch{throw new Error('Incompatible EMG data. Check the acquisition firmware and reconnect.');}
      onPacket(packet);
    }
  },onError);
}

export function connectBoardSerial(port:Port,onBatch:(rows:BoardRow[],ignored:number)=>void,onError:(message:string)=>void){
  return readSerialLines(port,115200,lines=>{
    const rows:BoardRow[]=[];
    let ignored=0;
    for(const line of lines){
      const row=parseBoardRow(line);
      if(row)rows.push(row);
      else ignored++;
    }
    onBatch(rows,ignored);
  },onError);
}
