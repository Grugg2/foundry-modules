/* GM Deck 0.1.0: one window for running the table. Written for Foundry v14 + PF1 (works system-agnostic except CR). */
const ID = "gm-deck";
const AUDIO = /\.(mp3|ogg|oga|wav|flac|webm|m4a|opus)$/i;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const get = (k) => game.settings.get(ID, k);
const set = (k, v) => game.settings.set(ID, k, v);
const FP = () => foundry.applications.apps.FilePicker.implementation;
const leaf = (p) => { const s = p.replace(/\/$/, "").split("/").pop(); try { return decodeURIComponent(s); } catch { return s; } };
const nameOf = (p) => leaf(p).replace(/\.[^.]+$/, "");
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const strip = (h) => String(h ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

/* ------------------------------------------------------------------ */
/* Audio: runs on every client. The GM decides, everyone plays.        */
/* ------------------------------------------------------------------ */
const playing = new Map(); // key -> Sound

async function playLocal({ key, src, volume = 0.8, rate = 1, loop = false, fade = 0 }) {
  const k = key ?? foundry.utils.randomID();
  if (playing.has(k)) return;
  try {
    const s = new foundry.audio.Sound(src, { context: game.audio.environment });
    playing.set(k, s);
    await s.load();
    if (playing.get(k) !== s) return; // stopped while loading
    const done = () => { if (playing.get(k) === s) playing.delete(k); deck?.markPlaying(); };
    s.addEventListener("end", done);
    s.addEventListener("stop", done);
    await s.play({ volume, loop, fade });
    // Random pitch: buffered sounds use the source node, streamed (long) sounds use the media element.
    const node = s.sourceNode;
    if (node?.playbackRate) node.playbackRate.value = rate;
    else if (s.element) { s.element.preservesPitch = false; s.element.playbackRate = rate; }
    deck?.markPlaying();
  } catch (err) {
    playing.delete(k);
    console.warn(`${ID} | could not play ${src}`, err);
  }
}

function stopLocal(key, fade = 400) {
  const s = playing.get(key);
  if (!s) return;
  playing.delete(key);
  try { s.stop({ fade }); } catch (err) { console.warn(`${ID} | stop failed`, err); }
}

function handle(d) {
  switch (d.t) {
    case "play": return playLocal(d);
    case "stop": return stopLocal(d.key);
    case "stopAll": for (const k of [...playing.keys()]) if (!d.prefix || k.startsWith(d.prefix)) stopLocal(k); return;
    case "loops":
      for (const src of d.srcs ?? []) {
        const key = `mood:${d.mood}:${src}`;
        if (d.on) playLocal({ key, src, volume: d.volume, loop: true, fade: 1500 });
        else stopLocal(key, 1500);
      }
      if (!d.on) for (const k of [...playing.keys()]) if (k.startsWith(`mood:${d.mood}:`)) stopLocal(k, 1500);
      return;
  }
}

/** Play for everyone (or only for me when solo is true). */
function send(d, solo = false) {
  if (!solo) game.socket.emit(`module.${ID}`, d);
  handle(d);
}

const wobble = () => 1 + (Math.random() * 2 - 1) * (get("pitch") / 100);

/* ------------------------------------------------------------------ */
/* Ambience moods (GM only). Folder = mood. Files in it loop;          */
/* files in any subfolder (e.g. "oneshots") fire at random.            */
/* ------------------------------------------------------------------ */
const moods = new Map(); // name -> {path, loops, shots, timer}
const browseCache = new Map();

async function browse(path) {
  if (browseCache.has(path)) return browseCache.get(path);
  let r = { dirs: [], files: [], error: null };
  try {
    const b = await FP().browse("data", path);
    r = { dirs: b.dirs ?? [], files: (b.files ?? []).filter((f) => AUDIO.test(f)), error: null };
  } catch (err) { r.error = err.message; }
  browseCache.set(path, r);
  return r;
}

function scheduleShot(name) {
  const m = moods.get(name);
  if (!m || !m.shots.length) return;
  m.timer = setTimeout(() => {
    if (!moods.has(name)) return;
    send({ t: "play", src: pick(m.shots), volume: get("volume") * (0.3 + Math.random() * 0.5), rate: wobble() });
    scheduleShot(name);
  }, 5000 + Math.random() * 20000);
}

async function startMood(name, path) {
  if (moods.has(name)) return;
  const root = await browse(path);
  const m = { path, loops: [...root.files], shots: [], timer: null };
  for (const d of root.dirs) m.shots.push(...(await browse(d)).files);
  if (!m.loops.length && !m.shots.length) return ui.notifications.warn(`GM Deck: no audio files in ${path}`);
  moods.set(name, m);
  send({ t: "loops", mood: name, on: true, srcs: m.loops, volume: get("volume") * 0.6 });
  scheduleShot(name);
  await saveMoods();
}

async function stopMood(name) {
  const m = moods.get(name);
  if (!m) return;
  clearTimeout(m.timer);
  moods.delete(name);
  send({ t: "loops", mood: name, on: false, srcs: m.loops });
  await saveMoods();
}

function saveMoods() {
  const o = {};
  for (const [n, m] of moods) o[n] = { path: m.path, srcs: m.loops, volume: get("volume") * 0.6 };
  return set("activeMoods", o);
}

/* ------------------------------------------------------------------ */
/* Weather                                                             */
/* ------------------------------------------------------------------ */
const CLIMATES = {
  temperate: { "": 50, rain: 20, fog: 10, rainStorm: 8, leaves: 7, snow: 5 },
  cold: { "": 35, snow: 35, blizzard: 15, fog: 15 },
  desert: { "": 85, fog: 5, rainStorm: 5, leaves: 5 },
  tropical: { "": 40, rain: 30, rainStorm: 25, fog: 5 },
};
const WEATHER_MOOD = { rain: /rain/i, rainStorm: /storm|thunder/i, snow: /snow/i, blizzard: /blizzard|wind/i, fog: /fog|mist/i, leaves: /wind|leaves/i };
let weatherMood = null;

function weatherLabel(id) {
  const w = CONFIG.weatherEffects[id];
  return w ? game.i18n.localize(w.label) : "Clear";
}

async function setWeather(id) {
  if (!canvas.scene) return ui.notifications.warn("GM Deck: no scene is open.");
  await canvas.scene.update({ weather: id });
  if (!get("linkWeather")) return;
  if (weatherMood) { await stopMood(weatherMood); weatherMood = null; }
  const rx = WEATHER_MOOD[id];
  if (!rx) return;
  const dir = (await browse(get("moodRoot"))).dirs.find((d) => rx.test(leaf(d)));
  if (dir) { weatherMood = leaf(dir); await startMood(weatherMood, dir); }
}

function rollWeather() {
  const table = CLIMATES[get("climate")] ?? CLIMATES.temperate;
  let r = Math.random() * Object.values(table).reduce((a, b) => a + b, 0);
  for (const [id, w] of Object.entries(table)) { if ((r -= w) < 0) return setWeather(id); }
}

function timeStr() {
  try { return game.time.calendar.format(game.time.worldTime, "timestamp"); } catch { return `${game.time.worldTime} s`; }
}

/* ------------------------------------------------------------------ */
/* NPC ideas                                                           */
/* ------------------------------------------------------------------ */
const NPC = {
  first: ["Alda", "Bram", "Cerys", "Doran", "Edda", "Falk", "Greta", "Hale", "Isolde", "Joss", "Kara", "Leof", "Mira", "Nils", "Orla", "Pell", "Quill", "Runa", "Sten", "Tova", "Ulf", "Vera", "Wynn", "Ysa", "Zeke"],
  last: ["Ashdown", "Blackwater", "Corwick", "Dunmere", "Elmhurst", "Fenwick", "Garrow", "Holloway", "Ironside", "Kettle", "Longstride", "Marsh", "Northgate", "Oakes", "Pike", "Redfern", "Stonehand", "Thorne", "Underhill", "Vance", "Wolfe"],
  job: ["innkeeper", "smith", "ferryman", "priest", "guard sergeant", "herbalist", "pedlar", "scribe", "hunter", "moneylender", "midwife", "gravedigger", "minstrel", "tax collector", "retired soldier", "fence", "shepherd", "apothecary"],
  look: ["missing two fingers", "a burn scar across the neck", "immaculate clothes", "ink-stained hands", "a limp", "one clouded eye", "a shaved head", "far too many rings", "a nervous laugh", "towering and stooped", "tiny and quick", "smells of woodsmoke"],
  trait: ["generous to a fault", "suspicious of strangers", "relentlessly cheerful", "bitter about an old slight", "devout", "greedy", "curious about everything", "cowardly", "proud", "weary", "sly", "blunt"],
  want: ["a debt paid off", "news of a missing sibling", "to leave this town", "revenge on a rival", "a rare ingredient", "protection for a secret", "someone to take a letter north", "to be believed about what they saw", "a quiet life", "to impress a noble"],
  voice: ["slow and low", "fast and clipped", "sing-song", "whispering", "booming", "dry and flat", "stammering", "overly formal"],
};
function npcIdea() {
  return { name: `${pick(NPC.first)} ${pick(NPC.last)}`, job: pick(NPC.job), look: pick(NPC.look), trait: pick(NPC.trait), want: pick(NPC.want), voice: pick(NPC.voice) };
}

async function appendJournal(journalName, pageName, html) {
  const entry = game.journal.getName(journalName) ?? (await JournalEntry.create({ name: journalName }));
  const page = entry.pages.getName(pageName);
  if (page) await page.update({ "text.content": `${page.text.content ?? ""}${html}` });
  else await entry.createEmbeddedDocuments("JournalEntryPage", [{ name: pageName, type: "text", text: { content: html } }]);
  return entry;
}

/* ------------------------------------------------------------------ */
/* The window                                                          */
/* ------------------------------------------------------------------ */
const TABS = [["sound", "🔊 Sound"], ["world", "☀ World"], ["tables", "🎲 Tables"], ["people", "👤 People"], ["lore", "📖 Lore"]];
let deck = null;

class GMDeck extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: ID,
    classes: [ID],
    window: { title: "GM Deck", icon: "fa-solid fa-dice-d20", resizable: true },
    position: { width: 440, height: 660 },
    actions: {
      tab(_e, t) { this.tab = t.dataset.tab; this.render(); },
      stopAll() { send({ t: "stopAll" }); for (const n of [...moods.keys()]) stopMood(n); this.render(); },
      refresh() { browseCache.clear(); this.tables = this.actors = null; this.render(); },
      async mood(_e, t) { moods.has(t.dataset.name) ? await stopMood(t.dataset.name) : await startMood(t.dataset.name, t.dataset.path); this.render(); },
      dir(_e, t) { this.soundDir = t.dataset.path; this.render(); },
      sfx(e, t) { send({ t: "play", src: t.dataset.src, volume: get("volume"), rate: wobble() }, e.shiftKey); },
      pickFolder(_e, t) {
        const key = t.dataset.key;
        new (FP())({ type: "folder", current: get(key), callback: async (p) => { await set(key, p); browseCache.clear(); this.soundDir = null; this.render(); } }).render(true);
      },
      time(_e, t) { game.time.advance(Number(t.dataset.s)); },
      async weather(_e, t) { await setWeather(t.dataset.id); this.render(); },
      async rollWeather() { await rollWeather(); this.render(); },
      async draw(e, t) {
        const table = await fromUuid(t.dataset.uuid);
        if (table) table.draw({ messageMode: e.shiftKey ? "self" : "public" });
      },
      pull(e, t) { this.pull(this.actors.find((a) => a.uuid === t.dataset.uuid), !e.shiftKey); },
      randomActor() { const l = this.filterActors(); if (l.length) this.pull(pick(l), true); else ui.notifications.info("GM Deck: nothing matches."); },
      idea() { this.idea = npcIdea(); this.render(); },
      async saveIdea() {
        const i = this.idea;
        const e = await appendJournal("GM Deck NPCs", i.name, `<p><strong>${esc(i.name)}</strong>, ${esc(i.job)}. Looks: ${esc(i.look)}. Is ${esc(i.trait)}. Wants ${esc(i.want)}. Voice: ${esc(i.voice)}.</p>`);
        ui.notifications.info(`GM Deck: saved ${i.name} to "${e.name}".`);
      },
      openPage(_e, t) { game.journal.get(t.dataset.entry)?.sheet.render(true, { pageId: t.dataset.page }); },
      async log() {
        const ta = this.element.querySelector("[name=note]");
        if (!ta?.value.trim()) return;
        await appendJournal("Session Log", new Date().toISOString().slice(0, 10), `<p><strong>${esc(timeStr())}</strong> ${esc(ta.value.trim())}</p>`);
        ta.value = "";
        ui.notifications.info("GM Deck: logged.");
      },
    },
  };

  tab = "sound";
  soundDir = null;
  q = { tables: "", people: "", lore: "" };
  cr = { min: "", max: "" };
  tables = null;
  actors = null;
  idea = npcIdea();

  async _renderHTML() {
    const tabs = TABS.map(([k, l]) => `<button type="button" data-action="tab" data-tab="${k}" class="${k === this.tab ? "on" : ""}">${l}</button>`).join("");
    const body = await this[`_${this.tab}`]();
    return `<nav class="gd-tabs">${tabs}</nav><section class="gd-body">${body}</section>`;
  }

  _replaceHTML(result, content) { content.innerHTML = result; }

  _onRender() {
    const el = this.element;
    for (const i of el.querySelectorAll("[data-setting]")) {
      i.addEventListener("change", async () => {
        await set(i.dataset.setting, i.type === "checkbox" ? i.checked : i.type === "range" ? Number(i.value) : i.value);
      });
    }
    el.querySelector("[data-search]")?.addEventListener("input", (e) => { this.q[this.tab] = e.target.value; this.fill(); });
    for (const i of el.querySelectorAll("[data-cr]")) i.addEventListener("change", () => { this.cr[i.dataset.cr] = i.value; this.fill(); });
    el.querySelector("[data-dark]")?.addEventListener("change", (e) => canvas.scene?.update({ "environment.darknessLevel": Number(e.target.value) }, { animateDarkness: 1500 }));
    // Right-click a soundboard button to loop it; right-click again to stop.
    for (const b of el.querySelectorAll("[data-action=sfx]")) {
      b.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const key = `loop:${b.dataset.src}`;
        if (playing.has(key)) send({ t: "stop", key });
        else send({ t: "play", key, src: b.dataset.src, volume: get("volume"), loop: true });
        this.markPlaying();
      });
    }
    this.markPlaying();
  }

  _onClose() { deck = null; }

  markPlaying() {
    for (const b of this.element?.querySelectorAll("[data-action=sfx]") ?? []) b.classList.toggle("playing", playing.has(`loop:${b.dataset.src}`));
  }

  /** Re-draw only the result list so the search box keeps focus. */
  fill() {
    const box = this.element.querySelector(".gd-results");
    if (box) box.innerHTML = this[`_${this.tab}Results`]();
  }

  /* ---- Sound ---- */
  async _sound() {
    const moodRoot = await browse(get("moodRoot"));
    const sndRoot = get("soundRoot");
    const root = await browse(sndRoot);
    const cur = this.soundDir ?? sndRoot;
    const here = cur === sndRoot ? root : await browse(cur);
    const moodChips = moodRoot.dirs.map((d) => `<button type="button" class="gd-chip ${moods.has(leaf(d)) ? "on" : ""}" data-action="mood" data-name="${esc(leaf(d))}" data-path="${esc(d)}">${esc(leaf(d))}</button>`).join("");
    const dirChips = [sndRoot, ...root.dirs].map((d) => `<button type="button" class="gd-chip ${d === cur ? "on" : ""}" data-action="dir" data-path="${esc(d)}">${d === sndRoot ? "All" : esc(leaf(d))}</button>`).join("");
    const sfx = here.files.map((f) => `<button type="button" data-action="sfx" data-src="${esc(f)}">${esc(nameOf(f))}</button>`).join("");
    return `
      <div class="gd-row">
        <label>Volume</label><input type="range" min="0" max="1" step="0.05" value="${get("volume")}" data-setting="volume">
        <label>Pitch ±%</label><input type="range" min="0" max="40" step="1" value="${get("pitch")}" data-setting="pitch">
        <button type="button" class="gd-chip" data-action="stopAll">■ Stop all</button>
      </div>
      <h4>Ambience</h4>
      <div class="gd-row">${moodChips || `<span class="gd-hint">No moods yet. Make a folder per mood inside "${esc(get("moodRoot"))}": files in it loop, files in a subfolder (e.g. "oneshots") play at random.</span>`}</div>
      <h4>Soundboard</h4>
      <div class="gd-row">${dirChips}</div>
      <div class="gd-grid">${sfx || `<span class="gd-hint">${esc(here.error ?? "No audio files here.")}</span>`}</div>
      <div class="gd-hint">Click: everyone hears it. Shift-click: only you. Right-click: loop on/off.</div>
      <div class="gd-row">
        <button type="button" class="gd-chip" data-action="pickFolder" data-key="soundRoot">📁 Soundboard folder</button>
        <button type="button" class="gd-chip" data-action="pickFolder" data-key="moodRoot">📁 Ambience folder</button>
        <button type="button" class="gd-chip" data-action="refresh">↻ Rescan</button>
      </div>`;
  }

  /* ---- World ---- */
  async _world() {
    const sc = canvas.scene;
    const cur = sc?.weather ?? "";
    const wx = ["", ...Object.keys(CONFIG.weatherEffects)].map((id) => `<button type="button" data-action="weather" data-id="${id}" class="${id === cur ? "on" : ""}">${esc(weatherLabel(id))}</button>`).join("");
    const steps = [["+10 min", 600], ["+1 hour", 3600], ["+8 hours", 28800], ["+1 day", 86400]].map(([l, s]) => `<button type="button" data-action="time" data-s="${s}">${l}</button>`).join("");
    const climates = Object.keys(CLIMATES).map((c) => `<option value="${c}" ${c === get("climate") ? "selected" : ""}>${c}</option>`).join("");
    return `
      <div class="gd-big">${esc(timeStr())}</div>
      <div class="gd-grid">${steps}</div>
      <h4>Weather${sc ? ` on ${esc(sc.name)}` : ""}</h4>
      ${sc ? `<div class="gd-grid">${wx}</div>
      <div class="gd-row">
        <button type="button" class="gd-chip" data-action="rollWeather">🎲 Roll weather</button>
        <select data-setting="climate">${climates}</select>
        <label><input type="checkbox" data-setting="linkWeather" ${get("linkWeather") ? "checked" : ""}> matching ambience</label>
      </div>
      <h4>Darkness</h4>
      <div class="gd-row"><label>Day</label><input type="range" min="0" max="1" step="0.05" value="${sc.environment?.darknessLevel ?? 0}" data-dark><label>Night</label></div>` : `<div class="gd-hint">Open a scene to set weather and darkness.</div>`}`;
  }

  /* ---- Tables ---- */
  async _tables() {
    if (!this.tables) {
      this.tables = game.tables.map((t) => ({ uuid: t.uuid, name: t.name, src: "World" }));
      for (const p of game.packs) {
        if (p.documentName !== "RollTable") continue;
        for (const e of await p.getIndex()) this.tables.push({ uuid: e.uuid, name: e.name, src: p.metadata.label });
      }
      this.tables.sort((a, b) => a.name.localeCompare(b.name));
    }
    return `<div class="gd-row"><input type="search" data-search placeholder="Search ${this.tables.length} tables…" value="${esc(this.q.tables)}"></div>
      <div class="gd-hint">Click: roll to chat. Shift-click: roll for your eyes only.</div>
      <div class="gd-list gd-results">${this._tablesResults()}</div>`;
  }
  _tablesResults() {
    const q = this.q.tables.toLowerCase();
    return this.tables.filter((t) => !q || t.name.toLowerCase().includes(q)).slice(0, 60)
      .map((t) => `<div class="gd-item" data-action="draw" data-uuid="${t.uuid}"><span class="gd-name">${esc(t.name)}</span><span class="gd-sub">${esc(t.src)}</span></div>`).join("") || `<span class="gd-hint">No tables match.</span>`;
  }

  /* ---- People ---- */
  async _people() {
    if (!this.actors) {
      this.actors = [];
      for (const p of game.packs) {
        if (p.documentName !== "Actor") continue;
        for (const e of await p.getIndex({ fields: ["system.details.cr.base"] })) {
          this.actors.push({ uuid: e.uuid, pack: p.collection, id: e._id, name: e.name, img: e.img, cr: e.system?.details?.cr?.base ?? null, src: p.metadata.label });
        }
      }
      this.actors.sort((a, b) => a.name.localeCompare(b.name));
    }
    const i = this.idea;
    return `<div class="gd-row">
        <input type="search" data-search placeholder="Search ${this.actors.length} creatures…" value="${esc(this.q.people)}">
        <label>CR</label><input type="number" min="0" data-cr="min" value="${esc(this.cr.min)}"><label>to</label><input type="number" min="0" data-cr="max" value="${esc(this.cr.max)}">
        <button type="button" class="gd-chip" data-action="randomActor">🎲</button>
      </div>
      <div class="gd-hint">Click: import and drop a token in the middle of your view. Shift-click: import and open the sheet.</div>
      <div class="gd-list gd-results">${this._peopleResults()}</div>
      <h4>Quick NPC</h4>
      <div class="gd-card"><strong>${esc(i.name)}</strong>, ${esc(i.job)}<br>Looks: ${esc(i.look)}<br>Is ${esc(i.trait)}; wants ${esc(i.want)}<br>Voice: ${esc(i.voice)}</div>
      <div class="gd-row"><button type="button" class="gd-chip" data-action="idea">🎲 Another</button><button type="button" class="gd-chip" data-action="saveIdea">📖 Save to lore</button></div>`;
  }
  filterActors() {
    const q = this.q.people.toLowerCase();
    const min = this.cr.min === "" ? null : Number(this.cr.min);
    const max = this.cr.max === "" ? null : Number(this.cr.max);
    return this.actors.filter((a) => (!q || a.name.toLowerCase().includes(q)) && (min === null || (a.cr !== null && a.cr >= min)) && (max === null || (a.cr !== null && a.cr <= max)));
  }
  _peopleResults() {
    return this.filterActors().slice(0, 60)
      .map((a) => `<div class="gd-item" data-action="pull" data-uuid="${a.uuid}"><img src="${esc(a.img)}" alt=""><span class="gd-name">${esc(a.name)}</span><span class="gd-sub">${a.cr !== null ? `CR ${a.cr} · ` : ""}${esc(a.src)}</span></div>`).join("") || `<span class="gd-hint">Nothing matches.</span>`;
  }
  async pull(a, place) {
    if (!a) return;
    const actor = game.actors.find((x) => x._stats?.compendiumSource === a.uuid) ?? (await game.actors.importFromCompendium(game.packs.get(a.pack), a.id));
    if (!place || !canvas.scene) return actor.sheet.render(true);
    const p = canvas.grid.getTopLeftPoint({ x: canvas.stage.pivot.x, y: canvas.stage.pivot.y });
    const td = await actor.getTokenDocument({ x: p.x, y: p.y });
    await canvas.scene.createEmbeddedDocuments("Token", [td.toObject()]);
  }

  /* ---- Lore ---- */
  async _lore() {
    return `<div class="gd-row"><input type="search" data-search placeholder="Search journals (names and text)…" value="${esc(this.q.lore)}"></div>
      <div class="gd-list gd-results">${this._loreResults()}</div>
      <h4>Session log</h4>
      <textarea name="note" placeholder="What just happened? Saved with the in-game time to the Session Log journal."></textarea>
      <div class="gd-row"><button type="button" class="gd-chip" data-action="log">✍ Log it</button></div>`;
  }
  _loreResults() {
    const q = this.q.lore.toLowerCase().trim();
    if (q.length < 2) return `<span class="gd-hint">Type at least two letters.</span>`;
    const out = [];
    for (const entry of game.journal) {
      for (const page of entry.pages) {
        const text = strip(page.text?.content);
        const at = text.toLowerCase().indexOf(q);
        if (at < 0 && !page.name.toLowerCase().includes(q) && !entry.name.toLowerCase().includes(q)) continue;
        const snip = at >= 0 ? `…${text.slice(Math.max(0, at - 30), at + 60)}…` : "";
        out.push(`<div class="gd-item" data-action="openPage" data-entry="${entry.id}" data-page="${page.id}" title="${esc(snip)}"><span class="gd-name">${esc(page.name)}</span><span class="gd-sub">${esc(entry.name)}</span></div>`);
        if (out.length >= 60) return out.join("");
      }
    }
    return out.join("") || `<span class="gd-hint">Nothing found.</span>`;
  }
}

