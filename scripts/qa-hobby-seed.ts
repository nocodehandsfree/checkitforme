// Seeds ONE Hobby chain + two card shops into the local throwaway DB so scripts/qa-hobby.mjs has a
// live type=Hobby feed (staging gets real data from the Data lane). Run once per fresh .t-p.db:
//   DATABASE_URL="file:$PWD/.t-p.db" tsx scripts/qa-hobby-seed.ts
import { db } from '../src/db/client';
import { chains, retailers } from '../src/db/schema';
import { eq } from 'drizzle-orm';
async function main(){
  await db.insert(chains).values([{ id: 900, name: 'QA Cards', type: 'Hobby', isMSRP: false } as any]).onConflictDoNothing();
  await db.update(chains).set({ type: 'Hobby', isMSRP: false }).where(eq(chains.id, 900));
  await db.insert(retailers).values([
    { name: 'QA Cards Calabasas', location: 'Calabasas, CA', address: '1 Card Way', lat: 34.15, lng: -118.63, active: true, phone: '+15550003333', chainId: 900, sellsPacks: true } as any,
    { name: 'QA Cards Woodland Hills', location: 'Woodland Hills, CA', address: '2 Card Way', lat: 34.16, lng: -118.60, active: true, phone: '+15550004444', chainId: 900, sellsPacks: true } as any,
  ]).onConflictDoNothing();
  console.log('hobby QA seed done');
  process.exit(0);
}
main();
