import {test} from 'vitest';
import {strict as assert} from 'node:assert';
import bs58 from 'bs58';
import {createDailyReceipt} from '../lib/dailyReceipt';
const sig=bs58.encode(new Uint8Array(64).fill(1));
function setup(){let raw:string|null=null;const store={get:async()=>raw,set:async(v:string)=>{raw=v;},clear:async()=>{raw=null;}};return{store,daily:createDailyReceipt(store,'https://api.devnet.solana.com','public-owner-test','2026-10-09')};}
test('daily no-hash interruption blocks another daily memo after reload',async()=>{const{store,daily}=setup();await daily.prepare();const restored=createDailyReceipt(store,'https://api.devnet.solana.com','public-owner-test','2026-10-09');await assert.rejects(()=>restored.check(async()=>{throw new Error('must not query unknown hash');}),/interrupted/);});
test('processed daily error cannot permit another submission',async()=>{const{daily}=setup();await daily.prepare();await daily.save(sig);await assert.rejects(()=>daily.check(async()=>({err:{InstructionError:[0,'failure']},confirmationStatus:'processed'})),/unknown/);});
test('daily unknown or unavailable provider preserves original hash',async()=>{const{store,daily}=setup();await daily.prepare();await daily.save(sig);await assert.rejects(()=>daily.check(async()=>null),/unknown/);await assert.rejects(()=>daily.check(async()=>{throw new Error('RPC unavailable');}));assert.ok((await store.get())!.includes(sig));});
test('different daily signature never overwrites original',async()=>{const{daily}=setup();await daily.prepare();await daily.save(sig);await assert.rejects(()=>daily.save(bs58.encode(new Uint8Array(64).fill(2))),/changed/);});
test('lost daily write blocks preparation',async()=>{const{store}=setup();store.set=async()=>{};const daily=createDailyReceipt(store,'https://api.devnet.solana.com','public-owner-test','2026-10-09');await assert.rejects(()=>daily.prepare(),/not saved/);});
test('corrupt and wrong-network daily records fail closed',async()=>{const{store,daily}=setup();await store.set('{broken');await assert.rejects(()=>daily.check(async()=>null),/unreadable/);await store.clear();await daily.prepare();const other=createDailyReceipt(store,'https://other.invalid','public-owner-test','2026-10-09');await assert.rejects(()=>other.check(async()=>null),/another network/);});
test('pre-broadcast cleanup requires unchanged retained daily record',async()=>{const{store,daily}=setup();await daily.prepare();await store.set('changed');await assert.rejects(()=>daily.abort(),/changed/);});
