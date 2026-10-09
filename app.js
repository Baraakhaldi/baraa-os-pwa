/* Baraa OS iPhone · build 4 */
(() => {
  'use strict';
  const BUILD = 4;
  const SUPABASE_URL = 'https://arfqsuawppydcgwzucjo.supabase.co';
  const VAPID_PUBLIC = 'BCe3QDPBXKzd_EIDEnwSIz6TvFT1hwBjXTjSp5K-PNN7oC7cFd0qYDq_JHE9nRPFukSmPXdWw925z4Io142OchM';
  const API = SUPABASE_URL + '/functions/v1/app-api';
  const ACTION_URL = SUPABASE_URL + '/functions/v1/task-action';
  const OFFSET = 3 * 3600 * 1000; // Asia/Riyadh, no DST
  const DAYMS = 86400000;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, w, ws) => `${n} ${n === 1 ? w : (ws || w + 's')}`;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- dates (Riyadh) ---------------- */
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const rd = (ms) => new Date(ms + OFFSET); // read with getUTC*
  const dayKey = (ms) => rd(ms).toISOString().slice(0, 10);
  const dayStart = (key) => Date.parse(key + 'T00:00:00Z') - OFFSET;
  const addDays = (key, n) => dayKey(dayStart(key) + n * DAYMS + 3600000);
  const dowOf = (key) => new Date(key + 'T00:00:00Z').getUTCDay();
  const isWeekend = (key) => { const d = dowOf(key); return d === 5 || d === 6; }; // Fri + Sat
  const hm = (ms) => { const d = rd(ms); const h = d.getUTCHours(), m = d.getUTCMinutes(); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'PM' : 'AM'}`; };
  const shortDay = (key) => { const d = new Date(key + 'T00:00:00Z'); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
  let hijriFmt = null;
  try { hijriFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'short', timeZone: 'UTC' }); } catch (e) {}
  const hijri = (key) => (hijriFmt && store.get('hijri') === '1' ? hijriFmt.format(new Date(key + 'T12:00:00Z')).replace(/ AH$/, '') : '');

  function dayWord(key) {
    const today = dayKey(Date.now());
    if (key === today) return 'Today';
    if (key === addDays(today, 1)) return 'Tomorrow';
    if (key === addDays(today, -1)) return 'Yesterday';
    const diff = Math.round((dayStart(key) - dayStart(today)) / DAYMS);
    if (diff > 1 && diff < 7) return DOW[dowOf(key)];
    return shortDay(key);
  }
  /** "Tonight · 7 PM", "Tomorrow · 11:59 PM", "Thu · 2 PM", "Today · all day" */
  function whenPhrase(t) {
    const s = Date.parse(t.starts_at);
    const key = dayKey(s);
    let w = dayWord(key);
    if (t.all_day) return `${w} · all day`;
    if (w === 'Today' && rd(s).getUTCHours() >= 17) w = 'Tonight';
    return `${w} · ${hm(s)}${t.ends_at ? '–' + hm(Date.parse(t.ends_at)) : ''}`;
  }
  /** "in 12 min", "in 2 h 10 min", "in 15 h", "in 3 days" (seconds only in the last hour, for the hero) */
  function inPhrase(ms, withSeconds) {
    const d = ms - Date.now();
    if (d <= 0) return 'now';
    const min = Math.floor(d / 60000);
    if (min < 60) {
      if (withSeconds) { const s = Math.floor((d % 60000) / 1000); return `in ${min}:${String(s).padStart(2, '0')}`; }
      return `in ${Math.max(1, min)} min`;
    }
    const h = Math.floor(min / 60), m = min % 60;
    if (h < 3) return `in ${h} h${m ? ' ' + m + ' min' : ''}`;
    if (h < 24) return `in ${h} h`;
    return `in ${plural(Math.round(h / 24), 'day')}`;
  }

  /* ---------------- theme ---------------- */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  let themePref = store.get('theme') || 'auto';
  const isDark = () => themePref === 'dark' || (themePref === 'auto' && mq.matches);
  function applyTheme() {
    const d = isDark();
    document.documentElement.dataset.theme = d ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').content = d ? '#0A0A0A' : '#F4F4F4';
    $('themePick').innerHTML = [['auto', 'Match iPhone'], ['light', 'Light'], ['dark', 'Dark']]
      .map(([id, l]) => `<button type="button" class="f${themePref === id ? ' on' : ''}" data-theme-pick="${id}" aria-pressed="${themePref === id}">${l}</button>`).join('');
    silk.dark = d; silk.redraw();
    if (state.data) render();
  }
  mq.addEventListener && mq.addEventListener('change', () => themePref === 'auto' && applyTheme());

  /* ---------------- silk background: animates 5 s, then ~1 fps; static with Reduce Motion ---------------- */
  const silk = (() => {
    const cv = $('silk');
    const api = { dark: false, redraw() {} };
    const gl = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!gl) return api;
    const fs = [
      'precision mediump float;',
      'uniform vec2 uRes; uniform float uTime; uniform vec3 uBg; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uSheen; uniform float uGrain;',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'void main(){',
      '  vec2 uv = gl_FragCoord.xy / uRes;',
      '  vec2 p = vec2((uv.x - 0.5) * (uRes.x / uRes.y), uv.y - 0.5);',
      '  float an = -0.42; p = mat2(cos(an), -sin(an), sin(an), cos(an)) * p;',
      '  vec3 col = uBg; float t = uTime * 0.32;',
      '  for (int i = 0; i < 4; i++) {',
      '    float fi = float(i);',
      '    vec3 lc = i == 0 ? uC0 : (i == 1 ? uC1 : (i == 2 ? uC2 : uC3));',
      '    float fr = 2.4 + fi * 0.7;',
      '    float ph = p.x * fr + t * (1.0 + fi * 0.3) + fi * 2.1;',
      '    float am = 0.11 + 0.04 * sin(t * 0.7 + fi);',
      '    float ph2 = ph * 2.3 - t * 1.3 + fi;',
      '    float w = am * sin(ph) + 0.045 * sin(ph2);',
      '    float d = p.y - (-0.36 + fi * 0.21 + w);',
      '    float slope = am * fr * cos(ph) + 0.1 * fr * cos(ph2);',
      '    float body = smoothstep(-0.015, 0.12, -d);',
      '    float m = body * clamp(exp(d * 2.6), 0.0, 1.0);',
      '    float fold = 0.72 + 0.28 * sin(ph * 1.6 + slope * 1.5 + 1.2);',
      '    col = mix(col, lc * fold, m * 0.9);',
      '    float edge = exp(-abs(d) * 55.0);',
      '    float spec = pow(clamp(0.5 + 0.5 * sin(ph * 1.6 + slope * 1.5 - 0.4), 0.0, 1.0), 7.0);',
      '    col += uSheen * (edge * 0.55 + spec * m * 0.35);',
      '  }',
      '  col *= mix(0.9, 1.0, smoothstep(1.1, 0.25, length(uv - 0.5)));',
      '  col += (hash(gl_FragCoord.xy) - 0.5) * uGrain;',
      '  gl_FragColor = vec4(col, 1.0);',
      '}'].join('\n');
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, mk(gl.VERTEX_SHADER, 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }'));
    gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return api;
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {};
    ['uRes', 'uTime', 'uBg', 'uC0', 'uC1', 'uC2', 'uC3', 'uSheen', 'uGrain'].forEach((n) => { u[n] = gl.getUniformLocation(pr, n); });
    const g = (v) => [v, v, v];
    let time = 14;
    const draw = () => {
      const dk = api.dark;
      gl.uniform2f(u.uRes, cv.width, cv.height);
      gl.uniform1f(u.uTime, time);
      gl.uniform3fv(u.uBg, dk ? g(0.035) : g(0.955));
      gl.uniform3fv(u.uC0, dk ? g(0.10) : g(0.88));
      gl.uniform3fv(u.uC1, dk ? g(0.15) : g(0.83));
      gl.uniform3fv(u.uC2, dk ? g(0.08) : g(0.92));
      gl.uniform3fv(u.uC3, dk ? g(0.13) : g(0.86));
      gl.uniform3fv(u.uSheen, dk ? g(0.30) : g(0.22));
      gl.uniform1f(u.uGrain, dk ? 0.05 : 0.035);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
      gl.viewport(0, 0, cv.width, cv.height); draw();
    };
    size(); addEventListener('resize', size);
    api.redraw = draw;
    if (!reduceMotion) {
      const t0 = performance.now(); let last = 0;
      const frame = (ts) => {
        const age = ts - t0;
        const gap = age < 5000 ? 40 : 1000; // smooth for 5 s, then about 1 fps
        if (!document.hidden && ts - last >= gap) { last = ts; time = 14 + age / 1000; draw(); }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }
    return api;
  })();

  /* ---------------- area colours ---------------- */
  const PAL_L = [['#EEEDFE', '#3C3489', '#534AB7'], ['#E1F5EE', '#085041', '#0F6E56'], ['#FAECE7', '#712B13', '#993C1D'], ['#FAEEDA', '#633806', '#854F0B'], ['#E6F1FB', '#0C447C', '#185FA5'], ['#FBEAF0', '#72243E', '#993556']];
  const PAL_D = [['#26215C', '#CECBF6', '#AFA9EC'], ['#04342C', '#9FE1CB', '#5DCAA5'], ['#4A1B0C', '#F5C4B3', '#F0997B'], ['#412402', '#FAC775', '#EF9F27'], ['#042C53', '#B5D4F4', '#85B7EB'], ['#4B1528', '#F4C0D1', '#ED93B1']];
  const areaIdx = {};
  function color(area) {
    const k = (area || 'Personal').toLowerCase();
    if (!(k in areaIdx)) {
      const names = [...new Set((state.data ? state.data.tasks : []).map((t) => (t.area || 'Personal').toLowerCase()).concat(k))].sort();
      names.forEach((n, i) => { if (!(n in areaIdx)) areaIdx[n] = i % PAL_L.length; });
    }
    const c = (isDark() ? PAL_D : PAL_L)[areaIdx[k]];
    return { tint: c[0], fg: c[1], strong: c[2] };
  }
  const areaTag = (area) => { const c = color(area); return `<span class="tag" style="background:${c.tint};color:${c.fg}"><bdi>${esc(area || 'Personal')}</bdi></span>`; };

  /* ---------------- Type groups (same as rules.ts) ---------------- */
  const CHOICES = {
    exam: [['ready', 'Ready ✓'], ['study_session', 'Plan a study session'], ['snooze60', 'Snooze 1 hour']],
    deadline: [['done', 'Submitted ✓'], ['more_time', 'Need more time'], ['note', 'Add note']],
    meeting: [['joined', 'Joined ✓'], ['late', 'Running late'], ['note', 'Add meeting notes']],
    study: [['start', 'Start now'], ['snooze15', 'Snooze 15 min'], ['skip', 'Skip today']],
    writing: [['done', 'Done ✓'], ['snooze60', 'Snooze 1 hour'], ['tomorrow', 'Move to tomorrow']],
    personal: [['done', 'Done ✓'], ['tomorrow', 'Tomorrow']],
  };
  const HERO = {
    exam: [['ready', 'Ready'], ['study_session', 'Plan study']],
    deadline: [['done', 'Submitted'], ['more_time', 'Need more time']],
    meeting: [['joined', 'Joined'], ['late', 'Running late']],
    study: [['start', 'Start'], ['done', 'Done']],
    writing: [['done', 'Done'], ['tomorrow', 'Tomorrow']],
    personal: [['done', 'Done'], ['tomorrow', 'Tomorrow']],
  };
  const GROUP_NAMES = [['exam', 'Exams & quizzes', 'Major, Quiz'], ['deadline', 'Deadlines', 'Deadline, Report, HW'], ['meeting', 'Meetings', 'Meeting'], ['study', 'Study', 'Study, Read'], ['writing', 'Writing', 'Writing, Feedback'], ['personal', 'Personal', 'Personal, Organize, Work'], ['overdue', 'Overdue nudges', 'Deadline, Study, Writing']];
  const isNoise = (t) => /\bclass(es)?\s*off\b|\bno class\b|\bholiday\b/i.test(t.title) || (t.all_day && !(t.types && t.types.length));

  /* ---------------- state ---------------- */
  const state = { view: 'today', day: null, filter: 'open', area: null, showDone: false, weekOffset: 0, data: null, loading: false, busy: new Set(), sheet: null, replan: null, inbox: null };
  try { const c = JSON.parse(store.get('cache') || 'null'); if (c && c.tasks) state.data = c; } catch (e) {}
  let device = store.get('device');
  let queue = []; try { queue = JSON.parse(store.get('queue') || '[]'); } catch (e) {}

  /* ---------------- toast ---------------- */
  let toastTimer = null, undoFn = null;
  function toast(msg, undo) {
    $('toastText').textContent = msg;
    undoFn = undo || null;
    $('toastUndo').hidden = !undo;
    $('toast').classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').classList.remove('on'); undoFn = null; }, undo ? 5000 : 2600);
  }
  $('toastUndo').addEventListener('click', () => { const f = undoFn; $('toast').classList.remove('on'); undoFn = null; if (f) f(); });

  /* ---------------- API + offline queue ---------------- */
  async function api(op, body, opts = {}) {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-device': device || '' }, body: JSON.stringify(Object.assign({ op }, body || {})) });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401 && device && !opts.noUnlink) { lostLink(); throw new Error('This iPhone is no longer linked.'); }
    if (!res.ok) throw new Error(j.error || 'Something went wrong. Try again.');
    return j;
  }
  const QUEUEABLE = new Set(['check', 'move', 'note_toggle']);
  async function write(op, body) {
    try { return await api(op, body); }
    catch (e) {
      if (e instanceof TypeError && QUEUEABLE.has(op)) { // offline: keep it and send later
        queue.push({ op, body, at: Date.now() }); store.set('queue', JSON.stringify(queue));
        return { queued: true };
      }
      throw e;
    }
  }
  async function flushQueue() {
    if (!device || !queue.length || !navigator.onLine) return;
    const left = [];
    for (const q of queue) { try { await api(q.op, q.body); } catch (e) { if (e instanceof TypeError) left.push(q); } }
    const sent = queue.length - left.length;
    queue = left; store.set('queue', JSON.stringify(queue));
    if (sent) toast(`Synced ${plural(sent, 'change')} made offline`);
  }
  addEventListener('online', () => { flushQueue().then(() => load(true)); });

  function lostLink() { device = null; store.set('device', null); store.set('cache', null); state.data = null; render(); }

  async function load(quiet) {
    if (!device || state.loading) return;
    state.loading = true;
    if (!quiet) $('syncLine').innerHTML = '<span class="spin"></span>';
    try {
      await flushQueue();
      const res = await fetch(API, { headers: { 'x-device': device } });
      if (res.status === 401) { lostLink(); return; }
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Server error');
      j.loadedAt = Date.now();
      state.data = j;
      store.set('cache', JSON.stringify(j));
    } catch (e) {
      if (!quiet) toast("Couldn't refresh. Showing the last saved tasks.");
    } finally { state.loading = false; render(); }
  }
  const findTask = (id) => (state.data ? state.data.tasks.find((t) => t.id === id) : null);
  function replaceTask(t) { if (!state.data || !t) return; const i = state.data.tasks.findIndex((x) => x.id === t.id); if (i >= 0) state.data.tasks[i] = Object.assign({}, state.data.tasks[i], t); store.set('cache', JSON.stringify(state.data)); }

  async function setChecked(task, checked, silent) {
    if (state.busy.has(task.id)) return;
    state.busy.add(task.id);
    const prev = task.checked; task.checked = checked; render();
    try {
      const r = await write('check', { id: task.id, checked });
      store.set('cache', JSON.stringify(state.data));
      if (!silent) toast(r.queued ? 'Saved offline · will sync' : (checked ? 'Done · ticked in Notion' : 'Unticked in Notion'), r.queued ? null : () => setChecked(task, !checked, true));
    } catch (e) { task.checked = prev; toast(e.message); }
    finally { state.busy.delete(task.id); render(); }
  }
  async function moveTo(task, to, date, silent) {
    const before = { starts_at: task.starts_at, ends_at: task.ends_at, all_day: task.all_day };
    state.busy.add(task.id); render();
    try {
      const r = await write('move', { id: task.id, to, date });
      if (r.queued) { toast('Saved offline · will sync'); return r; }
      replaceTask(r.task);
      if (!silent) toast(r.result.title);
      return r;
    } catch (e) { Object.assign(task, before); toast(e.message); }
    finally { state.busy.delete(task.id); render(); }
  }
  async function act(task, action, note) {
    state.busy.add(task.id); render();
    try {
      const r = await api('act', { id: task.id, action, note });
      replaceTask(r.task);
      if (['done', 'joined'].includes(action)) toast(r.result.title, () => setChecked(findTask(task.id) || task, false, true));
      else toast(r.result.title);
      if (action === 'study_session') load(true);
      return r;
    } catch (e) { toast(e.message); }
    finally { state.busy.delete(task.id); render(); }
  }

  /* ---------------- navigation ---------------- */
  const VIEWS = ['today', 'tasks', 'week', 'inbox', 'settings', 'notif', 'sheet', 'replan'];
  function go(view, opts) {
    state.view = view;
    VIEWS.forEach((v) => { $('v-' + v).hidden = v !== view; });
    $('nav').hidden = view === 'sheet' || view === 'replan';
    const tab = view === 'settings' || view === 'notif' ? 'today' : view;
    document.querySelectorAll('nav [data-go]').forEach((b) => { const on = b.dataset.go === tab; b.classList.toggle('on', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
    if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);
    if (view === 'settings') renderSettings();
    if (view === 'notif') renderNotif();
    if (view === 'inbox') loadInbox();
    render();
  }
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); if (g.dataset.area !== undefined) { state.area = g.dataset.area || null; state.day = state.day || dayKey(Date.now()); } if (g.dataset.day) state.day = g.dataset.day; go(g.dataset.go); return; }
    const tp = e.target.closest('[data-theme-pick]');
    if (tp) { themePref = tp.dataset.themePick; store.set('theme', themePref); applyTheme(); return; }
    const open = e.target.closest('[data-open]');
    if (open) { openSheet(open.dataset.open); return; }
    const ck = e.target.closest('[data-check]');
    if (ck && state.data) { const t = findTask(ck.dataset.check); if (t) setChecked(t, !t.checked); return; }
    const pd = e.target.closest('[data-pick-day]');
    if (pd) { state.day = pd.dataset.pickDay; render(); return; }
    const f = e.target.closest('[data-filter]');
    if (f) { state.filter = f.dataset.filter; render(); return; }
    if (e.target.closest('[data-clear-area]')) { state.area = null; render(); return; }
    if (e.target.closest('[data-toggle-done]')) { state.showDone = !state.showDone; render(); return; }
    const ha = e.target.closest('[data-hero]');
    if (ha) { const t = findTask(ha.dataset.id); if (t) heroAct(t, ha.dataset.hero); return; }
  });

  /* ---------------- render ---------------- */
  function render() {
    const linked = !!device;
    $('linkCard').hidden = linked;
    $('todayData').hidden = !linked && !state.data;
    if (state.data) {
      const n = state.data.inboxCount || 0;
      $('inboxBadge').hidden = !n; $('inboxBadge').textContent = n;
    }
    if (state.view === 'today') renderToday();
    if (state.view === 'tasks') renderTasks();
    if (state.view === 'week') renderWeek();
    updateBadge();
  }

  const tasksOn = (key) => { const s = dayStart(key), e = s + DAYMS; return (state.data ? state.data.tasks : []).filter((t) => { if (!t.starts_at) return false; const ms = Date.parse(t.starts_at); return ms >= s && ms < e; }); };
  const byTime = (a, b) => (a.all_day === b.all_day ? Date.parse(a.starts_at) - Date.parse(b.starts_at) : a.all_day ? -1 : 1);
  const endOf = (t) => (t.ends_at ? Date.parse(t.ends_at) : Date.parse(t.starts_at) + (t.all_day ? DAYMS : 0));

  function leftovers() {
    if (!state.data) return [];
    const today = dayKey(Date.now()), s0 = dayStart(addDays(today, -7)), s1 = dayStart(today);
    return state.data.tasks.filter((t) => !t.checked && t.starts_at && !isNoise(t) && !['meeting', 'exam'].includes(t.group) && Date.parse(t.starts_at) >= s0 && Date.parse(t.starts_at) < s1).sort(byTime);
  }

  function rowHTML(t, opts = {}) {
    const c = color(t.area);
    const now = Date.now();
    const overdue = !t.checked && endOf(t) < now && ['deadline', 'study', 'writing'].includes(t.group);
    const type = (t.types || [])[0];
    const when = opts.whenFull ? whenPhrase(t) : (t.all_day ? 'All day' : hm(Date.parse(t.starts_at)) + (t.ends_at ? '–' + hm(Date.parse(t.ends_at)) : ''));
    return `<div class="row card${t.checked ? ' done' : ''}${state.busy.has(t.id) ? ' busy' : ''}" data-row="${t.id}">
      <div class="swipebg" aria-hidden="true"><span>Done</span><span>Tomorrow</span></div>
      <div class="inner">
        <button type="button" class="cb" data-check="${t.id}" aria-pressed="${t.checked}" aria-label="${t.checked ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">
          <span style="${t.checked ? `background:${c.strong};border-color:${c.strong}` : ''}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${isDark() ? '#0A0A0A' : '#FFFFFF'}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
        </button>
        <button type="button" class="body" data-open="${t.id}" aria-label="Open ${esc(t.title)}">
          <span class="t title" dir="auto">${esc(t.title)}</span>
          <span class="m"><span class="dot" style="background:${c.strong}"></span><bdi>${esc(t.area || 'Personal')}</bdi><span>·</span><span>${esc(when)}</span>${type ? `<span>· ${esc(type)}</span>` : ''}${t.openNotes ? `<span>· ${plural(t.openNotes, 'note')}</span>` : ''}${overdue ? '<span class="flag">Overdue</span>' : ''}</span>
        </button>
      </div>
    </div>`;
  }

  /* ----- Today ----- */
  let heroTimer = null;
  function nextTask() {
    if (!state.data) return null;
    const now = Date.now(), today = dayKey(now), s1 = dayStart(today) + 2 * DAYMS;
    const list = state.data.tasks.filter((t) => !t.checked && t.starts_at && !isNoise(t) && endOf(t) > now && Date.parse(t.starts_at) < s1);
    const timed = list.filter((t) => !t.all_day).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    if (timed.length) return timed[0];
    return list.filter((t) => t.all_day).sort(byTime)[0] || null;
  }
  function renderToday() {
    const now = Date.now();
    const h = rd(now).getUTCHours();
    $('greet').textContent = h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,';
    const ts = state.data && state.data.termStart;
    if (ts) { const wk = Math.floor((dayStart(dayKey(now)) - dayStart(ts)) / (7 * DAYMS)) + 1; $('termWeek').textContent = wk > 0 && wk < 20 ? `Week ${wk} · Term 261` : ''; }
    if (!state.data) return;
    const today = dayKey(now);

    // leftovers banner
    const lo = leftovers();
    $('leftBanner').innerHTML = lo.length ? `<div class="card banner"><div class="m"><b>${plural(lo.length, 'unfinished task')} from earlier</b><span class="sub">${lo.some((t) => dayKey(Date.parse(t.starts_at)) === addDays(today, -1)) ? 'Including yesterday' : 'From the last few days'}</span></div><button class="btn sm" type="button" id="reviewBtn">Review</button></div>` : '';
    if (lo.length) $('reviewBtn').addEventListener('click', startReplan);

    // hero
    const todays = tasksOn(today).filter((t) => !isNoise(t));
    const done = todays.filter((t) => t.checked).length;
    const pct = todays.length ? done / todays.length : 0;
    const ring = `<div class="ring" aria-label="${done} of ${todays.length} done today"><svg width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="23" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="5"/><circle cx="28" cy="28" r="23" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="144.5" stroke-dashoffset="${(144.5 * (1 - pct)).toFixed(1)}" transform="rotate(-90 28 28)"/></svg><span>${done}/${todays.length}</span></div>`;
    const nt = nextTask();
    clearInterval(heroTimer);
    if (nt) {
      const s = Date.parse(nt.starts_at), live = !nt.all_day && s <= now;
      const whenMain = nt.all_day ? (dayKey(s) === today ? 'Today' : 'Tomorrow') : live ? `Now · until ${nt.ends_at ? hm(Date.parse(nt.ends_at)) : 'done'}` : inPhrase(s, s - now < 3600000);
      const btns = (HERO[nt.group] || HERO.personal).map(([id, l], i) => `<button type="button" class="${i ? 'o' : ''}" data-hero="${id}" data-id="${nt.id}">${l}</button>`).join('');
      $('hero').innerHTML = `<div class="hero">
        <div class="row1"><div class="info"><span class="lbl">${live ? 'Now' : 'Next up'}</span>
          <span class="ttl title" dir="auto">${esc(nt.title)}</span>
          <span class="when" id="heroWhen">${esc(whenMain)}</span>
          <span class="meta"><bdi>${esc(nt.area || 'Personal')}</bdi> · ${esc(whenPhrase(nt))}</span></div>${ring}</div>
        <div class="acts">${btns}</div>
        <button type="button" class="ghost" data-open="${nt.id}" style="color:inherit;opacity:.75;font-size:13px;min-height:36px;text-align:start;padding:0">Open task ›</button>
      </div>`;
      if (!nt.all_day && !live && s - now < 3600000) heroTimer = setInterval(() => { const el = $('heroWhen'); if (!el || Date.parse(nt.starts_at) <= Date.now()) { clearInterval(heroTimer); renderToday(); return; } el.textContent = inPhrase(s, true); }, 1000);
    } else {
      $('hero').innerHTML = `<div class="hero"><div class="row1"><div class="info"><span class="lbl">Today</span><span class="ttl">${todays.length ? (done === todays.length ? 'Everything is done for today.' : 'Nothing else timed today.') : 'Nothing planned for today.'}</span><span class="meta">${plural(todays.length - done, 'task')} left</span></div>${ring}</div></div>`;
    }

    // coming up: next 48 h, minus hero
    const s2 = dayStart(today) + 2 * DAYMS;
    const up = state.data.tasks.filter((t) => !t.checked && t.starts_at && !isNoise(t) && (!nt || t.id !== nt.id) && endOf(t) > now && Date.parse(t.starts_at) < s2).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)).slice(0, 5);
    $('upCount').textContent = up.length;
    $('upList').innerHTML = up.length ? up.map((t) => rowHTML(t, { whenFull: true })).join('') : '<span class="empty">Nothing else in the next two days.</span>';

    // areas this week (Sun–Sat)
    const wkStart = addDays(today, -dowOf(today));
    const s0 = dayStart(wkStart), s7 = s0 + 7 * DAYMS;
    const by = {};
    state.data.tasks.forEach((t) => { if (!t.starts_at || isNoise(t)) return; const ms = Date.parse(t.starts_at); if (ms < s0 || ms >= s7) return; const k = t.area || 'Personal'; by[k] = by[k] || { n: 0, d: 0 }; by[k].n++; if (t.checked) by[k].d++; });
    const areas = Object.entries(by).sort((a, b) => (b[1].n - b[1].d) - (a[1].n - a[1].d) || b[1].n - a[1].n);
    $('areaCount').textContent = areas.length;
    $('areaList').innerHTML = areas.length ? areas.map(([name, v]) => {
      const c = color(name);
      return `<button type="button" class="area" data-go="tasks" data-area="${esc(name)}" data-day="${today}">
        <span class="n"><bdi>${esc(name)}</bdi></span><span class="v">${v.d} of ${v.n} done</span>
        <span class="track"><span class="fill" style="display:block;width:${Math.round((v.d / v.n) * 100)}%;background:${c.strong}"></span></span>
      </button>`;
    }).join('') : '<span class="empty">No tasks this week.</span>';

    const ago = state.data.loadedAt ? Math.round((Date.now() - state.data.loadedAt) / 60000) : null;
    if (!state.loading) $('syncLine').textContent = (ago == null ? 'Tap to refresh' : `Updated ${ago < 1 ? 'just now' : plural(ago, 'min') + ' ago'} · tap to refresh`) + (queue.length ? ` · ${plural(queue.length, 'change')} waiting` : '');
  }
  $('syncLine').addEventListener('click', () => load());
  function heroAct(t, action) {
    if (action === 'tomorrow') { moveTo(t, 'tomorrow'); return; }
    if (action === 'done') { act(t, 'done'); return; }
    act(t, action);
  }

  /* ----- Tasks ----- */
  let scrolledDays = false;
  function renderTasks() {
    const now = Date.now(), today = dayKey(now);
    if (!state.day) state.day = today;
    const keys = []; for (let i = -3; i <= 10; i++) keys.push(addDays(today, i));
    $('days').innerHTML = keys.map((k) => {
      const d = new Date(k + 'T00:00:00Z');
      const open = tasksOn(k).some((t) => !t.checked && !isNoise(t));
      const hj = hijri(k);
      return `<button type="button" class="day${isWeekend(k) ? ' we' : ''}${k === state.day ? ' on' : ''}" data-pick-day="${k}" aria-label="${shortDay(k)}${isWeekend(k) ? ', weekend' : ''}" aria-pressed="${k === state.day}">
        <span>${k === today ? 'Today' : DOW[d.getUTCDay()]}</span><b>${d.getUTCDate()}</b><span>${hj || MON[d.getUTCMonth()]}</span>${open ? '<i></i>' : ''}</button>`;
    }).join('');
    const on = $('days').querySelector('.on');
    if (on && !scrolledDays) { on.scrollIntoView({ inline: 'center', block: 'nearest' }); scrolledDays = true; }

    const f = [['open', 'Not checked'], ['all', 'All'], ['done', 'Checked']].map(([id, l]) => `<button type="button" class="f${state.filter === id ? ' on' : ''}" data-filter="${id}" aria-pressed="${state.filter === id}">${l}</button>`);
    if (state.area) f.push(`<button type="button" class="f on" data-clear-area aria-label="Show all areas"><bdi>${esc(state.area)}</bdi> ✕</button>`);
    $('filters').innerHTML = f.join('');
    $('tasksTitle').textContent = state.day === today ? 'Tasks · Today' : `Tasks · ${dayWord(state.day)}${isWeekend(state.day) ? ' (weekend)' : ''}`;

    if (!state.data) { $('taskList').innerHTML = device ? '<span class="empty"><span class="spin"></span></span>' : '<span class="empty">Link this iPhone from Today to see your tasks.</span>'; return; }
    let list = tasksOn(state.day).sort(byTime);
    if (state.area) list = list.filter((t) => (t.area || 'Personal') === state.area);
    const open = list.filter((t) => !t.checked), done = list.filter((t) => t.checked);
    let html = '';
    if (state.filter === 'done') html = done.map((t) => rowHTML(t)).join('') || '<span class="empty">Nothing checked yet.</span>';
    else {
      html = open.map((t) => rowHTML(t)).join('') || `<span class="empty">${list.length ? 'All done for this day.' : (isWeekend(state.day) ? 'Weekend · nothing planned.' : 'Nothing on this day.')}</span>`;
      if (done.length) {
        if (state.filter === 'all' || state.showDone) html += `<button type="button" class="doneRow card" data-toggle-done aria-expanded="true"><span>${done.length} done</span><span>Hide</span></button>` + done.map((t) => rowHTML(t)).join('');
        else html += `<button type="button" class="doneRow card" data-toggle-done aria-expanded="false"><span>${done.length} done</span><span>Show</span></button>`;
      }
    }
    $('taskList').innerHTML = html;
  }

  /* ----- swipe: right = done, left = tomorrow ----- */
  (() => {
    let row = null, x0 = 0, y0 = 0, dx = 0, mode = null;
    document.addEventListener('touchstart', (e) => {
      const r = e.target.closest('.row'); if (!r || e.touches.length > 1) return;
      row = r; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; mode = null;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!row) return;
      const x = e.touches[0].clientX - x0, y = e.touches[0].clientY - y0;
      if (!mode) { if (Math.abs(x) < 8 && Math.abs(y) < 8) return; mode = Math.abs(x) > Math.abs(y) ? 'x' : 'y'; if (mode === 'x') row.classList.add('dragging'); }
      if (mode !== 'x') return;
      dx = Math.max(-140, Math.min(140, x));
      row.querySelector('.inner').style.transform = `translateX(${dx}px)`;
    }, { passive: true });
    document.addEventListener('touchend', () => {
      if (!row) return;
      const r = row, id = r.dataset.row; row = null;
      r.classList.remove('dragging');
      r.querySelector('.inner').style.transform = '';
      if (mode !== 'x') return;
      const t = findTask(id); if (!t) return;
      if (dx > 90 && !t.checked) setChecked(t, true);
      else if (dx < -90) moveTo(t, 'tomorrow').then((res) => { if (res && res.result) toast(res.result.title); });
    });
  })();

  /* ----- quick add: one line, parsed ----- */
  const TYPE_WORDS = [[/\b(midterm|final|major|exam)\b/i, 'Major'], [/\bquiz\b/i, 'Quiz'], [/\b(report)\b/i, 'Report'], [/\b(hw|homework|assignment)\b/i, 'HW'], [/\b(deadline|due|submit)\b/i, 'Deadline'], [/\b(meeting|meet|call)\b/i, 'Meeting'], [/\b(study|revise|review)\b/i, 'Study'], [/\bread\b/i, 'Read'], [/\b(write|writing|essay|draft)\b/i, 'Writing'], [/\bfeedback\b/i, 'Feedback'], [/\b(organi[sz]e|clean)\b/i, 'Organize'], [/\bwork\b/i, 'Work']];
  const QA_TYPES = ['Study', 'Deadline', 'HW', 'Report', 'Quiz', 'Major', 'Meeting', 'Writing', 'Personal'];
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  const DAYNAMES = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
  function parseQuick(text) {
    let s = ' ' + text.trim() + ' ';
    const today = dayKey(Date.now());
    let date = null, time = null;
    const cut = (re) => { const m = s.match(re); if (m) s = s.replace(m[0], ' '); return m; };
    let m;
    if ((m = cut(/\s(today)\s/i))) date = today;
    else if ((m = cut(/\s(tonight)\s/i))) { date = today; time = time || '19:00'; }
    else if ((m = cut(/\s(tomorrow|tmrw|tmr)\s/i))) date = addDays(today, 1);
    else if ((m = cut(/\sin (\d{1,2}) days?\s/i))) date = addDays(today, +m[1]);
    else if ((m = cut(/\s(?:on\s|next\s)?(sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday)\s/i))) {
      const want = DAYNAMES[m[1].toLowerCase()]; let k = today; for (let i = 0; i < 7; i++) { if (dowOf(k) === want) break; k = addDays(k, 1); } date = k;
    } else if ((m = cut(/\s(\d{1,2})\s?(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\s/i)) || (m = cut(/\s(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\s(\d{1,2})\s/i))) {
      const num = /\d/.test(m[1]); const day = num ? +m[1] : +m[2]; const mon = MONTHS[(num ? m[2] : m[1]).toLowerCase().slice(0, 3)];
      let y = +today.slice(0, 4); let k = `${y}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; if (k < today) k = `${y + 1}${k.slice(4)}`; date = k;
    } else if ((m = cut(/\s(\d{1,2})\/(\d{1,2})\s/))) {
      let y = +today.slice(0, 4); let k = `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`; if (k < today) k = `${y + 1}${k.slice(4)}`; date = k;
    }
    if ((m = cut(/\s(?:at\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)\s/i))) { let h = +m[1] % 12; if (m[3].toLowerCase() === 'pm') h += 12; time = `${String(h).padStart(2, '0')}:${m[2] || '00'}`; }
    else if ((m = cut(/\s(?:at\s)?([01]?\d|2[0-3]):([0-5]\d)\s/))) time = `${String(+m[1]).padStart(2, '0')}:${m[2]}`;
    else if ((m = cut(/\s(noon)\s/i))) time = '12:00';
    else if ((m = cut(/\s(midnight)\s/i))) time = '23:59';
    // area: course code or a known area name (#tag works too)
    let area = null;
    const known = state.data ? [...new Set(state.data.tasks.map((t) => t.area).filter(Boolean))] : [];
    const norm = (x) => x.toLowerCase().replace(/[\s#_-]/g, '');
    if ((m = s.match(/\s#([\w-]+)\s/))) { const hit = known.find((a) => norm(a) === norm(m[1])); area = hit || m[1]; s = s.replace(m[0], ' '); }
    if (!area && (m = s.match(/\s([a-z]{2,4})\s?(\d{3})\s/i))) { const code = `${m[1].toUpperCase()} ${m[2]}`; const hit = known.find((a) => norm(a) === norm(code)); area = hit || code; s = s.replace(m[0], ' '); }
    if (!area) { const hit = known.filter((a) => a.length > 3).find((a) => new RegExp(`\\s${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'i').test(s)); if (hit) area = hit; }
    let title = s.replace(/\s+/g, ' ').trim();
    if (title && /^[a-z]/.test(title)) title = title[0].toUpperCase() + title.slice(1);
    let type = null;
    const lead = title.match(/^(study|read|write|review)\b/i);
    if (lead) type = /read/i.test(lead[1]) ? 'Read' : /write/i.test(lead[1]) ? 'Writing' : 'Study';
    else for (const [re, ty] of TYPE_WORDS) if (re.test(title)) { type = ty; break; }
    if (!type) type = area && /\d/.test(area) ? null : 'Personal';
    if (time && !date) { date = today; const [hh, mm] = time.split(':').map(Number); if (dayStart(today) + (hh * 60 + mm) * 60000 < Date.now()) date = addDays(today, 1); }
    return { title, date, time, type, area };
  }
  let qa = null;
  function renderQA() {
    const box = $('qaPreview');
    if (!qa) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    const dateLabel = qa.date ? `${dayWord(qa.date)}${qa.time ? ' · ' + hm(dayStart(qa.date) + (+qa.time.slice(0, 2) * 60 + +qa.time.slice(3)) * 60000) : ' · all day'}` : 'No date';
    const quickDates = [['', 'No date'], [dayKey(Date.now()), 'Today'], [addDays(dayKey(Date.now()), 1), 'Tomorrow']];
    box.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">
      <div class="title" dir="auto" style="font-weight:500">${esc(qa.title || '(no name)')}</div>
      <div class="chips"><span class="chipbtn on" style="display:inline-flex;align-items:center">${esc(dateLabel)}</span>${quickDates.map(([k, l]) => `<button type="button" class="chipbtn" data-qa-date="${k}">${l}</button>`).join('')}</div>
      <div class="chips">${QA_TYPES.map((ty) => `<button type="button" class="chipbtn${qa.type === ty ? ' on' : ''}" data-qa-type="${ty}" aria-pressed="${qa.type === ty}">${ty}</button>`).join('')}</div>
      <div class="chips">${qa.area ? areaTag(qa.area) : '<span class="tiny sub">No area · add a course code like EE 420 or #personal</span>'}</div>
      <div class="grid2"><button type="button" class="btn" id="qaAdd">Add to Notion</button><button type="button" class="btn alt" id="qaCancel">Cancel</button></div>
    </div>`;
  }
  $('qaForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('qaIn').value.trim();
    if (!v) { $('qaIn').focus(); return; }
    if (!device) { toast('Link this iPhone first.'); return; }
    qa = parseQuick(v);
    if (!qa.date && state.day) qa.date = state.day;
    renderQA();
  });
  $('qaPreview').addEventListener('click', async (e) => {
    const d = e.target.closest('[data-qa-date]'); if (d) { qa.date = d.dataset.qaDate || null; if (!qa.date) qa.time = null; renderQA(); return; }
    const ty = e.target.closest('[data-qa-type]'); if (ty) { qa.type = qa.type === ty.dataset.qaType ? null : ty.dataset.qaType; renderQA(); return; }
    if (e.target.id === 'qaCancel') { qa = null; renderQA(); return; }
    if (e.target.id === 'qaAdd') {
      if (!qa.title) { toast('Give the task a name.'); return; }
      const b = e.target; b.disabled = true;
      const body = { title: qa.title, types: qa.type ? [qa.type] : [], subject: qa.area || undefined, academic: qa.area ? /\d/.test(qa.area) || /kfupm|academic/i.test(qa.area) : false };
      if (qa.date) {
        if (qa.time) { const ms = dayStart(qa.date) + (+qa.time.slice(0, 2) * 60 + +qa.time.slice(3)) * 60000; body.starts_at = new Date(ms).toISOString(); body.all_day = false; }
        else { body.starts_at = new Date(dayStart(qa.date)).toISOString(); body.all_day = true; }
      }
      try {
        const r = await api('create', body);
        if (state.data) { state.data.tasks.push(Object.assign({ moves: 0, openNotes: 0 }, r.task)); store.set('cache', JSON.stringify(state.data)); }
        toast(`Added · ${r.task.dateText}`);
        $('qaIn').value = ''; qa = null; renderQA();
        if (body.starts_at) state.day = dayKey(Date.parse(r.task.starts_at));
        render();
      } catch (err) { toast(err.message); b.disabled = false; }
    }
  });

  /* ----- Week ----- */
  function classesOn(key) {
    if (!state.data || !state.data.classes) return [];
    const wd = dowOf(key);
    return state.data.classes.filter((c) => c.weekday === wd && (!c.valid_from || c.valid_from <= key) && (!c.valid_to || c.valid_to >= key));
  }
  const t12 = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h >= 12 ? 'PM' : 'AM'}`; };
  function renderWeek() {
    const today = dayKey(Date.now());
    const start = addDays(addDays(today, -dowOf(today)), state.weekOffset * 7);
    const end = addDays(start, 6);
    const ts = state.data && state.data.termStart;
    const wk = ts ? Math.floor((dayStart(start) - dayStart(ts)) / (7 * DAYMS)) + 1 : null;
    const sd = new Date(start + 'T00:00:00Z'), ed = new Date(end + 'T00:00:00Z');
    $('wkTitle').textContent = `${wk && wk > 0 && wk < 20 ? 'Week ' + wk + ' · ' : ''}${sd.getUTCDate()} ${MON[sd.getUTCMonth()]} – ${ed.getUTCDate()} ${MON[ed.getUTCMonth()]}`;
    if (!state.data) { $('wkList').innerHTML = '<span class="empty">Link this iPhone to see your week.</span>'; return; }
    let html = '';
    for (let i = 0; i < 7; i++) {
      const k = addDays(start, i);
      const cls = classesOn(k);
      const ts2 = tasksOn(k).filter((t) => !isNoise(t)).sort(byTime);
      const hj = hijri(k);
      html += `<div class="card wday${isWeekend(k) ? ' we' : ''}${k === today ? ' today' : ''}">
        <div class="hd"><b>${shortDay(k)}</b>${hj ? `<span class="tiny sub">${esc(hj)}</span>` : ''}${isWeekend(k) ? '<span class="tiny sub">Weekend</span>' : ''}<span class="tiny sub" style="margin-inline-start:auto">${ts2.length ? plural(ts2.filter((t) => !t.checked).length, 'open task') : ''}</span></div>
        ${cls.map((c) => `<div class="cls${c.kind === 'office_hours' || /oh|office/i.test(c.kind || '') ? ' oh' : ''}"><span class="tm">${t12(c.start_time.slice(0, 5))}–${t12(c.end_time.slice(0, 5))}</span><span><bdi>${esc(c.course || c.title)}</bdi>${/oh|office/i.test(c.kind || '') ? ' · office hours' : ''}${c.location ? ' · ' + esc(c.location) : ''}</span></div>`).join('')}
        ${ts2.map((t) => rowHTML(t)).join('')}
        ${!cls.length && !ts2.length ? '<span class="empty">Free</span>' : ''}
      </div>`;
    }
    $('wkList').innerHTML = html;
  }
  $('wkPrev').addEventListener('click', () => { state.weekOffset--; renderWeek(); });
  $('wkNext').addEventListener('click', () => { state.weekOffset++; renderWeek(); });

  /* ----- Inbox ----- */
  async function loadInbox() {
    if (!device) { $('mailList').innerHTML = '<span class="empty">Link this iPhone to see your inbox.</span>'; return; }
    if (!state.inbox) $('mailList').innerHTML = '<span class="empty"><span class="spin"></span></span>';
    try { const r = await api('inbox'); state.inbox = r.emails; renderInbox(); }
    catch (e) { $('mailList').innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  }
  function renderInbox() {
    const list = state.inbox || [];
    const top = list.filter((m) => /action|important/i.test(m.tier || ''));
    const rest = list.length - top.length;
    const tierPill = (t) => `<span class="tag" style="${/action/i.test(t) ? 'background:var(--inv);color:var(--invfg)' : ''}">${/action/i.test(t) ? 'Action' : 'Important'}</span>`;
    $('mailList').innerHTML = (top.length ? top.map((m) => `<div class="card mail">
        <div style="display:flex;gap:8px;align-items:center">${tierPill(m.tier)}<span class="tiny sub">${esc(m.sender_name || '')} · ${esc(dayWord(dayKey(Date.parse(m.received_at))))}</span></div>
        <span class="s title" dir="auto">${esc(m.subject || '(no subject)')}</span>
        ${m.summary ? `<span class="small sub" dir="auto">${esc(m.summary)}</span>` : ''}
        ${m.action_needed ? `<span class="small" dir="auto"><b style="font-weight:500">To do:</b> ${esc(m.action_needed)}</span>` : ''}
        ${m.due_at ? `<span class="small">Due ${esc(whenPhrase({ starts_at: m.due_at, all_day: false }))}</span>` : ''}
        <div class="acts">
          <button type="button" class="btn sm" data-mail-task="${esc(m.message_id)}">Make a task</button>
          <button type="button" class="btn sm alt" data-mail-done="${esc(m.message_id)}">Done</button>
          ${m.web_link ? `<a class="btn sm alt" style="display:inline-flex;align-items:center;text-decoration:none" href="${esc(m.web_link)}" target="_blank" rel="noopener">Open in Outlook</a>` : ''}
        </div></div>`).join('') : '<div class="card panel"><div class="status ok"><i></i><span>Nothing needs you</span></div><p>No Action or Important emails right now.</p></div>')
      + (rest ? `<div class="hint">${plural(rest, 'other email')} (info and noise) are on the laptop.</div>` : '');
  }
  $('mailList').addEventListener('click', async (e) => {
    const d = e.target.closest('[data-mail-done]');
    if (d) {
      const id = d.dataset.mailDone; const keep = state.inbox; state.inbox = state.inbox.filter((m) => m.message_id !== id); renderInbox();
      if (state.data) { state.data.inboxCount = Math.max(0, (state.data.inboxCount || 1) - 1); render(); }
      try { await api('inbox_done', { message_id: id }); toast('Marked done'); } catch (err) { state.inbox = keep; renderInbox(); toast(err.message); }
      return;
    }
    const mt = e.target.closest('[data-mail-task]');
    if (mt) {
      const m = state.inbox.find((x) => x.message_id === mt.dataset.mailTask);
      go('tasks');
      const due = m.due_at ? ` ${shortDay(dayKey(Date.parse(m.due_at))).split(' ').slice(1).join(' ')} ${hm(Date.parse(m.due_at)).replace(' ', '').toLowerCase()}` : '';
      $('qaIn').value = (m.action_needed || m.subject || '').slice(0, 120) + due;
      $('qaForm').requestSubmit();
    }
  });

  /* ----- Task sheet (tap a row, or a notification link) ----- */
  async function openSheet(id, token) {
    state.sheet = { id, token, choices: null, kind: null, notes: null, notesErr: null, result: null, noteOpen: false, pick: false, confirmDrop: false, err: '' };
    go('sheet');
    renderSheet();
    if (token) {
      try {
        const r = await fetch(ACTION_URL + '?t=' + encodeURIComponent(token)).then((x) => x.json().then((j) => ({ ok: x.ok, j })));
        if (!r.ok) { state.sheet.err = r.j.error || 'Can’t open this task.'; state.sheet.dead = true; renderSheet(); return; }
        state.sheet.id = r.j.task.id; state.sheet.remote = r.j.task; state.sheet.choices = r.j.choices.map((c) => [c.id, c.label]); state.sheet.kind = r.j.kind;
      } catch (e) { state.sheet.err = 'No connection. Check your internet and reopen the notification.'; renderSheet(); return; }
    }
    renderSheet();
    if (device && state.sheet.id) {
      try { const r = await api('notes_get', { id: state.sheet.id }); if (state.sheet) { state.sheet.notes = r.notes; renderSheet(); } }
      catch (e) { if (state.sheet) { state.sheet.notesErr = e.message; renderSheet(); } }
    }
  }
  function sheetTask() {
    const s = state.sheet; if (!s) return null;
    const local = s.id ? findTask(s.id) : null;
    if (local) return local;
    if (s.remote) return Object.assign({ group: 'personal', types: [] }, s.remote);
    return null;
  }
  function renderSheet() {
    const s = state.sheet; if (!s) return;
    const t = sheetTask();
    const el = $('sheet');
    if (!t) { el.innerHTML = s.err ? `<h2>Can’t open this task</h2><div class="err">${esc(s.err)}</div>` : '<span class="spin"></span>'; return; }
    const chips = [areaTag(t.area)].concat((t.types || []).map((x) => `<span class="tag">${esc(x)}</span>`)).join(' ');
    const choices = s.choices || CHOICES[t.group] || CHOICES.personal;
    const today = dayKey(Date.now());
    const counts = {}; for (let i = 0; i < 8; i++) { const k = addDays(today, i); counts[k] = tasksOn(k).filter((x) => !x.checked && !isNoise(x)).length; }
    el.innerHTML = `
      <div style="display:flex;gap:6px;flex-wrap:wrap">${chips}</div>
      <h2 class="title" dir="auto" style="${t.checked ? 'text-decoration:line-through' : ''}">${esc(t.title)}</h2>
      <div class="sub">${esc(t.starts_at ? whenPhrase(t) : (t.dateText || 'No date'))}</div>
      ${s.result ? `<div class="result"><span class="tick" aria-hidden="true">✓</span><div><b>${esc(s.result.title)}</b><span>${esc(s.result.sub || '')}</span></div></div>` : ''}
      ${t.checked && !s.result ? '<div class="result"><span class="tick" aria-hidden="true">✓</span><div><b>Done</b><span>Check is ticked in Notion</span></div></div>' : ''}
      ${!t.checked ? `<div class="choices">${choices.map(([id, l], i) => `<button type="button" class="btn${i ? ' alt' : ''}" data-choice="${id}">${esc(l)}</button>`).join('')}</div>` : `<button type="button" class="btn alt" data-uncheck>Mark not done</button>`}
      <div id="noteBox" ${s.noteOpen ? '' : 'hidden'}>
        <label for="noteText" class="small sub">Note (added to Notes in Notion)</label>
        <textarea id="noteText" rows="3" dir="auto"></textarea>
        <div class="grid2" style="margin-top:8px"><button class="btn" type="button" id="noteSave">Save note</button><button class="btn alt" type="button" id="noteCancel">Cancel</button></div>
      </div>
      ${device && !s.dead ? `
      <div class="sec">Move</div>
      <div class="grid2"><button type="button" class="btn alt" data-move="evening">This evening</button><button type="button" class="btn alt" data-move="tomorrow">Tomorrow</button></div>
      <button type="button" class="btn alt" data-pick aria-expanded="${s.pick}">Pick a day</button>
      ${s.pick ? `<div class="daypick">${Object.keys(counts).map((k) => `<button type="button" class="${isWeekend(k) ? 'we' : ''}" data-move-date="${k}"><span>${k === today ? 'Today' : DOW[dowOf(k)]} ${new Date(k + 'T00:00:00Z').getUTCDate()}</span><small>${counts[k] ? plural(counts[k], 'task') : 'free'}</small></button>`).join('')}</div>` : ''}
      <div class="sec">Quick notes</div>
      <div id="notes">${s.notes ? (s.notes.length ? s.notes.map((n) => `<div class="note${n.checked ? ' done' : ''}"><button type="button" class="cb" data-note="${esc(n.id)}" aria-pressed="${n.checked}" aria-label="${n.checked ? 'Untick' : 'Tick'} note"><span style="${n.checked ? 'background:var(--fg);border-color:var(--fg)' : ''}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${isDark() ? '#0A0A0A' : '#FFFFFF'}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" style="opacity:${n.checked ? 1 : 0}"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span></button><span class="t" dir="auto">${esc(n.text)}</span></div>`).join('') : '<span class="empty">No quick notes yet.</span>') : (s.notesErr ? `<span class="err">${esc(s.notesErr)}</span>` : '<span class="empty"><span class="spin"></span></span>')}</div>
      <form class="noteadd" id="noteAdd"><label for="noteIn" hidden>New quick note</label><input id="noteIn" placeholder="Add a quick note" dir="auto" enterkeyhint="done"><button class="btn sm" type="submit">Add</button></form>
      ${(t.moves || 0) >= 3 ? `<div class="warn">Moved ${t.moves} times. Still needed?</div>` : ''}
      ${!s.confirmDrop ? '<button type="button" class="btn alt" data-drop>Drop this task</button>' : `<div class="warn">Drop removes it from Notion. It stays in Notion’s trash for 30 days.</div><div class="grid2"><button type="button" class="btn" data-drop-yes>Drop</button><button type="button" class="btn alt" data-drop-no>Keep</button></div>`}
      ${t.notion ? `<a class="btn alt" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="${esc(t.notion)}" target="_blank" rel="noopener">Open in Notion</a>` : ''}` : ''}
      <div class="err" role="alert">${esc(s.err || '')}</div>`;
  }
  $('sheet').addEventListener('click', async (e) => {
    const s = state.sheet; const t = sheetTask(); if (!s || !t) return;
    const c = e.target.closest('[data-choice]');
    if (c) {
      const id = c.dataset.choice;
      if (id === 'note') { s.noteOpen = true; renderSheet(); $('noteText').focus(); return; }
      await sheetAction(id); return;
    }
    if (e.target.closest('[data-uncheck]')) { await setChecked(t, false); s.result = null; renderSheet(); return; }
    if (e.target.id === 'noteCancel') { s.noteOpen = false; renderSheet(); return; }
    if (e.target.id === 'noteSave') { const n = $('noteText').value.trim(); if (!n) { s.err = 'Write a note first.'; renderSheet(); return; } await sheetAction('note', n); return; }
    const mv = e.target.closest('[data-move]');
    if (mv) { const r = await moveTo(t, mv.dataset.move, null, true); if (r && r.result) { s.result = r.result; renderSheet(); } return; }
    if (e.target.closest('[data-pick]')) { s.pick = !s.pick; renderSheet(); return; }
    const md = e.target.closest('[data-move-date]');
    if (md) { const r = await moveTo(t, 'date', md.dataset.moveDate, true); if (r && r.result) { s.result = r.result; s.pick = false; renderSheet(); } return; }
    const nb = e.target.closest('[data-note]');
    if (nb && s.notes) {
      const n = s.notes.find((x) => x.id === nb.dataset.note); if (!n) return;
      n.checked = !n.checked; renderSheet();
      try { await write('note_toggle', { block_id: n.id, checked: n.checked }); } catch (err) { n.checked = !n.checked; renderSheet(); toast(err.message); }
      return;
    }
    if (e.target.closest('[data-drop]')) { s.confirmDrop = true; renderSheet(); return; }
    if (e.target.closest('[data-drop-no]')) { s.confirmDrop = false; renderSheet(); return; }
    if (e.target.closest('[data-drop-yes]')) {
      try { const r = await api('drop', { id: t.id }); if (state.data) state.data.tasks = state.data.tasks.filter((x) => x.id !== t.id); store.set('cache', JSON.stringify(state.data)); toast(r.result.title); closeSheet(); }
      catch (err) { s.err = err.message; renderSheet(); }
    }
  });
  $('sheet').addEventListener('submit', async (e) => {
    if (e.target.id !== 'noteAdd') return;
    e.preventDefault();
    const s = state.sheet; const v = $('noteIn').value.trim(); if (!v || !s) return;
    $('noteIn').disabled = true;
    try { const r = await api('note_add', { id: s.id, text: v }); s.notes = r.notes; const t = findTask(s.id); if (t) t.openNotes = r.notes.filter((n) => !n.checked).length; renderSheet(); }
    catch (err) { toast(err.message); $('noteIn').disabled = false; }
  });
  async function sheetAction(action, note) {
    const s = state.sheet; const t = sheetTask(); s.err = '';
    document.querySelectorAll('#sheet button').forEach((b) => (b.disabled = true));
    try {
      let r;
      if (s.token) { // notification link: let task-action check the link and the choice
        const res = await fetch(ACTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: s.token, action, note }) });
        r = await res.json(); if (!res.ok) throw new Error(r.error || 'Something went wrong. Try again.');
        if (state.data && r.task) { const lt = findTask(r.task.id); if (lt) Object.assign(lt, { checked: r.task.checked }); }
        s.remote = Object.assign({}, s.remote, r.task);
        if (device) load(true);
      } else {
        r = await api('act', { id: t.id, action, note }); replaceTask(r.task);
      }
      s.result = r.result; s.noteOpen = false;
    } catch (e) { s.err = e.message; }
    renderSheet();
  }
  function closeSheet() { const tok = state.sheet && state.sheet.token; state.sheet = null; if (tok) history.replaceState(null, '', './'); go(state.prevView || 'today'); }
  $('sheetBack').addEventListener('click', closeSheet);

  /* ----- Replan: one card at a time ----- */
  function startReplan() { state.replan = { ids: leftovers().map((t) => t.id), i: 0, confirm: false }; go('replan'); renderReplan(); }
  function renderReplan() {
    const r = state.replan; const el = $('rp');
    if (!r) return;
    while (r.i < r.ids.length && !findTask(r.ids[r.i])) r.i++;
    if (r.i >= r.ids.length) { $('rpCount').textContent = ''; el.innerHTML = '<h2>All sorted</h2><p class="sub" style="margin:0">Nothing left over from earlier.</p><button type="button" class="btn" data-go="today">Back to Today</button>'; return; }
    const t = findTask(r.ids[r.i]);
    $('rpCount').textContent = `${r.i + 1} of ${r.ids.length}`;
    el.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap">${areaTag(t.area)}${(t.types || []).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
      <h2 class="title" dir="auto">${esc(t.title)}</h2>
      <div class="sub">Was ${esc(whenPhrase(t))}</div>
      ${(t.moves || 0) >= 3 ? `<div class="warn">Moved ${t.moves} times already. Consider dropping it.</div>` : ''}
      ${r.confirm ? `<div class="warn">Drop removes it from Notion. It stays in Notion’s trash for 30 days.</div><div class="grid2"><button type="button" class="btn" data-rp="drop-yes">Drop</button><button type="button" class="btn alt" data-rp="drop-no">Keep</button></div>`
      : `<div class="grid2"><button type="button" class="btn" data-rp="done">Done</button><button type="button" class="btn alt" data-rp="today">Today</button><button type="button" class="btn alt" data-rp="tomorrow">Tomorrow</button><button type="button" class="btn alt" data-rp="drop">Drop</button></div>`}
      <button type="button" class="ghost small sub" data-rp="skip" style="min-height:44px">Skip for now</button>`;
  }
  $('rp').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rp]'); const r = state.replan; if (!b || !r) return;
    const t = findTask(r.ids[r.i]); const a = b.dataset.rp;
    if (a === 'drop') { r.confirm = true; renderReplan(); return; }
    if (a === 'drop-no') { r.confirm = false; renderReplan(); return; }
    document.querySelectorAll('#rp button').forEach((x) => (x.disabled = true));
    try {
      if (a === 'done') await setChecked(t, true, true);
      else if (a === 'today' || a === 'tomorrow') await moveTo(t, a, null, true);
      else if (a === 'drop-yes') { await api('drop', { id: t.id }); state.data.tasks = state.data.tasks.filter((x) => x.id !== t.id); store.set('cache', JSON.stringify(state.data)); }
    } catch (err) { toast(err.message); }
    r.i++; r.confirm = false; renderReplan();
  });

  /* ----- Settings ----- */
  let reg = null;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then((r) => { reg = r; }).catch(() => {});
  const keyToBytes = (b64) => { const pad = '='.repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
  let pushOn = false;
  function renderSettings() {
    $('modeText').textContent = standalone ? 'Installed on this iPhone' : 'Running in Safari';
    $('mode').classList.toggle('ok', standalone);
    $('steps').hidden = standalone;
    $('installCard').hidden = standalone;
    $('pushText').textContent = 'Notifications: ' + (pushOn ? 'on' : 'off');
    $('pushStatus').classList.toggle('ok', pushOn);
    $('pushBtn').textContent = pushOn ? 'Re-register this iPhone' : 'Turn on notifications';
    $('pushBtn').disabled = !standalone || !device;
    $('linkStatusText').textContent = 'Tasks: ' + (device ? 'linked' : 'not linked');
    $('linkStatus').classList.toggle('ok', !!device);
    $('unlinkBtn').hidden = !device; $('codeBtn').hidden = !device;
    $('hijriSw').checked = store.get('hijri') === '1';
    if (!device) $('pushLog').textContent = 'Link this iPhone first (on Today), then turn on notifications.';
  }
  async function registerPush(ask) {
    if (!('PushManager' in window) || !device) return false;
    if (ask) { const perm = await Notification.requestPermission(); if (perm !== 'granted') throw new Error('Notifications are blocked. Allow them in Settings → Notifications → Baraa OS.'); }
    else if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const r = await navigator.serviceWorker.ready;
    const sub = (await r.pushManager.getSubscription()) || await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC) });
    const j = sub.toJSON();
    await api('subscribe', { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
    return true;
  }
  if ('serviceWorker' in navigator && 'PushManager' in window) navigator.serviceWorker.ready.then((r) => r.pushManager.getSubscription()).then((s) => { pushOn = !!s; if (state.view === 'settings') renderSettings(); }).catch(() => {});
  $('pushBtn').addEventListener('click', async () => {
    try { $('pushLog').textContent = 'Registering this iPhone…'; await registerPush(true); pushOn = true; renderSettings(); $('pushLog').textContent = 'Done. Reminders will arrive on their own.'; if (!store.get('focusTip')) $('pushLog').textContent += ' Tip: allow Baraa OS in your Focus modes (Notification settings).'; }
    catch (e) { $('pushLog').textContent = "Couldn't register: " + e.message; }
  });
  $('testBtn').addEventListener('click', async () => {
    if (!('Notification' in window)) { $('pushLog').textContent = 'This iOS version does not support web notifications.'; return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { $('pushLog').textContent = 'Notifications are blocked. Allow them in Settings → Notifications → Baraa OS.'; return; }
    const r = reg || await navigator.serviceWorker.ready;
    await r.showNotification('Test from Baraa OS', { body: 'Notifications are working on this iPhone.', icon: 'icons/icon-192.png' });
    $('pushLog').textContent = 'Sent. If nothing showed, check Focus mode and Settings → Notifications → Baraa OS.';
  });
  $('hijriSw').addEventListener('change', (e) => { store.set('hijri', e.target.checked ? '1' : null); toast(e.target.checked ? 'Hijri dates on' : 'Hijri dates off'); });
  let codeTimer = null;
  $('codeBtn').addEventListener('click', async () => {
    const box = $('codeBox'); box.hidden = false; box.innerHTML = '<span class="spin"></span>';
    try {
      const r = await api('pair_code_start');
      let left = r.expiresIn;
      const paint = () => { box.innerHTML = `<p>On the new iPhone, open Baraa OS and type this code. It works once and expires in ${Math.ceil(left / 60)} min.</p><div class="code" aria-live="polite">${r.code.slice(0, 3)} ${r.code.slice(3)}</div>`; };
      paint(); clearInterval(codeTimer);
      codeTimer = setInterval(() => { left -= 30; if (left <= 0) { clearInterval(codeTimer); box.innerHTML = '<p>The code expired. Tap again for a new one.</p>'; } else paint(); }, 30000);
    } catch (e) { box.innerHTML = `<span class="err">${esc(e.message)}</span>`; }
  });
  $('unlinkBtn').addEventListener('click', () => { $('unlinkConfirm').hidden = false; });
  $('unlinkNo').addEventListener('click', () => { $('unlinkConfirm').hidden = true; });
  $('unlinkYes').addEventListener('click', async () => {
    try { await api('unlink', {}, { noUnlink: true }); } catch (e) {}
    $('unlinkConfirm').hidden = true; lostLink(); renderSettings(); toast('Unlinked');
  });

  /* ----- Notification settings ----- */
  function prefs() { return (state.data && state.data.prefs) || { groups: {}, mutedAreas: [], quiet: { on: true, start: 23, end: 6 }, digest: false }; }
  const hourLabel = (h) => `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}`;
  function renderNotif() {
    const p = prefs();
    $('focusTip').hidden = store.get('focusTip') === '1';
    $('groupToggles').innerHTML = '<div class="status"><span>Reminders by Type</span></div>' + GROUP_NAMES.map(([id, name, types]) => `<div class="toggle"><label for="g-${id}">${name}<br><span class="tiny sub">${types}</span></label><input type="checkbox" class="sw" id="g-${id}" data-group="${id}" ${p.groups[id] !== false ? 'checked' : ''}></div>`).join('');
    $('quietSw').checked = !!p.quiet.on;
    const opts = (sel) => Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === sel ? ' selected' : ''}>${hourLabel(h)}</option>`).join('');
    $('qStart').innerHTML = opts(p.quiet.start); $('qEnd').innerHTML = opts(p.quiet.end);
    $('quietTimes').style.opacity = p.quiet.on ? 1 : 0.45;
    $('digestSw').checked = !!p.digest;
    const areas = state.data ? [...new Set(state.data.tasks.map((t) => t.area).filter(Boolean))].sort((a, b) => a.localeCompare(b)) : [];
    const muted = new Set((p.mutedAreas || []).map((a) => a.toLowerCase()));
    $('muteAreas').innerHTML = areas.length ? areas.map((a) => `<button type="button" class="f${muted.has(a.toLowerCase()) ? ' on' : ''}" data-mute="${esc(a)}" aria-pressed="${muted.has(a.toLowerCase())}"><bdi>${esc(a)}</bdi>${muted.has(a.toLowerCase()) ? ' · muted' : ''}</button>`).join('') : '<span class="empty">No areas yet.</span>';
  }
  let prefTimer = null;
  function savePrefs() {
    clearTimeout(prefTimer);
    $('prefLog').textContent = 'Saving…';
    prefTimer = setTimeout(async () => {
      try { const r = await api('prefs_set', { prefs: prefs() }); state.data.prefs = r.prefs; store.set('cache', JSON.stringify(state.data)); $('prefLog').textContent = 'Saved'; }
      catch (e) { $('prefLog').textContent = e.message; }
    }, 500);
  }
  $('v-notif').addEventListener('change', (e) => {
    if (!state.data) return; const p = prefs();
    if (e.target.dataset.group) { p.groups = Object.assign({}, p.groups, { [e.target.dataset.group]: e.target.checked }); }
    else if (e.target.id === 'quietSw') p.quiet = Object.assign({}, p.quiet, { on: e.target.checked });
    else if (e.target.id === 'qStart') p.quiet = Object.assign({}, p.quiet, { start: +e.target.value });
    else if (e.target.id === 'qEnd') p.quiet = Object.assign({}, p.quiet, { end: +e.target.value });
    else if (e.target.id === 'digestSw') p.digest = e.target.checked;
    else return;
    state.data.prefs = p; renderNotif(); savePrefs();
  });
  $('v-notif').addEventListener('click', (e) => {
    const m = e.target.closest('[data-mute]'); if (!m || !state.data) return;
    const p = prefs(); const a = m.dataset.mute; const set = new Set((p.mutedAreas || []).map((x) => x.toLowerCase()));
    p.mutedAreas = set.has(a.toLowerCase()) ? p.mutedAreas.filter((x) => x.toLowerCase() !== a.toLowerCase()) : (p.mutedAreas || []).concat(a);
    state.data.prefs = p; renderNotif(); savePrefs();
  });
  $('tipDone').addEventListener('click', () => { store.set('focusTip', '1'); $('focusTip').hidden = true; });

  /* ----- linking ----- */
  async function afterLink(dev) {
    device = dev; store.set('device', device);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    toast('This iPhone is linked');
    await load();
    registerPush(false).then((ok) => { if (ok) pushOn = true; }).catch(() => {});
  }
  $('linkBtn').addEventListener('click', async () => {
    const b = $('linkBtn'); b.disabled = true; $('linkLog').textContent = 'Sending…';
    try { await api('pair_start'); $('linkLog').textContent = 'Sent. Tap the “Link this iPhone” notification.'; }
    catch (e) { $('linkLog').textContent = e.message; }
    finally { setTimeout(() => { b.disabled = false; }, 4000); }
  });
  $('codeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('codeIn').value.replace(/\D/g, '');
    if (code.length !== 6) { $('linkLog').textContent = 'Enter all 6 digits.'; return; }
    $('linkLog').textContent = 'Linking…';
    try { const r = await api('pair_code', { code }); $('codeIn').value = ''; await afterLink(r.device); }
    catch (err) { $('linkLog').textContent = err.message; }
  });
  async function redeemPair(t) {
    history.replaceState(null, '', './');
    $('linkLog').textContent = 'Linking…';
    try { const r = await api('pair', { t }); await afterLink(r.device); }
    catch (e) { $('linkLog').textContent = e.message; }
  }

  /* ----- app badge: open tasks due today ----- */
  function updateBadge() {
    if (!state.data || !('setAppBadge' in navigator)) return;
    const n = tasksOn(dayKey(Date.now())).filter((t) => !t.checked && !isNoise(t)).length;
    (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  }

  /* ---------------- start ---------------- */
  applyTheme();
  const q = new URLSearchParams(location.search);
  const viewOf = () => state.view;
  // remember where the sheet was opened from
  document.addEventListener('click', (e) => { if (e.target.closest('[data-open]')) state.prevView = ['today', 'tasks', 'week'].includes(viewOf()) ? viewOf() : 'today'; }, true);
  if (q.get('t')) { state.prevView = 'today'; openSheet(null, q.get('t')); }
  else {
    go('today');
    if (q.get('pair')) redeemPair(q.get('pair'));
    else load(!!state.data);
  }
  if (device && standalone) registerPush(false).then((ok) => { if (ok) pushOn = true; }).catch(() => {}); // moves this phone's subscription onto its device key
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !['sheet', 'replan'].includes(state.view)) load(true); });
  setInterval(() => { if (!document.hidden && state.view === 'today') renderToday(); }, 60000);
  window.__baraa = { parseQuick, inPhrase, whenPhrase, BUILD }; // for tests
})();
