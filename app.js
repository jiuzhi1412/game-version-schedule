/* =========================================================================
 * 游戏版本周期日程表  —  Game Version Schedule
 * 纯前端单页应用。数据存 localStorage，预留云端同步接口。
 * ========================================================================= */

'use strict';

/* ----------------------------- 事件类型定义 ----------------------------- */
/* 每个版本周期内派生的固定事件。offsets 为相对"版本更新日(第0天)"的默认偏移天数。
 * 卡池更新一个版本发生两次(上半/下半)。
 * 这是默认模板；用户可在设置中增删隐藏，实际使用 state.customEvents。 */
const EVENT_DEFS_TEMPLATE = [
  { key: 'version_update',  name: '版本更新', offsets: [0] },
  { key: 'banner',          name: '卡池更新', offsets: [0, 21], sub: ['上半', '下半'] },
  { key: 'char_tease',      name: '新角色爆料', offsets: [33] },
  { key: 'char_preview',    name: '角色预告', offsets: [34] },
  { key: 'char_pv',         name: '角色PV', offsets: [35] },
  { key: 'version_preview', name: '版本前瞻', offsets: [35] },
];
// 向后兼容别名
const EVENT_DEFS = EVENT_DEFS_TEMPLATE;

/** 获取当前生效的事件定义列表（过滤掉 hidden 的） */
function activeEvents() {
  return (state.customEvents || EVENT_DEFS_TEMPLATE).filter(e => e.hidden !== true);
}

/* 事件类型配色（更丰富的区分度） */
const EVENT_COLORS = {
  version_update: '#16a34a',
  banner_0: '#2563eb',
  banner_1: '#38bdf8',
  char_tease: '#f97316',
  char_preview: '#a855f7',
  char_pv: '#ec4899',
  version_preview: '#e11d48',
};
function eventColor(defKey, idx) {
  if (defKey === 'banner') return EVENT_COLORS['banner_' + idx];
  return EVENT_COLORS[defKey] || '#64748b';
}

/* 游戏主题色板（丰富、对比明显） */
const PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981',
  '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#0d9488', '#0284c7', '#65a30d'
];

const DEFAULT_CYCLE = 42;
const DAY = 86400000;
const STORE_KEY = 'gvs_state_v1';
const LEAD_DEFAULT = 3; // 提前提醒天数

/* ----------------------------- 日期工具 ----------------------------- */
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12, 0, 0); }
function fmtDate(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
function pad(n) { return String(n).padStart(2, '0'); }
function addDays(dt, n) { return new Date(dt.getTime() + n * DAY); }
function stripTime(dt) { return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 12, 0, 0); }
function diffDays(a, b) { return Math.round((stripTime(a) - stripTime(b)) / DAY); }
function todayNoon() { const t = new Date(); t.setHours(12, 0, 0, 0); return t; }

/* 版本号：支持按版本段设置不同小版本号上限(minorMax)。
 * 数据结构：game.minorMax = 全局默认(如9)；game.minorMaxBreakpoints = [{atTenths, minorMax}, ...]
 * 例：[{atTenths:58, minorMax:8}] 表示从第58个版本起，.8之后变.0（之前仍用全局默认）。
 * 算法：从锚点逐步迭代到目标tenths，每步用该位置的有效minorMax决定是否进位。 */
function effectiveMinorMax(game, tenths) {
  const bps = (game.minorMaxBreakpoints || []);
  let mm = (typeof game.minorMax === 'number') ? game.minorMax : 9;
  for (let i = 0; i < bps.length; i++) { if (bps[i].atTenths <= tenths) mm = bps[i].minorMax; }
  return mm;
}
function verLabel(game, tenths) {
  if (tenths === game.anchorTenths) {
    return Math.floor(game.anchorTenths / 10) + '.' + (game.anchorTenths % 10);
  }
  const aMaj = Math.floor(game.anchorTenths / 10);
  let curMaj = aMaj, curMin = game.anchorTenths % 10;
  const step = tenths > game.anchorTenths ? 1 : -1;
  let t = game.anchorTenths;
  while (t !== tenths) {
    const mm = effectiveMinorMax(game, t);
    t += step;
    if (step > 0) { curMin++; if (curMin > mm) { curMaj++; curMin = 0; } }
    else { curMin--; if (curMin < 0) { curMaj--; curMin = mm; } }
  }
  return curMaj + '.' + curMin;
}

/* ----------------------------- 存储层（预留云端接口） ----------------------------- */
const Storage = {
  backend: 'local',
  syncAdapter: null,
  load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); } catch (e) { console.warn('load fail', e); }
    return null;
  },
  save(state) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { console.warn('save fail', e); }
    if (fileHandle) { try { persistToFile(); } catch (e) { console.warn('persist fail', e); } }
    if (this.syncAdapter && typeof this.syncAdapter.push === 'function') {
      try { this.syncAdapter.push(state); } catch (e) { console.warn('sync push fail', e); }
    }
  },
  enableCloud(adapter) { this.syncAdapter = adapter; this.backend = 'cloud'; },
  disableCloud() { this.syncAdapter = null; this.backend = 'local'; }
};

/* ----------------------------- 云端同步（Supabase） ----------------------------- */
/* 启用方法：去 https://supabase.com 建免费项目 → SQL Editor 执行 buildSql() → 把下面两项填好。
   未填写/离线时自动降级为纯本地（localStorage + 本机文件），不影响现有功能。 */
const SUPABASE_URL = 'https://zvgeldnvmzwhjrjaimau.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ag80tkGzn9UIFhbNpqYMUg_ViZP0qfC';

let supabase = null;
let cloudUser = null;           // { id, email }
let cloudReady = false;

function supabaseConfigured() { return !!SUPABASE_URL && !!SUPABASE_ANON_KEY; }
function supabaseLibReady() { return typeof window.supabase !== 'undefined'; }
function supabaseEnabled() { return supabaseConfigured() && supabaseLibReady(); }

function buildSql() {
  return `-- 在 Supabase 项目的 SQL Editor 执行：
create table if not exists public.user_schedule (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.user_schedule enable row level security;
create policy "own row" on public.user_schedule for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);`;
}

function initSupabase() {
  if (!supabaseEnabled()) return false;
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { persistSession: true, autoRefreshToken: true });
    supabase.auth.getSession().then(({ data }) => { if (data.session) onCloudLogin(data.session.user); });
    supabase.auth.onAuthStateChange((_e, session) => { if (session) onCloudLogin(session.user); else onCloudLogout(); });
    return true;
  } catch (e) { console.warn('initSupabase fail', e); return false; }
}

function onCloudLogin(user) {
  if (cloudUser && cloudUser.id === user.id) return; // 同一用户已处理，避免重复拉取
  cloudUser = { id: user.id, email: user.email };
  Storage.enableCloud(supabaseAdapter());
  updateCloudStatus();
  supabaseAdapter().pull().then(remote => {
    if (remote && Array.isArray(remote.games)) { applyRemoteState(remote); toast('已从云端同步数据'); }
    else { Storage.save(state); toast('已把本地数据上传到云端'); }
  }).catch(e => { console.warn('cloud pull fail', e); toast('云端同步失败'); });
}

function onCloudLogout() {
  cloudUser = null; cloudReady = false;
  Storage.disableCloud();
  updateCloudStatus();
}

function supabaseAdapter() {
  return {
    async pull() {
      if (!supabase || !cloudUser) return null;
      const { data, error } = await supabase.from('user_schedule').select('data')
        .eq('user_id', cloudUser.id).maybeSingle();
      if (error) { console.warn('pull err', error); return null; }
      return data && data.data ? data.data : null;
    },
    async push(st) {
      if (!supabase || !cloudUser) return;
      const { error } = await supabase.from('user_schedule')
        .upsert({ user_id: cloudUser.id, data: st, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) { console.warn('push err', error); toast('云端同步失败'); }
    }
  };
}

function applyRemoteState(remote) {
  if (!remote || !Array.isArray(remote.games)) return;
  state = remote;
  if (!state.customEvents || !Array.isArray(state.customEvents)) state.customEvents = JSON.parse(JSON.stringify(EVENT_DEFS_TEMPLATE));
  if (typeof state.dayW !== 'number') state.dayW = 4;
  if (typeof state.listCount !== 'number') state.listCount = 8;
  if (typeof state.listPast !== 'number') state.listPast = 2;
  if (typeof state.showLabels !== 'boolean') state.showLabels = true;
  state.games.forEach(migrateGame);
  visibleGames = state.visibleGames || {};
  Storage.save(state); render();
}

async function cloudSignIn(email, pwd) {
  if (!supabaseConfigured()) { alert('未配置 Supabase，请先在 app.js 顶部填入 URL 与 anon key。'); return; }
  if (!supabaseLibReady()) { alert('Supabase 库尚未加载完成（可能网络问题），请稍后重试或刷新页面。'); return; }
  const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
  if (error) { alert('登录失败：' + error.message); return; }
  toast('登录成功');
}
async function cloudSignUp(email, pwd) {
  if (!supabaseConfigured()) { alert('未配置 Supabase，请先在 app.js 顶部填入 URL 与 anon key。'); return; }
  if (!supabaseLibReady()) { alert('Supabase 库尚未加载完成（可能网络问题），请稍后重试或刷新页面。'); return; }
  const { error } = await supabase.auth.signUp({ email, password: pwd });
  if (error) { alert('注册失败：' + error.message); return; }
  alert('注册成功。若项目开启了邮箱确认，请先查收验证邮件再登录；未开启则已自动登录。');
}
async function cloudSignOut() { if (supabase) await supabase.auth.signOut(); }

function updateCloudStatus() {
  const el = document.getElementById('cloud-status');
  if (!el) return;
  if (cloudUser) { el.textContent = '☁ 已登录：' + (cloudUser.email || cloudUser.id); el.classList.add('on'); }
  else if (supabaseEnabled()) { el.textContent = '☁ 未登录'; el.classList.remove('on'); }
  else if (supabaseConfigured()) { el.textContent = '☁ 库加载中…'; el.classList.remove('on'); }
  else { el.textContent = '☁ 未配置（填好 Supabase 密钥后可用）'; el.classList.remove('on'); }
}

/* ----------------------------- 状态 ----------------------------- */
let state = null;
let viewMode = 'timeline'; // 'timeline' | 'calendar' | 'list'
let visibleGames = {};
let searchQuery = '';
let dragCtx = null;

/* ----------------------------- 本地文件自动备份（落盘到磁盘，独立于浏览器记录） ----------------------------- */
/* 数据实时写入用户指定的本机 .json 文件；清空浏览器记录/缓存也不会丢，重开网页后从文件恢复即可。 */
let fileHandle = null; // FileSystemFileHandle

function fsApiAvailable() { return typeof window.showSaveFilePicker === 'function'; }

/* 简易 IndexedDB 键值存储，用于记住文件句柄（跨刷新有效；清空浏览器数据后失效，需重新选择/恢复） */
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('gvs-idb', 1);
    r.onupgradeneeded = () => { try { r.result.createObjectStore('kv'); } catch (e) {} };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  try { const db = await idbOpen(); return await new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readonly'); const rq = tx.objectStore('kv').get(k);
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  }); } catch (e) { return null; }
}
async function idbSet(k, v) {
  try { const db = await idbOpen(); return await new Promise((res, rej) => {
    const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k);
    tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error);
  }); } catch (e) { return false; }
}

