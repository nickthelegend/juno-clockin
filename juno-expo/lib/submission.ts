import { Buffer } from 'buffer';
import { Connection, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { createReceiptJournal } from './pendingReceipt';
import type { WalletState } from './wallet';
const KEY='juno.pending.receipt.v2';
const journal=createReceiptJournal({get:async()=>(await import('expo-secure-store')).getItemAsync(KEY),set:async value=>(await import('expo-secure-store')).setItemAsync(KEY,value),clear:async()=>(await import('expo-secure-store')).deleteItemAsync(KEY)});
/** Signing-only wallet callback; this function owns the sole broadcast invocation. */
export async function submitWithReceipt(wallet: WalletState, unsigned: string, connection: Connection, broadcast:(signed:string)=>Promise<string>, callbacks:{onSignature?:(signature:string)=>Promise<void>;onIntent?:()=>Promise<void>;onNoBroadcast?:()=>Promise<void>}={}):Promise<string> {
  if (!wallet.address) throw new Error('Connect a wallet first');
  const owner=wallet.address;
  return journal.run(connection.rpcEndpoint,owner,async signature=>{
    const {value}=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true});return value[0]??null;
  },async(save,control)=>{
    try {
      await callbacks.onIntent?.();
      const transaction=Transaction.from(Buffer.from(unsigned,'base64'));
      if (transaction.feePayer?.toBase58()!==owner) throw new Error('Transaction fee payer differs from the connected wallet.');
      const originalMessage=transaction.serializeMessage();
      const signed=await wallet.sign(unsigned);
      const parsed=Transaction.from(Buffer.from(signed,'base64'));
      if (!parsed.serializeMessage().equals(originalMessage) || parsed.feePayer?.toBase58()!==owner || !parsed.signature || !parsed.verifySignatures()) throw new Error('Wallet signed a different or invalid transaction. Submission blocked.');
      const original=bs58.encode(parsed.signature);
      await save(original);
      await callbacks.onSignature?.(original);
      control.beginBroadcast();
      const returned=await broadcast(signed);
      await save(returned);
      const {value}=await connection.getSignatureStatuses([original],{searchTransactionHistory:true});
      const receipt=value[0];
      if (!receipt || !Object.prototype.hasOwnProperty.call(receipt,'err') || !['confirmed','finalized'].includes(receipt.confirmationStatus??'')) throw new Error(`Transaction outcome remains unknown (${original}). Check the same receipt; do not retry.`);
      if (receipt.err!==null) throw new Error(`Transaction failed (${original}). Review the confirmed receipt.`);
      return original;
    } catch(error) { if(await control.abortBeforeBroadcast())await callbacks.onNoBroadcast?.();throw error; }
  });
}
