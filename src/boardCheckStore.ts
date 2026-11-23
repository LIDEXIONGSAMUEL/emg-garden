import type {BoardCheck,BoardCheckSummary} from './boardCheck';

const DB_NAME='emg-garden-board-checks';
const CHECKS='checks';
const SUMMARIES='summaries';

async function openDatabase(){
  return new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      db.createObjectStore(CHECKS,{keyPath:'summary.id'});
      db.createObjectStore(SUMMARIES,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function transact<T>(mode:IDBTransactionMode,operation:(transaction:IDBTransaction)=>IDBRequest<T>){
  const db=await openDatabase();
  try{
    return await new Promise<T>((resolve,reject)=>{
      const transaction=db.transaction([CHECKS,SUMMARIES],mode);
      const request=operation(transaction);
      transaction.oncomplete=()=>resolve(request.result);
      transaction.onabort=()=>reject(transaction.error??new Error('Board check storage was interrupted.'));
    });
  }finally{db.close();}
}

export async function saveBoardCheck(check:BoardCheck){
  await transact('readwrite',transaction=>{
    transaction.objectStore(SUMMARIES).add(check.summary);
    return transaction.objectStore(CHECKS).add(check);
  });
}

export async function listBoardChecks():Promise<BoardCheckSummary[]>{
  const summaries=await transact('readonly',transaction=>transaction.objectStore(SUMMARIES).getAll());
  return summaries.sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
}

export async function readBoardCheck(id:string):Promise<BoardCheck|undefined>{
  return transact('readonly',transaction=>transaction.objectStore(CHECKS).get(id));
}