async function readFileHandle() {
  if (!fileHandle) return null;
  try { const f = await fileHandle.getFile(); const t = await f.text(); return JSON.parse(t); }
  catch (e) { console.warn('readFileHandle fail', e); return null; }
}
async function persistToFile() {
  if (!fileHandle) return;
  try {
    const w = await fileHandle.createWritable();
    await w.write(JSON.stringify(state));
    await w.close();
    updateBackupStatus();
  } catch (e) {
    console.warn('persistToFile fail', e);
    toast('自动备份到本机文件失败，请重新选择保存位置');
  }
}
function updateBackupStatus() {
  const badge = document.getElementById('backup-badge');
  if (badge) {
    if (fileHandle && fileHandle.name) {
      badge.textContent = '💾 已自动备份：' + fileHandle.name;
      badge.title = '数据已实时保存到本机文件：' + fileHandle.name + '\n（即使清空浏览器记录也不会丢失）';
      badge.classList.add('on');
    } else {
      badge.textContent = '⚠ 未设置本机备份';
      badge.title = '当前仅保存在浏览器中，清空浏览器记录会丢失。点「设置 → 数据备份」选择本机文件。';
      badge.classList.remove('on');
    }
  }
  const st = document.getElementById('s-file-status');
  if (st) st.textContent = fileHandle && fileHandle.name ? fileHandle.name : '未设置（当前仅存于浏览器）';
}
async function pickSaveFile() {
  if (!fsApiAvailable()) {
    alert('当前浏览器不支持本地文件自动备份（需 Chrome / Edge / 新版浏览器）。\n可改用「导出JSON」手动备份，或用本地服务器方案。');
    return;
  }
  try {
    const h = await window.showSaveFilePicker({
      suggestedName: 'game-schedule-data.json',
      types: [{ description: 'JSON 数据', accept: { 'application/json': ['.json'] } }]
    });
    fileHandle = h;
    await idbSet('fileHandle', h);
    await persistToFile();
    updateBackupStatus();
    toast('已设置本机自动备份：' + (h.name || ''));
  } catch (e) { if (e && e.name !== 'AbortError') console.warn(e); }
}
async function restoreFromFile() {
  if (!fsApiAvailable()) {
    alert('当前浏览器不支持文件选择器（需 Chrome / Edge）。请用「导入JSON」恢复备份。');
    return;
  }
  try {
    const [h] = await window.showOpenFilePicker({ types: [{ description: 'JSON 数据', accept: { 'application/json': ['.json'] } }] });
    const f = await h.getFile(); const t = await f.text(); const st = JSON.parse(t);
    if (!st || !Array.isArray(st.games)) throw new Error('文件格式不正确');
    state = st;
    fileHandle = h;
    await idbSet('fileHandle', h);
    if (!state.customEvents || !Array.isArray(state.customEvents)) state.customEvents = JSON.parse(JSON.stringify(EVENT_DEFS_TEMPLATE));
    if (typeof state.dayW !== 'number') state.dayW = 4;
    if (typeof state.listCount !== 'number') state.listCount = 8;
  if (typeof state.listPast !== 'number') state.listPast = 2;
    if (typeof state.showLabels !== 'boolean') state.showLabels = true;
    state.games.forEach(migrateGame);
    visibleGames = state.visibleGames || {};
    Storage.save(state); render(); updateBackupStatus();
    toast('已从本机文件恢复数据');
  } catch (e) { if (e && e.name !== 'AbortError') { console.warn(e); alert('恢复失败：' + e.message); } }
}

function defaultState() {
  const g = (name, full, color, anchorTenths, anchorDate) => ({
    id: 'g_' + Math.random().toString(36).slice(2, 9),
    name, fullName: full, color,
    icon: { type: 'letter', value: name[0], color },
    baseCycleDays: DEFAULT_CYCLE,
    anchorTenths, anchorDate, minorMax: 9,
    eventHistory: {}, baseOffsets: {}, eventTitles: {}, versionDurations: {}
  });
  const games = [
    g('原神', 'Genshin Impact', '#22c55e', 50, '2024-08-28'),
    g('崩坏：星穹铁道', 'Honkai: Star Rail', '#6366f1', 20, '2024-02-06'),
    g('绝区零', 'Zenless Zone Zero', '#f97316', 10, '2024-07-04'),
    g('崩坏3', 'Honkai Impact 3', '#ef4444', 42, '2024-01-01'),
    g('鸣潮', 'Wuthering Waves', '#06b6d4', 42, '2024-05-23'),
    g('终末地', 'Arknights: Endfield', '#14b8a6', 42, '2025-01-01'),
  ];
  games[0].icon = { type: 'file', value: 'icons/yuanshen.png', color: '#22c55e' };
  games[1].icon = { type: 'file', value: 'icons/starrail.png', color: '#6366f1' };
  games[2].icon = { type: 'file', value: 'icons/zenless.png', color: '#f97316' };
  games[3].icon = { type: 'file', value: 'icons/bh3.png', color: '#ef4444' };
  games[4].icon = { type: 'file', value: 'icons/wuthering.png', color: '#06b6d4' };
  games[5].icon = { type: 'file', value: 'icons/endfield.png', color: '#14b8a6' };
  const vis = {}; games.forEach(x => vis[x.id] = true);
  return {
    version: 1, games, leadDays: LEAD_DEFAULT, notified: [],
    customEvents: JSON.parse(JSON.stringify(EVENT_DEFS_TEMPLATE)),
    viewStart: fmtDate(addDays(todayNoon(), -60)),
    viewEnd: fmtDate(addDays(todayNoon(), 400)),
    visibleGames: vis, dayW: 4, listCount: 8, listPast: 2, showLabels: true
  };
}

function migrateGame(g) {
  if (typeof g.minorMax !== 'number') g.minorMax = 9;
  if (!g.minorMaxBreakpoints) g.minorMaxBreakpoints = [];
  if (!g.baseOffsets) g.baseOffsets = {};
  if (!g.eventTitles) g.eventTitles = {};
  if (!g.eventHistory) g.eventHistory = {};
  if (!g.versionDurations) g.versionDurations = {};
}

async function init() {
  // 优先从本机文件恢复（数据在磁盘上，清空浏览器记录也不丢）
  let loaded = null;
  if (fsApiAvailable()) {
    const h = await idbGet('fileHandle');
    if (h) {
      fileHandle = h;
      const fs = await readFileHandle();
      if (fs && fs.games && fs.games.length) loaded = fs;
    }
  }
  // 回退：浏览器 localStorage
  if (!loaded) loaded = Storage.load();

  if (loaded && loaded.games && loaded.games.length) {
    state = loaded;
    if (!state.visibleGames) { state.visibleGames = {}; state.games.forEach(x => state.visibleGames[x.id] = true); }
  } else {
    state = defaultState();
    Storage.save(state);
  }
  if (typeof state.dayW !== 'number') state.dayW = 4;
  if (typeof state.listCount !== 'number') state.listCount = 8;
  if (typeof state.listPast !== 'number') state.listPast = 2;
  if (typeof state.showLabels !== 'boolean') state.showLabels = true;
  if (!state.customEvents || !Array.isArray(state.customEvents)) {
    state.customEvents = JSON.parse(JSON.stringify(EVENT_DEFS_TEMPLATE));
  }
  state.games.forEach(migrateGame);
  visibleGames = state.visibleGames;
  render();
  updateBackupStatus();
  updateCloudStatus();
  // 延迟初始化 Supabase（等 CDN 库加载完成）
  if (supabaseConfigured()) {
    if (supabaseLibReady()) {
      initSupabase();
    } else {
      // CDN 可能还在加载，最多等 3 秒
      let tries = 0;
      const tryInit = setInterval(() => {
        tries++;
        if (supabaseLibReady() || tries > 6) { clearInterval(tryInit); initSupabase(); }
      }, 500);
    }
  }
  setupNotifications();
  // 拉取统一图标库清单（失败则用内置回退）
  fetch('icons/manifest.json').then(r => r.ok ? r.json() : null).then(j => {
    if (Array.isArray(j) && j.length) window.__iconLib = j;
  }).catch(() => {});
}

/* ----------------------------- 版本计算 ----------------------------- */
function durationOf(game, seq) {
  const d = game.versionDurations[String(seq)];
  return (typeof d === 'number' && d >= 7) ? d : game.baseCycleDays;
}
function evTitleKey(seq, hk) { return seq + '|' + hk; }

/* 推荐偏移：有历史取平均；否则用自定义基准 baseOffsets；再否则用默认 */
function eventOffset(game, hk, defOff) {
  const h = game && game.eventHistory && game.eventHistory[hk];
  if (h && h.length) return Math.round(h.reduce((a, b) => a + b, 0) / h.length);
  const bo = game && game.baseOffsets && game.baseOffsets[hk];
  return (typeof bo === 'number') ? bo : defOff;
}
function recordOffset(game, hk, off) {
  if (!game.eventHistory) game.eventHistory = {};
  if (!game.eventHistory[hk]) game.eventHistory[hk] = [];
  game.eventHistory[hk].push(off);
  if (game.eventHistory[hk].length > 12) game.eventHistory[hk].shift();
}
function learnedAvg(game, hk) {
  const h = game && game.eventHistory && game.eventHistory[hk];
  if (h && h.length) return Math.round(h.reduce((a, b) => a + b, 0) / h.length);
  return null;
}

