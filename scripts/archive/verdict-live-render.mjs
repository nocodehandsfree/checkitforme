// Render the REAL checkit.html result page with a mock result, so the verdict
// shows in true context (proof, actions, upsell, CTA). Captures:
//   1) current design (out)   2) redesign (out)   3) redesign (in, yellow product)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const OUT = '/tmp/comps';
mkdirSync(OUT, { recursive: true });
const SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const SRC = '/home/user/fungibles/voice-caller/public/checkit.html';

let html = readFileSync(SRC, 'utf8');

// ── substitute the deploy-time template placeholders so the app actually boots ──
const BRAND = { key:'poke', category:'Pokémon', name:'Check It For Me', short:'Pokémon',
                accent:'#4ADE80', accent2:'#A78BFA' };
const SWITCHER = { current:'poke', list:[{ key:'poke', slug:'pokemon', label:'Pokémon', emoji:'🃏' }] };
html = html
  .replace('__BRAND_JSON__', JSON.stringify(BRAND))
  .replace('__BRAND_SWITCHER__', JSON.stringify(SWITCHER))
  .replace('__BRAND_HEAD__', '<title>Check It For Me</title>')
  .replace('__BRAND_ART__', '')
  .replace('__BRAND_HEADLINE__', 'Find Pokémon cards, in stock.')
  .replace(/__CLERK_[A-Z_]+__/g, '');
// drop the external Clerk bundle so nothing hangs offline
html = html.replace(/<script\b[^>]*src="https:\/\/[^"]*clerk[^"]*"[^>]*>\s*<\/script>/gi, '<!-- clerk stripped -->');

const MOCK_TRANSCRIPT =
  "Agent: Hi! Quick question — do you have any Pokémon trading cards in stock right now?\n" +
  "Clerk: Let me check for you… we just sold through the latest batch, so not at the moment.\n" +
  "Agent: No worries — do you know when the next shipment lands?\n" +
  "Clerk: Usually Tuesdays, but I can't promise anything.";

const MOCK_OUT = JSON.stringify({ status:'completed', confirmed:false, ts: Date.now()-2*60*1000, durationSec:124,
  summary:"Reached the info desk. They're sold out of Pokémon cards at the moment; the next shipment usually lands Tuesday.",
  transcript:
    "Clerk: Thank you for calling. For pharmacy press 1. Para español, marque dos.\n" +
    "Clerk: Good evening, thanks for calling — how can I help you?\n" +
    "Agent: Hi! Quick question — do you have any Pokémon trading cards in stock right now?\n" +
    "Clerk: Let me check for you… we just sold through the latest batch, so not at the moment.\n" +
    "Agent: No worries — do you know when the next shipment lands?\n" +
    "Clerk: Usually Tuesdays, but I can't promise anything." });

const MOCK_IN = JSON.stringify({ status:'completed', confirmed:true, productName:'3-pack blister', ts: Date.now()-78*1000, durationSec:78,
  summary:"Reached the info desk. They have Pokémon 3-pack blisters in stock on the shelf right now.",
  transcript:
    "Clerk: Thanks for calling, how can I help?\n" +
    "Agent: Hi! Do you have any Pokémon trading cards in stock?\n" +
    "Clerk: We do — we just got the 3-pack blisters in, they're on the shelf by the registers." });

// Spanish conversation → Translate button SHOULD appear (the whole convo is foreign).
const MOCK_ES = JSON.stringify({ status:'completed', confirmed:false, ts: Date.now()-3*60*1000, durationSec:96,
  summary:"Reached the desk; they're out of Pokémon cards right now.",
  transcript:
    "Clerk: Gracias por llamar, ¿en qué le puedo ayudar?\n" +
    "Agent: Hi! Do you have any Pokémon trading cards in stock?\n" +
    "Clerk: No, ahorita no tenemos esas tarjetas, disculpe. Quizás la próxima semana." });

const bootScript = (state) => `
<script>
(function(){
  function ready(cb){
    if(typeof showResult==='function' && document.readyState!=='loading'){ setTimeout(cb,150); }
    else { setTimeout(()=>ready(cb), 50); }
  }
  ready(function(){
    try{
      // neutralise network / secondary renderers (these are top-level function decls → reassignable)
      isAuthed = function(){ return true; };
      renderCallRail = function(){};
      ensureHistCache = function(){ return Promise.resolve(); };

      // mock state — bare assignments hit the app's real top-level \`let\` bindings
      var CVS_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='66' height='66'%3E%3Crect width='66' height='66' fill='%23CC0000'/%3E%3Ctext x='33' y='41' font-family='Arial,sans-serif' font-weight='bold' font-style='italic' font-size='21' fill='white' text-anchor='middle'%3ECVS%3C/text%3E%3C/svg%3E";
      STORES = [{ id:'cvs1', name:'CVS — Agoura Hills', location:'5125 Kanan Rd, Agoura Hills, CA', logoUrl: CVS_LOGO }];
      SEL_STORE = STORES[0];
      CATS = [{ id:'pkmn', label:'Pokémon' }];
      SEL_CAT = 'pkmn'; SEL_CATS = []; ASKED_CATS = [];

      // header dressing so it reads like live
      var vt = document.getElementById('vsw_trig');
      if(vt) vt.innerHTML = '<span style="width:18px;height:18px;border-radius:50%;display:inline-block;background:linear-gradient(#EE1515 0 50%,#fff 50% 100%);box-shadow:inset 0 0 0 1.5px #0C0C12"></span><span class="vsw-name">Pokémon</span><span style="opacity:.45;font-size:11px">▾</span>';
      var cn = document.getElementById('creditN'); if(cn) cn.textContent = 'You';

      if('${state}'==='live'){
        document.getElementById('builder').classList.add('hidden');
        document.getElementById('live').classList.remove('hidden');
        renderLiveStore();
        document.getElementById('phase').textContent = 'On the line for you';
        document.getElementById('elapsed').textContent = '· 0:08';
        return;
      }
      var MOCK = { in:${MOCK_IN}, es:${MOCK_ES}, out:${MOCK_OUT} };
      showResult(MOCK['${state}'] || MOCK.out, 'mockcid');
    }catch(e){ document.body.innerHTML = '<pre style="color:#f55;padding:20px;font:13px monospace">'+e.stack+'</pre>'; }
  });
})();
</script>`;

function render(name, state, height) {
  const page = html.replace('</body>', bootScript(state) + '\n</body>');
  const f = `${OUT}/live-${name}.html`;
  writeFileSync(f, page);
  execFileSync(SHELL, ['--headless','--no-sandbox','--hide-scrollbars','--force-device-scale-factor=2',
    '--virtual-time-budget=2500','--default-background-color=ff0C0C12',
    `--window-size=440,${height}`,
    `--screenshot=${OUT}/live-${name}.png`, `file://${f}`], { stdio:'pipe' });
  console.log('rendered', name);
}

render('v2-live', 'live', 900);
render('v2-out', 'out', 1700);
render('v2-in', 'in', 1500);
render('v2-es', 'es', 1700);
