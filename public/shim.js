// Spoonful – Supabase-Anbindung für die eigenständige App.
// Stellt dieselbe Schnittstelle bereit, die die App in der claude.ai-Testversion nutzt
// (window.claude.use('db' | 'user' | 'assets' | 'sample')), sodass beide Versionen denselben App-Code teilen.
(() => {
  const cfg = window.SPOONFUL_CONFIG || {};
  const configured = cfg.supabaseUrl && !/DEIN-PROJEKT/.test(cfg.supabaseUrl) && cfg.supabaseAnonKey && !/DEIN-ANON/.test(cfg.supabaseAnonKey);
  const sb = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;

  let resolveReady; const ready = new Promise(r => (resolveReady = r));
  const ns = {};
  let ctx = null, starting = false;
  window.claude = { use: name => ready.then(() => ns[name] ?? null) };

  // Einladungscode aus dem Link merken (…/?code=ABC123)
  try { const c = new URLSearchParams(location.search).get('code'); if (c) sessionStorage.setItem('sf-code', c.toUpperCase()); } catch {}

  const fail = (code, message) => ({ code, message });
  const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => new Date().toISOString();

  // ---------- Oberfläche für Anmeldung & Kochbuch ----------
  function gate(html, onMount) {
    let el = document.getElementById('sf-gate');
    if (!el) { el = document.createElement('div'); el.id = 'sf-gate'; document.body.append(el); }
    el.innerHTML = `<div class="ov" style="place-items:center;background:var(--bg)"><div class="sheet" style="box-shadow:0 12px 40px rgba(0,0,0,.14)">${html}</div></div>`;
    onMount?.(el);
    el.querySelector('input')?.focus();
    return el;
  }
  const closeGate = () => document.getElementById('sf-gate')?.remove();
  const status = (el, msg) => { const s = el.querySelector('.sf-status'); if (s) s.textContent = msg; };

  function showLogin(mode = 'login') {
    const signup = mode === 'signup';
    gate(`<h2>${signup ? 'Konto erstellen' : 'Willkommen bei Spoonful'}</h2>
      <p>${signup ? 'Wähle ein Passwort mit mindestens 8 Zeichen.' : 'Melde dich mit E-Mail und Passwort an. Du bleibst danach angemeldet.'}</p>
      <form id="sf-auth"><label class="field"><span>E-Mail</span><input type="email" required autocomplete="email" id="sf-email"></label>
      <label class="field"><span>Passwort</span><input type="password" required minlength="${signup ? 8 : 1}" autocomplete="${signup ? 'new-password' : 'current-password'}" id="sf-pw"></label>
      <div class="btns"><button class="btn" type="button" id="sf-switch">${signup ? 'Ich habe schon ein Konto' : 'Neues Konto erstellen'}</button><button class="btn primary" type="submit">${signup ? 'Konto erstellen' : 'Anmelden'}</button></div></form>
      ${signup ? '' : '<p style="margin-top:14px"><button class="linkish" type="button" id="sf-forgot" style="padding:0">Passwort vergessen?</button></p>'}
      <p class="by sf-status" aria-live="polite"></p>`, el => {
      el.querySelector('#sf-switch').addEventListener('click', () => showLogin(signup ? 'login' : 'signup'));
      el.querySelector('#sf-forgot')?.addEventListener('click', async () => {
        const email = el.querySelector('#sf-email').value.trim();
        if (!email) { status(el, 'Bitte zuerst deine E-Mail eintragen.'); return; }
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        status(el, error ? 'Das hat nicht geklappt: ' + error.message : 'Wir haben dir einen Link zum Zurücksetzen geschickt. Öffne ihn im Browser.');
      });
      el.querySelector('#sf-auth').addEventListener('submit', async e => {
        e.preventDefault();
        const email = el.querySelector('#sf-email').value.trim(), password = el.querySelector('#sf-pw').value;
        if (signup && password.length < 8) { status(el, 'Das Passwort braucht mindestens 8 Zeichen.'); return; }
        status(el, signup ? 'Erstelle Konto …' : 'Melde an …');
        if (signup) {
          const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
          if (error) { status(el, /registered|exists/i.test(error.message) ? 'Diese E-Mail hat schon ein Konto – bitte anmelden.' : 'Das hat nicht geklappt: ' + error.message); return; }
          if (!data.session) status(el, 'Fast geschafft: Bestätige deine E-Mail über den Link in der Mail und melde dich dann hier an.');
        } else {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) status(el, /confirm/i.test(error.message) ? 'Bitte bestätige zuerst deine E-Mail über den Link in der Mail.' : 'E-Mail oder Passwort stimmt nicht.');
        }
      });
    });
  }

  function showNewPassword() {
    gate(`<h2>Neues Passwort</h2><p>Wähle ein neues Passwort mit mindestens 8 Zeichen.</p>
      <form id="sf-np"><label class="field"><span>Neues Passwort</span><input type="password" minlength="8" required autocomplete="new-password" id="sf-np-pw"></label>
      <div class="btns"><button class="btn primary" type="submit">Speichern</button></div></form><p class="by sf-status" aria-live="polite"></p>`, el => {
      el.querySelector('#sf-np').addEventListener('submit', async e => {
        e.preventDefault();
        const { data, error } = await sb.auth.updateUser({ password: el.querySelector('#sf-np-pw').value });
        if (error) { status(el, 'Das hat nicht geklappt: ' + error.message); return; }
        afterLogin(data.user);
      });
    });
  }

  function showSetup(user) {
    const code = (() => { try { return sessionStorage.getItem('sf-code') || ''; } catch { return ''; } })();
    gate(`<h2>${code ? 'Kochbuch beitreten' : 'Euer Kochbuch'}</h2>
      <p>${code ? 'Du wurdest in ein Kochbuch eingeladen.' : 'Leg ein neues Kochbuch an oder tritt mit dem Code deiner Partnerin oder deines Partners bei.'}</p>
      <label class="field"><span>Dein Name (sieht die andere Person)</span><input id="sf-name" maxlength="40" value="${esc(user.email?.split('@')[0] || '')}"></label>
      <label class="field"><span>Einladungscode</span><input id="sf-join" maxlength="12" value="${esc(code)}" placeholder="z. B. 4F2A9C" style="text-transform:uppercase"></label>
      <div class="btns"><button class="btn primary" id="sf-do-join" type="button">Beitreten</button></div>
      <p style="margin-top:18px">Noch kein Kochbuch?</p>
      <label class="field"><span>Name des Kochbuchs</span><input id="sf-cbname" maxlength="60" value="Unser Kochbuch"></label>
      <div class="btns"><button class="btn" id="sf-do-create" type="button">Neues Kochbuch anlegen</button></div>
      <p class="by sf-status" aria-live="polite"></p>`, el => {
      const name = () => el.querySelector('#sf-name').value.trim();
      el.querySelector('#sf-do-join').addEventListener('click', async () => {
        const c = el.querySelector('#sf-join').value.trim(); if (!c) { status(el, 'Bitte Code eingeben.'); return; }
        status(el, 'Trete bei …');
        const { data, error } = await sb.rpc('join_cookbook', { p_code: c, p_display: name() });
        if (error) { status(el, /unbekannt/i.test(error.message) ? 'Diesen Code gibt es nicht.' : 'Beitreten hat nicht geklappt.'); return; }
        try { sessionStorage.removeItem('sf-code'); } catch {}
        enter(user, data);
      });
      el.querySelector('#sf-do-create').addEventListener('click', async () => {
        status(el, 'Lege an …');
        const { data, error } = await sb.rpc('create_cookbook', { p_name: el.querySelector('#sf-cbname').value, p_display: name() });
        if (error) { status(el, 'Anlegen hat nicht geklappt.'); return; }
        enter(user, data);
      });
    });
  }

  async function afterLogin(user) {
    if (starting || ctx) return; starting = true;
    const { data, error } = await sb.from('members').select('cookbook_id, cookbooks(id, name, invite_code)').eq('user_id', user.id).order('joined_at').limit(1);
    starting = false;
    if (error) { gate(`<h2>Verbindung fehlgeschlagen</h2><p>${esc(error.message)}</p>`); return; }
    if (!data?.length) { showSetup(user); return; }
    enter(user, data[0].cookbooks);
  }

  function enter(user, cookbook) {
    if (ctx) return;
    ctx = { user, cookbook };
    closeGate();
    build();
    resolveReady();
    addMenu();
  }

  // ---------- Schnittstellen ----------
  async function shrink(file, max = 1568) {
    let src; try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
    const k = Math.min(1, max / Math.max(src.width, src.height)); const c = document.createElement('canvas'); c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.85));
  }
  const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  const parseJson = t => {
    if (t && typeof t === 'object') return t;
    t = String(t ?? ''); try { return JSON.parse(t); } catch {}
    const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
    throw fail('invalid_json', 'Antwort war kein JSON');
  };

  function build() {
    const cb = ctx.cookbook.id, uid = ctx.user.id, CACHE = 'spoonful-cache-' + cb;
    const listeners = new Set(); let rows = null, channel = null, timer = null;
    const snap = (list, fromCache) => { const docs = list.map(r => ({ id: r.id, exists: true, data: () => r.data, metadata: { fromCache, hasPendingWrites: false } })); return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache, hasPendingWrites: false }, docChanges: () => [] }; };
    async function refresh() {
      const { data, error } = await sb.from('recipes').select('id, data').eq('cookbook_id', cb);
      if (error) throw error;
      rows = data; try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch {}
      listeners.forEach(l => l.next(snap(data, false)));
    }
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => refresh().catch(() => {}), 120); };
    function channelOn() {
      if (channel) return;
      channel = sb.channel('recipes-' + cb)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, schedule)
        .subscribe(s => { if (s === 'SUBSCRIBED') schedule(); });
    }
    window.addEventListener('online', schedule);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
    const mapErr = e => fail(e?.code === '42501' ? 'invalid_argument' : 'unavailable', e?.message || 'Fehler');
    const ref = id => ({
      id, path: 'recipes/' + id,
      async get() { const { data } = await sb.from('recipes').select('data').eq('cookbook_id', cb).eq('id', id).maybeSingle(); return { id, exists: !!data, data: () => data?.data, metadata: { fromCache: false, hasPendingWrites: false } }; },
      async set(data) { const { error } = await sb.from('recipes').upsert({ cookbook_id: cb, id, data, updated_at: now() }); if (error) throw mapErr(error); schedule(); },
      async update(patch) {
        const { data: row, error: e1 } = await sb.from('recipes').select('data').eq('cookbook_id', cb).eq('id', id).maybeSingle();
        if (e1 || !row) throw fail('invalid_argument', 'Rezept nicht gefunden');
        const { error } = await sb.from('recipes').update({ data: { ...row.data, ...patch }, updated_at: now() }).eq('cookbook_id', cb).eq('id', id);
        if (error) throw mapErr(error); schedule();
      },
      async delete() { const { error } = await sb.from('recipes').delete().eq('cookbook_id', cb).eq('id', id); if (error) throw mapErr(error); schedule(); }
    });
    ns.db = Object.freeze({
      doc(path) { const [c, id] = path.split('/'); if (c !== 'recipes' || !id) throw new TypeError('Pfad'); return ref(id); },
      collection(path) {
        if (path !== 'recipes') throw new TypeError('Nur die Sammlung recipes ist verfügbar');
        return {
          path, doc: id => ref(id || rid()), async add(d) { const r = ref(rid()); await r.set(d); return r; },
          onSnapshot(next, error) {
            const l = { next, error }; listeners.add(l);
            if (rows) setTimeout(() => next(snap(rows, false)), 0);
            else { try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); if (c) setTimeout(() => next(snap(c, true)), 0); } catch {} }
            channelOn(); refresh().catch(() => {});
            return () => listeners.delete(l);
          }
        };
      }
    });
    ns.assets = Object.freeze({
      async upload(blob) {
        const path = `${cb}/${rid()}.jpg`;
        const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
        if (error) throw fail('unavailable', error.message);
        return { id: path, url: sb.storage.from('photos').getPublicUrl(path).data.publicUrl, sizeBytes: blob.size, contentType: blob.type };
      },
      async delete(id) { if (id && id.startsWith(cb + '/')) await sb.storage.from('photos').remove([id]); },
      async list() { return { assets: [], usage: {} }; }
    });
    ns.user = Object.freeze({
      id: async () => uid, me: async () => ({ id: uid }), isOwner: async () => true, canEdit: async () => true, can: async () => true,
      async profiles(ids) {
        const { data } = await sb.from('members').select('user_id, display_name').eq('cookbook_id', cb);
        const m = Object.fromEntries((data || []).map(r => [r.user_id, { id: r.user_id, name: r.display_name }]));
        return Object.fromEntries(ids.map(i => [i, m[i] || { id: i, name: '' }]));
      }
    });
    // Mindestversion der Edge Function „import-recipe“, die diese App-Version braucht
    const FN_VERSION_NEEDED = 5; let fnWarned = false;
    function checkFnVersion(d) {
      const v = +(d?.version || 0);
      if (v >= FN_VERSION_NEEDED || fnWarned) return; fnWarned = true;
      const t = document.createElement('div'); t.className = 'toast'; t.style.cssText = 'bottom:calc(150px + env(safe-area-inset-bottom));animation:none';
      t.textContent = `Die Edge Function „import-recipe“ in Supabase ist veraltet (${v ? 'Version ' + v : 'ohne Versionsnummer'}, nötig: Version ${FN_VERSION_NEEDED}). Bitte den neuen Code einspielen.`;
      document.body.append(t); setTimeout(() => t.remove(), 8000);
    }
    async function callFn(body) {
      const { data, error } = await sb.functions.invoke('import-recipe', { body });
      if (error) {
        let code = 'upstream_error', msg = error.message;
        try { const j = await error.context.json(); code = j.code || code; msg = j.error || msg; } catch {}
        throw fail(code, msg);
      }
      checkFnVersion(data);
      if (data?.error) throw fail(data.code || 'upstream_error', data.error);
      return data;
    }
    const sample = async () => { throw fail('capability_disabled', 'Nur sample.json wird unterstützt'); };
    sample.limits = async () => ({ maxPromptBytes: 200000, images: { maxCount: 4, maxInputBytes: 20e6, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } });
    sample.json = async (prompt, opts = {}) => {
      const images = [];
      for (const f of [].concat(opts.images ? Array.from(opts.images.length !== undefined ? opts.images : [opts.images]) : [])) images.push({ media_type: 'image/jpeg', data: await toB64(await shrink(f)) });
      const d = await callFn({ prompt, images });
      return parseJson(d.text ?? d);
    };
    sample.importUrl = async (url, prompt) => { const d = await callFn({ url, prompt }); return d.recipe || parseJson(d.text ?? d); };
    sample.photo = async (name, desc) => { const d = await callFn({ action: 'photo', name, desc }); return d && 'photo' in d ? d.photo : null; };
    sample.inspire = async prompt => { const d = await callFn({ action: 'inspire', prompt }); if (!Array.isArray(d?.recipes)) throw Object.assign(new Error('inspire: Funktion veraltet'), { code: 'outdated' }); return d.recipes; };
    ns.sample = sample;
  }

  // ---------- Menü: teilen, Name, Daten übernehmen, abmelden ----------
  function addMenu() {
    const bar = document.querySelector('.top-in'); if (!bar || document.getElementById('sf-menu')) return;
    const b = document.createElement('button'); b.id = 'sf-menu'; b.type = 'button'; b.className = 'btn ghost-light'; b.textContent = 'Kochbuch';
    bar.append(b); b.addEventListener('click', openMenu);
  }
  async function openMenu() {
    const cb = ctx.cookbook, link = `${location.origin}${location.pathname}?code=${cb.invite_code}`;
    const { data: me } = await sb.from('members').select('display_name').eq('cookbook_id', cb.id).eq('user_id', ctx.user.id).maybeSingle();
    const layer = document.getElementById('layer');
    layer.innerHTML = `<div class="ov" role="dialog" aria-modal="true"><div class="sheet">
      <h2>${esc(cb.name)}</h2>
      <p>Einladungscode: <b style="font-size:22px;letter-spacing:2px;color:var(--ink)">${esc(cb.invite_code)}</b></p>
      <div class="btns" style="justify-content:flex-start;margin-top:0"><button class="btn primary" data-m="copy">Einladungslink kopieren</button></div>
      <label class="field" style="margin-top:18px"><span>Dein Name</span><input id="sf-me" maxlength="40" value="${esc(me?.display_name || '')}"></label>
      <div class="btns" style="justify-content:flex-start;margin-top:0"><button class="btn" data-m="name">Namen speichern</button></div>
      <details style="margin-top:18px"><summary style="cursor:pointer;font-weight:600">Rezepte aus der Testversion übernehmen</summary>
        <p>In der Testversion auf claude.ai ganz unten „Sicherung aller Rezepte“ öffnen, „Kopieren“ tippen und den Text hier einfügen – oder eine gespeicherte Sicherungsdatei wählen. Fotos werden nicht mit übernommen.</p>
        <label class="btn" style="position:relative;width:max-content;margin-bottom:8px">Sicherungsdatei wählen<input type="file" accept=".json,application/json" id="sf-file" style="position:absolute;inset:0;opacity:0"></label>
        <textarea id="sf-json" style="width:100%;min-height:120px;border-radius:12px;border:1.5px solid var(--line);background:var(--card);padding:10px;font-size:14px"></textarea>
        <div class="btns" style="justify-content:flex-start"><button class="btn" data-m="import">Übernehmen</button></div>
      </details>
      <p class="by sf-status" aria-live="polite"></p>
      <div class="btns"><button class="btn danger" data-m="logout">Abmelden</button><button class="btn" data-m="close">Schließen</button></div>
    </div></div>`;
    const ov = layer.firstElementChild, st = m => (ov.querySelector('.sf-status').textContent = m);
    ov.querySelector('#sf-file').addEventListener('change', async e => { const f = e.target.files?.[0]; if (f) { ov.querySelector('#sf-json').value = await f.text(); st('Datei geladen – jetzt „Übernehmen“ tippen.'); } });
    ov.addEventListener('click', async e => {
      if (e.target === ov) { layer.innerHTML = ''; return; }
      const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return;
      if (m === 'close') layer.innerHTML = '';
      if (m === 'copy') navigator.clipboard?.writeText(link).then(() => st('Link kopiert – schick ihn deiner Partnerin oder deinem Partner.'), () => st(link));
      if (m === 'name') { const { error } = await sb.from('members').update({ display_name: ov.querySelector('#sf-me').value.trim() || 'Ich' }).eq('cookbook_id', cb.id).eq('user_id', ctx.user.id); st(error ? 'Speichern hat nicht geklappt.' : 'Name gespeichert.'); }
      if (m === 'logout') { await sb.auth.signOut(); location.reload(); }
      if (m === 'import') {
        let list; try { const j = JSON.parse(ov.querySelector('#sf-json').value); list = Array.isArray(j) ? j : j.recipes; if (!Array.isArray(list)) throw 0; } catch { st('Das ist keine gültige Sicherung.'); return; }
        const rowsIn = list.filter(r => r && r.id && r.name).map(({ id, ...r }) => ({ cookbook_id: cb.id, id: String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || rid(), data: { ...r, photoId: null, photoUrl: null, photoOrigId: null, photoOrigUrl: null, photoCrop: null, createdBy: r.createdBy && r.createdBy === ctx.user.id ? r.createdBy : null, updatedBy: null, favBy: [] }, updated_at: now() }));
        st(`Übernehme ${rowsIn.length} Rezepte …`);
        const { error } = await sb.from('recipes').upsert(rowsIn);
        st(error ? 'Übernehmen hat nicht geklappt: ' + error.message : `${rowsIn.length} Rezepte übernommen.`);
      }
    });
  }

  // ---------- Start ----------
  async function start() {
    if (!configured) { gate('<h2>Noch nicht eingerichtet</h2><p>Trage in <b>config.js</b> die Supabase-Adresse und den anon-Schlüssel ein (siehe ANLEITUNG.md).</p>'); return; }
    let recovering = /type=recovery/.test(location.hash);
    sb.auth.onAuthStateChange((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') { recovering = true; showNewPassword(); return; }
      if (ev === 'SIGNED_IN' && session && !ctx && !recovering) afterLogin(session.user);
      if (ev === 'SIGNED_OUT' && ctx) location.reload();
    });
    const { data: { session } } = await sb.auth.getSession();
    if (recovering) { showNewPassword(); return; }
    if (session) afterLogin(session.user); else showLogin();
  }
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

  // ---------- Update-Hinweis ----------
  const myVersion = document.querySelector('meta[name="app-version"]')?.content || '';
  let lastCheck = 0, shown = false;
  async function checkUpdate() {
    if (shown || !myVersion || Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    try {
      const r = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
      const { version } = await r.json();
      if (version && version !== myVersion) showUpdate();
    } catch {}
  }
  function showUpdate() {
    shown = true;
    const bar = document.createElement('div');
    bar.className = 'toast'; bar.setAttribute('role', 'status');
    bar.style.cssText = 'display:flex;gap:12px;align-items:center;bottom:calc(92px + env(safe-area-inset-bottom))';
    bar.innerHTML = '<span>Neue Version verfügbar</span><button class="btn" style="min-height:36px;padding:0 14px">Neu laden</button>';
    bar.querySelector('button').addEventListener('click', () => location.reload());
    document.body.append(bar);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
  window.addEventListener('focus', checkUpdate);
  setTimeout(checkUpdate, 5000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