function genGameVersions(game) {
  const vStart = parseDate(state.viewStart), vEnd = parseDate(state.viewEnd);
  const vStartMs = vStart.getTime(), vEndMs = vEnd.getTime();
  const out = [];
  const anchorMs = parseDate(game.anchorDate).getTime();
  const anchorT = game.anchorTenths;

  function makeVersion(t, dMs) {
    const updateDate = new Date(dMs);
    const dur = durationOf(game, t);
    const events = [];
    activeEvents().forEach(def => {
      def.offsets.forEach((defOff, idx) => {
        const hk = def.key + (def.offsets.length > 1 ? '_' + idx : '');
        const off = eventOffset(game, hk, defOff);
        const name = def.name + (def.sub ? def.sub[idx] : '');
        const custom = game.eventTitles && game.eventTitles[evTitleKey(t, hk)];
        const title = custom || name;
        events.push({
          defKey: def.key, historyKey: hk, sub: def.offsets.length > 1 ? idx : null,
          name, title, date: addDays(updateDate, off), offset: off
        });
      });
    });
    return { tenths: t, label: verLabel(game, t), updateDate, duration: dur, events };
  }

  let t = anchorT, d = anchorMs;
  while (d <= vEndMs) {
    const v = makeVersion(t, d);
    if (v.updateDate.getTime() + v.duration * DAY >= vStartMs) out.push(v);
    d += durationOf(game, t) * DAY; t += 1;
  }
  t = anchorT - 1; d = anchorMs - durationOf(game, t) * DAY;
  while (d >= vStartMs) {
    const v = makeVersion(t, d);
    if (v.updateDate.getTime() <= vEndMs) out.push(v);
    d -= durationOf(game, t) * DAY; t -= 1;
  }
  return out;
}

function collectEvents() {
  const list = [];
  state.games.forEach(game => {
    if (visibleGames[game.id] === false) return;
    genGameVersions(game).forEach(v => {
      v.events.forEach(ev => {
        list.push({ game, version: v, ev, date: ev.date, key: game.id + '|' + ev.historyKey + '|' + v.tenths });
      });
    });
  });
  return list;
}

/* ----------------------------- 渲染：通用 ----------------------------- */
// 统一图标库回退清单（manifest.json 拉取失败时仍可用）
const ICON_LIB_FALLBACK = [
  { file: 'icons/yuanshen.png', name: '原神' },
  { file: 'icons/starrail.png', name: '崩坏：星穹铁道' },
  { file: 'icons/zenless.png', name: '绝区零' },
  { file: 'icons/bh3.png', name: '崩坏3' },
  { file: 'icons/wuthering.png', name: '鸣潮' },
  { file: 'icons/endfield.png', name: '终末地' }
];
function iconLib() {
  return (window.__iconLib && window.__iconLib.length) ? window.__iconLib : ICON_LIB_FALLBACK;
}
function gameIconHTML(game, cls) {
  const ic = game.icon || { type: 'letter', value: game.name[0], color: game.color };
  if ((ic.type === 'image' || ic.type === 'file') && ic.value) {
    return `<span class="${cls}" style="background:${game.color}"><img src="${ic.value}" alt=""></span>`;
  }
  if (ic.type === 'emoji' && ic.value) {
    return `<span class="${cls}" style="background:${game.color}">${ic.value}</span>`;
  }
  return `<span class="${cls}" style="background:${ic.color || game.color}">${(ic.value || game.name[0])}</span>`;
}

function render() {
  renderFilterBar();
  document.getElementById('view-timeline').classList.toggle('hidden', viewMode !== 'timeline');
  document.getElementById('view-calendar').classList.toggle('hidden', viewMode !== 'calendar');
  document.getElementById('view-list').classList.toggle('hidden', viewMode !== 'list');
  renderViewControls();
  if (viewMode === 'timeline') renderTimeline();
  else if (viewMode === 'calendar') renderCalendar();
  else renderList();
  Storage.save(state);
}

/* ----------------------------- 过滤栏 ----------------------------- */
function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  bar.innerHTML = '';
  if (state.games.length === 0) { bar.innerHTML = '<span class="muted">还没有游戏，点击右上角“添加游戏”。</span>'; return; }
  state.games.forEach(game => {
    const chip = document.createElement('div');
    chip.className = 'filter-chip' + (visibleGames[game.id] === false ? ' off' : '');
    chip.draggable = true;
    chip.dataset.id = game.id;
    chip.innerHTML = `<span class="dot" style="background:${game.color}"></span>${escapeHtml(game.name)}`;
    chip.onclick = () => {
      visibleGames[game.id] = !(visibleGames[game.id] !== false);
      state.visibleGames = visibleGames; render();
    };
    const editBtn = document.createElement('button');
    editBtn.className = 'chip-edit';
    editBtn.textContent = '✎';
    editBtn.title = '编辑该游戏的设置';
    editBtn.onclick = (e) => { e.stopPropagation(); openGameModal(game.id); };
    chip.appendChild(editBtn);
    // 拖拽排序
    chip.addEventListener('dragstart', (e) => {
      chip.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', game.id);
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
      bar.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('drag-over'));
    });
    chip.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; chip.classList.add('drag-over'); });
    chip.addEventListener('dragleave', () => chip.classList.remove('drag-over'));
    chip.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      chip.classList.remove('drag-over');
      reorderGames(e.dataTransfer.getData('text/plain'), game.id);
    });
    bar.appendChild(chip);
  });
}

/** 拖拽重排游戏顺序 */
function reorderGames(fromId, toId) {
  if (!fromId || fromId === toId) return;
  const from = state.games.findIndex(g => g.id === fromId);
  const to = state.games.findIndex(g => g.id === toId);
  if (from < 0 || to < 0) return;
  const [moved] = state.games.splice(from, 1);
  state.games.splice(to, 0, moved);
  saveAndRender();
  toast('已调整游戏顺序');
}

/** 拖拽重排事件类型顺序 */
function reorderEvents(fromKey, toKey) {
  if (!fromKey || fromKey === toKey) return;
  const arr = state.customEvents;
  if (!arr) return;
  const from = arr.findIndex(e => e.key === fromKey);
  const to = arr.findIndex(e => e.key === toKey);
  if (from < 0 || to < 0) return;
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);
  saveAndRender();
  curSettingsTab = 's-events';
  openSettings();
  toast('已调整事件顺序');
}

