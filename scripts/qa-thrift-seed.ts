// Seeds ONE Thrift chain + two thrift shops into the local throwaway DB so scripts/qa-thrift.mjs has a
// live type=Thrift feed (staging/prod get real thrift chains once Admin types them). Run once per fresh
// .t-p.db:  DATABASE_URL="file:$PWD/.t-p.db" tsx scripts/qa-thrift-seed.ts
import { db } from '../src/db/client';
import { chains, retailers } from '../src/db/schema';
import { eq } from 'drizzle-orm';
async function main(){
  await db.insert(chains).values([{ id: 901, name: 'QA Thrift', type: 'Thrift', isMSRP: false } as any]).onConflictDoNothing();
  await db.update(chains).set({ type: 'Thrift', isMSRP: false }).where(eq(chains.id, 901));
  await db.insert(retailers).values([
    { name: 'QA Thrift Calabasas', location: 'Calabasas, CA', address: '9 Thrift Rd', lat: 34.15, lng: -118.63, active: true, phone: '+15550005555', chainId: 901, sellsPacks: true } as any,
    { name: 'QA Thrift Tarzana', location: 'Tarzana, CA', address: '8 Thrift Rd', lat: 34.17, lng: -118.55, active: true, phone: '+15550006666', chainId: 901, sellsPacks: true } as any,
  ]).onConflictDoNothing();
  console.log('thrift QA seed done');
  process.exit(0);
}
main();
