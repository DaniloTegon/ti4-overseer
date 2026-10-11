(() => {
const $ = (s) => document.querySelector(s);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const KEY = "overseer.v2";

const state = Object.assign({
  pok: false, te: false, acr: false, short: false, desc: "original", line: true, group: "component", tts: "",
  selected: [], picks: {}, colors: {}, leg: [], relics: [], planetOwners: {}, relicOwners: {}, assetPicker: null,
  hiddenFactions: [], legCollapsed: false, relicCollapsed: false, factionsCollapsed: false, openIds: null,
}, JSON.parse(localStorage.getItem(KEY) || "{}"));
state.relics ||= [];
state.planetOwners ||= {};
state.relicOwners ||= {};
state.hiddenFactions ||= [];
if (!state.mirageAutoSelectionFixed) {
  if (!state.planetOwners.mirage) state.leg = state.leg.filter((id) => id !== "mirage");
  if (!state.relicOwners.dominusorb) state.relics = state.relics.filter((id) => id !== "dominusorb");
  state.mirageAutoSelectionFixed = true;
}
let pickerFor = null;
let tts = { empty: true };
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
const level = () => (state.te ? "te" : state.pok ? "pok" : "base");
const vis = (o) => !o.v || o.v.includes(level());
const byId = Object.fromEntries(FACTIONS.map((f) => [f.id, f]));
const HOME_TILE = Object.fromEntries(FACTIONS.filter((f) => f.tile).map((f) => [f.tile, f.id]));
const LEG_TILE = Object.fromEntries(LEGENDARY.filter((l) => l.tile).map((l) => [l.tile, l.id]));
const maxPicks = () => (state.selected.length <= 4 ? 2 : 1);
const legAvail = (l) => (l.exp === "pok" ? state.pok : state.te);
const relicAvail = (r) => (r.exp === "pok" ? state.pok : state.te);

/* ---------- acronyms ---------- */
const wordMap = {};
for (const [abbr, forms] of ACRONYMS) forms.forEach((w) => (wordMap[w] = abbr));
const ACR_RE = new RegExp(
  "\\b(" + Object.keys(wordMap).sort((a, b) => b.length - a.length).join("|") + ")(s)?\\b", "gi");
const LEG_IMG = { avernus: "Avernus", emelpar: "Emelpar", faunus: "Faunus", garbozia: "Garbozia", hopes: "HopesEnd", industrex: "Industrex", mallice: "Mallice", mecatolrex: "MecatolRex.jpg", mirage: "Mirage", ordinian: "Ordinian", primor: "Primor", styx: "Styx", tempesta: "Tempesta", thunders: "ThundersEdge" };
const acrName = (a) => LEGEND_TEXT[a] || ACRONYMS.find((x) => x[0] === a)[1][0].replace(/^./, (c) => c.toUpperCase());
function fmt(text) {
  return esc(text).replace(ACR_RE, (m, w, plural) => {
    const a = wordMap[w.toLowerCase()];
    if (!state.acr) return `<b class="ac">${m}</b>`;
    return `<b class="ac tip" data-tip="${esc(acrName(a))}" tabindex="0">${a + (plural ? "s" : "")}</b>`;
  }).replace(/Ω/g, '<span class="om" title="Updated (omega) component">Ω</span>');
}
const fmtLegend = () => ACRONYMS.map(([a, forms]) => {
  const name = LEGEND_TEXT[a] || forms[0].replace(/^./, (c) => c.toUpperCase());
  return `<div><b>${a}</b>: ${name}</div>`;
}).join("");

/* ---------- faction helpers ---------- */
const fname = (f) => (state.short ? f.short : f.full);
const colorHex = (id) => (PLAYER_COLORS.find((c) => c.id === state.colors[id]) || {}).hex;
const colorTextHex = (id) => {
  const color = PLAYER_COLORS.find((c) => c.id === state.colors[id]);
  return color && (color.textHex || color.hex);
};
const nameHtml = (id) => `<span class="fname" style="color:${colorTextHex(id) || "#9fc3ff"}">${esc(fname(byId[id]))}</span>`;
function initiativeKey(id) {
  const d = FACTION_DATA[id];
  if (d && d.initiative !== undefined) return d.initiative;
  const p = state.picks[id] || [];
  return p.length ? Math.min(...p) : 99;
}
const ready = (id) => !!state.colors[id] && (state.picks[id] || []).length > 0;
function orderedSelected(all) {
  return state.selected
    .filter((id) => all || ready(id))
    .map((id, i) => ({ id, i, k: initiativeKey(id) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((o) => o.id);
}
function visibleSelected(all) {
  return orderedSelected(all).filter((id) => !state.hiddenFactions.includes(id));
}
function available() {
  return FACTIONS.filter((f) => f.exp === "base" || (f.exp === "pok" && (state.pok || (f.id === "keleres" && state.te))) || (f.exp === "te" && state.te));
}
// A local images/<id>.png is tried before the remote portrait.
function fimg(f) {
  const remote = `https://ti4-cheatsheets.vercel.app/factions/portraits/${f.img}.png`;
  const st = "width:100%;height:100%;left:0;top:0;object-fit:contain";
  const local = `images/${f.id}.png`;
  const lst = "width:100%;height:100%;left:0;top:0;object-fit:contain;object-position:center";
  return `<div class="fimg">${esc(f.short[0])}<img src="${local}" style="${lst}" data-r="${remote}" data-s="${st}" alt="" onerror="if(this.dataset.r){this.style.cssText=this.dataset.s;this.src=this.dataset.r;delete this.dataset.r}else this.remove()"></div>`;
}
function fixPicks() {
  const max = maxPicks();
  for (const id of Object.keys(state.picks)) {
    if (!state.selected.includes(id)) delete state.picks[id];
    else state.picks[id] = state.picks[id].slice(0, max);
  }
  for (const id of Object.keys(state.colors)) if (!state.selected.includes(id)) delete state.colors[id];
  state.hiddenFactions = state.hiddenFactions.filter((id) => state.selected.includes(id));
}

/* ---------- TTS map string ---------- */
function parseTts() {
  const raw = state.tts.trim();
  if (!raw) return { empty: true };
  const tokens = raw.split(/\s+/);
  const re = /^(\{-?\d{1,3}\}|-1|\d{1,3}([AB]\d?)?)$/i;
  const bad = tokens.filter((t) => !re.test(t));
  if (bad.length) return { err: `Invalid token(s): ${bad.slice(0, 5).join(", ")}` };
  const ring = tokens.filter((t, i) => !(i === 0 && t.startsWith("{")));
  let rings = 0, total = 0;
  while (total < ring.length) { rings++; total += 6 * rings; }
  if (total !== ring.length) return { err: `${ring.length} ring tiles does not complete a ring` };
  const factions = [], leg = [], tiles = [];
  for (const t of tokens) {
    const n = parseInt(t.replace(/[{}]/g, ""), 10);
    const f = HOME_TILE[n], l = LEG_TILE[n];
    tiles.push(n);
    if (f && !factions.includes(f)) factions.push(f);
    if (l && !leg.includes(l)) leg.push(l);
  }
  const te = factions.some((id) => byId[id].exp === "te") || leg.some((id) => LEGENDARY.find((l) => l.id === id).exp === "te");
  if (te && tiles.includes(18)) leg.push("mecatolrex");
  const pok = te || factions.some((id) => byId[id].exp === "pok") || leg.some((id) => LEGENDARY.find((l) => l.id === id).exp === "pok");
  return { ok: true, rings, factions, leg, pok, te, active: factions.length > 0 };
}
function applyTts() {
  tts = parseTts();
  const el = $("#ttsInfo");
  if (tts.empty) { el.textContent = ""; el.className = "hint"; }
  else if (tts.err) { el.textContent = tts.err; el.className = "hint err"; }
  else {
    el.textContent = `Valid: ${tts.rings} ring(s), ${tts.factions.length} home system(s), ${tts.leg.length} legendary planet(s) detected` +
      (tts.active ? " – factions and legendary planets taken from the map." : " – no home systems found, select factions manually.");
    el.className = "hint ok";
  }
  if (tts.active) {
    state.selected = tts.factions.slice(0, 8);
    state.leg = tts.leg;
    state.pok = tts.pok;
    state.te = tts.te;
  }
  $("#factions").hidden = !!tts.active;
}

/* ---------- setup ---------- */
function renderSetup() {
  $("#expPok").checked = state.pok;
  $("#expTe").checked = state.te;
  $("#expPok").disabled = !!tts.active && tts.pok;
  $("#expTe").disabled = !!tts.active && tts.te;
  $("#acrToggle").checked = state.acr;
  $("#lineColor").checked = state.line;
  document.querySelectorAll('input[name="group"]').forEach((r) => (r.checked = r.value === state.group));
  $("#shortNames").checked = state.short;
  document.querySelectorAll('input[name="desc"]').forEach((r) => (r.checked = r.value === state.desc));
  if ($("#tts").value !== state.tts) $("#tts").value = state.tts;
  const lg = $("#legend");
  lg.hidden = !state.acr;
  if (state.acr) lg.innerHTML = fmtLegend();
  const opts = LEGENDARY.filter((l) => legAvail(l) && (!tts.active || state.leg.includes(l.id) || (l.id === "mirage" && state.pok) || (l.id === "thunders" && state.te)));
  $("#legSel").classList.toggle("closed", state.legCollapsed);
  $("[data-collapse='legendary']").setAttribute("aria-expanded", String(!state.legCollapsed));
  $("#legList").innerHTML = opts.length
    ? opts.map((l) => assetTile("planet", l, state.leg, state.planetOwners)).join("")
    : `<span class="hint">Enable an expansion to choose legendary planets.</span>`;
  const relics = RELICS.filter(relicAvail);
  $("#relicSel").classList.toggle("closed", state.relicCollapsed);
  $("[data-collapse='relics']").setAttribute("aria-expanded", String(!state.relicCollapsed));
  $("#relicList").innerHTML = relics.length
    ? relics.map((r) => assetTile("relic", r, state.relics, state.relicOwners)).join("")
    : `<span class="hint">Enable an expansion to choose relics.</span>`;
}

function assetTile(kind, item, selected, owners) {
  const open = state.assetPicker === `${kind}:${item.id}`;
  const owner = owners[item.id];
  const faction = owner && byId[owner];
  const label = faction ? fname(faction) : selected.includes(item.id) ? "No owner" : "Not in play";
  const planetImage = LEG_IMG[item.id];
  const image = kind === "planet" && planetImage
    ? item.id === "mecatolrex"
      ? `<span class="planet-photo mecatolrex"><img src="images/planets/${planetImage}" alt=""></span>`
      : `<img class="planet-img ${item.id}" src="images/planets/${planetImage.endsWith(".jpg") ? planetImage : `${planetImage}.png`}" alt="">`
    : kind === "relic"
      ? `<img class="relic-icon" src="images/relic-icon.png" alt="Relic">`
      : `<span class="ph">Ω</span>`;
  return `<div class="asset-wrap"><button type="button" class="legtile asset-tile ${selected.includes(item.id) ? "on" : ""} ${open ? "open" : ""}" data-asset="${kind}:${item.id}" title="${esc(item.name)}">${image}<span class="ln">${esc(item.name)}</span><span class="asset-owner"${faction && colorTextHex(owner) ? ` style="color:${colorTextHex(owner)}"` : ""}>${esc(label)}</span></button>${open ? assetOwnerPicker(kind, item) : ""}</div>`;
}

function assetOwnerPicker(kind, item) {
  const key = kind === "planet" ? "planetOwners" : "relicOwners";
  const selected = kind === "planet" ? state.leg : state.relics;
  const owners = state[key];
  const hasOwner = !!owners[item.id];
  const choices = orderedSelected(true).map((id) => {
    const color = colorHex(id) || "#8a90a2";
    return `<button type="button" class="owner-choice" data-kind="${kind}" data-item="${item.id}" data-owner="${id}"><i style="background:${color}"></i>${esc(fname(byId[id]))}</button>`;
  }).join("");
  return `<div class="asset-picker"><div class="asset-picker-title">Owner</div>${choices || `<span class="hint">Select a faction first.</span>`}<button type="button" class="owner-choice" data-kind="${kind}" data-item="${item.id}" data-owner="">No owner</button>${selected.includes(item.id) && !(kind === "planet" && tts.active) ? `<button type="button" class="owner-choice remove" data-kind="${kind}" data-item="${item.id}" data-action="remove">Remove from game</button>` : ""}${hasOwner ? `<span class="hint">Choosing a faction keeps this item in play.</span>` : ""}</div>`;
}

/* ---------- factions ---------- */
function renderFactions() {
  const list = available().slice().sort((a, b) => fname(a).localeCompare(fname(b)));
  const full = state.selected.length >= 8;
  $("#factionGrid").innerHTML = list.map((f) => {
    const sel = state.selected.includes(f.id);
    return `<div class="fcard ${sel ? "sel" : ""} ${!sel && full ? "dis" : ""}" data-id="${f.id}">${fimg(f)}<div class="nm">${esc(fname(f))}</div></div>`;
  }).join("");
  $("#factionCount").textContent = `${state.selected.length}/8`;
  $("#factions").classList.toggle("closed", state.factionsCollapsed);
}

/* ---------- overview ---------- */
const txt = (i) => (state.desc === "original" ? i.f || i.x : state.desc === "idiotic" ? i.i ?? i.x : i.x);
function expansionIcon(version, factionId) {
  const versions = [].concat(version || []);
  let expansion = null;
  if (factionId === "keleres") {
    if (versions.length === 1 && versions[0] === "te") expansion = "te";
  } else if (versions.includes("pok")) expansion = "pok";
  else if (versions.includes("te")) expansion = "te";
  if (!expansion) return "";
  const label = expansion === "te" ? "Thunder's Edge" : "Prophecy of Kings";
  return `<img class="exp-icon" src="images/${expansion}-icon.png" alt="${label}" title="${label}">`;
}
const overviewText = (item, id) => `${fmt(txt(item))}${expansionIcon(item.v, id)}`;
function overviewItems(id, key) {
  const sh = SHORT[id] || {}, id2 = (typeof IDIOTIC !== "undefined" && IDIOTIC[id]) || {};
  const all = (OVERVIEW[id] || {})[key] || [];
  const hasPok = all.some((i) => [].concat(i.v || []).join() === "pok");
  return all.filter(vis).map((i) => {
    const n = (i.n || "").trim();
    const teOnly = [].concat(i.v || []).join() === "te";
    const om = teOnly && hasPok ? " Ω" : "";
    const x = (teOnly && sh[`${n}@te`]) || sh[n] || i.f;
    return { f: i.f + om, x: x + om, i: id2[n] === undefined ? undefined : id2[n] && id2[n] + om, v: i.v };
  });
}
function groupLine(id, items, source) {
  const body = items.map((item) => typeof item === "string" ? fmt(item) : `${fmt(item.text)}${expansionIcon(item.version, id)}`).join(" / ");
  const hex = state.line ? colorTextHex(id) : undefined;
  return `<li${hex ? ` style="color:${hex}"` : ""}>${nameHtml(id)}${source ? ` <span class="source-tag">[${source}]</span>` : ""}: ${body.replace(/[\s/]/g, "") ? body + "." : ""}</li>`;
}
function renderOverview() {
  const order = visibleSelected();
  const max = maxPicks();
  let h = "";
  if (!state.selected.length) h += `<p class="empty">Select factions (or paste a TTS map string) to see their abilities.</p>`;
  else if (!visibleSelected(true).length) h += `<p class="empty">Faction information is hidden. Enable it from the faction list.</p>`;
  h += `<div class="chips">` + orderedSelected(true).map((id) => {
    const f = byId[id];
    const p = (state.picks[id] || []).slice().sort((a, b) => a - b);
    const ini = FACTION_DATA[id] && FACTION_DATA[id].initiative === 0 ? `<span class="sc">0</span>` : "";
    const hex = colorHex(id);
    const textHex = colorTextHex(id);
    const visible = !state.hiddenFactions.includes(id);
    const toggle = `<input class="fvisibility" type="checkbox" data-fvisibility="${id}" ${visible ? "checked" : ""} aria-label="Show ${esc(f.full)} in overview and timeline" title="Show in overview and timeline">`;
    return `<div class="chipwrap ${visible ? "" : "hidden-faction"}">${toggle}<div class="chip ${pickerFor === id ? "open" : ""}" data-id="${id}" ${hex ? `style="border-color:${hex}"` : ""}>${fimg(f)}<div><div style="color:${textHex || "inherit"}">${esc(fname(f))}</div><div class="cards">${ini}${p.map((n) => `<span class="sc">${n}</span>`).join("")}</div></div></div>${pickerFor === id ? picker(id, max) : ""}</div>`;
  }).join("") + `</div><div class="ov">`;

  h += renderOwnedAssets("planet", LEGENDARY, state.leg, state.planetOwners, "Legendary Planets");
  h += renderOwnedAssets("relic", RELICS, state.relics, state.relicOwners, "Relics");

  let lastGroup = null;
  if (state.group === "faction") {
    for (const id of order) {
      const hex = state.line ? colorHex(id) : undefined;
      const lines = [];
      for (const s of OVERVIEW_SECTIONS) {
        if (s.v && !s.v.includes(level())) continue;
        const items = overviewItems(id, s.key);
        const rows = items.map((item) => ({ text: txt(item), version: item.v }));
        if (items.length) lines.push(groupLine(id, rows, s.source));
      }
      if (lines.length) h += `<h3>${nameHtml(id)}</h3><ul>${lines.join("")}</ul>`;
    }
  }
  for (const s of state.group === "faction" ? [] : OVERVIEW_SECTIONS) {
    if (s.v && !s.v.includes(level())) continue;
    const lines = [];
    for (const id of order) {
      const items = overviewItems(id, s.key).map((item) => ({ text: txt(item), version: item.v }));
      if (items.length) lines.push(groupLine(id, items, s.source));
    }
    if (!lines.length) continue;
    if (s.group && s.group !== lastGroup) h += `<h3>${fmt(s.group)}</h3>`;
    lastGroup = s.group || null;
    h += s.group ? `<h4>${fmt(s.title)}</h4>` : `<h3>${fmt(s.title)}</h3>`;
    h += `<ul>${lines.join("")}</ul>`;
  }
  const pending = state.selected.filter((id) => !state.hiddenFactions.includes(id) && !ready(id));
  if (pending.length) h += `<p class="empty">Pick a color and at least 1 strategy card to reveal: ${pending.map((id) => esc(fname(byId[id]))).join(", ")}.</p>`;
  const missing = order.filter((id) => !OVERVIEW[id]);
  if (missing.length) h += `<p class="empty">Details not yet available for: ${missing.map((id) => esc(fname(byId[id]))).join(", ")}.</p>`;
  $("#overviewBody").innerHTML = h + `</div>`;
}

function renderOwnedAssets(kind, items, selected, owners, heading) {
  const owned = visibleSelected(true).flatMap((owner) =>
    items.filter((item) => selected.includes(item.id) && (owners[item.id] === owner) && (kind === "planet" ? legAvail(item) : relicAvail(item)))
      .map((item) => ({ text: `${item.name}: ${(kind === "planet" ? txt({ ...item, i: IDIOTIC_PLANETS[item.id] }) : txt({ ...item, i: IDIOTIC_RELICS[item.id] })).replace(/[.!?]+$/, "")}`, version: item.exp }))
      .map((item) => groupLine(owner, [item])));
  return owned.length ? `<h3>${fmt(heading)}</h3><ul>${owned.join("")}</ul>` : "";
}
function picker(id, max) {
  const mine = state.picks[id] || [];
  const taken = new Set(Object.entries(state.picks).filter(([k]) => k !== id).flatMap(([, v]) => v));
  const usedColors = new Set(Object.entries(state.colors).filter(([k]) => k !== id).map(([, v]) => v));
  return `<div class="picker"><div class="hd">Strategy cards (${mine.length}/${max})</div>` +
    STRATEGY_CARDS.map((c) => {
      const isMine = mine.includes(c.n);
      const blocked = taken.has(c.n) || (!isMine && mine.length >= max);
      return `<div class="pick ${isMine ? "mine" : ""} ${blocked ? "taken" : ""}" data-n="${c.n}" data-f="${id}"><span class="n">${c.n}</span>${c.name}</div>`;
    }).join("") +
    `<div class="hd" style="margin-top:8px">Color</div><div class="sws">` +
    PLAYER_COLORS.map((c) => `<span class="sw ${state.colors[id] === c.id ? "on" : ""} ${usedColors.has(c.id) ? "taken" : ""}" data-c="${c.id}" data-f="${id}" title="${c.name}" style="background:${c.hex}"></span>`).join("") +
    `</div></div>`;
}

/* ---------- timeline ---------- */
let allIds = [];
function renderNode(n, depth, path, order) {
  if (!vis(n)) return "";
  allIds.push(path);
  const lines = [];
  for (const id of order) {
    const d = FACTION_DATA[id];
    const items = d && n.slot ? (d.timeline[n.slot] || []).filter(vis).map((i) => ({ text: i.x, version: i.v })) : [];
    if (items.length) lines.push(groupLine(id, items));
  }
  const kids = (n.c || []).map((c, i) => renderNode(c, depth + 1, `${path}.${i}`, order)).join("");
  const open = state.openIds.includes(path) ? "open" : "";
  return `<details class="node d${depth}" data-id="${path}" ${open}><summary>${fmt(n.t)}</summary><div class="nbody">` +
    (n.d ? `<p>${fmt(n.d)}</p>` : "") + (lines.length ? `<ul>${lines.join("")}</ul>` : "") + kids + `</div></details>`;
}
function renderTimeline() {
  allIds = [];
  if (!state.openIds) state.openIds = TIMELINE.map((_, i) => String(i));
  $("#timelineTree").innerHTML = TIMELINE.map((n, i) => renderNode(n, 0, String(i), visibleSelected())).join("");
}

function renderAll() {
  applyTts();
  fixPicks();
  renderSetup(); renderFactions(); renderOverview(); renderTimeline();
  save();
}

/* ---------- events ---------- */
document.querySelectorAll(".toggle").forEach((h) =>
  h.addEventListener("click", () => {
    if (h.parentElement.id === "factions") { state.factionsCollapsed = !state.factionsCollapsed; renderFactions(); save(); }
    else h.parentElement.classList.toggle("closed");
  }));
function dropUnavailable() {
  const ids = new Set(available().map((f) => f.id));
  state.selected = state.selected.filter((id) => ids.has(id));
  state.leg = state.leg.filter((id) => legAvail(LEGENDARY.find((l) => l.id === id)));
  state.relics = state.relics.filter((id) => relicAvail(RELICS.find((r) => r.id === id)));
  for (const id of Object.keys(state.planetOwners)) if (!LEGENDARY.some((l) => l.id === id && legAvail(l))) delete state.planetOwners[id];
  for (const id of Object.keys(state.relicOwners)) if (!RELICS.some((r) => r.id === id && relicAvail(r))) delete state.relicOwners[id];
}
$("#expPok").addEventListener("change", (e) => { state.pok = e.target.checked; dropUnavailable(); renderAll(); });
$("#expTe").addEventListener("change", (e) => { state.te = e.target.checked; dropUnavailable(); renderAll(); });
$("#lineColor").addEventListener("change", (e) => { state.line = e.target.checked; renderAll(); });
document.querySelectorAll('input[name="group"]').forEach((r) =>
  r.addEventListener("change", (e) => { state.group = e.target.value; renderAll(); }));
$("#acrToggle").addEventListener("change", (e) => { state.acr = e.target.checked; renderAll(); });
$("#shortNames").addEventListener("change", (e) => { state.short = e.target.checked; renderAll(); });
document.querySelectorAll('input[name="desc"]').forEach((r) =>
  r.addEventListener("change", (e) => { state.desc = e.target.value; renderAll(); }));
$("#tts").addEventListener("change", (e) => { state.tts = e.target.value; renderAll(); });
$("#tts").addEventListener("input", (e) => { state.tts = e.target.value; if (parseTts().ok || !state.tts.trim()) renderAll(); else applyTts(); });
$("#setupBody").addEventListener("click", (e) => {
  const toggle = e.target.closest("[data-collapse]");
  if (toggle) {
    const isPlanetSection = toggle.dataset.collapse === "legendary";
    const key = isPlanetSection ? "legCollapsed" : "relicCollapsed";
    state[key] = !state[key];
    const section = isPlanetSection ? $("#legSel") : $("#relicSel");
    section.classList.toggle("closed", state[key]);
    toggle.setAttribute("aria-expanded", String(!state[key]));
    save();
    return;
  }
  const tile = e.target.closest("[data-asset]");
  if (tile) {
    state.assetPicker = state.assetPicker === tile.dataset.asset ? null : tile.dataset.asset;
    renderAll();
    return;
  }
  const choice = e.target.closest(".owner-choice");
  if (!choice) return;
  const { kind, item, owner, action } = choice.dataset;
  const isPlanet = kind === "planet";
  const selected = isPlanet ? state.leg : state.relics;
  const owners = isPlanet ? state.planetOwners : state.relicOwners;
  if (action === "remove") {
    if (isPlanet) state.leg = selected.filter((id) => id !== item);
    else state.relics = selected.filter((id) => id !== item);
    delete owners[item];
  } else {
    if (!selected.includes(item)) selected.push(item);
    if (owner) owners[item] = owner;
    else delete owners[item];
  }
  state.assetPicker = null;
  renderAll();
});
$("#clearSel").addEventListener("click", () => {
  state.selected = []; state.picks = {}; state.colors = {}; state.hiddenFactions = []; state.leg = []; state.relics = []; state.planetOwners = {}; state.relicOwners = {}; pickerFor = null; state.factionsCollapsed = false; renderAll();
});
$("#clearStrategyCards").addEventListener("click", () => {
  state.picks = {};
  pickerFor = null;
  renderAll();
});
$("#factionGrid").addEventListener("click", (e) => {
  const c = e.target.closest(".fcard");
  if (!c) return;
  const id = c.dataset.id;
  const i = state.selected.indexOf(id);
  if (i >= 0) { state.selected.splice(i, 1); delete state.picks[id]; if (pickerFor === id) pickerFor = null; }
  else if (state.selected.length < 8) {
    state.selected.push(id);
    if (state.selected.length === 8) state.factionsCollapsed = true;
  } else return;
  renderAll();
});
$("#overviewBody").addEventListener("click", (e) => {
  const visibility = e.target.closest(".fvisibility");
  if (visibility) {
    const id = visibility.dataset.fvisibility;
    state.hiddenFactions = visibility.checked
      ? state.hiddenFactions.filter((factionId) => factionId !== id)
      : [...state.hiddenFactions, id];
    renderAll();
    return;
  }
  const sw = e.target.closest(".sw");
  if (sw) {
    if (sw.classList.contains("taken")) return;
    const f = sw.dataset.f;
    if (state.colors[f] === sw.dataset.c) delete state.colors[f]; else state.colors[f] = sw.dataset.c;
    renderAll();
    return;
  }
  const pk = e.target.closest(".pick");
  if (pk) {
    if (pk.classList.contains("taken")) return;
    const f = pk.dataset.f, n = +pk.dataset.n;
    const cur = state.picks[f] || [];
    state.picks[f] = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n];
    renderAll();
    return;
  }
  const chip = e.target.closest(".chip");
  if (chip) { pickerFor = pickerFor === chip.dataset.id ? null : chip.dataset.id; renderOverview(); }
});
document.addEventListener("click", (e) => {
  document.querySelectorAll(".tip.show").forEach((t) => t !== e.target && t.classList.remove("show"));
  if (e.target.classList && e.target.classList.contains("tip")) e.target.classList.toggle("show");
});
document.addEventListener("click", (e) => {
  if (pickerFor && !e.target.closest(".chipwrap")) { pickerFor = null; renderOverview(); }
});
$("#timelineTree").addEventListener("toggle", (e) => {
  const id = e.target.dataset && e.target.dataset.id;
  if (!id) return;
  const s = new Set(state.openIds);
  e.target.open ? s.add(id) : s.delete(id);
  state.openIds = [...s]; save();
}, true);
// Right-click: if anything inside is closed, open everything below; otherwise close it all.
document.querySelectorAll(".toggle").forEach((h) =>
  h.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const p = h.parentElement;
    const nested = [...p.querySelectorAll("details")];
    const closed = p.id === "factions" ? state.factionsCollapsed : p.classList.contains("closed");
    const expand = closed || nested.some((d) => !d.open);
    if (p.id === "factions") { state.factionsCollapsed = !expand; renderFactions(); save(); }
    else p.classList.toggle("closed", !expand);
    nested.forEach((d) => (d.open = expand));
  }));
$("#timelineTree").addEventListener("contextmenu", (e) => {
  const s = e.target.closest("summary");
  if (!s) return;
  e.preventDefault();
  const d = s.parentElement, nested = [...d.querySelectorAll("details")];
  const expand = !d.open || nested.some((x) => !x.open);
  d.open = expand;
  nested.forEach((x) => (x.open = expand));
});
$("#expandAll").addEventListener("click", () => { state.openIds = allIds.slice(); renderTimeline(); save(); });
$("#collapseAll").addEventListener("click", () => { state.openIds = []; renderTimeline(); save(); });

const pixDialog = $("#pixDialog");
$("#donateBtn").addEventListener("click", () => pixDialog.showModal());
$("#pixClose").addEventListener("click", () => pixDialog.close());
pixDialog.addEventListener("click", (e) => { if (e.target === pixDialog) pixDialog.close(); });

applyTts();
dropUnavailable();
renderAll();
})();