function toggleDeck() {
  if (!game.user.isGM) return;
  if (deck) return deck.close();
  deck = new GMDeck();
  deck.render({ force: true });
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */
Hooks.once("init", () => {
  const reg = (k, o) => game.settings.register(ID, k, o);
  reg("soundRoot", { name: "Soundboard folder", scope: "world", config: true, type: String, default: "soundboard", filePicker: "folder" });
  reg("moodRoot", { name: "Ambience folder", hint: "One subfolder per mood. Files in it loop; files in a deeper subfolder play at random.", scope: "world", config: true, type: String, default: "ambience", filePicker: "folder" });
  reg("volume", { scope: "world", config: false, type: Number, default: 0.8 });
  reg("pitch", { scope: "world", config: false, type: Number, default: 12 });
  reg("climate", { scope: "world", config: false, type: String, default: "temperate" });
  reg("linkWeather", { scope: "world", config: false, type: Boolean, default: true });
  reg("activeMoods", { scope: "world", config: false, type: Object, default: {} });
  game.keybindings.register(ID, "toggle", { name: "Open or close GM Deck", editable: [{ key: "KeyG", modifiers: ["Shift"] }], restricted: true, onDown: () => { toggleDeck(); return true; } });
});

Hooks.once("ready", async () => {
  game.socket.on(`module.${ID}`, handle);
  const saved = get("activeMoods") ?? {};
  if (game.user.isGM) {
    // Take the moods back over after a reload, so the random one-shots keep firing.
    for (const [name, m] of Object.entries(saved)) await startMood(name, m.path);
  } else {
    for (const [name, m] of Object.entries(saved)) handle({ t: "loops", mood: name, on: true, srcs: m.srcs, volume: m.volume });
  }
  game.modules.get(ID).api = { toggle: toggleDeck, play: send, startMood, stopMood, setWeather };
});

Hooks.on("getSceneControlButtons", (controls) => {
  const tools = controls.tokens?.tools;
  if (!tools) return;
  tools.gmDeck = { name: "gmDeck", title: "GM Deck (Shift+G)", icon: "fa-solid fa-dice-d20", order: Object.keys(tools).length, button: true, visible: game.user.isGM, onChange: () => toggleDeck() };
});

Hooks.on("updateWorldTime", () => { if (deck?.tab === "world") deck.render(); });
Hooks.on("canvasReady", () => { if (deck?.tab === "world") deck.render(); });
