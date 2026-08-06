// HOW CLOSE IS THE RECORD'S CLOCK TO WHAT REALLY HAPPENED, AND HOW MUCH NEVER GOT WRITTEN DOWN.
//
// The store that answers itself keeps its own note of every line it said and the second it said it,
// counted from the moment it picked up. Our record counts from the moment the check was placed, and
// it knows when the line was answered, so the two clocks lay over each other and every line we wrote
// down can be compared with the truth. Nothing here is judged by eye.
//
// THIS IS THE BEFORE AND AFTER for anything that touches what a check hears (owner 08-06): run the
// same scene, run this, compare. It is how the spoken lines were measured from 3.3 seconds late, and
// 6.1 seconds late after a hold, down to about a second.
//
// Run:  ADMIN_TOKEN=… node scripts/timing-truth.mjs <room>
//       ADMIN_TOKEN=… node scripts/timing-truth.mjs            (the newest check)
const HOST = process.env.CHECK_HOST || 'https://staging.checkitforme.com';
const TOKEN = process.env.ADMIN_TOKEN || '';
if (!TOKEN) { console.error('No ADMIN_TOKEN. Pull it from Railway (CLAUDE.md has the curl).'); process.exit(2); }
const get = async (p) => {
  const r = await fetch(HOST + p, { headers: { 'x-admin-token': TOKEN, 'User-Agent': 'Mozilla/5.0 (iPhone)' } });
  if (!r.ok) throw new Error(p + ' → ' + r.status);
  return r.json();
};
// With no room given, the newest check on the Testing list, which is the one just dialed.
const room = process.argv[2] || (await get('/api/admin/test-calls?limit=1')).rows?.[0]?.room;
if (!room) { console.error('no check to read'); process.exit(1); }
const rec = await get('/api/admin/receipt/' + encodeURIComponent(room));
const robot = await get('/api/admin/robot-store');
const run = robot.run;
// The store's own note lives in memory on the staging service, so a deploy or a restart between the
// check and this read wipes it. Nothing is broken; the comparison just cannot be made any more.
if (!run) { console.error('the store that answers itself kept no note of that call any more (it only holds the last few, and a restart clears them). Dial the scene again and run this straight after.'); process.exit(1); }

// The two zeros: ours is the dial, the robot's is the moment it picked up. Our own record says when
// the line was answered, and that is the same instant the robot started counting.
const answered = (rec.timeline.find((e) => e.kind === 'connected') || {}).atMs;
if (answered == null) { console.error('this check has no answer moment on it'); process.exit(1); }
console.log(`  the robot picked up ${(answered / 1000).toFixed(2)}s into the check · scene ${run.scenario} "${run.sceneName}"`);
console.log('');
console.log('  what the robot said              said at    written at   out by');
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const lines = rec.lines.filter((l) => l.who === 'Clerk');
const used = new Set();
let worst = 0, matched = 0;
for (const said of [{ text: run.greeting, atSec: 0 }, ...run.said]) {
  const trueMs = answered + said.atSec * 1000;
  // Match on the words, never on the clock: matching by time would prove itself.
  // The transcriber mangles words ("No, I'm sorry. I haven't seen any yet." came back as "Sorry, I
  // haven't seen any yet."), so a line counts as the same line when most of its words survived.
  let hit = -1, best = 0;
  const want = norm(said.text).split(' ').filter((w) => w.length > 2);
  lines.forEach((l, i) => { if (used.has(i)) return;
    const got = new Set(norm(l.text).split(' '));
    const share = want.length ? want.filter((w) => got.has(w)).length / want.length : 0;
    if (share > best && share >= 0.5) { best = share; hit = i; } });
  const w = said.text.length > 30 ? said.text.slice(0, 29) + '…' : said.text;
  if (hit < 0) { console.log(`  ${w.padEnd(32)} ${(trueMs / 1000).toFixed(1)}s     never written down`); continue; }
  used.add(hit);
  const off = (lines[hit].atMs - trueMs) / 1000;
  worst = Math.max(worst, Math.abs(off)); matched++;
  console.log(`  ${w.padEnd(32)} ${(trueMs / 1000).toFixed(1).padStart(6)}s ${(lines[hit].atMs / 1000).toFixed(1).padStart(11)}s ${(off > 0 ? '+' : '') + off.toFixed(1)}s`);
}
console.log('');
console.log(`  ${matched} of the robot's lines were written down · the worst one is ${worst.toFixed(1)}s out`);
// And the one the owner reads first: nothing said can be written before the phone was picked up.
const early = rec.lines.filter((l) => l.atMs != null && l.atMs < answered);
console.log(early.length
  ? `  ✗ ${early.length} line(s) written down BEFORE the line was answered: ` + early.map((l) => `"${l.text.slice(0, 24)}" at ${(l.atMs / 1000).toFixed(1)}s`).join(' · ')
  : '  ✓ nothing was written down before the line was answered');
