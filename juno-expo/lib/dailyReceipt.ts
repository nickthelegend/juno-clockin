import bs58 from 'bs58';
import type { Receipt, JournalStore } from './pendingReceipt';
/** Public daily memo receipt only; never a reward proof or signer secret. */
export function createDailyReceipt(store:JournalStore,scope:string,owner:string,day:string) {
  let expected:string|null=null;
  const read=async()=>{
    const raw=await store.get();if(raw===null)return null;
    try {const r=JSON.parse(raw);if(r.version!==1||r.scope!==scope||r.owner!==owner||r.day!==day||(r.signature!==null&&(typeof r.signature!=='string'||bs58.decode(r.signature).length!==64)))throw new Error();return r as {signature:string|null};}
    catch {throw new Error('Saved daily clock-in is unreadable or belongs to another network. Review wallet history; no replacement was submitted.');}
  };
  const write=async(signature:string|null)=>{const value=JSON.stringify({version:1,scope,owner,day,signature});await store.set(value);if(await store.get()!==value)throw new Error('Daily clock-in receipt was not saved reliably. Submission blocked.');expected=value;};
  return {
    async check(status:(signature:string)=>Promise<Receipt>) {
      const original=await store.get();const prior=await read();if(!prior)return;
      if(!prior.signature)throw new Error('Previous daily clock-in was interrupted before its signature was saved. Review wallet history; retry is disabled.');
      const receipt=await status(prior.signature);
      if(!receipt||!Object.prototype.hasOwnProperty.call(receipt,'err')||!['confirmed','finalized'].includes(receipt.confirmationStatus??''))throw new Error(`Previous daily clock-in remains unknown (${prior.signature}). Check the original receipt.`);
      if(receipt.err===null)throw new Error(`Already clocked in today (${prior.signature}). Refresh on-chain history; no additional reward is assumed.`);
      if(await store.get()!==original)throw new Error('Daily receipt changed during recovery.');await store.clear();if(await store.get()!==null)throw new Error('Failed daily receipt could not be cleared reliably.');
    },
    async prepare(){if(await store.get()!==null)throw new Error('Daily clock-in receipt already exists.');await write(null);},
    async save(signature:string){if(bs58.decode(signature).length!==64)throw new Error('Invalid daily signature.');const prior=await read();if(!prior||await store.get()!==expected||(prior.signature!==null&&prior.signature!==signature))throw new Error('Daily original signature changed. Retry blocked.');await write(signature);},
    async abort(){if(expected===null)return;if(await store.get()!==expected)throw new Error('Daily receipt changed before cleanup.');await store.clear();if(await store.get()!==null)throw new Error('Daily receipt cleanup failed.');},
  };
}