/* ----------------------------- 视图统一设置条 + 时间轴侧栏 ----------------------------- */
const SHORT = { version_update: '更新', banner_0: '上半', banner_1: '下半', char_tease: '爆料', char_preview: '预告', char_pv: 'PV', version_preview: '前瞻' };
function evShortKey(ev) { return ev.defKey + (ev.sub != null ? '_' + ev.sub : ''); }
function fmtCalFocus(dt) { return dt.getFullYear() + '-' + (dt.getMonth() + 1); }
function shiftCal(d) {
  const parts = (state.calFocus || fmtCalFocus(todayNoon())).split('-');
  let y = Number(parts[0]), m = Number(parts[1]) + d;
  if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
  state.calFocus = y + '-' + m; saveAndRender();
}
function upcomingEvents(limit) {
  const all = collectEvents().filter(it => visibleGames[it.game.id] !== false && it.date >= addDays(todayNoon(), -1));
  all.sort((a, b) => a.date - b.date);
  return all.slice(0, limit || 12);
}
function timelineSidebarHTML() {
  let legend = '';
  activeEvents().forEach(def => def.offsets.forEach((o, idx) => {
    legend += `<div class="lg-item"><span class="lg-dot" style="background:${eventColor(def.key, idx)}"></span>${escapeHtml(def.name + (def.sub ? def.sub[idx] : ''))}<span class="muted">默认 +${o}天</span></div>`;
  }));
  let up = '';
  const list = upcomingEvents(12);
  if (!list.length) up = '<p class="muted">暂无临近事件</p>';
  list.forEach(it => {
    const cd = diffDays(it.date, todayNoon());
    const cdTxt = cd === 0 ? '今天' : (cd > 0 ? cd + ' 天后' : '已过');
    const soon = cd >= 0 && cd <= (state.leadDays || 3);
    up += `<div class="up-item${soon ? ' soon' : ''}" data-game="${it.game.id}" data-tenths="${it.version.tenths}" data-hk="${it.ev.historyKey}">` +
      `<div class="up-when">${fmtDate(it.date)}<span class="up-cd">${cdTxt}</span></div>` +
      `<div class="up-main">${gameIconHTML(it.game, 'chip-ico')}<b>${escapeHtml(it.game.name)}</b> v${it.version.label} · ${escapeHtml(it.ev.title)}</div></div>`;
  });
  return `<aside class="tl-side"><div class="tl-card"><div class="tl-card-h">事件图例</div>${legend}</div>` +
    `<div class="tl-card"><div class="tl-card-h">即将到来（${state.leadDays || 3}天内高亮）</div>${up}</div></aside>`;
}
function renderViewControls() {
  const bar = document.getElementById('view-controls');
  if (viewMode === 'timeline') {
    bar.innerHTML = `<span class="vc-label">缩放</span>` +
      `<button id="vc-zoom-out" class="vc-btn" title="缩小">－</button>` +
      `<input type="range" id="vc-zoom" min="2" max="24" value="${state.dayW || 4}">` +
      `<button id="vc-zoom-in" class="vc-btn" title="放大">＋</button>` +
      `<label class="vc-check"><input type="checkbox" id="vc-labels" ${state.showLabels ? 'checked' : ''}> 显示事件标签</label>` +
      `<button id="vc-today" class="vc-btn">跳到今天</button>` +
      `<span class="muted">拖版本块右缘可改时长 · 点事件可编辑</span>`;
    bar.classList.remove('hidden');
    document.getElementById('vc-zoom-out').onclick = () => { state.dayW = Math.max(2, (state.dayW || 4) - 1); saveAndRender(); };
    document.getElementById('vc-zoom-in').onclick = () => { state.dayW = Math.min(24, (state.dayW || 4) + 1); saveAndRender(); };
    document.getElementById('vc-zoom').oninput = (e) => { state.dayW = Number(e.target.value) || 4; render(); };
    document.getElementById('vc-labels').onchange = (e) => { state.showLabels = e.target.checked; saveAndRender(); };
    document.getElementById('vc-today').onclick = () => {
      const sc = document.querySelector('#view-timeline .timeline-scroll');
      if (sc) { const vS = parseDate(state.viewStart); const x = 156 + diffDays(todayNoon(), vS) * (state.dayW || 4); sc.scrollLeft = Math.max(0, x - 320); }
    };
  } else if (viewMode === 'calendar') {
    const f = state.calFocus || fmtCalFocus(todayNoon());
    const fp = f.split('-');
    bar.innerHTML = `<button id="vc-cal-prev" class="vc-btn">‹ 上个月</button>` +
      `<button id="vc-cal-today" class="vc-btn">今天（${todayNoon().getFullYear()}年${todayNoon().getMonth() + 1}月）</button>` +
      `<button id="vc-cal-next" class="vc-btn">下个月 ›</button>` +
      `<span class="muted">${fp[0]}年${fp[1]}月 · 点事件可编辑</span>`;
    bar.classList.remove('hidden');
    document.getElementById('vc-cal-prev').onclick = () => shiftCal(-1);
    document.getElementById('vc-cal-next').onclick = () => shiftCal(1);
    document.getElementById('vc-cal-today').onclick = () => { state.calFocus = fmtCalFocus(todayNoon()); saveAndRender(); };
    setTimeout(() => { const el = document.getElementById('month-' + f); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
  } else {
    bar.innerHTML = `<span class="vc-label">显示过去</span>` +
      `<input type="number" id="vc-listpast" min="0" max="30" value="${state.listPast || 2}" style="width:56px">` +
      `<span class="muted">个版本 · 未来</span>` +
      `<input type="number" id="vc-listcount" min="1" max="30" value="${state.listCount || 8}" style="width:56px">` +
      `<span class="muted">个版本</span>` +
      `<span class="muted">点游戏右侧“编辑”改周期/进位规则</span>`;
    bar.classList.remove('hidden');
    document.getElementById('vc-listpast').onchange = (e) => { state.listPast = Math.max(0, Math.min(30, Number(e.target.value) || 0)); saveAndRender(); };
    document.getElementById('vc-listcount').onchange = (e) => { state.listCount = Math.max(1, Math.min(30, Number(e.target.value) || 8)); saveAndRender(); };
  }
}

/* ----------------------------- 时间轴渲染 ----------------------------- */
function renderTimeline() {
  const host = document.getElementById('view-timeline');
  const vStart = parseDate(state.viewStart);
  const vEnd = parseDate(state.viewEnd);
  const totalDays = diffDays(vEnd, vStart);
  const dayW = state.dayW || 4;
  const laneH = 104;
  const labelW = 156;
  const width = totalDays * dayW + labelW;
  const xOf = (dt) => labelW + diffDays(dt, vStart) * dayW;
  const xBody = (dt) => diffDays(dt, vStart) * dayW;

  const visibleList = state.games.filter(g => visibleGames[g.id] !== false);

  let overlay = '<div class="tl-month-grid">';
  let cur = new Date(vStart.getFullYear(), vStart.getMonth(), 1, 12, 0, 0);
  while (cur <= vEnd) {
    const lx = xOf(cur);
    overlay += `<div class="tl-month-line" style="left:${lx}px"></div>`;
    overlay += `<div class="tl-month-label" style="left:${lx}px">${cur.getFullYear()}年${cur.getMonth() + 1}月</div>`;
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 12, 0, 0);
  }
  const todayMs = todayNoon().getTime();
  if (todayMs >= vStart.getTime() && todayMs <= vEnd.getTime()) {
    const tx = xOf(todayNoon());
    overlay += `<div class="tl-today" style="left:${tx}px"></div>`;
    overlay += `<div class="tl-today-label" style="left:${tx}px">今天</div>`;
  }
  overlay += '</div>';

  let lanes = '';
  visibleList.forEach(game => {
    const versions = genGameVersions(game).filter(v =>
      v.updateDate.getTime() <= vEnd.getTime() && v.updateDate.getTime() + v.duration * DAY >= vStart.getTime());
    let blocks = '', marks = '', labels = '';
    versions.forEach(v => {
      const left = xBody(v.updateDate);
      const w = v.duration * dayW;
      blocks += `<div class="tl-version" data-game="${game.id}" data-tenths="${v.tenths}" style="left:${left}px;width:${w}px;background:linear-gradient(135deg,${game.color},${shade(game.color,-18)})">` +
        `<span class="tl-vname">${escapeHtml(game.name)}</span> <span class="tl-vlabel">v${v.label}</span>` +
        `<div class="resize" data-game="${game.id}" data-tenths="${v.tenths}"></div></div>`;
      v.events.forEach(ev => {
        const mLeft = xBody(ev.date);
        if (mLeft >= left && mLeft <= left + w) {
          const tip = escapeHtml(ev.title) + ' ' + fmtDate(ev.date) + ' (+' + ev.offset + '天)';
          marks += `<div class="tl-event-mark" data-game="${game.id}" data-tenths="${v.tenths}" data-hk="${ev.historyKey}" title="${tip}" style="left:${mLeft}px;background:${eventColor(ev.defKey, ev.sub)}"></div>`;
          if (state.showLabels) {
            labels += `<div class="tl-evt-tag" data-game="${game.id}" data-tenths="${v.tenths}" data-hk="${ev.historyKey}" title="${tip}" style="left:${mLeft}px;--c:${eventColor(ev.defKey, ev.sub)}">${SHORT[evShortKey(ev)] || escapeHtml(ev.name)}</div>`;
          }
        }
      });
    });
    lanes += `<div class="tl-lane" style="height:${laneH}px">` +
      `<div class="tl-lane-label" style="width:${labelW}px">${gameIconHTML(game, 'icon')}<span>${escapeHtml(game.name)}</span></div>` +
      `<div class="tl-lane-body" style="height:${laneH}px">${blocks}${marks}${labels}</div></div>`;
  });

  const side = timelineSidebarHTML();
  host.innerHTML = `<div class="tl-layout"><div class="timeline-scroll"><div class="timeline-inner" style="width:${width}px;height:${Math.max(1, visibleList.length) * laneH + 4}px">${overlay}${lanes}</div></div>${side}</div>`;
  const sc = host.querySelector('.timeline-scroll');
  if (sc) sc.scrollLeft = Math.max(0, xOf(todayNoon()) - 320);
  bindTimelineEvents();
  host.querySelectorAll('.up-item').forEach(el => el.addEventListener('click', () => openVersionModal(el.dataset.game, Number(el.dataset.tenths), el.dataset.hk)));
}

function bindTimelineEvents() {
  const host = document.getElementById('view-timeline');
  host.querySelectorAll('.tl-version').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('resize')) return;
      openVersionModal(el.dataset.game, Number(el.dataset.tenths));
    });
  });
  host.querySelectorAll('.tl-event-mark').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); openVersionModal(el.dataset.game, Number(el.dataset.tenths), el.dataset.hk); });
  });
  host.querySelectorAll('.tl-evt-tag').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); openVersionModal(el.dataset.game, Number(el.dataset.tenths), el.dataset.hk); });
  });
  host.querySelectorAll('.resize').forEach(el => {
    el.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); startResize(el.dataset.game, Number(el.dataset.tenths), e); });
  });
}

