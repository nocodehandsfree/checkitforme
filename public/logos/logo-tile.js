/* ───────────────────────────────────────────────────────────────────────────
   LogoTile — the ONE shared chain-logo renderer.
   Used identically by the consumer store list (checkit.html), the admin
   (app.html), and the QA wall (/logo-wall). Inlined into all three at serve
   time, so "fixed on the wall" == "fixed in the app and admin" — same rules,
   same pixels. Do not fork this logic per surface.

   info = {
     url:      string|null   // /logos/chains/<slug>.png, or null/none
     wide:     bool          // asset is a wide wordmark (aspect hint from _meta)
     dark:     bool          // dark ink → needs a light plate behind the mark
     wordmark: bool          // render the NAME as balanced text, ignore the image
     name:     string        // chain/store name (used for wordmark text)
   }

   Rules (owner spec):
   1. Uniform size — every tile is the same square; every mark fills the same box.
   2. Mark-only — when we show an image it's a brand MARK (square-ish), never a
      squished wordmark. Wordmark assets are flagged wordmark:true upstream.
   3. Long, mark-less name → balanced two lines. Barnes & Noble is custom: the
      "&" sits to the RIGHT of both stacked words, at word size.
   4. Short name → a single, large line.
   ───────────────────────────────────────────────────────────────────────── */
(function (root) {
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // Drop the per-store branch ("Target — Tysons Corner" → "Target") and any secondary brand after a
  // slash ("Office Depot / OfficeMax" → "Office Depot") so the wordmark spells one clean brand.
  function baseName(name) {
    return ((name || "").split(/[—–]| - | \/ /)[0] || "").trim();
  }

  // Split a name into two length-balanced lines (greedy on char count). Hyphens break like spaces so
  // single hyphenated tokens ("Bi-Mart", "Hy-Vee") wrap to two lines instead of one cramped line.
  function balance(base) {
    var words = base.split(/[\s-]+/).filter(Boolean);
    if (words.length <= 1) return [base];
    var best = 1, bestDiff = 1e9, acc = 0;
    for (var i = 1; i < words.length; i++) {
      acc += words[i - 1].length + 1;
      var d = Math.abs(acc - base.length / 2);
      if (d < bestDiff) { bestDiff = d; best = i; }
    }
    return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
  }

  // Fit ONE line's font (px) so it fills — but never overflows — the tile width. Each line is sized
  // on its own, so a short line (e.g. Dunham's "Sports") reads as large as it can instead of shrinking
  // to match a longer sibling. A single line may run larger than two (rule 4 — short names read big).
  function fitFont(text, size, nLines) {
    var len = Math.max(1, String(text).length);
    var avail = size * 0.92;            // usable width inside the tile
    var fs = avail / (len * 0.56);      // 0.56em ≈ bold uppercase char width at -0.02em tracking
    var cap = (nLines || 1) > 1 ? size * 0.40 : size * 0.44;
    // Floor low enough that even long lines fit rather than clip; the ones that bottom out here are
    // exactly the chains that want a real brand mark — flag them from the wall, don't fake one.
    return Math.max(size * 0.13, Math.min(fs, cap));
  }

  // The balanced-text mark. `size` is the tile px (defaults to the CSS var fallback, 36).
  function wordmark(name, size) {
    size = size || 36;
    var base = baseName(name) || (name || "").trim();
    if (!base) return '<span class="lt-wm"></span>';

    // Custom: Barnes & Noble → "Barnes" / "Noble" stacked, "&" to the right at word size.
    if (/^barnes\s*&\s*noble$/i.test(base)) {
      var fs = fitFont("Barnes", size, 2);
      return '<span class="lt-wm lt-amp" style="--lt-fs:' + fs.toFixed(1) + 'px">' +
        '<span class="lt-lines"><span>Barnes</span><span>Noble</span></span>' +
        '<span class="lt-and">&amp;</span></span>';
    }

    // Each line sized to fill its own width (short bottom lines read bigger, not shrunk to match).
    var lines = balance(base);
    var inner = lines.map(function (l) {
      return '<span style="font-size:' + fitFont(l, size, lines.length).toFixed(1) + 'px">' + esc(l) + "</span>";
    }).join("");
    return '<span class="lt-wm">' + inner + "</span>";
  }

  // Inner content of a tile: image when we have a real mark, else the wordmark text.
  function inner(info, size) {
    info = info || {};
    if (!info.wordmark && info.url) {
      return '<img src="' + esc(info.url) + '" alt="' + esc(baseName(info.name)) + '" loading="lazy">';
    }
    return wordmark(info.name, size);
  }

  // Full tile. `size` (px) is optional; when omitted the CSS var --lt-size (36) wins.
  function tile(info, size) {
    info = info || {};
    var useImg = info.url && !info.wordmark;
    var cls = ["lt-tile"];
    if (useImg && info.dark) cls.push("lt-lite"); // light plate only behind a real dark mark
    var style = size ? ' style="--lt-size:' + size + 'px"' : "";
    return '<div class="' + cls.join(" ") + '"' + style + ">" + inner(info, size || 36) + "</div>";
  }

  root.LogoTile = { tile: tile, inner: inner, wordmark: wordmark, balance: balance, baseName: baseName };
})(typeof window !== "undefined" ? window : globalThis);
