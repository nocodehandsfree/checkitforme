// The logo wall (every chain's artwork as a customer sees it), the logo files themselves, the
// check-lab preview page, and chain logo uploads. The wall is the record of what each site serves.

import type { Hono } from "hono";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cachedChains } from "../refcache";
import { adminOk, chainLogoInfo, esc, here, withLogo } from "./shared-helpers";

// ---- Chain logo upload + migration (logo-r2-keystone spec, git history) ----
// Read the artwork's own width and height straight out of the bytes — no image library. PNG carries
// them in the IHDR chunk at a fixed offset; SVG in its width/height or viewBox. That is all the size
// rule needs, and reading it here means it is worked out ONCE, at upload, never at serve time.
export function artworkSize(bytes: Uint8Array, ext: string): { w: number; h: number } | null {
  if (ext === "png" && bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  if (ext === "svg") {
    const head = new TextDecoder().decode(bytes.slice(0, 2048));
    const vb = head.match(/viewBox\s*=\s*"([-\d.eE+\s]+)"/);
    if (vb) { const p = vb[1].trim().split(/[\s,]+/).map(Number); if (p.length === 4 && p[2] > 0 && p[3] > 0) return { w: p[2], h: p[3] }; }
    const w = head.match(/\swidth\s*=\s*"([\d.]+)/), h = head.match(/\sheight\s*=\s*"([\d.]+)/);
    if (w && h && +w[1] > 0 && +h[1] > 0) return { w: +w[1], h: +h[1] };
  }
  return null; // webp and anything unreadable: the caller falls back to fit-inside
}

export function register(app: Hono) {
  app.get("/logo-wall", async (c) => {
    if (!(await adminOk(c))) return c.notFound(); // private: not a public page
    // THE RECORD OF TRUTH (site RULES 6). The wall walks the chain rows and renders exactly what
    // every store list renders — same address, same flags, same size — so it cannot show a customer
    // one thing and the site another. It never reads the artwork shipped inside the app.
    const rows = (await cachedChains())
      .map((ch) => ({ ch, l: chainLogoInfo(ch.name) }))
      .filter((x) => !!x.l.url)
      .sort((a, b) => a.ch.name.replace(/^_/, "").localeCompare(b.ch.name.replace(/^_/, "")));
    const types = [...new Set(rows.map((x) => (x.ch.type || "").trim() || "Other"))]
      .sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
    // Render treatments: every logo resolves to exactly one, from the chain row's own flags.
    const treatKey = (wide: boolean, dark: boolean) => (wide && dark ? "both" : wide ? "wide" : dark ? "plate" : "std");
    const TREAT: Array<{ k: string; label: string }> = [
      { k: "std", label: "Standard" }, { k: "wide", label: "Wide" },
      { k: "plate", label: "Plated" }, { k: "both", label: "Wide + Plated" },
    ];
    const tCount: Record<string, number> = { std: 0, wide: 0, plate: 0, both: 0 };
    for (const x of rows) tCount[treatKey(x.l.wide, x.l.dark)]++;
    const tile = (x: { ch: { name: string; type: string | null }; l: { url: string | null; wide: boolean; dark: boolean; pct: number | null } }) => {
      const cls = (x.l.dark ? " lite" : "") + (x.l.wide ? " widelogo" : "");
      const style = x.l.pct != null ? ` style="width:${x.l.pct}%;height:auto;max-width:none;max-height:none"` : "";
      return `<div class="cell" data-type="${esc((x.ch.type || "").trim() || "Other")}" data-treat="${treatKey(x.l.wide, x.l.dark)}"><div class="ic${cls}"><img src="${esc(x.l.url || "")}" alt=""${style}></div><div class="nm">${esc(x.ch.name)}</div></div>`;
    };
    // ── Pokémon set & era logos — same repo/logo-wall system as chains, but shown BIG (owner 2026-07-03:
    //    "take up the box, be the main attraction"): these are wordmark logos, not 52px store marks.
    //    Grouped by era; a set with no logo file yet shows a striped gap so the wall reveals what's missing.
    const listPng = (dir: string) => { try { return new Set(readdirSync(join(here, dir)).filter((f) => /\.png$/i.test(f))); } catch { return new Set<string>(); } };
    const setLogoFiles = listPng("../public/logos/pokemon/sets"), eraLogoFiles = listPng("../public/logos/pokemon/eras"), bannerFiles = listPng("../public/logos/pokemon/banners");
    const pslug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let pokeEras: Array<{ era: string; slug: string; hasEra: boolean; sets: Array<{ code: string; name: string; key: string; has: boolean; banner: boolean }> }> = [];
    try {
      const pj = JSON.parse(readFileSync(join(here, "../data/pokemon-sets.json"), "utf8")) as { eras: Array<{ era: string; sets: Array<{ code: string; name?: string }> }> };
      pokeEras = pj.eras.map((e) => ({ era: e.era, slug: pslug(e.era), hasEra: eraLogoFiles.has(pslug(e.era) + ".png"),
        sets: e.sets.map((s) => { const key = pslug(String(s.code)); return { code: String(s.code), name: String(s.name || ""), key, has: setLogoFiles.has(key + ".png"), banner: bannerFiles.has(key + ".png") }; }) }));
    } catch { /* no data file → section stays empty */ }
    const pokeSetCount = pokeEras.reduce((n, e) => n + e.sets.filter((s) => s.has).length, 0);
    const pokeSection = pokeEras.length ? `
  <div id="pokeArea" hidden>
    <h2>Pokémon set tiles · ${pokeSetCount} sets</h2>
    <div class="sub">The exact composite the hobby wall renders — set art (<code>/logos/pokemon/banners</code>) with the set logo (<code>/logos/pokemon/sets</code>) raised on top, area-normalized. Grouped by era.</div>
    ${pokeEras.map((e) => `
    <div class="pera">${e.hasEra ? `<img src="/logos/pokemon/eras/${e.slug}.png?v=73" alt="">` : ""}<span class="en">${esc(e.era)}</span><span class="ec">${e.sets.filter((s) => s.has).length}/${e.sets.length}</span></div>
    <div class="pgrid">${e.sets.map((s) => s.has
      ? `<div class="pset"><div class="ptile">${s.banner ? `<img class="pbg" src="/logos/pokemon/banners/${s.key}.png?v=73" alt="">` : ""}<img class="plogo" src="/logos/pokemon/sets/${s.key}.png?v=73" alt="" onload="pnorm(this)"></div><div class="pnm">${esc(s.code)}<span>${esc(s.name)}</span></div></div>`
      : `<div class="pset"><div class="ptile pmiss"><span class="pcode">${esc(s.code)}</span></div><div class="pnm" style="opacity:.5">${esc(s.code)}<span>no logo yet</span></div></div>`).join("")}</div>`).join("")}
  </div>` : "";
    return c.html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    *{box-sizing:border-box}
    body{background:#0C0C12;font-family:-apple-system,system-ui,sans-serif;color:#fff;padding:20px;margin:0}
    h2{font-weight:900;margin:0 0 4px}
    .sub{color:#9a9aac;font-size:12px;margin-bottom:6px}
    .bar{position:sticky;top:0;background:#0C0C12;padding:12px 0 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;z-index:5;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:18px}
    .fld{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a8a98;display:flex;align-items:center;gap:8px;font-weight:700}
    select,.ms-btn{appearance:none;-webkit-appearance:none;background:#1a1a22;color:#fff;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:9px 32px 9px 12px;font-size:14px;font-weight:600;cursor:pointer;text-transform:none;letter-spacing:normal}
    select{background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23aaa' stroke-width='2'%3E%3Cpath d='M2 4l4 4 4-4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 11px center}
    .ms{position:relative}
    .ms-btn{display:flex;align-items:center;gap:8px;padding-right:12px}
    .ms-btn .chev{opacity:.7}
    .ms-pop{position:absolute;top:calc(100% + 6px);left:0;background:#16161e;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:6px;min-width:230px;box-shadow:0 14px 34px rgba(0,0,0,.55);z-index:30}
    .ms-pop[hidden]{display:none}
    .ms-row{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;text-transform:none;letter-spacing:normal;color:#e6e6ee}
    .ms-row:hover{background:rgba(255,255,255,.06)}
    .ms-row input{width:17px;height:17px;accent-color:#22c55e;cursor:pointer;margin:0;flex-shrink:0}
    .ms-ct{margin-left:auto;font-size:12px;color:#8a8a98;font-weight:600}
    #count{font-size:12px;color:#8a8a98;margin-left:auto}
    .grid{display:flex;flex-wrap:wrap;gap:18px}
    .cell{width:72px;display:flex;flex-direction:column;align-items:center;gap:7px}
    .cell.hide{display:none}
    .nm{font-size:10px;color:#9a9aac;text-align:center;line-height:1.25;overflow-wrap:anywhere}
    /* —— EXACT copy of the consumer store-list tile (.ic) from checkit.html —— */
    .ic{width:46px;height:46px;border-radius:12px;background:#1F1F25;box-shadow:inset 0 1px 0 rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .ic img{max-width:78%;max-height:78%;width:auto;height:auto;object-fit:contain}/* fallback only: a real logo carries its own width inline */
    .ic.widelogo img{max-width:92%;max-height:64%}
    .ic.lite{background:#f2f2f5;border-color:rgba(255,255,255,.28)}
    /* —— tabs: Store logos | Pokémon sets (separate areas on this private wall) —— */
    .tabs{display:flex;gap:8px;margin-bottom:16px}
    .tab{appearance:none;background:#1a1a22;color:#c7c7d4;border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer}
    .tab.on{background:#4ADE80;color:#06210f;border-color:transparent}
    /* —— Pokémon set tiles — composited: set art + logo raised on top (exactly like the hobby wall) —— */
    .pera{display:flex;align-items:center;gap:13px;margin:26px 0 14px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08)}
    .pera img{height:38px;width:auto;filter:drop-shadow(0 4px 8px rgba(0,0,0,.5))}
    .pera .en{font-size:13px;font-weight:800;letter-spacing:.03em;color:#c7c7d4}
    .pera .ec{margin-left:auto;font-size:12px;color:#8a8a98;font-variant-numeric:tabular-nums}
    .pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:16px}
    .pset{display:flex;flex-direction:column;gap:8px}
    .ptile{position:relative;aspect-ratio:1/1;border-radius:16px;overflow:hidden;background:#1b1b20;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 6px 14px -6px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.05)}
    .ptile .pbg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(.6)}
    .ptile .plogo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:82%;height:auto;filter:drop-shadow(0 5px 8px rgba(0,0,0,.6))}
    .ptile.pmiss{background:repeating-linear-gradient(45deg,#2B2B33 0 12px,#25252C 12px 24px);display:grid;place-items:center}
    .pcode{font-size:12px;color:#8a8a98;font-weight:800}
    .pnm{font-size:11px;color:#c7c7d4;text-align:center;font-weight:700;line-height:1.3}
    .pnm span{display:block;color:#8a8a98;font-weight:500;font-size:10px;overflow-wrap:anywhere}
  </style>
  <script>
    // Area-normalized logo sizing (equal visual footprint, filling the tile) — matches the hobby wall.
    // Defined before <body> so img onload always resolves it.
    function pnorm(img){var box=img.parentElement;if(!box)return;var W=box.clientWidth,H=box.clientHeight;if(!W||!H){requestAnimationFrame(function(){pnorm(img);});return;}var nw=img.naturalWidth,nh=img.naturalHeight;if(!nw||!nh)return;var tA=0.40*W*H,mW=0.92*W,mH=0.74*H,sc=Math.sqrt(tA/(nw*nh));if(nw*sc>mW)sc=mW/nw;if(nh*sc>mH)sc=mH/nh;img.style.width=(100*nw*sc/W)+'%';}
  </script>
  <body>
  <div class="tabs"><button class="tab on" data-area="storeArea">Store logos · ${rows.length}</button><button class="tab" data-area="pokeArea">Pokémon sets · ${pokeSetCount}</button></div>
  <div id="storeArea">
  <h2>Logo wall · ${rows.length} marks</h2>
  <div class="sub">Every chain that has a logo, drawn from the SAME address, flags and size the store list uses. If a mark looks wrong here it is wrong on the site.</div>
  <div class="bar">
    <label class="fld">Store type
      <select id="type"><option value="">All stores</option>${types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>
    </label>
    <span class="fld">Treatment
      <span class="ms">
        <button type="button" class="ms-btn" id="treatBtn" aria-expanded="false"><span id="treatSum">All treatments</span><svg class="chev" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#aaa" stroke-width="2"><path d="M2 4l4 4 4-4"/></svg></button>
        <div class="ms-pop" id="treatPop" hidden>${TREAT.map((t) => `<label class="ms-row"><input type="checkbox" value="${t.k}" checked>${t.label}<span class="ms-ct">${tCount[t.k]}</span></label>`).join("")}</div>
      </span>
    </span>
    <span id="count"></span>
  </div>
  <div class="grid" id="grid">${rows.map(tile).join("")}</div>
  </div>
  ${pokeSection}
  <script>
    var sel=document.getElementById('type'),grid=document.getElementById('grid'),count=document.getElementById('count');
    var treatBtn=document.getElementById('treatBtn'),treatPop=document.getElementById('treatPop'),treatSum=document.getElementById('treatSum');
    var boxes=[].slice.call(treatPop.querySelectorAll('input[type=checkbox]'));
    function apply(){
      var v=sel.value,sel2={},nc=0;
      boxes.forEach(function(b){if(b.checked){sel2[b.value]=1;nc++;}});
      var n=0,k=grid.children;
      for(var i=0;i<k.length;i++){var el=k[i];var show=(!v||el.getAttribute('data-type')===v)&&sel2[el.getAttribute('data-treat')]===1;el.classList.toggle('hide',!show);if(show)n++;}
      count.textContent=n+(n===1?' logo':' logos');
      treatSum.textContent=nc===boxes.length?'All treatments':(nc===0?'None':nc+' of '+boxes.length);
    }
    treatBtn.addEventListener('click',function(e){e.stopPropagation();var h=treatPop.hasAttribute('hidden');if(h){treatPop.removeAttribute('hidden');}else{treatPop.setAttribute('hidden','');}treatBtn.setAttribute('aria-expanded',h?'true':'false');});
    treatPop.addEventListener('click',function(e){e.stopPropagation();});
    // Never allow zero treatments — unchecking the last one snaps back (an empty wall is a dead end).
    boxes.forEach(function(b){b.addEventListener('change',function(){if(!boxes.some(function(x){return x.checked;})){b.checked=true;return;}apply();});});
    document.addEventListener('click',function(){treatPop.setAttribute('hidden','');treatBtn.setAttribute('aria-expanded','false');});
    sel.addEventListener('change',apply);apply();
    document.querySelectorAll('.tab').forEach(function(t){t.addEventListener('click',function(){document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('on');});t.classList.add('on');['storeArea','pokeArea'].forEach(function(id){var el=document.getElementById(id);if(el)el.hidden=(id!==t.dataset.area);});});});
  </script>
  </body>`);
  });

  // Pokémon TCG set logos — the "swap-to" wall for the Hobby picker. Era pills → set cards
  // ([logo] · code · name · release), data-driven from data/pokemon-sets.json (data-dev's catalog)
  // + the downloaded logos in public/logos/pokemon/sets/. QA page only; no auth (public logos + set names).
  app.get("/logo-wall/sets", async (c) => {
    const nslug = (x: any) => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    // Asset lookup by set NAME (logos + dominant colour) from the full pokemontcg.io catalog — so
    // logos/banners resolve no matter which data source drives the list.
    const logoByName = new Map<string, string | null>();
    let catalog: any = { eras: [] };
    try {
      catalog = JSON.parse(readFileSync(join(here, "../public/logos/pokemon/sets/_catalog.json"), "utf8"));
      for (const e of catalog.eras || []) for (const s of e.sets || []) logoByName.set(nslug(s.name), s.logoFile);
    } catch { /* not built yet */ }
    // Data source: prefer website-dev's expanded feed catalog (data/pokemon-sets.json) the moment it
    // lands (13 eras / 129 sets, presentation-ordered); until then use the full pokemontcg.io catalog.
    let cat: any = catalog;
    // Pull the canonical feed FRESH (owner: "ONE PULL, EVERYTHING" — GET /pub/pokemon-sets) from this
    // same origin. Falls back to the local data file, then the full card catalog, if the feed isn't on
    // this deployment yet (e.g. prod before it's promoted).
    try {
      const r = await fetch(new URL(c.req.url).origin + "/pub/pokemon-sets", { signal: AbortSignal.timeout(5000) });
      if (r.ok) { const feed: any = await r.json(); if ((feed.eras || []).length >= 5) cat = feed; }
    } catch { /* feed not reachable on this deployment yet */ }
    if (cat === catalog) { try { const f = JSON.parse(readFileSync(join(here, "../data/pokemon-sets.json"), "utf8")); if ((f.eras || []).length >= 5) cat = f; } catch { /* keep catalog */ } }
    const eras = (cat.eras || []) as Array<{ era: string; short?: string; years?: string; sets: Array<{ code: string; name: string; release: string; logoFile?: string | null }> }>;
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const fmt = (r: string) => { const m = /^(\d{4})[-/](\d{2})/.exec(r || ""); return m ? `${MON[+m[2] - 1]} ${m[1]}` : (r || "TBA"); };
    const logoOf = (s: any) => s.logoFile || logoByName.get(nslug(s.name)) || null;
    // Real banner key-art in public/logos/sets/banners/<name>.<ext>; else the shared Pokémon fallback.
    let bannerFiles = new Set<string>();
    try { bannerFiles = new Set(readdirSync(join(here, "../public/logos/pokemon/banners")).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))); } catch { /* none yet */ }
    const bannerFor = (s: any) => { for (const k of [nslug(s.name), nslug(s.code), nslug(s.apiId)]) { if (!k) continue; for (const ext of ["jpeg", "jpg", "png", "webp"]) if (bannerFiles.has(k + "." + ext)) return k + "." + ext; } return null; };
    const fallbackBanner = bannerFiles.has("_fallback.jpeg") ? "/logos/pokemon/banners/_fallback.jpeg" : null;
    const totalSets = eras.reduce((n, e) => n + e.sets.length, 0);
    const withLogo = eras.reduce((n, e) => n + e.sets.filter((s) => logoOf(s)).length, 0);
    const withBanner = eras.reduce((n, e) => n + e.sets.filter((s) => bannerFor(s)).length, 0);
    const def = Math.max(0, eras.length - 1); // newest era shown first
    const logoCard = (s: any) => {
      const lf = logoOf(s);
      const art = lf
        ? `<div class="setart"><img src="/logos/pokemon/sets/${lf}?v=2" alt="" loading="lazy"></div>`
        : `<div class="setart noimg"><span>${esc(s.name)}</span><small>logo coming soon</small></div>`;
      return `<div class="setcard">${art}<div class="setname">${esc(s.name)}</div><div class="setmeta">${esc(s.code)} · ${esc(fmt(s.release))}</div></div>`;
    };
    const bannerCard = (s: any) => {
      const bf = bannerFor(s);
      const art = bf ? `/logos/pokemon/banners/${bf}` : fallbackBanner;
      if (!art) return `<div class="banner noimg"><span>${esc(s.name)}</span><small>banner coming soon</small></div>`;
      const lf = logoOf(s);
      const logo = lf ? `<img class="blogo" src="/logos/pokemon/sets/${lf}?v=2" alt="" loading="lazy">` : "";
      return `<div class="banner${bf ? "" : " fb"}"><img class="bart" src="${art}" alt="" loading="lazy">${logo}<div class="bcap"><b>${esc(s.name)}</b><span>${esc(s.code)} · ${esc(fmt(s.release))}</span></div></div>`;
    };
    const pills = eras.map((e, i) => `<button type="button" class="pill${i === def ? " on" : ""}" data-era="${i}">${esc(e.era)} <small>${e.sets.length}</small></button>`).join("");
    const sections = eras.map((e, i) => `<section class="era${i === def ? " on" : ""}" data-era="${i}"><h3 class="sech">Logos <small>${e.sets.length} sets</small></h3><div class="grid">${e.sets.map(logoCard).join("")}</div><h3 class="sech">Banners <small>enlarged logo · muted background</small></h3><div class="bgrid">${e.sets.map(bannerCard).join("")}</div></section>`).join("");
    return c.html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    *{box-sizing:border-box}
    body{background:#0C0C12;font-family:-apple-system,system-ui,sans-serif;color:#fff;padding:20px;margin:0}
    .nav{display:flex;gap:8px;margin-bottom:14px}
    .nav a{padding:8px 14px;border-radius:999px;font-size:13px;font-weight:700;text-decoration:none;background:#1a1a22;color:#cfcfd6;border:1px solid rgba(255,255,255,.14)}
    .nav a.on{background:#22c55e;color:#06210f;border-color:transparent}
    h2{font-weight:900;margin:0 0 4px}
    .sub{color:#9a9aac;font-size:12px;margin-bottom:16px}
    .pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
    .pill{background:#16161e;color:#cfcfd6;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer}
    .pill small{color:#8a8a98;font-weight:600;margin-left:4px}
    .pill.on{border-color:#eab308;color:#fff;box-shadow:0 0 0 1px #eab308,0 0 18px rgba(234,179,8,.25)}
    .era{display:none} .era.on{display:block}
    .sech{font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:#8a8a98;margin:24px 0 12px;border-top:1px solid rgba(255,255,255,.07);padding-top:18px}
    .sech small{font-weight:600;text-transform:none;letter-spacing:0;color:#6f6f80;margin-left:8px}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
    .setcard{background:#16161e;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:2px}
    .setart{height:100px;display:flex;align-items:center;justify-content:center;margin-bottom:10px}
    .setart img{max-width:100%;max-height:92px;object-fit:contain}
    .setart.noimg{flex-direction:column;gap:4px;border:1px dashed rgba(255,255,255,.14);border-radius:12px;color:#9a9aac;text-align:center;padding:8px;width:100%}
    .setart.noimg span{font-weight:800;font-size:13px;color:#cfcfd6} .setart.noimg small{font-size:11px;color:#6f6f80}
    .setname{font-weight:800;font-size:15px;line-height:1.2}
    .setmeta{font-size:12px;color:#8a8a98}
    .bgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
    .banner{position:relative;aspect-ratio:16/9;border-radius:16px;overflow:hidden;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.08);background:#0b0b11}
    .bart{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(.4) saturate(.92)}
    .banner.fb .bart{filter:brightness(.28) saturate(.55)}
    .blogo{position:relative;max-width:82%;max-height:66%;object-fit:contain;filter:drop-shadow(0 10px 26px rgba(0,0,0,.85))}
    .bcap{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:1px;padding:12px 12px 9px;background:linear-gradient(transparent,rgba(0,0,0,.82))}
    .bcap b{font-size:14px;font-weight:800} .bcap span{font-size:11px;color:#c9c9d4}
    .banner.noimg{flex-direction:column;gap:5px;background:#141019;border:1px dashed rgba(255,255,255,.14);color:#9a9aac}
    .banner.noimg span{font-weight:800;font-size:15px;color:#cfcfd6;text-align:center;padding:0 12px} .banner.noimg small{font-size:11px;color:#6f6f80}
  </style>
  <body>
  <div class="nav"><a href="/logo-wall">Store logos</a><a class="on" href="/logo-wall/sets">Pokémon sets</a></div>
  <h2>Pokémon sets · ${eras.length} eras · ${totalSets} sets</h2>
  <div class="sub">${withLogo}/${totalSets} logos · ${withBanner}/${totalSets} real banners (rest use the shared Pokémon fallback) · Base Set → newest. Each era has a <b>Logos</b> and a <b>Banners</b> section — banner = enlarged logo on the muted key art. Pick an era.</div>
  <div class="pills">${pills}</div>
  ${sections}
  <script>
    var pills=[].slice.call(document.querySelectorAll('.pill'));
    var eras=[].slice.call(document.querySelectorAll('.era'));
    pills.forEach(function(p){p.addEventListener('click',function(){var e=p.getAttribute('data-era');
      pills.forEach(function(x){x.classList.toggle('on',x===p);});
      eras.forEach(function(s){s.classList.toggle('on',s.getAttribute('data-era')===e);});
      window.scrollTo(0,0);});});
  </script>
  </body>`);
  });

  // Owner preview: "the check" — a SOLID gradient disc with a white check CENTERED inside it, tip
  // reaching the top-right edge (never past it), exactly like the reference. 4 to choose:
  // flat / raised × purple / green. The winner becomes FCHK() everywhere (ticker, footer, verdicts).
  app.get("/check-lab", (c) => {
    const RAMP: Record<string, [string, string]> = { purple: ["#5B1E99", "#A65CED"], green: ["#15803D", "#4ADE80"] };
    // Small, CENTERED check with clear margin from the rim (Reminders-style) — never touches/breaks the edge.
    const CHECK = "M8.1 12.2 L10.9 15.0 L16.0 8.9", SW = "2.3";
    const flat = (hue: string) => (sz: number) => { const [a, b] = RAMP[hue]; const id = `f${hue}${sz}`;
      return `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" style="vertical-align:middle"><defs><linearGradient id="${id}" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
      <circle cx="12" cy="12" r="10" fill="url(#${id})"/>
      <path d="${CHECK}" stroke="#fff" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/></svg>`; };
    const raised = (hue: string) => (sz: number) => { const [a, b] = RAMP[hue]; const id = `r${hue}${sz}`, g = `gl${hue}${sz}`;
      return `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" style="vertical-align:middle"><defs><linearGradient id="${id}" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
      <radialGradient id="${g}" cx="0.38" cy="0.28" r="0.8"><stop stop-color="#fff" stop-opacity="0.5"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
      <circle cx="12" cy="12" r="10" fill="url(#${id})"/>
      <circle cx="12" cy="12" r="10" fill="url(#${g})"/>
      <path d="${CHECK}" stroke="#000" stroke-opacity="0.2" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,0.6)"/>
      <path d="${CHECK}" stroke="#fff" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round"/></svg>`; };
    const MARKS: Record<string, { name: string; svg: (sz: number) => string }> = {
      "1": { name: "Flat · purple", svg: flat("purple") },
      "2": { name: "Raised · purple", svg: raised("purple") },
      "3": { name: "Flat · green", svg: flat("green") },
      "4": { name: "Raised · green", svg: raised("green") },
    };
    const row = (key: string) => { const m = MARKS[key]; return `
    <div style="background:#15151c;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:18px;display:flex;gap:18px;align-items:center;flex-wrap:wrap">
      <div style="width:88px;text-align:center">${m.svg(72)}<div style="font-weight:900;font-size:16px;margin-top:8px">#${key}</div></div>
      <div style="flex:1;min-width:210px">
        <div style="font-weight:800;font-size:16px;margin-bottom:10px">${m.name}</div>
        <div style="display:flex;flex-direction:column;gap:9px">
          <div style="display:flex;align-items:center;gap:7px;font-size:12.5px;color:#cfcfd8">${m.svg(15)}<b style="color:#4ADE80">Found!</b> · Target — Sunset Blvd <span style="color:#56566a;margin-left:auto">ticker</span></div>
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#cfcfd8">${m.svg(22)}<b>Fungibles</b> <span style="color:#56566a;margin-left:auto">footer</span></div>
          <div style="display:flex;align-items:center;gap:8px;font-weight:900;font-size:16px;color:#4ADE80">${m.svg(34)} In stock! <span style="color:#56566a;font-weight:400;font-size:12px;margin-left:auto">verdict</span></div>
        </div>
      </div>
    </div>`; };
    return c.html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#0C0C12;font-family:-apple-system,sans-serif;color:#fff;padding:20px;max-width:560px;margin:0 auto">
  <h2 style="font-weight:900;margin:0 0 4px">The Check</h2>
  <div style="color:#9a9aac;font-size:12.5px;margin-bottom:14px">Solid disc · white check centered inside, tip at the edge. Flat &amp; raised, purple &amp; green. Reply <b>1</b>, <b>2</b>, <b>3</b>, or <b>4</b>.</div>
  <div style="display:flex;flex-direction:column;gap:12px">${["1", "2", "3", "4"].map(row).join("")}</div></body>`);
  });

  app.get("/logos/chains/:file", (c) => {
    const file = (c.req.param("file") || "").replace(/[^a-z0-9._-]/gi, "");
    try {
      const buf = readFileSync(join(here, `../public/logos/chains/${file}`));
      const ext = file.split(".").pop()?.toLowerCase();
      c.header("Cache-Control", "public, max-age=86400");
      return c.body(buf, 200, { "Content-Type": ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : "image/png" });
    } catch { return c.notFound(); }
  });
}