function startResize(gameId, tenths, e) {
  const game = state.games.find(g => g.id === gameId);
  const dayW = state.dayW || 4;
  dragCtx = { game, tenths, startX: e.clientX, baseDur: durationOf(game, tenths) };
  function move(ev) {
    const dx = ev.clientX - dragCtx.startX;
    let nd = Math.round(dragCtx.baseDur + dx / dayW);
    nd = Math.max(14, Math.min(120, nd));
    dragCtx.newDur = nd;
    let tip = document.getElementById('drag-tip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'drag-tip'; tip.className = 'toast show'; tip.style.bottom = '60px'; document.body.appendChild(tip); }
    tip.textContent = `版本时长：${nd} 天`;
  }
  function up() {
    window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
    const tip = document.getElementById('drag-tip'); if (tip) tip.remove();
    if (dragCtx.newDur && dragCtx.newDur !== durationOf(game, tenths)) {
      game.versionDurations[String(tenths)] = dragCtx.newDur;
      saveAndRender(); toast(`已将该版本时长改为 ${dragCtx.newDur} 天，后续版本自动顺延`);
    }
    dragCtx = null;
  }
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
}

/* ----------------------------- 列表视图（自动计算的后继版本日程） ----------------------------- */
function renderList() {
  const host = document.getElementById('view-list');
  let html = '';
  const list = state.games.filter(g => visibleGames[g.id] !== false);
  if (!list.length) { host.innerHTML = '<p class="muted">暂无游戏</p>'; return; }
  list.forEach(game => {
    const all = genGameVersions(game);
    const tMs = addDays(todayNoon(), -1).getTime();
    const past = all.filter(v => v.updateDate.getTime() < tMs);
    const future = all.filter(v => v.updateDate.getTime() >= tMs);
    const pastN = past.slice(-(state.listPast || 2)).reverse(); // 过去版本：从旧到新排列
    const futureN = future.slice(0, state.listCount || 8);
    const cols = 2 + activeEvents().reduce((a, d) => a + d.offsets.length, 0);
    let rows = '';
    let dividerDone = false;
    const currentIdx = pastN.length > 0 ? pastN.length - 1 : -1; // 最后一个过去版本 = 当前版本
    [...pastN, ...futureN].forEach((v, i) => {
      if (!dividerDone && pastN.length && futureN.length && i === pastN.length) {
        rows += `<tr class="vt-divider"><td colspan="${cols}">— 今天 —</td></tr>`;
        dividerDone = true;
      }
      // 当前版本（最近的过去版本）高亮，其他过去版本灰，未来正常
      const isCurrent = (i === currentIdx);
      const rowCls = isCurrent ? ' class="vt-current"' : (i < pastN.length ? ' class="vt-past"' : '');
      rows += `<tr${rowCls}><td class="vt-ver">${isCurrent ? '📍 ' : ''}${v.label}</td><td>${fmtDate(v.updateDate)}</td>`;
      v.events.forEach(ev => {
        const cd = diffDays(ev.date, todayNoon());
        const cdTxt = cd === 0 ? '今天' : (cd > 0 ? '+' + cd : String(cd));
        const isSoon = cd >= 0 && cd <= (state.leadDays || 3);
        rows += `<td class="${isSoon ? 'soon' : ''}" title="${escapeHtml(ev.title)}">${fmtDate(ev.date)}` +
          `<div class="muted" style="font-size:11px">${cdTxt}</div>` +
          (ev.title !== ev.name ? `<div class="ev-custom">${escapeHtml(ev.title)}</div>` : '') + `</td>`;
      });
      rows += `</tr>`;
    });
    let head = '<th>版本</th><th>更新</th>';
    activeEvents().forEach(def => def.offsets.forEach((o, idx) => {
      head += `<th><span class="chip-dot" style="background:${eventColor(def.key, idx)};display:inline-block;width:8px;height:8px;border-radius:50%"></span> ${escapeHtml(def.name + (def.sub ? def.sub[idx] : ''))}</th>`;
    }));
    html += `<div class="list-game"><div class="list-game-title">${gameIconHTML(game, 'icon')} <b>${escapeHtml(game.name)}</b>` +
      `<span class="muted">基础 ${game.baseCycleDays}天 · 小版本上限 ${game.minorMax} · 显示过去 ${state.listPast || 2} / 未来 ${state.listCount || 8} 个版本</span>` +
      `<button class="ghost" style="margin-left:auto" onclick="openGameModal('${game.id}')">编辑</button></div>` +
      `<div class="calendar-scroll"><table class="ver-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  });
  host.innerHTML = html;
}

/* ----------------------------- 月历渲染 ----------------------------- */
function renderCalendar() {
  const host = document.getElementById('view-calendar');
  const vStart = parseDate(state.viewStart);
  const vEnd = parseDate(state.viewEnd);
  const all = collectEvents();
  const byDate = {};
  all.forEach(it => {
    if (searchQuery && !(it.game.name.includes(searchQuery) || it.ev.name.includes(searchQuery) || (it.ev.title && it.ev.title.includes(searchQuery)))) return;
    const k = fmtDate(it.date);
    (byDate[k] = byDate[k] || []).push(it);
  });
  let cur = new Date(vStart.getFullYear(), vStart.getMonth(), 1, 12, 0, 0);
  let html = '';
  const dow = ['日', '一', '二', '三', '四', '五', '六'];
  while (cur <= vEnd) {
    const y = cur.getFullYear(), m = cur.getMonth();
    const firstDow = new Date(y, m, 1, 12, 0, 0).getDay();
    const daysInMonth = new Date(y, m + 1, 0, 12, 0, 0).getDate();
    let cells = '';
    for (let i = 0; i < firstDow; i++) cells += cellHTML(new Date(y, m, 1 - (firstDow - i), 12, 0, 0), byDate, true);
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, m, d, 12, 0, 0);
      cells += (dt < vStart || dt > vEnd) ? cellHTML(dt, byDate, true) : cellHTML(dt, byDate, false);
    }
    const rem = (7 - ((firstDow + daysInMonth) % 7)) % 7;
    for (let i = 0; i < rem; i++) cells += cellHTML(new Date(y, m + 1, i + 1, 12, 0, 0), byDate, true);
    let head = ''; dow.forEach(w => head += `<div class="cal-dow">${w}</div>`);
    html += `<div class="month" id="month-${y}-${m + 1}"><div class="month-title">${y} 年 ${m + 1} 月</div><div class="calendar-scroll"><div class="cal-grid">${head}${cells}</div></div></div>`;
    cur = new Date(y, m + 1, 1, 12, 0, 0);
  }
  host.innerHTML = html;
  host.querySelectorAll('.ev-chip').forEach(el => {
    el.addEventListener('click', () => openVersionModal(el.dataset.game, Number(el.dataset.tenths), el.dataset.hk));
  });
}

function cellHTML(dt, byDate, out) {
  const k = fmtDate(dt);
  const isToday = diffDays(dt, todayNoon()) === 0;
  const evs = byDate[k] || [];
  let chips = '';
  evs.slice(0, 4).forEach(it => {
    chips += `<div class="ev-chip" data-game="${it.game.id}" data-tenths="${it.version.tenths}" data-hk="${it.ev.historyKey}" title="${escapeHtml(it.game.name)} ${escapeHtml(it.ev.title)}">` +
      `${gameIconHTML(it.game, 'chip-ico')}<span class="chip-dot" style="background:${eventColor(it.ev.defKey, it.ev.sub)}"></span>` +
      `<span class="chip-txt">${escapeHtml(it.ev.title)}</span></div>`;
  });
  if (evs.length > 4) chips += `<div class="muted" style="font-size:10px">+${evs.length - 4} 更多</div>`;
  return `<div class="cal-cell${out ? ' out' : ''}${isToday ? ' today' : ''}"><span class="dnum">${dt.getDate()}</span>${chips}</div>`;
}

/* ----------------------------- 弹窗：版本 / 事件编辑 ----------------------------- */
let curModalGame = null, curModalTenths = null;
function openVersionModal(gameId, tenths, focusHk) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;
  curModalGame = game; curModalTenths = tenths;
  const versions = genGameVersions(game);
  const v = versions.find(x => x.tenths === tenths) || versions[0];
  if (!v) return;

  document.getElementById('modal-title').textContent = `${game.name} · 版本 ${v.label}`;
  const body = document.getElementById('modal-body');

  let html = `<div class="field"><label>版本更新日期</label>
    <div class="row"><input type="date" id="m-update" value="${fmtDate(v.updateDate)}">
    <span class="muted">基础周期 ${game.baseCycleDays} 天</span></div></div>`;
  html += `<div class="field"><label>本版本时长（天）</label>
    <div class="row"><input type="number" id="m-dur" min="14" max="120" value="${v.duration}">
    <button id="m-dur-reset" class="ghost">恢复基础周期</button></div>
    <div class="muted" style="margin-top:4px">修改后，该版本之后的所有版本会自动顺延。</div></div>`;

  html += `<div class="field"><label>事件（改日期记入历史偏移；可填自定义名称，如角色名）</label>`;
  v.events.forEach(ev => {
    const off = diffDays(ev.date, v.updateDate);
    const tkey = evTitleKey(v.tenths, ev.historyKey);
    const custom = game.eventTitles && game.eventTitles[tkey] ? game.eventTitles[tkey] : '';
    html += `<div class="ev-row">
      <span class="ev-name"><span class="chip-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${eventColor(ev.defKey, ev.sub)}"></span> ${escapeHtml(ev.name)}</span>
      <input type="text" class="m-title" data-tkey="${tkey}" placeholder="自定义名称" value="${escapeAttr(custom)}" style="max-width:120px">
      <input type="date" data-hk="${ev.historyKey}" data-defkey="${ev.defKey}" data-sub="${ev.sub}" value="${fmtDate(ev.date)}">
      <span class="ev-offset">+${off}天</span>
    </div>`;
  });
  html += `</div>`;
  body.innerHTML = html;

  document.getElementById('m-dur-reset').onclick = () => { delete game.versionDurations[String(tenths)]; saveAndRender(); openVersionModal(gameId, tenths, focusHk); };
  body.querySelector('#m-dur').onchange = (e) => {
    let nd = Math.max(14, Math.min(120, Number(e.target.value) || game.baseCycleDays));
    game.versionDurations[String(tenths)] = nd; saveAndRender(); openVersionModal(gameId, tenths, focusHk);
  };
  body.querySelector('#m-update').onchange = (e) => {
    const nd = parseDate(e.target.value);
    const shift = diffDays(nd, v.updateDate);
    game.anchorDate = fmtDate(addDays(parseDate(game.anchorDate), shift));
    saveAndRender(); openVersionModal(gameId, tenths, focusHk);
    toast('已把该版本更新日期设为新基准，整条时间线平移');
  };
  body.querySelectorAll('.m-title').forEach(inp => {
    inp.onchange = () => {
      const key = inp.dataset.tkey;
      const val = inp.value.trim();
      if (!game.eventTitles) game.eventTitles = {};
      if (val) game.eventTitles[key] = val; else delete game.eventTitles[key];
      saveAndRender(); openVersionModal(gameId, tenths, focusHk);
    };
  });
  body.querySelectorAll('input[type="date"][data-hk]').forEach(inp => {
    inp.onchange = (e) => {
      const newDate = parseDate(e.target.value);
      const upd = parseDate(document.getElementById('m-update').value);
      const off = diffDays(newDate, upd);
      recordOffset(game, inp.dataset.hk, off);
      saveAndRender(); openVersionModal(gameId, tenths, focusHk);
      toast(`已记录偏移 +${off} 天，后续按历史平均推荐（可去游戏设置重置学习）`);
    };
  });
  showModal();
}

/* ----------------------------- 弹窗：游戏编辑 ----------------------------- */
let editingGameId = null;
function openGameModal(gameId) {
  editingGameId = gameId || null;
  const game = gameId ? state.games.find(g => g.id === gameId) : null;
  document.getElementById('modal-title').textContent = game ? '编辑游戏' : '添加游戏';
  const ic = game ? (game.icon || { type: 'letter', value: game.name[0], color: game.color }) : { type: 'letter', value: '', color: '#22c55e' };
  const body = document.getElementById('modal-body');

  let swatches = '';
  PALETTE.forEach(c => { swatches += `<button type="button" class="swatch" data-c="${c}" style="background:${c}"></button>`; });

  /* ---- 偏移设置：日期选择器（选日期→自动算距更新日天数）---- */
  const anchorDt = game ? parseDate(game.anchorDate) : todayNoon();
  let offHtml = '<div class="field"><label>事件默认日期 / 偏移（相对版本更新日）</label>' +
    '<div class="muted" style="margin-bottom:6px">选择该事件的参考日期，系统自动计算距版本更新日的偏移天数。有手动记录时按历史平均优先。</div>';
  activeEvents().forEach(def => {
    def.offsets.forEach((defOff, idx) => {
      const hk = def.key + (def.offsets.length > 1 ? '_' + idx : '');
      const base = (game && game.baseOffsets && typeof game.baseOffsets[hk] === 'number') ? game.baseOffsets[hk] : defOff;
      const refDate = fmtDate(addDays(anchorDt, base));
      const avg = learnedAvg(game, hk);
      const reset = (avg !== null) ? `<button type="button" class="ghost off-reset" data-hk="${hk}" style="font-size:11px;padding:2px 6px">重置学习(${game.eventHistory[hk].length})</button>` : '<span class="muted" style="font-size:11px">无记录</span>';
      offHtml += `<div class="ev-row"><span class="ev-name">${escapeHtml(def.name + (def.sub ? def.sub[idx] : ''))}</span>` +
        `<input type="date" class="off-date" data-hk="${hk}" value="${refDate}">` +
        `<span class="muted" style="font-size:11px;min-width:72px;text-align:center">→ <strong class="off-calc" data-hk="${hk}">${base}</strong> 天</span>` +
        `<span class="muted" style="font-size:11px">${avg !== null ? ('均值' + avg) : '默认'}</span>${reset}` +
        `<input type="hidden" class="off-inp" data-hk="${hk}" value="${base}"></div>`;
    });
  });
  offHtml += '</div>';

  /* ---- 版本号进位规则（minorMax breakpoints）---- */
  const bps = (game && game.minorMaxBreakpoints) ? game.minorMaxBreakpoints : [];
  let bpHtml = '<div class="field"><label>版本号进位规则（从某版本起改用新上限）</label>' +
    '<div class="muted" style="margin-bottom:6px">默认全局上限见上方「小版本号上限」。此处可添加例外：例如设「从 v5.8 起上限=8」，则 5.8 之后直接变为 6.0（而非 5.9）。后续所有版本自动适配。</div><div id="bp-list">';
  bps.forEach((bp, i) => {
    bpHtml += `<div class="bp-row" data-i="${i}"><span class="muted" style="font-size:12px">从</span> ` +
      `<input type="text" class="bp-ver" value="${verLabel(game, bp.atTenths)}" placeholder="如 5.8" style="width:64px">` +
      `<span class="muted" style="font-size:12px">起 上限=</span>` +
      `<input type="number" class="bp-mm" min="0" max="11" value="${bp.minorMax}" style="width:48px">` +
      `<button type="button" class="ghost bp-del" data-i="${i}" style="font-size:11px;padding:1px 6px;color:#dc2626">✕</button></div>`;
  });
  bpHtml += '</div><button type="button" class="ghost" id="bp-add" style="font-size:12px">+ 添加进位规则</button></div>';

  body.innerHTML = `
    <div class="modal-tabs">
      <button type="button" class="mtab active" data-tab="basic">基础</button>
      <button type="button" class="mtab" data-tab="adv">高级</button>
      <span class="muted" style="margin-left:auto;align-self:center;font-size:11px">日常调整用「基础」· 自定义图片/偏移/进位规则用「高级」</span>
    </div>
    <div id="tab-basic">
      <div class="field"><label>昵称（必填）</label><input type="text" id="g-name" value="${game ? escapeAttr(game.name) : ''}" placeholder="如 原神"></div>
      <div class="field"><label>全称（选填）</label><input type="text" id="g-full" value="${game ? escapeAttr(game.fullName || '') : ''}" placeholder="如 Genshin Impact"></div>
      <div class="field"><label>主题色</label><div class="row"><input type="color" id="g-color" value="${game ? game.color : '#22c55e'}" style="width:50px;padding:2px"><input type="text" id="g-color-t" value="${game ? game.color : '#22c55e'}" style="max-width:100px"></div>
        <div class="swatch-row">${swatches}</div></div>
      <div class="field"><label>图标</label>
        <div class="row">
          <span id="g-icon-prev" class="icon-preview" style="background:${ic.color || '#22c55e'}"></span>
          <select id="g-ic-type">
            <option value="letter"${ic.type === 'letter' ? ' selected' : ''}>首字母/文字</option>
            <option value="emoji"${ic.type === 'emoji' ? ' selected' : ''}>Emoji</option>
            <option value="file"${ic.type === 'file' ? ' selected' : ''}>图库 / 本地图标</option>
            <option value="image"${ic.type === 'image' ? ' selected' : ''}>上传图片 / URL（高级里填）</option>
          </select>
        </div>
        <div class="row" style="margin-top:8px" id="g-ic-text-wrap">
          <input type="text" id="g-ic-val" value="${ic.type === 'emoji' || ic.type === 'letter' ? escapeAttr(ic.value || '') : ''}" placeholder="文字或 emoji">
        </div>
        <div class="icon-gallery hidden" id="g-ic-gallery" style="margin-top:8px"></div>
        <input type="hidden" id="g-ic-filepath" value="${ic.type === 'file' ? escapeAttr(ic.value || '') : ''}">
        <div class="muted" style="margin-top:4px">选「图库 / 本地图标」可从统一图标库里点选；用自己的图选「上传图片 / URL」到高级里上传。</div>
      </div>
      <div class="field"><label>版本基础周期（天）</label><input type="number" id="g-cycle" min="7" max="120" value="${game ? game.baseCycleDays : DEFAULT_CYCLE}"></div>
      <div class="field"><label>默认小版本号上限（如 9 = .9 后变 .0；例外在高级里加）</label><input type="number" id="g-minormax" min="0" max="11" value="${game ? game.minorMax : 9}"></div>
      <div class="field"><label>锚点版本号（如 5.0）</label><input type="text" id="g-anchorv" value="${game ? verLabel(game, game.anchorTenths) : '1.0'}"></div>
      <div class="field"><label>锚点版本更新日期</label><input type="date" id="g-anchord" value="${game ? game.anchorDate : fmtDate(todayNoon())}"></div>
    </div>
    <div id="tab-adv" class="hidden">
      <div class="field"><label>图标图片（自定义，base64 离线可用，或填 URL）</label>
        <div class="row">
          <input type="text" id="g-ic-img-url" placeholder="粘贴图片 URL，或点右侧选文件" value="${ic.type === 'image' ? escapeAttr(ic.value || '') : ''}">
          <input type="file" id="g-ic-file" accept="image/*">
        </div>
        <div class="muted" style="margin-top:4px">仅当基础里图标类型选了「上传图片 / URL」才生效。</div>
      </div>
      ${offHtml}
      ${bpHtml}
      ${game ? `<div class="field"><button class="danger" id="g-del">删除该游戏</button></div>` : ''}
    </div>
  `;

  // 标签切换
  function switchTab(tab) {
    body.querySelectorAll('.mtab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
    document.getElementById('tab-basic').classList.toggle('hidden', tab !== 'basic');
    document.getElementById('tab-adv').classList.toggle('hidden', tab !== 'adv');
  }
  body.querySelectorAll('.mtab').forEach(t => t.onclick = () => switchTab(t.dataset.tab));

  const icType = body.querySelector('#g-ic-type');
  const icFile = body.querySelector('#g-ic-file');
  const icPrev = body.querySelector('#g-icon-prev');
  const colorInp = body.querySelector('#g-color');
  const colorTxt = body.querySelector('#g-color-t');
  function loadIconGallery() {
    const gallery = body.querySelector('#g-ic-gallery');
    if (gallery.dataset.loaded) return;
    gallery.dataset.loaded = '1';
    const cur = (document.getElementById('g-ic-filepath') || {}).value || '';
    gallery.innerHTML = iconLib().map(it => {
      const f = it.file || it; const n = it.name || f.split('/').pop().replace(/\.\w+$/, '');
      const sel = (f === cur) ? ' sel' : '';
      return `<div class="icon-gallery-item${sel}" data-file="${escapeAttr(f)}"><img src="${f}" alt="${escapeAttr(n)}"><span>${escapeHtml(n)}</span></div>`;
    }).join('') + `<div class="icon-gallery-item add" id="g-ic-gallery-add"><span style="font-size:22px">＋</span><span>新增图标</span></div>`;
    gallery.querySelectorAll('.icon-gallery-item:not(.add)').forEach(el => el.onclick = () => {
      const fp = document.getElementById('g-ic-filepath');
      if (fp) fp.value = el.dataset.file;
      icType.value = 'file';
      gallery.querySelectorAll('.icon-gallery-item').forEach(x => x.classList.remove('sel'));
      el.classList.add('sel');
      syncPrev();
    });
    const addBtn = gallery.querySelector('#g-ic-gallery-add');
    if (addBtn) addBtn.onclick = () => { icType.value = 'image'; switchTab('adv'); syncPrev(); };
  }
  function syncPrev() {
    const type = icType.value;
    const nameEl = body.querySelector('#g-name');
    const textWrap = document.getElementById('g-ic-text-wrap');
    const gallery = document.getElementById('g-ic-gallery');
    if (type === 'image') {
      textWrap.classList.add('hidden'); gallery.classList.add('hidden');
      const url = (document.getElementById('g-ic-img-url') || {}).value || '';
      icPrev.innerHTML = url ? `<img src="${url}">` : '';
    } else if (type === 'file') {
      textWrap.classList.add('hidden'); gallery.classList.remove('hidden');
      loadIconGallery();
      const f = (document.getElementById('g-ic-filepath') || {}).value || '';
      icPrev.innerHTML = f ? `<img src="${f}">` : '';
    } else {
      textWrap.classList.remove('hidden'); gallery.classList.add('hidden');
      const valEl = document.getElementById('g-ic-val');
      const val = valEl ? valEl.value : '';
      icPrev.textContent = val || (nameEl && nameEl.value ? nameEl.value[0] : '?');
    }
    icPrev.style.background = colorInp.value;
  }
  icType.onchange = () => { if (icType.value === 'image') switchTab('adv'); syncPrev(); };
  const valEl = document.getElementById('g-ic-val');
  if (valEl) valEl.oninput = syncPrev;
  icFile.onchange = () => {
    const f = icFile.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const url = r.result; const t = document.getElementById('g-ic-img-url'); if (t) t.value = url; syncPrev(); };
    r.readAsDataURL(f);
  };
  colorInp.oninput = () => { colorTxt.value = colorInp.value; syncPrev(); };
  colorTxt.oninput = () => { colorInp.value = colorTxt.value; syncPrev(); };
  body.querySelector('#g-name').oninput = syncPrev;
  body.querySelectorAll('.swatch').forEach(s => s.onclick = () => { colorInp.value = s.dataset.c; colorTxt.value = s.dataset.c; syncPrev(); });
  body.querySelectorAll('.off-reset').forEach(b => b.onclick = () => {
    const hk = b.dataset.hk;
    if (game && game.eventHistory) delete game.eventHistory[hk];
    saveAndRender(); openGameModal(gameId); toast('已重置该事件的学习记录');
  });

  /* 日期选择器 → 自动算偏移天数 */
  body.querySelectorAll('.off-date').forEach(inp => {
    inp.onchange = () => {
      const hk = inp.dataset.hk;
      const picked = parseDate(inp.value);
      const anch = parseDate(body.querySelector('#g-anchord').value);
      if (!anch.getTime()) { toast('请先填写锚点版本更新日期'); return; }
      const off = diffDays(picked, anch);
      const hidden = body.querySelector('.off-inp[data-hk="' + hk + '"]');
      if (hidden) hidden.value = off;
      const calc = body.querySelector('.off-calc[data-hk="' + hk + '"]');
      if (calc) calc.textContent = off;
    };
  });
  /* 锚点日期变化时重新计算所有偏移显示 */
  body.querySelector('#g-anchord').onchange = () => {
    const anch = parseDate(body.querySelector('#g-anchord').value);
    if (!anch.getTime()) return;
    body.querySelectorAll('.off-date').forEach(inp => {
      const hidden = body.querySelector('.off-inp[data-hk="' + inp.dataset.hk + '"]');
      const baseOff = hidden ? Number(hidden.value) : 0;
      inp.value = fmtDate(addDays(anch, baseOff));
    });
  };

  /* 进位规则：增删 */
  body.querySelector('#bp-add').onclick = () => {
    const list = body.querySelector('#bp-list');
    const row = document.createElement('div');
    row.className = 'bp-row';
    row.innerHTML = `<span class="muted" style="font-size:12px">从</span> ` +
      `<input type="text" class="bp-ver" placeholder="如 5.8" style="width:64px">` +
      `<span class="muted" style="font-size:12px">起 上限=</span>` +
      `<input type="number" class="bp-mm" min="0" max="11" value="8" style="width:48px">` +
      `<button type="button" class="ghost bp-del" style="font-size:11px;padding:1px 6px;color:#dc2626">✕</button>`;
    list.appendChild(row);
    row.querySelector('.bp-del').onclick = () => row.remove();
  };
  body.querySelectorAll('.bp-del').forEach(b => b.onclick = () => b.parentElement.remove());

  /* 若已有图标为图片，默认打开高级标签 */
  if (ic.type === 'image') switchTab('adv');
  syncPrev();

  document.getElementById('modal-save').onclick = () => {
    const name = body.querySelector('#g-name').value.trim();
    if (!name) { toast('请填写昵称'); return; }
    const color = colorInp.value;
    const type = icType.value;
    let ival;
    if (type === 'image') {
      ival = (document.getElementById('g-ic-img-url') || {}).value || '';
      if (!ival) { toast('图片模式请在「高级」里上传或填 URL'); switchTab('adv'); return; }
    } else if (type === 'file') {
      ival = (document.getElementById('g-ic-filepath') || {}).value || '';
      if (!ival) { toast('请在图库里点选一个图标，或改用其他图标类型'); return; }
    } else {
      ival = (document.getElementById('g-ic-val') || {}).value || '';
      if (!ival) ival = name[0];
    }
    const cycle = Math.max(7, Math.min(120, Number(body.querySelector('#g-cycle').value) || DEFAULT_CYCLE));
    const minorMax = Math.max(0, Math.min(11, Number(body.querySelector('#g-minormax').value) || 9));
    const anchorTenths = Math.round(parseFloat(body.querySelector('#g-anchorv').value || '1.0') * 10);
    const anchorDate = body.querySelector('#g-anchord').value;
    const baseOffsets = {};
    body.querySelectorAll('.off-inp').forEach(inp => { baseOffsets[inp.dataset.hk] = Number(inp.value) || 0; });
    /* 收集进位规则 */
    const minorMaxBreakpoints = [];
    body.querySelectorAll('.bp-row').forEach(row => {
      const verStr = row.querySelector('.bp-ver').value.trim();
      const mm = Number(row.querySelector('.bp-mm').value);
      if (verStr && !isNaN(mm)) {
        const parts = verStr.split('.');
        const atMaj = parseInt(parts[0]) || 0;
        const atMin = parseInt(parts[1]) || 0;
        const aMaj = Math.floor(game ? game.anchorTenths / 10 : (atMaj * 10));
        const aMin = game ? (game.anchorTenths % 10) : 0;
        // 从锚点推算目标 tenths（近似；精确值由用户在版本弹窗里调）
        const eff = atMin - aMin + (atMaj - aMaj) * (game ? (game.minorMax || 9) + 1 : 10);
        minorMaxBreakpoints.push({ atTenths: game ? (game.anchorTenths + eff) : (atMaj * 10 + atMin), minorMax: mm });
      }
    });

    if (game) {
      game.name = name; game.fullName = body.querySelector('#g-full').value.trim();
      game.color = color; game.icon = { type, value: ival, color };
      game.baseCycleDays = cycle; game.minorMax = minorMax; game.anchorTenths = anchorTenths; game.anchorDate = anchorDate;
      game.baseOffsets = baseOffsets; game.minorMaxBreakpoints = minorMaxBreakpoints;
    } else {
      const ng = {
        id: 'g_' + Math.random().toString(36).slice(2, 9),
        name, fullName: body.querySelector('#g-full').value.trim(), color,
        icon: { type, value: ival, color }, baseCycleDays: cycle, minorMax,
        anchorTenths, anchorDate, eventHistory: {}, baseOffsets, eventTitles: {}, versionDurations: {},
        minorMaxBreakpoints
      };
      state.games.push(ng); visibleGames[ng.id] = true; state.visibleGames = visibleGames;
    }
    saveAndRender(); hideModal(); toast('已保存');
  };
  const del = body.querySelector('#g-del');
  if (del) del.onclick = () => {
    if (!confirm('确定删除该游戏及其全部版本数据？')) return;
    state.games = state.games.filter(g => g.id !== gameId);
    delete visibleGames[gameId];
    saveAndRender(); hideModal(); toast('已删除');
  };
  showModal();
}

/* ----------------------------- 弹窗基础 ----------------------------- */
function showModal() {
  document.getElementById('modal-mask').classList.add('show');
  document.getElementById('modal-cancel').onclick = hideModal;
}
function hideModal() { document.getElementById('modal-mask').classList.remove('show'); }

/* 颜色加深/变浅（用于版本块渐变） */
function shade(hex, percent) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r + Math.round(255 * percent / 100)));
  g = Math.max(0, Math.min(255, g + Math.round(255 * percent / 100)));
  b = Math.max(0, Math.min(255, b + Math.round(255 * percent / 100)));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/* ----------------------------- 提醒（浏览器通知） ----------------------------- */
function setupNotifications() {
  const btn = document.getElementById('btn-notif');
  if (!('Notification' in window)) { btn.textContent = '不支持通知'; btn.disabled = true; return; }
  function refresh() {
    if (Notification.permission === 'granted') btn.innerHTML = '提醒已开启<span class="notif-dot"></span>';
    else if (Notification.permission === 'denied') btn.innerHTML = '通知被拦截<span class="notif-dot off"></span>';
    else btn.innerHTML = '开启桌面提醒';
  }
  btn.onclick = () => {
    if (Notification.permission === 'default') Notification.requestPermission().then(() => { refresh(); if (Notification.permission === 'granted') checkNotifications(true); });
    else if (Notification.permission === 'denied') toast('通知权限被浏览器拦截，请在地址栏左侧允许后重试');
    else checkNotifications(true);
  };
  refresh(); checkNotifications(false);
  setInterval(() => checkNotifications(false), 3600 * 1000);
}
function checkNotifications(force) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const lead = state.leadDays || LEAD_DEFAULT;
  const now = todayNoon();
  const horizon = addDays(now, lead);
  const all = collectEvents();
  const fresh = [];
  all.forEach(it => {
    const d = diffDays(it.date, now);
    if (d >= 0 && it.date <= horizon && !state.notified.includes(it.key)) { fresh.push(it); state.notified.push(it.key); }
  });
  state.notified = state.notified.filter(k => { const it = all.find(x => x.key === k); return it && it.date >= addDays(now, -1); });
  if (fresh.length) {
    fresh.slice(0, 5).forEach(it => {
      try { new Notification(`${it.game.name} · ${it.ev.title}`, { body: `${fmtDate(it.date)}（${diffDays(it.date, now) === 0 ? '今天' : '还有 ' + diffDays(it.date, now) + ' 天'}）版本 ${it.version.label}` }); } catch (e) {}
    });
    Storage.save(state);
    if (force) toast(`将在 ${lead} 天内提醒 ${fresh.length} 个事件`);
  } else if (force) toast(`未来 ${lead} 天没有临近事件`);
}

/* ----------------------------- 导入 / 导出 / 工具 ----------------------------- */
function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'game-version-schedule.json'; a.click();
  toast('已导出 JSON');
}
function importJSON(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data.games) throw new Error('缺少 games');
      state = data;
      if (!state.visibleGames) { state.visibleGames = {}; state.games.forEach(g => state.visibleGames[g.id] = true); }
      state.games.forEach(migrateGame);
      if (typeof state.dayW !== 'number') state.dayW = 4;
      if (typeof state.listCount !== 'number') state.listCount = 8;
  if (typeof state.listPast !== 'number') state.listPast = 2;
      visibleGames = state.visibleGames;
      saveAndRender(); toast('导入成功');
    } catch (e) { toast('导入失败：' + e.message); }
  };
  r.readAsText(file);
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }
function saveAndRender() { Storage.save(state); render(); }

let toastTimer = null;
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ----------------------------- 绑定工具栏 ----------------------------- */
function setView(mode, btn, others) {
  viewMode = mode;
  btn.classList.add('active');
  others.forEach(o => o.classList.remove('active'));
  render();
}
function bindToolbar() {
  const bt = document.getElementById('btn-timeline'), bc = document.getElementById('btn-calendar'), bl = document.getElementById('btn-list');
  bt.onclick = () => setView('timeline', bt, [bc, bl]);
  bc.onclick = () => setView('calendar', bc, [bt, bl]);
  bl.onclick = () => setView('list', bl, [bt, bc]);
  document.getElementById('btn-add').onclick = () => openGameModal(null);
  document.getElementById('file-input').onchange = (e) => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; };
  document.getElementById('search').oninput = (e) => { searchQuery = e.target.value.trim(); render(); };
  document.getElementById('btn-settings').onclick = openSettings;
  // 数据下拉菜单
  const dd = document.getElementById('data-dd');
  const ddMenu = document.getElementById('data-dd-menu');
  const ddBtn = document.getElementById('btn-data');
  ddBtn.onclick = (e) => { e.stopPropagation(); ddMenu.classList.toggle('hidden'); };
  ddMenu.querySelectorAll('button[data-act]').forEach(m => {
    m.onclick = (e) => {
      e.stopPropagation();
      ddMenu.classList.add('hidden');
      const act = m.dataset.act;
      if (act === 'export') exportJSON();
      else if (act === 'import') document.getElementById('file-input').click();
      else if (act === 'backup') { curSettingsTab = 's-basic'; openSettings(); }
    };
  });
  document.addEventListener('click', (e) => { if (dd && !dd.contains(e.target)) ddMenu.classList.add('hidden'); });
  bt.classList.add('active');
}

let curSettingsTab = 's-basic';
function openSettings() {
  const body = document.getElementById('modal-body');
  document.getElementById('modal-title').textContent = '⚙ 设置';

  /* ---- 构建 HTML ---- */
  const evts = state.customEvents || [];
  let evRows = '';
  evts.forEach((ev, i) => {
    const hidden = !!ev.hidden;
    const color = EVENT_COLORS[ev.key] || '#64748b';
    const offStr = (ev.offsets || []).join(', ');
    const subStr = (ev.sub || []).join(', ');
    evRows += `<div class="set-ev-row" data-i="${i}" data-key="${escapeAttr(ev.key)}" draggable="true" style="opacity:${hidden ? 0.45 : 1}">
      <span class="set-ev-dot" style="background:${color}"></span>
      <input type="text" class="set-ev-name" value="${escapeAttr(ev.name)}" placeholder="事件名称" style="flex:1;min-width:90px">
      <input type="text" class="set-ev-off" value="${offStr}" placeholder="偏移天数,如 0,21" style="width:110px" title="相对版本更新日的偏移天数，多个用逗号分隔">
      <input type="text" class="set-ev-sub" value="${subStr}" placeholder="子标签(可选)" style="width:80px" title="多实例事件的子标签，如 上半,下半">
      <button type="button" class="ghost set-ev-toggle" data-i="${i}" title="${hidden ? '显示' : '隐藏'}">${hidden ? '👁 显示' : '👁 隐藏'}</button>
      <button type="button" class="ghost set-ev-del" data-i="${i}" style="color:#dc2626" title="删除此事件">✕</button>
    </div>`;
  });

  body.innerHTML = `
    <div class="modal-tabs">
      <button type="button" class="mtab active" data-tab="s-basic">基础设置</button>
      <button type="button" class="mtab" data-tab="s-events">事件管理</button>
    </div>
    <div id="tab-s-basic">
      <div class="field"><label>临近提醒提前天数</label><input type="number" id="s-lead" min="1" max="30" value="${state.leadDays || LEAD_DEFAULT}"></div>
      <div class="field"><label>列表视图显示版本数（过去 / 未来）</label><div style="display:flex;gap:8px;align-items:center"><input type="number" id="s-listpast" min="0" max="30" value="${state.listPast || 2}" style="width:72px"> 过去 <input type="number" id="s-list" min="1" max="30" value="${state.listCount || 8}" style="width:72px"> 未来</div></div>
      <div class="field"><label>视图起始（今天往前，天）</label><input type="number" id="s-back" min="0" max="365" value="${diffDays(todayNoon(), parseDate(state.viewStart))}"></div>
      <div class="field"><label>视图结束（今天往后，天）</label><input type="number" id="s-fwd" min="30" max="1095" value="${diffDays(parseDate(state.viewEnd), todayNoon())}"></div>
      <div class="field"><label>时间轴缩放（像素/天）</label><input type="range" id="s-zoom" min="2" max="24" value="${state.dayW || 4}" style="width:200px"> <span id="s-zoom-v">${state.dayW || 4}px</span></div>
      <div class="field"><label><input type="checkbox" id="s-labels" ${state.showLabels ? 'checked' : ''}> 时间轴显示事件标签</label></div>
      <hr class="set-sep">
      <div class="field"><label>数据备份（落盘到本机文件）</label>
        <div class="muted" style="margin-bottom:8px">默认数据只存在浏览器里，清空浏览器记录会丢失。选择一个本机 .json 文件后，所有改动会<b>实时自动保存</b>到该文件（存在磁盘，与浏览器无关）。清除浏览器记录后，重新打开网页会自动从该文件恢复；若连文件句柄也丢了，点「从本机文件恢复」重新选一次即可。</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button type="button" class="ghost" id="s-pick-file">📁 选择本机保存文件（自动备份）</button>
          <button type="button" class="ghost" id="s-restore-file">♻ 从本机文件恢复</button>
          <span class="muted">当前文件：<b id="s-file-status">未设置</b></span>
        </div>
      </div>
      <div class="muted">也可用顶栏「⬇ 数据」菜单做手动备份或跨设备/云端搬运。</div>
      <hr class="set-sep">
      <div class="field"><label>云端同步（跨设备，登录即用）</label>
        <div class="muted" style="margin-bottom:8px">在 <b>app.js 顶部</b>填入 Supabase 项目的 URL 与 anon key，并在 Supabase SQL Editor 执行建表语句后即可使用。登录后所有改动自动实时同步到云端，换设备打开网页登录即可看到相同记录。未配置时自动降级为本地。</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
          <input type="email" id="c-email" placeholder="邮箱" style="width:180px" value="${cloudUser ? (cloudUser.email || '') : ''}">
          <input type="password" id="c-pwd" placeholder="密码（6位以上）" style="width:160px">
          <button type="button" class="ghost" id="c-login">登录</button>
          <button type="button" class="ghost" id="c-signup">注册</button>
          <button type="button" class="ghost" id="c-logout">登出</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span class="muted">状态：<b id="cloud-status">未配置</b></span>
          <button type="button" class="ghost" id="c-sql">查看建表 SQL</button>
        </div>
      </div>
    </div>
    <div id="tab-s-events" class="hidden">
      <div class="field"><label>版本周期内的事件类型（可增删、隐藏/显示、改名称和偏移天数）</label>
        <div class="muted" style="margin-bottom:8px">隐藏后该事件不会在时间轴/月历/列表中显示。偏移天数为相对「版本更新日」的天数，多个值用逗号分隔（如卡池上半+下半=0,21）。修改后所有游戏立即生效。</div>
        <div id="set-ev-list">${evRows}</div>
        <button type="button" class="ghost" id="set-ev-add" style="margin-top:8px">＋ 添加新事件</button>
      </div>
    </div>
  `;

  /* ---- Tab 切换 ---- */
  function switchTab(tab) {
    curSettingsTab = tab;
    body.querySelectorAll('.mtab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
    document.getElementById('tab-s-basic').classList.toggle('hidden', tab !== 's-basic');
    document.getElementById('tab-s-events').classList.toggle('hidden', tab !== 's-events');
  }
  body.querySelectorAll('.mtab').forEach(t => t.onclick = () => switchTab(t.dataset.tab));

  /* ---- 基础设置：实时响应 ---- */
  const zoomInp = body.querySelector('#s-zoom');
  const zoomV = body.querySelector('#s-zoom-v');
  if (zoomInp) { zoomInp.oninput = () => { state.dayW = Number(zoomInp.value) || 4; zoomV.textContent = state.dayW + 'px'; render(); }; }
  const labelsCb = body.querySelector('#s-labels');
  if (labelsCb) { labelsCb.onchange = () => { state.showLabels = labelsCb.checked; saveAndRender(); }; }

  /* ---- 本地文件备份 ---- */
  updateBackupStatus();
  const pickBtn = body.querySelector('#s-pick-file');
  if (pickBtn) pickBtn.onclick = () => { pickSaveFile(); };
  const restoreBtn = body.querySelector('#s-restore-file');
  if (restoreBtn) restoreBtn.onclick = () => { restoreFromFile(); };

  /* ---- 云端同步 ---- */
  updateCloudStatus();
  const cEmail = body.querySelector('#c-email'), cPwd = body.querySelector('#c-pwd');
  const cLogin = body.querySelector('#c-login');
  if (cLogin) cLogin.onclick = () => { if (cEmail.value && cPwd.value) cloudSignIn(cEmail.value.trim(), cPwd.value); };
  const cSignup = body.querySelector('#c-signup');
  if (cSignup) cSignup.onclick = () => { if (cEmail.value && cPwd.value) cloudSignUp(cEmail.value.trim(), cPwd.value); };
  const cLogout = body.querySelector('#c-logout');
  if (cLogout) cLogout.onclick = () => { cloudSignOut(); };
  const cSql = body.querySelector('#c-sql');
  if (cSql) cSql.onclick = () => {
    const sql = buildSql();
    if (navigator.clipboard) navigator.clipboard.writeText(sql).then(() => toast('建表 SQL 已复制到剪贴板'), () => {});
    alert('建表 SQL（也已尝试复制到剪贴板）：\n\n' + sql);
  };

  /* ---- 保存基础设置 ---- */
  document.getElementById('modal-save').onclick = () => {
    // 基础
    state.leadDays = Math.max(1, Math.min(30, Number(body.querySelector('#s-lead').value) || LEAD_DEFAULT));
    state.listCount = Math.max(1, Math.min(30, Number(body.querySelector('#s-list').value) || 8));
    state.listPast = Math.max(0, Math.min(30, Number(body.querySelector('#s-listpast').value) || 0));
    const back = Math.max(0, Number(body.querySelector('#s-back').value) || 60);
    const fwd = Math.max(30, Number(body.querySelector('#s-fwd').value) || 400);
    state.viewStart = fmtDate(addDays(todayNoon(), -back));
    state.viewEnd = fmtDate(addDays(todayNoon(), fwd));
    // 事件管理
    saveEventSettings(body);
    saveAndRender(); hideModal(); toast('设置已保存');
  };

  /* ---- 事件行操作（即时生效，无需点保存）---- */
  // 隐藏/显示
  body.querySelectorAll('.set-ev-toggle').forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.dataset.i);
      const ev = state.customEvents[i];
      if (!ev) return;
      ev.hidden = !ev.hidden;
      btn.textContent = ev.hidden ? '👁 显示' : '👁 隐藏';
      btn.title = ev.hidden ? '显示' : '隐藏';
      btn.closest('.set-ev-row').style.opacity = ev.hidden ? 0.45 : 1;
      saveAndRender();
    };
  });
  // 删除
  body.querySelectorAll('.set-ev-del').forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.dataset.i);
      if (!confirm(`确定删除事件「${state.customEvents[i].name}」？`)) return;
      state.customEvents.splice(i, 1);
      saveAndRender();
      openSettings(); // 刷新面板
    };
  });
  // 名称/偏移/子标签 即时保存
  body.querySelectorAll('.set-ev-name').forEach(inp => {
    inp.onchange = () => {
      const i = Number(inp.closest('.set-ev-row').dataset.i);
      if (state.customEvents[i]) { state.customEvents[i].name = inp.value.trim() || '未命名'; saveAndRender(); }
    };
  });
  body.querySelectorAll('.set-ev-off').forEach(inp => {
    inp.onchange = () => {
      const i = Number(inp.closest('.set-ev-row').dataset.i);
      if (state.customEvents[i]) {
        const arr = inp.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0);
        state.customEvents[i].offsets = arr.length ? arr : [0];
        saveAndRender();
      }
    };
  });
  body.querySelectorAll('.set-ev-sub').forEach(inp => {
    inp.onchange = () => {
      const i = Number(inp.closest('.set-ev-row').dataset.i);
      if (state.customEvents[i]) {
        const arr = inp.value.split(',').map(s => s.trim()).filter(Boolean);
        state.customEvents[i].sub = arr.length ? arr : undefined;
        saveAndRender();
      }
    };
  });
  // 事件行拖拽排序
  const evList = body.querySelector('#set-ev-list');
  body.querySelectorAll('.set-ev-row').forEach(row => {
    row.addEventListener('dragstart', (e) => {
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.key);
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      body.querySelectorAll('.set-ev-row').forEach(r => r.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.classList.add('drag-over'); });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      row.classList.remove('drag-over');
      reorderEvents(e.dataTransfer.getData('text/plain'), row.dataset.key);
    });
  });

  // 添加新事件
  const addBtn = body.querySelector('#set-ev-add');
  if (addBtn) addBtn.onclick = () => {
    const newKey = 'custom_' + Date.now();
    state.customEvents.push({ key: newKey, name: '新事件', offsets: [14], hidden: false });
    saveAndRender();
    openSettings(); // 刷新面板并跳到事件 tab
    // 自动切换到事件 tab 并滚动到底部
    setTimeout(() => {
      switchTab('s-events');
      const list = document.getElementById('set-ev-list');
      if (list) list.scrollTop = list.scrollHeight;
    }, 50);
  };

  document.getElementById('modal-cancel').onclick = hideModal;
  switchTab(curSettingsTab);
  showModal();
}

/** 从设置面板 DOM 读取事件数据写入 state（save 按钮兜底） */
function saveEventSettings(body) {
  if (!body) return;
  body.querySelectorAll('.set-ev-row').forEach(row => {
    const i = Number(row.dataset.i);
    const ev = state.customEvents[i];
    if (!ev) return;
    const nameEl = row.querySelector('.set-ev-name');
    const offEl = row.querySelector('.set-ev-off');
    const subEl = row.querySelector('.set-ev-sub');
    if (nameEl) ev.name = nameEl.value.trim() || '未命名';
    if (offEl) {
      const arr = offEl.value.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0);
      ev.offsets = arr.length ? arr : [0];
    }
    if (subEl) {
      const arr = subEl.value.split(',').map(s => s.trim()).filter(Boolean);
      ev.sub = arr.length ? arr : undefined;
    }
  });
}

/* ----------------------------- 启动 ----------------------------- */
window.addEventListener('DOMContentLoaded', () => { init(); bindToolbar(); });
