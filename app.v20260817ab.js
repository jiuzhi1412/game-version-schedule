/* =========================================================================
 * 游戏版本周期日程表  —  Game Version Schedule
 * 纯前端单页应用。数据存 localStorage，预留云端同步接口。
 * 版本: app.v20260817z.js — 编辑模式每次打开默认关闭
 * ========================================================================= */
console.log('[GVS] ✅ 加载 app.v20260817z.js — edit mode 默认关闭');

'use strict';

/* ----------------------------- 事件类型定义 ----------------------------- */
/* 每个版本周期内派生的固定事件。offsets 为相对"版本更新日(第0天)"的默认偏移天数。
 * 卡池更新由「角色卡池」事件替代，故默认模板不再含 banner。
 * 这是默认模板；用户可在设置中增删隐藏，实际使用 state.customEvents。 */
const EVENT_DEFS_TEMPLATE = [
  { key: 'version_update',  name: '版本更新', offsets: [0] },
  // 新角色爆料不再作为静态顶层事件；改为按 game.charCount 动态生成（每个角色一个子类，见 generateCharEvents），直接显示对应角色的备注名
  // 角色预告/PV 不再作为独立顶层事件，改为按 game.charCount 动态生成（见 generateCharEvents）
  { key: 'version_preview', name: '版本前瞻', offsets: [35] },
];
// 向后兼容别名
const EVENT_DEFS = EVENT_DEFS_TEMPLATE;

/**
 * 根据角色数量动态生成角色相关事件定义。
 * 每个角色产生：角色卡池N / 预告N(-2天) / PVN(-3天)
 * 默认 charCount=2，第1个角色与卡池上半同天，第2个角色延后1天
 */
function generateCharEvents(charCount) {
  const n = Math.max(1, Math.min(6, charCount || 2)); // 限制 1~6 个角色
  const CHARS = ['一', '二', '三', '四', '五', '六'];
  // 基准偏移：角色1卡池=卡池上半(0)，角色2卡池=+1天，以此类推
  const baseOffsets = [0, 1, 2, 3, 4, 5];
  // 子项定义：卡池 / 预告 / PV（相对角色卡池日的偏移）
  const SUB_DEFS = {
    char_banner:   { sub: ['卡池'], off: 0 },
    char_preview: { sub: ['预告'], off: -2 },
    char_pv:      { sub: ['PV'], off: -3 },
  };
  // 子项顺序（同一角色内）：取自设置面板排序，默认 卡池→预告→PV
  const subOrder = (state && state.charSubOrder && state.charSubOrder.length) ? state.charSubOrder : ['char_banner', 'char_preview', 'char_pv'];
  // 角色组顺序：取自设置面板排序，默认 角色一→角色二→…
  const rawGroup = (state && state.charGroupOrder && state.charGroupOrder.length) ? state.charGroupOrder : [0, 1, 2, 3, 4, 5];
  const groupOrder = rawGroup.filter(i => i >= 0 && i < n);
  for (let i = 0; i < n; i++) if (!groupOrder.includes(i)) groupOrder.push(i); // 补全缺失角色
  const evts = [];
  // 新角色爆料：按角色拆分为多个子类（数量=角色数），独立成一块（不混入角色分组）
  // 绑定到「当前运行版本 + teaseVersionOffset」的目标版本角色备注名（见 renderList）
  const TEASE_OFF = 33; // 相对版本更新日的偏移（版本末期预告），仅用于计算事件日期（列表不显示）
  groupOrder.forEach(i => {
    const label = CHARS[i] || String(i + 1);
    evts.push({
      key: 'char_tease', name: '新角色爆料·角色' + label, sub: undefined,
      offsets: [TEASE_OFF], charIndex: i, _tease: true
    });
  });
  groupOrder.forEach(i => {
    const base = baseOffsets[i] || 0;
    const label = CHARS[i] || String(i + 1);
    subOrder.forEach(key => {
      const sd = SUB_DEFS[key]; if (!sd) return;
      const isBanner = key === 'char_banner';
      evts.push({
        key, name: '角色' + label, offsets: [base + sd.off], sub: sd.sub,
        charIndex: i, _isChar: true,
        _charParent: isBanner ? null : 'char_banner_' + i
      });
    });
  });
  return evts;
}

/** 获取当前生效的事件定义列表（过滤掉 hidden 的，含动态生成的角色事件） */
function activeEvents() {
  // 渲染源头过滤已废弃的旧 key：char_pv/char_preview（已被角色分组替代）、banner（已被角色一卡池替代）
  const raw = state.customEvents || EVENT_DEFS_TEMPLATE;
  // 诊断：检测是否有 banner 漏网
  if (Array.isArray(raw) && raw.some(e => e.key === 'banner' || (e.key||'').toString().trim() === 'banner')) {
    console.warn('[GVS] ⚠️ activeEvents 检测到 banner 未被过滤！customEvents keys:', raw.map(e=>e.key));
  }
  // 权威定义表：云端/本地 customEvents 的 name/sub/offsets 字段可能损坏，一律用模板纠正
  const TMPL = {};
  EVENT_DEFS_TEMPLATE.forEach(t => { TMPL[t.key] = t; });
  const base = raw.filter(e => {
    const k = (e.key || '').toString().trim();
    if (k.startsWith('banner')) return false; // 过滤所有 banner 变体
    return e.hidden !== true &&
      k !== 'char_pv' && k !== 'char_preview' && k !== 'char_tease';
  }).map(e => {
    const k = (e.key || '').toString().trim();
    const t = TMPL[k];
    if (t && !e._isChar) {
      // 用权威模板覆盖 name/sub/offsets，保留用户的隐藏状态
      return { key: t.key, name: t.name, offsets: t.offsets.slice(),
        sub: t.sub ? t.sub.slice() : undefined, hidden: e.hidden, _origKey: e._origKey };
    }
    return e;
  });
  // 追加动态角色事件（从第一个游戏取 charCount，或默认2）
  const charCount = (state.games && state.games[0] && state.games[0].charCount) || 2;
  return base.concat(generateCharEvents(charCount));
}

/**
 * 获取某个游戏生效的事件定义列表（全局隐藏 + 该游戏单独隐藏的都过滤掉）
 * game.hiddenEventKeys 存的是要隐藏的事件子 key，如 'char_banner_1' 表示角色二卡池
 */
function gameActiveEvents(game) {
  const hidden = (game && game.hiddenEventKeys) || [];
  const hiddenSet = new Set(hidden);
  const base = activeEvents().filter(e => e.hidden !== true);
  // 每个游戏用自己的 charCount 覆盖全局角色事件
  // ⚠️ _tease 事件也必须排除（它们由 generateCharEvents 按游戏重新生成，不保留 activeEvents 的旧副本）
  const staticEvts = base.filter(e => !e._isChar && !e._tease);
  const charCount = (game && game.charCount) || 2;
  const charEvts = generateCharEvents(charCount);
  return staticEvts.concat(charEvts).map(def => {
    // 单偏移事件：标记是否被隐藏（不丢弃，让表格渲染决定如何展示）
    if (def.offsets.length === 1) {
      const k = def.key + '_' + (def.charIndex ?? 0);
      if (hiddenSet.has(k)) return { ...def, _hidden: true };
    }
    // 多 offset 事件：过滤掉隐藏的子项
    if (def.offsets.length > 1) {
      const visibleIdx = [];
      def.offsets.forEach((_, idx) => {
        const subKey = def.key + '_' + idx;
        if (!hiddenSet.has(subKey)) visibleIdx.push(idx);
      });
      if (visibleIdx.length === 0) return null; // 全部隐藏
      if (visibleIdx.length < def.offsets.length) {
        const copy = { ...def, offsets: visibleIdx.map(i => def.offsets[i]) };
        if (def.sub) copy.sub = visibleIdx.map(i => def.sub[i]);
        copy._origKey = def.key;
        return copy;
      }
    }
    return def;
  }).filter(Boolean);
}

/** 列设置面板专用：返回所有事件定义（含被隐藏的），确保用户能恢复 */
function allGameEventsForSettings(game) {
  const base = activeEvents().filter(e => e.hidden !== true);
  const staticEvts = base.filter(e => !e._isChar);
  const charCount = (game && game.charCount) || 2;
  return staticEvts.concat(generateCharEvents(charCount));
}

/* 事件类型配色（更丰富的区分度） */
const EVENT_COLORS = {
  version_update: '#16a34a',
  banner_0: '#2563eb', banner_1: '#38bdf8',
  char_tease: '#f97316',
  char_preview: '#a855f7', char_pv: '#ec4899',
  version_preview: '#e11d48',
  // 动态角色卡池：每个角色一组渐变色
  char_banner_0: '#f43f5e', char_preview_0: '#fb7185', char_pv_0: '#fda4af',
  char_banner_1: '#7c3aed', char_preview_1: '#a78bfa', char_pv_1: '#c4b5fd',
  char_banner_2: '#0369a1', char_preview_2: '#38bdf8', char_pv_2: '#7dd3fc',
  char_banner_3: '#15803d', char_preview_3: '#4ade80', char_pv_3: '#86efac',
  char_banner_4: '#a16207', char_preview_4: '#fbbf24', char_pv_4: '#fde68a',
  char_banner_5: '#be185d', char_preview_5: '#f472b6', char_pv_5: '#fbcfe8',
};
function eventColor(defKey, idx) {
  if (defKey === 'banner') return EVENT_COLORS['banner_' + idx];
  // 角色事件带 charIndex
  if (defKey === 'char_banner' || defKey === 'char_preview' || defKey === 'char_pv' || defKey === 'char_tease') {
    const baseKey = defKey === 'char_tease' ? 'char_banner' : defKey; // 爆料用对应角色卡池的配色，视觉绑定角色
    return EVENT_COLORS[baseKey + '_' + (idx ?? 0)] || EVENT_COLORS[defKey] || '#64748b';
  }
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
  _pushTimer: null,
  _writeLocal(state) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { console.warn('save fail', e); }
    if (fileHandle) { try { persistToFile(); } catch (e) { console.warn('persist fail', e); } }
  },
  // 仅存本地 + 本机文件，不碰云端（浏览/显隐/缩放等基础操作）
  saveLocal(state) { this._writeLocal(state); },
  // 存本地并同步到云端（改了自定义数据时才调）
  save(state) {
    this._writeLocal(state);
    if (this.syncAdapter && typeof this.syncAdapter.push === 'function') {
      clearTimeout(this._pushTimer);
      this._pushTimer = setTimeout(() => {
        try { this.syncAdapter.push(state); } catch (e) { console.warn('sync push fail', e); }
      }, 1500);
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
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- ⚠️ 关键：必须给 authenticated 角色授权，否则登录后写入会报 42501 permission denied
grant all on table public.user_schedule to authenticated;
grant all on table public.user_schedule to service_role;`;
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
  }).catch(e => { console.warn('cloud pull fail', e); toast('云端拉取失败：' + (e && e.message ? e.message : '未知错误')); });
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
      if (error) { console.warn('cloud pull err', error); return null; }
      return data && data.data ? data.data : null;
    },
    async push(st) {
      if (!supabase || !cloudUser) return;
      const { error } = await supabase.from('user_schedule')
        .upsert({ user_id: cloudUser.id, data: st, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) {
        console.warn('cloud push err', error);
        toast('云端同步失败：' + (error.message || error.code || '未知错误'));
      }
      // 后台自动同步成功时静默，不弹 toast；仅失败时提示（避免切换页面等操作时频繁打扰）
    }
  };
}

function applyRemoteState(remote) {
  if (!remote || !Array.isArray(remote.games)) return;
  state = remote;
  console.log('[GVS] 🔍 云端数据 customEvents 原始 keys:', Array.isArray(state.customEvents) ? state.customEvents.map(e=>e.key).join(', ') : '非数组:' + typeof state.customEvents);
  if (!state.customEvents || !Array.isArray(state.customEvents)) state.customEvents = JSON.parse(JSON.stringify(EVENT_DEFS_TEMPLATE));
  // 云端旧数据可能含已废弃的 banner/char_pv/char_preview，加载后先清理（与 init 迁移一致）
  const beforeLen = state.customEvents.length;
  if (Array.isArray(state.customEvents)) {
    state.customEvents = state.customEvents.filter(e => {
      const k = (e.key || '').toString().trim();
      // 过滤所有 banner 变体（banner/banner_0/banner_1…）+ 已废弃的 char_pv/char_preview/char_tease（静态爆料改动态生成）
      if (k.startsWith('banner')) return false;
      return k !== 'char_pv' && k !== 'char_preview' && k !== 'char_tease';
    });
  }
  console.log('[GVS] 🔍 清理后 customEvents keys:', state.customEvents.map(e=>e.key), '（删除了', beforeLen - state.customEvents.length, '条）');
  // 纠正云端 customEvents 中损坏的 name/sub/offsets（以 EVENT_DEFS_TEMPLATE 权威定义为准），并写回
  const TMPL = {};
  EVENT_DEFS_TEMPLATE.forEach(t => { TMPL[t.key] = t; });
  state.customEvents.forEach(e => {
    const k = (e.key || '').toString().trim();
    const t = TMPL[k];
    if (t && !e._isChar) { e.name = t.name; e.sub = t.sub ? t.sub.slice() : undefined; e.offsets = t.offsets.slice(); }
  });
  if (!state.charSubOrder || !state.charSubOrder.length) state.charSubOrder = ['char_banner', 'char_preview', 'char_pv'];
  if (!state.charGroupOrder || !state.charGroupOrder.length) state.charGroupOrder = [0, 1, 2, 3, 4, 5];
  if (typeof state.teaseVersionOffset !== 'number' || state.teaseVersionOffset < 0) state.teaseVersionOffset = 1;
  if (typeof state.dayW !== 'number') state.dayW = 4;
  if (typeof state.listCount !== 'number') state.listCount = 8;
  if (typeof state.listPast !== 'number') state.listPast = 2;
  if (typeof state.showLabels !== 'boolean') state.showLabels = true;
  state.listEditMode = false; // 每次打开网页默认关闭编辑模式，不持久化
  // listColumnOrder: 自定义列顺序（空数组=使用默认顺序；非空时按此数组排列列）
  if (!Array.isArray(state.listColumnOrder)) state.listColumnOrder = [];
  if (!Array.isArray(state.listGroupOrder)) state.listGroupOrder = [];
  if (typeof state.listSubOrder !== 'object' || !state.listSubOrder) state.listSubOrder = {};
  state.games.forEach(g => {
    migrateGame(g);
    // 清理 hiddenEventKeys 中已失效的 banner/banner_0/char_pv/char_preview 脏 key
    if (Array.isArray(g.hiddenEventKeys)) {
      g.hiddenEventKeys = g.hiddenEventKeys.filter(k => !['banner', 'banner_0', 'banner_1', 'char_pv', 'char_preview'].includes(k));
    }
  });
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
    state.listEditMode = false; // 每次加载默认关闭编辑模式
  if (!Array.isArray(state.listColumnOrder)) state.listColumnOrder = [];
  if (!Array.isArray(state.listGroupOrder)) state.listGroupOrder = [];
  if (typeof state.listSubOrder !== 'object' || !state.listSubOrder) state.listSubOrder = {};
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
    eventHistory: {}, baseOffsets: {}, eventTitles: {}, versionDurations: {}, verNotes: {}, verEventOffsets: {}, verUpdateDates: {}, hiddenEventKeys: [], verHiddenEvents: {}, colDisplayNames: {}
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
    visibleGames: vis, dayW: 4, listCount: 8, listPast: 2, showLabels: true, listEditMode: false
  };
}

function migrateGame(g) {
  if (typeof g.minorMax !== 'number') g.minorMax = 9;
  if (!g.minorMaxBreakpoints) g.minorMaxBreakpoints = [];
  if (!g.baseOffsets) g.baseOffsets = {};
  if (!g.eventTitles) g.eventTitles = {};
  if (!g.eventHistory) g.eventHistory = {};
  if (!g.versionDurations) g.versionDurations = {};
  if (!g.verNotes) g.verNotes = {};
  if (!g.verEventOffsets) g.verEventOffsets = {};
  if (!g.verUpdateDates) g.verUpdateDates = {};
  if (!g.hiddenEventKeys) g.hiddenEventKeys = [];
  if (!g.verHiddenEvents) g.verHiddenEvents = {};
  if (!g.charNames) g.charNames = {}; // key: "tenths|charIndex" → 角色名，如 "70|0": "奥黛塔"
  if (!g.colDisplayNames) g.colDisplayNames = {}; // 表头自定义名覆盖：key=groupId 或 colId → 显示名（独立于备注）
  if (typeof g.charCount !== 'number') g.charCount = 2;
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
  state.listEditMode = false; // 每次加载默认关闭编辑模式
  console.log('[GVS] 🔒 edit mode 已重置为关闭 (listEditMode=false)');
  if (!state.customEvents || !Array.isArray(state.customEvents)) {
    state.customEvents = JSON.parse(JSON.stringify(EVENT_DEFS_TEMPLATE));
  }
  // 角色事件子项顺序（卡池/预告/PV）与角色组顺序（角色一/二/…），用于设置面板两级排序
  if (!state.charSubOrder || !Array.isArray(state.charSubOrder) || !state.charSubOrder.length) {
    state.charSubOrder = ['char_banner', 'char_preview', 'char_pv'];
  }
  if (!state.charGroupOrder || !Array.isArray(state.charGroupOrder)) {
    state.charGroupOrder = [0, 1, 2, 3, 4, 5];
  }
  // 新角色爆料绑定的版本偏移：0=当前版本，1=下1个版本，2=下2个版本…（默认提前1个版本放出）
  if (typeof state.teaseVersionOffset !== 'number' || state.teaseVersionOffset < 0) {
    state.teaseVersionOffset = 1;
  }
  // 列表列顺序：listGroupOrder = 组顺序（第一行拖整组），listSubOrder = {组id: 组内子列顺序}（第二行子项仅组内拖）
  if (!Array.isArray(state.listGroupOrder)) state.listGroupOrder = [];
  if (typeof state.listSubOrder !== 'object' || !state.listSubOrder) state.listSubOrder = {};
  // 清除旧静态 char_preview/char_pv/banner（已改为按 charCount 动态生成或被角色一卡池替代，避免重复列）
  let changed = false;
  const cleaned = [];
  state.customEvents.forEach(e => {
    if (e.key === 'char_preview' || e.key === 'char_pv' || e.key === 'banner' || e.key === 'char_tease') { changed = true; return; }
    cleaned.push(e);
  });
  if (changed) { state.customEvents = cleaned; Storage.save(state); persistToFile(); }
  // 清理各游戏 hiddenEventKeys 中已失效的旧 key（banner/banner_0/banner_1/裸char_pv/裸char_preview/裸char_tease）
  const staleKeys = ['banner', 'banner_0', 'banner_1', 'char_pv', 'char_preview', 'char_tease'];
  state.games.forEach(g => {
    if (Array.isArray(g.hiddenEventKeys) && g.hiddenEventKeys.some(k => staleKeys.includes(k))) {
      const before = g.hiddenEventKeys.length;
      g.hiddenEventKeys = g.hiddenEventKeys.filter(k => !staleKeys.includes(k));
      if (g.hiddenEventKeys.length !== before) { changed = true; }
    }
  });
  if (changed) { Storage.save(state); persistToFile(); }
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

/* 推荐偏移：优先取逐版本覆盖 → 有历史取平均 → 自定义基准 baseOffsets → 默认 */
function eventOffset(game, hk, defOff, tenths) {
  // 1. 逐版本逐事件覆盖（列表编辑模式写入）
  if (tenths !== undefined && tenths !== null) {
    const veo = game && game.verEventOffsets && game.verEventOffsets[tenths + '|' + hk];
    if (typeof veo === 'number') return veo;
  }
  // 2. 历史学习平均
  const h = game && game.eventHistory && game.eventHistory[hk];
  if (h && h.length) return Math.round(h.reduce((a, b) => a + b, 0) / h.length);
  // 3. 全局自定义基准
  const bo = game && game.baseOffsets && game.baseOffsets[hk];
  return (typeof bo === 'number') ? bo : defOff;
}
/** 获取默认偏移量（不含逐版本覆盖，用于判断是否需要存储覆盖） */
function getDefaultOffset(game, hk) {
  const h = game && game.eventHistory && game.eventHistory[hk];
  if (h && h.length) return Math.round(h.reduce((a, b) => a + b, 0) / h.length);
  const bo = game && game.baseOffsets && game.baseOffsets[hk];
  return (typeof bo === 'number') ? bo : null; // null = 使用 defOff（由调用方传入）
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
    // 逐版本更新日期覆盖（列表编辑模式写入）
    const vud = game && game.verUpdateDates && game.verUpdateDates[String(t)];
    const updateDate = vud ? parseDate(vud) : new Date(dMs);
    const dur = durationOf(game, t);
    const events = [];
    gameActiveEvents(game).forEach(def => {
      def.offsets.forEach((defOff, idx) => {
        const hk = def.key + (def.offsets.length > 1 || def.charIndex != null
          ? '_' + (def.charIndex != null ? def.charIndex : idx) : '');
        const off = eventOffset(game, hk, defOff, t);
        const name = def.name + (def.sub ? def.sub[idx] : '');
        const custom = game.eventTitles && game.eventTitles[evTitleKey(t, hk)];
        const title = custom || name;
        // 该版本是否隐藏此事件（per-version 隐藏 或 列级隐藏）
        const hidden = !!(game.verHiddenEvents && game.verHiddenEvents[t + '|' + hk]) || !!def._hidden;
        events.push({
          defKey: def.key, historyKey: hk, sub: def.offsets.length > 1 ? idx : null,
          charIndex: def.charIndex != null ? def.charIndex : null,
          name, title, date: addDays(updateDate, off), offset: off, hidden
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
      state.visibleGames = visibleGames; saveLocalOnly();
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

/** 拖拽重排角色组顺序（角色一/角色二/…，设置面板两级排序用） */
function reorderCharGroups(fromCi, toCi) {
  if (fromCi == null || fromCi === toCi) return;
  const arr = state.charGroupOrder;
  if (!arr) return;
  const from = arr.indexOf(fromCi), to = arr.indexOf(toCi);
  if (from < 0 || to < 0) return;
  arr.splice(from, 1); arr.splice(to, 0, fromCi);
  saveAndRender();
  curSettingsTab = 's-events';
  openSettings();
  toast('已调整角色顺序');
}

/** 拖拽重排角色内子项顺序（卡池/预告/PV，仅组内） */
function reorderCharSubs(fromKey, toKey) {
  if (!fromKey || !toKey || fromKey === toKey) return;
  const arr = state.charSubOrder;
  if (!arr) return;
  const from = arr.indexOf(fromKey), to = arr.indexOf(toKey);
  if (from < 0 || to < 0) return;
  arr.splice(from, 1); arr.splice(to, 0, fromKey);
  saveAndRender();
  curSettingsTab = 's-events';
  openSettings();
  toast('已调整角色内子项顺序');
}

/* ----------------------------- 视图统一设置条 + 时间轴侧栏 ----------------------------- */
const SHORT = { version_update: '更新', version_preview: '前瞻',
  char_tease_0: '一爆料', char_tease_1: '二爆料', char_tease_2: '三爆料', char_tease_3: '四爆料', char_tease_4: '五爆料', char_tease_5: '六爆料',
  char_banner_0: '角色一卡池', char_banner_1: '角色二卡池', char_banner_2: '角色三卡池', char_banner_3: '角色四卡池', char_banner_4: '角色五卡池', char_banner_5: '角色六卡池',
  char_preview_0: '一预告', char_preview_1: '二预告', char_preview_2: '三预告', char_preview_3: '四预告', char_preview_4: '五预告', char_preview_5: '六预告',
  char_pv_0: '一PV', char_pv_1: '二PV', char_pv_2: '三PV', char_pv_3: '四PV', char_pv_4: '五PV', char_pv_5: '六PV' };
function evShortKey(ev) { return ev.defKey + (ev.charIndex != null ? '_' + ev.charIndex : (ev.sub != null ? '_' + ev.sub : '')); }
function fmtCalFocus(dt) { return dt.getFullYear() + '-' + (dt.getMonth() + 1); }
function shiftCal(d) {
  const parts = (state.calFocus || fmtCalFocus(todayNoon())).split('-');
  let y = Number(parts[0]), m = Number(parts[1]) + d;
  if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
  state.calFocus = y + '-' + m; saveLocalOnly();
}
function upcomingEvents(limit) {
  const all = collectEvents().filter(it => visibleGames[it.game.id] !== false && it.date >= addDays(todayNoon(), -1));
  all.sort((a, b) => a.date - b.date);
  return all.slice(0, limit || 12);
}
function timelineSidebarHTML() {
  let legend = '';
  activeEvents().forEach(def => def.offsets.forEach((o, idx) => {
    legend += `<div class="lg-item"><span class="lg-dot" style="background:${eventColor(def.key, def.charIndex != null ? def.charIndex : idx)}"></span>${escapeHtml(def.name + (def.sub ? def.sub[idx] : ''))}<span class="muted">默认 +${o}天</span></div>`;
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
    document.getElementById('vc-zoom-out').onclick = () => { state.dayW = Math.max(2, (state.dayW || 4) - 1); saveLocalOnly(); };
    document.getElementById('vc-zoom-in').onclick = () => { state.dayW = Math.min(24, (state.dayW || 4) + 1); saveLocalOnly(); };
    document.getElementById('vc-zoom').oninput = (e) => { state.dayW = Number(e.target.value) || 4; saveLocalOnly(); };
    document.getElementById('vc-labels').onchange = (e) => { state.showLabels = e.target.checked; saveLocalOnly(); };
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
    document.getElementById('vc-cal-today').onclick = () => { state.calFocus = fmtCalFocus(todayNoon()); saveLocalOnly(); };
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
          marks += `<div class="tl-event-mark" data-game="${game.id}" data-tenths="${v.tenths}" data-hk="${ev.historyKey}" title="${tip}" style="left:${mLeft}px;background:${eventColor(ev.defKey, ev.charIndex ?? ev.sub)}"></div>`;
          if (state.showLabels) {
            labels += `<div class="tl-evt-tag" data-game="${game.id}" data-tenths="${v.tenths}" data-hk="${ev.historyKey}" title="${tip}" style="left:${mLeft}px;--c:${eventColor(ev.defKey, ev.charIndex ?? ev.sub)}">${SHORT[evShortKey(ev)] || escapeHtml(ev.name)}</div>`;
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
/** 生成列表视图中单个事件单元格的 HTML */
function listEvCellHTML(game, v, ev, editMode) {
  const cd = diffDays(ev.date, todayNoon());
  const cdTxt = cd === 0 ? '今天' : (cd > 0 ? '+' + cd : String(cd));
  const isSoon = cd >= 0 && cd <= (state.leadDays || 3);
  const soonCls = isSoon ? 'soon' : '';
  // 仅动态生成的角色事件（带 charIndex）才显示角色名标签，char_tease 等静态事件不算
  const isDynamicChar = ev.charIndex != null;
  // 角色事件：优先从 charNames（本版本该角色通用）取角色名；普通事件：用 eventTitles
  let customHtml = '';
  if (isDynamicChar) {
    const ci = ev.charIndex;
    const charName = (game.charNames && game.charNames[String(v.tenths) + '|' + ci]) || '';
    // charNames 优先 → 其次 eventTitles（per-cell 覆盖）→ 都没有则不显示标签
    const displayName = charName || ((ev.title !== ev.name) ? ev.title : '');
    if (displayName) {
      const tagColor = eventColor(ev.defKey, ci);
      customHtml = `<div class="ev-char-tag" style="background:${tagColor}18;color:${tagColor};border:1px solid ${tagColor}44">${escapeHtml(displayName)}</div>`;
    }
  } else if (ev.title !== ev.name) {
    customHtml = `<div class="ev-custom">${escapeHtml(ev.title)}</div>`;
  }

  // 该版本无此事件：显示空占位（编辑模式下可点击恢复）
  if (ev.hidden) {
    if (!editMode) {
      return `<td class="vt-empty" title="此版本无「${escapeHtml(ev.name)}」">—</td>`;
    }
    return `<td class="le-editable vt-empty" data-game="${game.id}" data-tenths="${v.tenths}"` +
      ` data-hk="${ev.historyKey}" data-ev-name="${escapeAttr(ev.name)}" title="点击恢复显示：${escapeHtml(ev.name)}">` +
      `<span class="le-add-hint">＋ 恢复</span></td>`;
  }

  if (!editMode) {
    return `<td class="${soonCls}" title="${escapeHtml(ev.title)}">${fmtDate(ev.date)}` +
      `<div class="muted" style="font-size:11px">${cdTxt}</div>${customHtml}</td>`;
  }
  // 编辑模式：可点击编辑
  return `<td class="le-editable ${soonCls}" data-game="${game.id}" data-tenths="${v.tenths}"` +
    ` data-hk="${ev.historyKey}" data-ev-name="${escapeAttr(ev.name)}" title="点击编辑：${escapeHtml(ev.title)}">` +
    `<div class="le-cell-date">${fmtDate(ev.date)}</div>` +
    `<div class="muted" style="font-size:11px">${cdTxt}</div>${customHtml}` +
    `<span class="le-edit-hint">✏️</span></td>`;
}

/** 新角色爆料列单元格：显示绑定目标版本的角色备注名 + 爆料事件日期（可点击编辑） */
function teaseCellHTML(def, remark, editMode, game, v, targetVer, teaseDate, verHidden) {
  const ci = def.charIndex != null ? def.charIndex : 0;
  const color = eventColor('char_tease', ci);
  const hidden = verHidden || !!def._hidden;
  const targetLabel = targetVer ? targetVer.label || '—' : '—';
  // 已隐藏：编辑模式可点击恢复（与普通事件格子一致）
  if (hidden) {
    if (!editMode) {
      return `<td class="vt-empty" title="新角色爆料·角色${ci + 1} 已隐藏">—</td>`;
    }
    return `<td class="le-editable vt-empty" style="border:1px solid var(--border);border-bottom:0!important" data-game="${game.id}" data-tenths="${v.tenths}"` +
      ` data-cell-type="tease" data-char-index="${ci}"` +
      (targetVer ? ` data-target-tenths="${targetVer.tenths}"` : '') +
      ` title="点击恢复显示：新角色爆料·角色${ci + 1}">` +
      `<span class="le-add-hint">＋ 恢复</span></td>`;
  }
  // 有备注名显示标签，无备注名不渲染占位符（避免多余 span 产生横线）
  const tag = remark
    ? `<div class="ev-char-tag" style="background:${color}18;color:${color};border:1px solid ${color}44">${escapeHtml(remark)}</div>`
    : '';
  // 日期倒计时（与 listEvCellHTML 算法一致）
  const cd = teaseDate ? diffDays(teaseDate, todayNoon()) : null;
  const cdTxt = cd === null ? '' : (cd === 0 ? '今天' : (cd > 0 ? '+' + cd : String(cd)));
  const dateHtml = teaseDate
    ? `<div class="le-cell-date" style="border:0!important;outline:0!important;box-shadow:none!important;text-decoration-line:none!important;text-decoration-style:none!important;text-decoration-color:transparent!important;text-decoration:none!important;border-bottom:0!important;background:none!important">${fmtDate(teaseDate)}</div><div class="muted" style="font-size:11px;border:0!important;outline:0!important;box-shadow:none!important;text-decoration-line:none!important;text-decoration-style:none!important;text-decoration-color:transparent!important;text-decoration:none!important;border-bottom:0!important;background:none!important">${cdTxt}</div>`
    : `<div class="le-cell-date muted" style="border:0!important;outline:0!important;box-shadow:none!important;text-decoration-line:none!important;text-decoration-style:none!important;text-decoration-color:transparent!important;border-bottom:0!important">—</div>`;
  // 爆料列可点击编辑：修改目标版本的角色备注名 + 爆料事件日期
  if (!editMode) {
    return `<td title="新角色爆料·角色${ci + 1} → 绑定到「${escapeAttr(targetLabel)}」">${dateHtml}${tag}</td>`;
  }
  return `<td class="le-editable" style="border:1px solid var(--border);border-bottom:0!important;outline:0!important;box-shadow:none!important" data-game="${game.id}" data-tenths="${v.tenths}"` +
    ` data-cell-type="tease" data-char-index="${ci}"` +
    (targetVer ? ` data-target-tenths="${targetVer.tenths}"` : '') +
    ` title="点击编辑：新角色爆料·角色${ci + 1} → 绑定到「${escapeAttr(targetLabel)}」的备注名与日期">${dateHtml}${tag}` +
    `<span class="le-edit-hint">✏️</span></td>`;
}

function renderList() {
  const host = document.getElementById('view-list');
  let html = '';
  const list = state.games.filter(g => visibleGames[g.id] !== false);
  const editMode = !!state.listEditMode;
  if (!list.length) { host.innerHTML = '<p class="muted">暂无游戏</p>'; return; }
  list.forEach(game => {
    const all = genGameVersions(game);
    const tMs = addDays(todayNoon(), -1).getTime();
    // 按日期排序（genGameVersions 返回顺序不保证是时间正序）
    const sorted = [...all].sort((a, b) => a.updateDate.getTime() - b.updateDate.getTime());
    const past = sorted.filter(v => v.updateDate.getTime() < tMs);
    const future = sorted.filter(v => v.updateDate.getTime() >= tMs);
    // 取过去版本：最新的 N 个（末尾），其中最后一个就是「当前版本」
    const pastN = past.slice(-(state.listPast || 2));   // 已按日期正序：如 [6.6, 6.8] 或 [6.8] 或 [6.8, 7.0]
    const currentVer = pastN.length > 0 ? pastN[pastN.length - 1] : null;  // 最近的一个 = 当前运行中版本
    const olderVersions = pastN.slice(0, -1);  // 排除当前版本的更早历史
    const futureN = future.slice(0, state.listCount || 8);
    // 爆料偏移量（用于每行独立计算目标版本）
    const teaseOff = state.teaseVersionOffset || 0;
    // 完整排序后的版本列表（含过去+未来），供每行计算各自的爆料目标版本
    const allSorted = sorted; // 已按日期正序

    // 该游戏可见的事件列（全局 + 按游戏隐藏过滤后）
    const gEvts = gameActiveEvents(game);
    // 🔍 诊断：打印列表视图实际渲染的表头文字（定位"卡池更新上半"来源）
    const headTexts = [];
    gEvts.forEach(def => def.offsets.forEach((o, idx) => {
      headTexts.push(def.name + (def.sub ? def.sub[idx] : '') + ' [key=' + def.key + (def.charIndex!=null?('_'+def.charIndex):'') + ']');
    }));
    console.log('[GVS] 🔍 列表视图实际表头文字 (game=' + (game&&game.id) + '): ' + headTexts.join(' | '));
    // 构建可见事件 key 集合（cols 计算仍需要）

    const cols = 2 + gEvts.reduce((a, d) => a + d.offsets.length, 0);

    // 构建分组表头数据（用于 headRow1 的分组行，含 colspan）
    const charGroupDefs = []; // { ci, label, cols: [{def, idx}] }
    const teaseGroup = { ci: -1, label: '新角色爆料', cols: [] };
    const normalCols = [];
    gEvts.forEach((def) => {
      def.offsets.forEach((o, idx) => {
        if (def._tease) {
          teaseGroup.cols.push({ def, idx });
        } else if (def._isChar) {
          const ci = def.charIndex ?? 0;
          let group = charGroupDefs.find(g => g.ci === ci);
          if (!group) {
            const CHARS = ['一', '二', '三', '四', '五', '六'];
            group = { ci, label: '角色' + (CHARS[ci] || (ci + 1)), cols: [] };
            charGroupDefs.push(group);
          }
          group.cols.push({ def, idx });
        } else {
          normalCols.push({ def, idx });
        }
      });
    });
    const teaseGroupDefs = teaseGroup.cols.length ? [teaseGroup] : [];

    // —— 统一分组模型（拖拽：第一行拖「整组」、第二行子项只能在「组内」拖） ——
    // 每个顶层项 = 一个 group：普通列是单列为一组(singleton)，爆料/角色分组是含多子列的分组
    const CHARS = ['一', '二', '三', '四', '五', '六'];
    function mkCol(c, type, ci) {
      if (type === 'tease') return { colId: 'tease_' + ci, type, def: c.def, idx: c.idx, groupCi: ci };
      if (type === 'char') return { colId: (c.def._origKey || c.def.key) + '_' + ci, type, def: c.def, idx: c.idx, groupCi: ci };
      return { colId: c.def.key, type: 'normal', def: c.def, idx: c.idx };
    }
    let groups = [];
    normalCols.forEach(c => {
      const col = mkCol(c, 'normal');
      groups.push({ id: 'norm__' + col.colId, type: 'normal', singleton: true, label: c.def.name, color: eventColor(c.def._origKey || c.def.key, c.idx), cols: [col] });
    });
    teaseGroupDefs.forEach(g => {
      const cols = g.cols.map(c => mkCol(c, 'tease', c.def.charIndex != null ? c.def.charIndex : c.idx));
      groups.push({ id: 'tease', type: 'tease', singleton: false, label: '新角色爆料', color: eventColor('char_tease', 0), cols });
    });
    charGroupDefs.forEach(g => {
      const cols = g.cols.map(c => mkCol(c, 'char', g.ci));
      groups.push({ id: 'char__' + g.ci, type: 'char', singleton: false, label: g.label, color: eventColor(g.cols[0].def._origKey || g.cols[0].def.key, g.ci), charIndex: g.ci, cols });
    });

    // 应用已保存的组顺序（第一行）与组内子顺序（第二行）
    const grpOrder = (state.listGroupOrder && state.listGroupOrder.length) ? state.listGroupOrder : [];
    if (grpOrder.length) {
      const m = {}; grpOrder.forEach((id, i) => { if (!(id in m)) m[id] = i; });
      const max = grpOrder.length;
      groups.sort((a, b) => ((a.id in m ? m[a.id] : max) - (b.id in m ? m[b.id] : max)));
    }
    groups.forEach(g => {
      const sub = (state.listSubOrder && state.listSubOrder[g.id] && state.listSubOrder[g.id].length) ? state.listSubOrder[g.id] : null;
      if (sub) {
        const m = {}; sub.forEach((id, i) => { if (!(id in m)) m[id] = i; });
        const max = sub.length;
        g.cols.sort((a, b) => ((a.colId in m ? m[a.colId] : max) - (b.colId in m ? m[b.colId] : max)));
      }
    });

    // 扁平有序列（表头/数据单元格/拖拽都按它），保证三者严格一致
    const flatCols = [];
    groups.forEach(g => g.cols.forEach(c => flatCols.push(c)));

    let rows = '';

    // 辅助函数：按 flatCols 顺序渲染可见事件单元格（与表头严格一一对应）
    const renderEvCells = (v, editMode) => {
      let html = '';
      // 预建 historyKey → 事件 映射
      const evMap = {};
      v.events.forEach(ev => { evMap[ev.historyKey] = ev; });
      // historyKey 拼接规则同 genGameVersions 第685行
      const lookupEv = (def, idx) => {
        const origKey = def._origKey || def.key;
        const needsSuffix = def.offsets.length > 1 || def.charIndex != null;
        const hk = origKey + (needsSuffix ? '_' + (def.charIndex != null ? def.charIndex : idx) : '');
        return evMap[hk];
      };
      // 按 flatCols 统一遍历（与 headRow2 完全一致）
      flatCols.forEach(col => {
        let cell;
        if (col.type === 'tease') {
          const ci = col.def.charIndex != null ? col.def.charIndex : col.idx;
          const vIdx = allSorted.findIndex(sv => sv.tenths === v.tenths);
          const rowTarget = (vIdx >= 0 && teaseOff > 0 && allSorted[vIdx + teaseOff])
            ? allSorted[vIdx + teaseOff]
            : (teaseOff <= 0 ? v : null);
          const remark = (rowTarget && game.charNames)
            ? (game.charNames[String(rowTarget.tenths) + '|' + ci] || '') : '';
          // 爆料事件自身日期 = 绑定未来版本的 char_tease 事件日期（= 该版本更新日 + 偏移），与其他事件列算法一致
          let teaseDate = null;
          if (rowTarget) {
            const teaseEv = rowTarget.events.find(e => e.historyKey === ('char_tease_' + ci));
            teaseDate = teaseEv ? teaseEv.date : addDays(rowTarget.updateDate, TEASE_OFF);
          }
          // 检查该版本是否隐藏了此爆料事件（per-version 隐藏 或 列级隐藏）
          const teaseHk = 'char_tease_' + ci;
          const verHidden = !!(game.verHiddenEvents && game.verHiddenEvents[String(v.tenths) + '|' + teaseHk]);
          cell = teaseCellHTML(col.def, remark, editMode, game, v, rowTarget, teaseDate, verHidden);
        } else {
          const ev = lookupEv(col.def, col.idx);
          cell = ev ? listEvCellHTML(game, v, ev, editMode) : '<td></td>';
        }
        // 整列 FLIP：给该列每个单元格打同列 key（分组共享 → 整块同移动）
        html += cell.replace(/^<td/, `<td data-col-key="${escapeAttr(col.colId)}"`);
      });
      return html;
    };

    // 渲染顺序：更早历史(灰) → —今天— → 📍当前版本(高亮) → 未来(正常)
    // ---- 更早的历史版本 ----
    olderVersions.forEach(v => {
      const verTd = editMode
        ? `<td class="vt-ver le-editable" data-game="${game.id}" data-tenths="${v.tenths}" data-cell-type="ver" title="点击编辑版本信息">${v.label}<span class="le-edit-hint">✏️</span></td>`
        : `<td class="vt-ver">${v.label}</td>`;
      const updateTd = editMode
        ? `<td class="le-editable" data-game="${game.id}" data-tenths="${v.tenths}" data-cell-type="update" title="点击修改更新日期">${fmtDate(v.updateDate)}<span class="le-edit-hint">✏️</span></td>`
        : `<td>${fmtDate(v.updateDate)}</td>`;
      rows += `<tr class="vt-past">${verTd}${updateTd}`;
      rows += renderEvCells(v, editMode);
      rows += `</tr>`;
    });
    // ---- 分隔线（有历史或有当前版本且有未来时才显示） ----
    if ((olderVersions.length > 0 || currentVer) && futureN.length > 0) {
      rows += `<tr class="vt-divider"><td colspan="${cols}">— 今天 —</td></tr>`;
    }
    // ---- 当前版本（高亮） ----
    if (currentVer) {
      const verTd = editMode
        ? `<td class="vt-ver le-editable" data-game="${game.id}" data-tenths="${currentVer.tenths}" data-cell-type="ver" title="点击编辑版本信息">📍 ${currentVer.label}<span class="le-edit-hint">✏️</span></td>`
        : `<td class="vt-ver">📍 ${currentVer.label}</td>`;
      const updateTd = editMode
        ? `<td class="le-editable" data-game="${game.id}" data-tenths="${currentVer.tenths}" data-cell-type="update" title="点击修改更新日期">${fmtDate(currentVer.updateDate)}<span class="le-edit-hint">✏️</span></td>`
        : `<td>${fmtDate(currentVer.updateDate)}</td>`;
      rows += `<tr class="vt-current">${verTd}${updateTd}`;
      rows += renderEvCells(currentVer, editMode);
      rows += `</tr>`;
    }
    // ---- 未来版本 ----
    futureN.forEach(v => {
      const verTd = editMode
        ? `<td class="vt-ver le-editable" data-game="${game.id}" data-tenths="${v.tenths}" data-cell-type="ver" title="点击编辑版本信息">${v.label}<span class="le-edit-hint">✏️</span></td>`
        : `<td class="vt-ver">${v.label}</td>`;
      const updateTd = editMode
        ? `<td class="le-editable" data-game="${game.id}" data-tenths="${v.tenths}" data-cell-type="update" title="点击修改更新日期">${fmtDate(v.updateDate)}<span class="le-edit-hint">✏️</span></td>`
        : `<td>${fmtDate(v.updateDate)}</td>`;
      rows += `<tr>${verTd}${updateTd}`;
      rows += renderEvCells(v, editMode);
      rows += `</tr>`;
    });
    // 第一行：分组标题（普通列 rowspan=2，角色组 colspan）
    // 辅助：判断事件定义是否被隐藏
    const isDefHidden = (d) => !!(d._hidden);
    // 编辑模式：表头改名入口改为「悬停小铅笔按钮」，避免与拖拽手势冲突（不再整块可点）
    const renameBtnHTML = (gId, key, kind) => editMode
      ? `<button type="button" class="le-rename-btn" draggable="false" onmousedown="event.stopPropagation()" onclick="openColRenameEditor('${gId}','${escapeAttr(key)}','${kind}', this.closest('th'))" title="重命名此列">✏️</button>`
      : '';
    let headRow1 = '<th rowspan="2">版本</th><th rowspan="2">更新</th>';
    groups.forEach(g => {
      const hid = g.cols.every(c => isDefHidden(c.def));
      const gDrag = editMode ? ` draggable="true" data-group-id="${escapeAttr(g.id)}"` : '';
      const grab = editMode ? '<span class="set-ev-grab" style="font-size:9px;margin-right:2px;opacity:.5">⠿</span>' : '';
      if (g.singleton) {
        const c = g.cols[0];
        const origKey = c.def._origKey || c.def.key;
        const dName = (game.colDisplayNames && game.colDisplayNames[g.id]) || (c.def.name + (c.def.sub ? c.def.sub[c.idx] : ''));
        headRow1 += `<th class="le-group-drag" data-col-key="${escapeAttr(g.id)}" rowspan="2" style="${hid ? 'opacity:.35;text-decoration:line-through' : ''};cursor:${editMode ? 'grab' : 'default'}"${gDrag}>${grab}<span class="chip-dot" style="background:${eventColor(origKey, c.idx)};display:inline-block;width:8px;height:8px;border-radius:50%"></span> ${escapeHtml(dName)}${renameBtnHTML(game.id, g.id, 'group')}</th>`;
      } else {
        const colSpan = g.cols.length;
        const dName = (game.colDisplayNames && game.colDisplayNames[g.id]) || g.label;
        headRow1 += `<th colspan="${colSpan}" class="char-group-head le-group-drag" data-col-key="${escapeAttr(g.id)}" style="background:${g.color}22;color:${g.color};font-size:11px;font-weight:700;padding:4px 6px;border-bottom:2px solid ${g.color}44${hid ? ';opacity:.35;text-decoration:line-through' : ''};cursor:${editMode ? 'grab' : 'default'}"${gDrag}>${grab}<span class="chip-dot" style="background:${g.color};width:6px;height:6px"></span> ${escapeHtml(dName)}${renameBtnHTML(game.id, g.id, 'group')}</th>`;
      }
    });
    // 第二行：子列名（仅非单列的组才占第二行；编辑模式可拖拽，但只能在所属组内移动）
    let headRow2 = '';
    groups.forEach(g => {
      if (g.singleton) return; // 单列为一组不占第二行
      g.cols.forEach(col => {
        const origKey = col.def._origKey || col.def.key;
        const color = eventColor(origKey, col.groupCi ?? col.idx);
        const hid = isDefHidden(col.def);
        const cellText = col.def.sub ? col.def.sub[col.idx] : col.def.name;
        const dName = (game.colDisplayNames && game.colDisplayNames[col.colId]) || cellText;
        const dragAttrs = editMode
          ? ` draggable="true" data-col-id="${escapeAttr(col.colId)}" data-group-id="${escapeAttr(g.id)}" data-col-key="${escapeAttr(col.colId)}" class="le-col-drag"`
          : '';
        headRow2 += `<th style="font-size:10px;color:var(--text-soft);padding:2px 4px;border-bottom:2px solid ${color}44;background:${color}08${hid ? ';opacity:.35;text-decoration:line-through' : ''};cursor:${editMode ? 'grab' : 'default'}"${dragAttrs}>${editMode ? '<span class="set-ev-grab" style="font-size:9px;margin-right:2px;opacity:.5">⠿</span>' : ''}${escapeHtml(dName)}${renameBtnHTML(game.id, col.colId, 'col')}</th>`;
      });
    });
    const head = `<tr>${headRow1}</tr>${headRow2 ? '<tr>' + headRow2 + '</tr>' : ''}`;
    // 编辑模式切换 + 列设置按钮（仅编辑模式显示）
    const editBtn = `<button class="vc-btn ${editMode ? 'le-btn-on' : ''}" onclick="toggleListEditMode()" style="margin-left:8px;${editMode ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : ''}">${editMode ? '✏️ 修改中' : '✏️ 修改'}</button>`;
    const colBtn = editMode
      ? `<button class="vc-btn" onclick="openColSettings('${game.id}', this)" title="设置显示/隐藏的列">⚙️ 列</button>`
      : '';
    // 有隐藏列时显示恢复提示
    const hiddenCount = (game.hiddenEventKeys || []).length;
    const hiddenHint = !editMode && hiddenCount > 0
      ? ` <span class="muted" style="cursor:pointer;font-size:11px;color:var(--danger);font-weight:600" onclick="toggleListEditMode();setTimeout(function(){openColSettings('${game.id}',document.querySelector('[data-game-id=&quot;${game.id}&quot;] .vc-btn[title*=列]'))},100)" title="点击进入修改模式恢复隐藏的${hiddenCount}列">🔒${hiddenCount}列已隐藏</span>`
      : '';
    html += `<div class="list-game ${editMode ? 'le-mode' : ''}" data-game-id="${game.id}"><div class="list-game-title">${gameIconHTML(game, 'icon')} <b>${escapeHtml(game.name)}</b>` +
      `<span class="muted">基础 ${game.baseCycleDays}天 · 小版本上限 ${game.minorMax} · 显示过去 ${state.listPast || 2} / 未来 ${state.listCount || 8} 个版本</span>` +
      `${editBtn}${colBtn}${hiddenHint}` +
      `<button class="ghost" style="margin-left:auto" onclick="openGameModal('${game.id}')">编辑游戏</button></div>` +
      `<div class="calendar-scroll"><table class="ver-table ${editMode ? 'le-table' : ''}"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  });
  host.innerHTML = html;
  // 编辑模式下绑定单元格点击事件
  if (editMode) { bindListEditCells(); bindColumnDrag(); }
}

/** 切换列表编辑模式 */
function toggleListEditMode() {
  state.listEditMode = !state.listEditMode;
  saveLocalOnly();
}

/** 为编辑模式的单元格绑定点击事件 */
function bindListEditCells() {
  document.querySelectorAll('#view-list .le-editable').forEach(td => {
    td.addEventListener('click', (e) => {
      e.stopPropagation();
      const gameId = td.dataset.game;
      const tenths = Number(td.dataset.tenths);
      const cellType = td.dataset.cellType || 'ev';
      const hk = td.dataset.hk || '';
      openListCellEditor(gameId, tenths, cellType, hk, td);
    });
  });
  // 表头改名入口已改为悬停小铅笔按钮（见 renameBtnHTML），无需在此绑定 click
}

/** FLIP 落位过渡：拖拽完成后整列滑入新位置。
 *  重排前调用 captureColumnRects() 记录各列左边界；render() 后调用 playColumnFlip() 播放。
 *  列内所有 [data-col-key] 元素（表头 th + 该列全部数据 td）共享同一 key，故整列同步平移。 */
function captureColumnRects() {
  // 先中和拖起浮起的 transform，否则被缩放的源单元格量到的左边界会偏移
  document.querySelectorAll('#view-list .le-dragging').forEach(el => { el.style.transition = 'none'; el.style.transform = 'none'; });
  const map = {};
  document.querySelectorAll('#view-list [data-col-key]').forEach(el => {
    const k = el.getAttribute('data-col-key');
    if (!(k in map)) map[k] = el.getBoundingClientRect().left;
  });
  return map;
}
function playColumnFlip(oldMap) {
  const moved = [];
  document.querySelectorAll('#view-list [data-col-key]').forEach(el => {
    const k = el.getAttribute('data-col-key');
    if (!(k in oldMap)) return;
    const dx = oldMap[k] - el.getBoundingClientRect().left;
    if (Math.abs(dx) < 1) return;
    el.classList.add('le-flip-move');
    el.style.transition = 'none';
    el.style.transform = `translateX(${dx}px)`;
    moved.push(el);
  });
  if (!moved.length) return;
  // 强制回流，确保初始位移生效后再过渡回 0
  void document.body.offsetHeight;
  requestAnimationFrame(() => {
    moved.forEach(el => {
      el.style.transition = 'transform 0.26s cubic-bezier(.2,.8,.2,1)';
      el.style.transform = '';
    });
    setTimeout(() => moved.forEach(el => {
      el.classList.remove('le-flip-move');
      el.style.transition = '';
      el.style.transform = '';
    }), 320);
  });
}

/** 为编辑模式的列表表头绑定拖拽排序：
 *   - 第一行(th.le-group-drag)：拖「整组」（含其下所有子列），组间自由重排
 *   - 第二行(th.le-col-drag)：拖「子列」，但只能在本组内移动，不能跨组
 * 用模块级 _listDragSrc 记录拖拽源，避免 dragover 中读取 dataTransfer 的限制。 */
let _listDragSrc = null; // { kind:'group'|'col', groupId, colId }
let _listDragSrcEl = null; // 拖拽源 th 元素（用于起步手持指示线，消除死区）
let _listInsSide = 'before'; // 'before' | 'after' —— 落位在目标前/后（由光标半区决定）
function bindColumnDrag() {
  const theads = Array.from(document.querySelectorAll('#view-list thead'));
  const groupEls = Array.from(document.querySelectorAll('#view-list .le-group-drag'));
  const colEls = Array.from(document.querySelectorAll('#view-list .le-col-drag'));
  if (!theads.length || (!groupEls.length && !colEls.length)) return;

  // —— 拖拽源：仍绑在各 th（draggable 元素本身）——
  groupEls.forEach(th => {
    th.addEventListener('dragstart', e => {
      if (e.target.closest && e.target.closest('.le-rename-btn')) return; // 改名按钮不触发拖拽
      _listDragSrc = { kind: 'group', groupId: th.dataset.groupId };
      _listDragSrcEl = th;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', 'group:' + th.dataset.groupId); } catch(_) {}
      th.classList.add('le-dragging');
      showDropLine(th, 'after', true); // 起步即在源边缘画手持指示线，消除死区
    });
    th.addEventListener('dragend', () => { th.classList.remove('le-dragging'); clearTargetHighlights(); hideDropLine(); _listDragSrc = null; _listDragSrcEl = null; });
  });
  colEls.forEach(th => {
    th.addEventListener('dragstart', e => {
      if (e.target.closest && e.target.closest('.le-rename-btn')) return; // 改名按钮不触发拖拽
      _listDragSrc = { kind: 'col', groupId: th.dataset.groupId, colId: th.dataset.colId };
      _listDragSrcEl = th;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', 'col:' + th.dataset.groupId + ':' + th.dataset.colId); } catch(_) {}
      th.classList.add('le-dragging');
      showDropLine(th, 'after', true); // 起步即在源边缘画手持指示线，消除死区
    });
    th.addEventListener('dragend', () => { th.classList.remove('le-dragging'); clearTargetHighlights(); hideDropLine(); _listDragSrc = null; _listDragSrcEl = null; });
  });

  const clearTargetHighlights = () => document.querySelectorAll('#view-list .drag-over-before, #view-list .drag-over-after').forEach(x => x.classList.remove('drag-over-before', 'drag-over-after'));

  // —— 事件委托：dragover / drop 绑到每个 thead，用 closest()/x 坐标定位目标（规避 colspan 子元素命中错乱）——
  theads.forEach(thead => {
  thead.addEventListener('dragover', e => {
    if (!_listDragSrc || !_listDragSrcEl) return;
    clearTargetHighlights();
    if (_listDragSrc.kind === 'group') {
      // 组拖：直接命中分组块优先，光标在子列区时退回按 x 命中整块（跨两行也生效）
      const tgt = e.target.closest('.le-group-drag') || groupAtX(e.clientX);
      if (tgt && tgt.dataset.groupId && tgt.dataset.groupId !== _listDragSrc.groupId) {
        e.preventDefault();
        const r = tgt.getBoundingClientRect();
        _listInsSide = (e.clientX - r.left) < r.width / 2 ? 'before' : 'after';
        tgt.classList.add('drag-over-' + _listInsSide);
        showDropLine(tgt, _listInsSide, false); // 真实插入线
      } else {
        // 仍在源块/无效区域：保持手持指示线（消除起步死区，不再无反馈）
        showDropLine(_listDragSrcEl, 'after', true);
      }
    } else if (_listDragSrc.kind === 'col') {
      // 子列拖：仅同组且非自身；左半区=插前、右半区=插后
      const cT = e.target.closest('.le-col-drag');
      if (cT && cT.dataset.groupId === _listDragSrc.groupId && cT.dataset.colId && cT.dataset.colId !== _listDragSrc.colId) {
        e.preventDefault();
        const r = cT.getBoundingClientRect();
        _listInsSide = (e.clientX - r.left) < r.width / 2 ? 'before' : 'after';
        cT.classList.add('drag-over-' + _listInsSide);
        showDropLine(cT, _listInsSide, false);
      } else {
        showDropLine(_listDragSrcEl, 'after', true);
      }
    }
  });
  // 注：不在 dragleave 隐藏指示线——拖拽中途光标落入表体时保留最后指示，避免「线消失」错觉
  thead.addEventListener('drop', e => {
    e.preventDefault(); clearTargetHighlights(); hideDropLine();
    const cT = e.target.closest('.le-col-drag');
    if (_listDragSrc && _listDragSrc.kind === 'group') {
      const srcId = _listDragSrc.groupId;
      const tgt = groupAtX(e.clientX); // 与悬停指示一致：按光标 x 命中整块（跨两行）
      const targetId = tgt && tgt.dataset.groupId;
      if (!targetId || srcId === targetId) return;
      const order = Array.from(document.querySelectorAll('#view-list .le-group-drag')).map(x => x.dataset.groupId);
      const arr = order.slice();
      const si = arr.indexOf(srcId);
      if (si < 0) return;
      arr.splice(si, 1);
      const tIdx = arr.indexOf(targetId);
      if (tIdx < 0) return;
      // 左半区插前、右半区插后（与悬停插入线一致）
      arr.splice(_listInsSide === 'after' ? tIdx + 1 : tIdx, 0, srcId);
      state.listGroupOrder = arr;
      const snap = captureColumnRects();
      saveLocalOnly(); render(); playColumnFlip(snap); toast('分组顺序已调整');
    } else if (_listDragSrc && _listDragSrc.kind === 'col') {
      const srcGrp = _listDragSrc.groupId, srcCol = _listDragSrc.colId;
      const tGrp = cT && cT.dataset.groupId, tCol = cT && cT.dataset.colId;
      if (!tGrp || !tCol || tGrp !== srcGrp || tCol === srcCol) return; // 跨组禁止
      const domCols = Array.from(document.querySelectorAll('#view-list .le-col-drag[data-group-id="' + cssEscapeAttr(srcGrp) + '"]')).map(x => x.dataset.colId);
      const base = (state.listSubOrder && state.listSubOrder[srcGrp] && state.listSubOrder[srcGrp].length) ? [...state.listSubOrder[srcGrp]] : domCols;
      const arr = base.slice();
      const si = arr.indexOf(srcCol);
      if (si < 0) return;
      arr.splice(si, 1);
      const tIdx = arr.indexOf(tCol);
      if (tIdx < 0) return;
      arr.splice(_listInsSide === 'after' ? tIdx + 1 : tIdx, 0, srcCol);
      state.listSubOrder = state.listSubOrder || {};
      state.listSubOrder[srcGrp] = arr;
      const snap = captureColumnRects();
      saveLocalOnly(); render(); playColumnFlip(snap); toast('组内列顺序已调整');
    }
  });
  });
}

/** 转义用于 querySelector 属性选择器的字符串（组id含下划线，无特殊字符，这里做兜底） */
function cssEscapeAttr(s) { return String(s).replace(/["\\]/g, '\\$&'); }
/** 按光标 x 命中所在分组块（跨两行也生效，用于组拖的悬停/落点判定） */
function groupAtX(x) {
  let found = null;
  document.querySelectorAll('#view-list .le-group-drag').forEach(th => {
    const r = th.getBoundingClientRect();
    if (x >= r.left && x <= r.right) found = th;
  });
  return found;
}

// —— 落点指示线浮层（绝对定位，贯穿整表高度，醒目且不受 <th> 渲染限制）——
let _dropLineEl = null;
function showDropLine(targetEl, side, held) {
  const scroll = targetEl.closest('.calendar-scroll');
  if (!scroll) return;
  if (!_dropLineEl) {
    _dropLineEl = document.createElement('div');
    _dropLineEl.id = 'le-drop-line';
    scroll.appendChild(_dropLineEl);
  } else if (_dropLineEl.parentElement !== scroll) {
    scroll.appendChild(_dropLineEl); // 多游戏时移动到当前滚动容器
  }
  const r = targetEl.getBoundingClientRect();
  const sr = scroll.getBoundingClientRect();
  const left = (side === 'after' ? r.right : r.left) - sr.left + scroll.scrollLeft;
  _dropLineEl.style.left = left + 'px';
  _dropLineEl.classList.toggle('held', !!held); // 手持态：中性灰、无脉冲
  _dropLineEl.classList.add('show');
}
function hideDropLine() { if (_dropLineEl) _dropLineEl.classList.remove('show'); }

/** 打开列表单元格的内联编辑弹窗 */
let _leActiveCell = null; // 当前正在编辑的单元格 DOM
var _leCloseGuard = false;
var _leMousedownHandler = null;
function openListCellEditor(gameId, tenths, cellType, hk, cellEl) {
  // 如果已有打开的编辑器，先关闭
  closeListCellEditor();

  const game = state.games.find(g => g.id === gameId);
  if (!game) return;

  const v = genGameVersions(game).find(v => v.tenths === tenths);
  if (!v) return;

  _leActiveCell = cellEl;

  // 创建内联编辑浮层
  const editor = document.createElement('div');
  editor.className = 'le-inline-editor';
  editor.onclick = (e) => e.stopPropagation();

  if (cellType === 'ver') {
    // 版本信息编辑（只读展示 + 备注）
    editor.innerHTML = `
      <div class="le-editor-title">📋 版本 ${escapeHtml(v.label)} <small class="muted">(tenths=${tenths})</small></div>
      <div class="field">
        <label>更新日期</label>
        <input type="date" id="le-date" value="${fmtDate(v.updateDate)}">
      </div>
      <div class="field">
        <label>版本备注（仅本地显示）</label>
        <input type="text" id="le-note" placeholder="可选，如「长草期」「大版本」" value="${escapeHtml(game.verNotes && game.verNotes[String(tenths)] || '')}">
      </div>
      <div class="modal-actions">
        <button onclick="closeListCellEditor()">取消</button>
        <button class="primary" onclick="saveListVerEdit('${gameId}', ${tenths})">保存</button>
      </div>`;
  } else if (cellType === 'update') {
    // 更新日期编辑
    editor.innerHTML = `
      <div class="le-editor-title">📅 修改更新日期 — 版本 ${escapeHtml(v.label)}</div>
      <div class="field">
        <label>当前更新日期</label>
        <input type="date" id="le-date" value="${fmtDate(v.updateDate)}">
        <div class="muted" style="font-size:11px;margin-top:4px">⚠️ 修改日期会影响该版本之后所有事件的计算日期</div>
      </div>
      <div class="modal-actions">
        <button onclick="closeListCellEditor()">取消</button>
        <button class="primary" onclick="saveListUpdateDate('${gameId}', ${tenths})">保存</button>
      </div>`;
  } else if (cellType === 'tease') {
    // 新角色爆料编辑：修改目标版本的角色备注名 + 爆料事件日期
    const ci = Number(cellEl.dataset.charIndex || 0);
    const targetTenths = cellEl.dataset.targetTenths ? Number(cellEl.dataset.targetTenths) : null;
    const rowTenths = cellEl.dataset.tenths ? Number(cellEl.dataset.tenths) : null;  // 当前行版本（隐藏 key 用这个）
    const targetVer = targetTenths != null ? genGameVersions(game).find(v => v.tenths === targetTenths) : null;
    const targetLabel = targetVer ? targetVer.label : '（目标版本不存在）';
    const cnKey = String(targetTenths) + '|' + ci;
    const currentName = (targetTenths != null && game.charNames && game.charNames[cnKey]) || '';
    // 当前爆料事件日期：优先用 verEventOffsets 覆盖，否则目标版本更新日 + TEASE_OFF
    let currentDateStr = '';
    if (targetVer) {
      const teaseEv = targetVer.events.find(e => e.historyKey === ('char_tease_' + ci));
      const d = teaseEv ? teaseEv.date : addDays(targetVer.updateDate, TEASE_OFF);
      currentDateStr = fmtDate(d);
    }
    // 当前是否已隐藏（per-row：用当前行版本号，不用目标版本）
    const teaseHk = 'char_tease_' + ci;
    const isHidden = rowTenths != null && !!(game.verHiddenEvents && game.verHiddenEvents[String(rowTenths) + '|' + teaseHk]);
    const CHARS = ['一', '二', '三', '四', '五', '六'];
    editor.innerHTML = `
      <div class="le-editor-title"><span class="chip-dot" style="background:${eventColor('char_tease', ci)};display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:middle"></span> 新角色爆料·角色${CHARS[ci] || (ci+1)} → 绑定到「${escapeHtml(targetLabel)}」</div>
      <div class="muted" style="font-size:11px;margin-bottom:8px">💡 此处填写的名称会显示在该游戏所有行的「新角色爆料·角色${CHARS[ci] || (ci+1)}」列中</div>
      <div class="field">
        <label>事件日期</label>
        <input type="date" id="le-tease-date" value="${currentDateStr}" ${isHidden ? 'disabled' : ''}>
      </div>
      <div class="field">
        <label>角色备注名</label>
        <input type="text" id="le-tease-name" placeholder="如：奥黛塔、薇斯娜" value="${escapeHtml(currentName)}" ${isHidden ? 'disabled' : ''}>
      </div>
      <label class="le-hide-check">
        <input type="checkbox" id="le-tease-hide" ${isHidden ? 'checked' : ''} />
        <span>此版本无该事件（隐藏此单元格）</span>
      </label>
      <div class="modal-actions">
        <button onclick="closeListCellEditor()">取消</button>
        <button class="primary" onclick="saveListTeaseEdit('${gameId}', ${targetTenths}, ${ci}, ${rowTenths})">保存</button>
      </div>`;
  } else {
    // 事件单元格编辑
    const ev = v.events.find(e => e.historyKey === hk);
    if (!ev) return;
    const tkey = evTitleKey(tenths, hk);
    const currentTitle = (game.eventTitles && game.eventTitles[tkey]) || '';
    const isHidden = !!ev.hidden;
    const isChar = ev.charIndex != null; // 仅动态角色事件（char_banner/char_preview/char_pv）
    // 角色事件：从 charNames（按版本+角色索引）读取，而非 eventTitles（按具体事件）
    const ci = ev.charIndex != null ? ev.charIndex : (ev.sub ?? 0);
    const charNameKey = String(tenths) + '|' + ci;
    const currentCharName = (isChar && game.charNames && game.charNames[charNameKey]) || '';
    editor.innerHTML = `
      <div class="le-editor-title"><span class="chip-dot" style="background:${eventColor(ev.defKey, ev.charIndex ?? ev.sub ?? 0)};display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:middle"></span> ${escapeHtml(ev.name)} — 版本 ${escapeHtml(v.label)}</div>
      <div class="field">
        <label>事件日期</label>
        <input type="date" id="le-date" value="${fmtDate(ev.date)}" ${isHidden ? 'disabled' : ''}>
      </div>
      ${isChar ? `
      <div class="field">
        <label>角色名（本版本该角色通用）</label>
        <input type="text" id="le-char-name" placeholder="如：奥黛塔、芙宁娜（填写后卡池/预告/PV 同步显示）" value="${escapeHtml(currentCharName)}" ${isHidden ? 'disabled' : ''}>
        <div class="muted" style="font-size:11px;margin-top:4px">✨ 只需填写一次，该版本此角色的「卡池·预告·PV」三列都会显示</div>
      </div>` : `
      <div class="field">
        <label>自定义标题 / 备注</label>
        <input type="text" id="le-title" placeholder="留空则显示默认名称" value="${escapeHtml(currentTitle)}" ${isHidden ? 'disabled' : ''}>
      </div>`}
      </div>
      <label class="le-hide-check">
        <input type="checkbox" id="le-hide" ${isHidden ? 'checked' : ''} />
        <span>此版本无该事件（隐藏此单元格）</span>
      </label>
      <div class="modal-actions">
        <button onclick="closeListCellEditor()">取消</button>
        <button class="primary" onclick="saveListEvEdit('${gameId}', ${tenths}, '${hk}')">保存</button>
      </div>`;
  }

  // 定位到单元格旁边
  const rect = cellEl.getBoundingClientRect();
  editor.style.position = 'fixed';
  editor.style.left = Math.min(rect.right, window.innerWidth - 320) + 'px';
  editor.style.top = rect.top + 'px';
  editor.style.zIndex = '200';

  document.body.appendChild(editor);

  // 点击外部关闭（用 mousedown 更可靠）
  _leCloseGuard = true;
  setTimeout(() => { _leCloseGuard = false; }, 150);
  if (!_leMousedownHandler) {
    _leMousedownHandler = function(e) {
      const el = document.querySelector('.le-inline-editor');
      if (el && !_leCloseGuard && !el.contains(e.target)) closeListCellEditor();
    };
  }
  document.addEventListener('mousedown', _leMousedownHandler, true);
}

function closeListCellEditor() {
  const el = document.querySelector('.le-inline-editor');
  if (el) el.remove();
  _leActiveCell = null;
  if (_leMousedownHandler) document.removeEventListener('mousedown', _leMousedownHandler, true);
}

/** 打开列表表头（大项/小项）改名编辑器 */
function openColRenameEditor(gameId, key, kind, thEl) {
  closeListCellEditor();
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;
  if (!game.colDisplayNames) game.colDisplayNames = {};
  const current = game.colDisplayNames[key] || '';
  const kindLabel = kind === 'group' ? '大项（分组标题）' : '小项（子列名）';
  const editor = document.createElement('div');
  editor.className = 'le-inline-editor';
  editor.innerHTML = `
    <div class="le-editor-title">✏️ 重命名${kindLabel}</div>
    <div class="muted" style="font-size:11px;margin-bottom:8px">留空则恢复默认名称</div>
    <div class="field">
      <label>显示名称</label>
      <input type="text" id="le-col-name" placeholder="默认名" value="${escapeHtml(current)}">
    </div>
    <div class="modal-actions">
      <button onclick="closeListCellEditor()">取消</button>
      <button class="primary" onclick="saveColRename('${gameId}', '${escapeAttr(key)}', '${kind}')">保存</button>
    </div>`;
  const rect = thEl.getBoundingClientRect();
  editor.style.position = 'fixed';
  editor.style.left = Math.min(rect.left, window.innerWidth - 320) + 'px';
  editor.style.top = Math.min(rect.bottom + 4, window.innerHeight - 160) + 'px';
  editor.style.zIndex = '200';
  document.body.appendChild(editor);
  setTimeout(() => { const inp = document.getElementById('le-col-name'); if (inp) inp.focus(); }, 30);
}

/** 保存列表表头改名 */
window.saveColRename = function(gameId, key, kind) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;
  if (!game.colDisplayNames) game.colDisplayNames = {};
  const val = document.getElementById('le-col-name').value.trim();
  if (val) game.colDisplayNames[key] = val;
  else delete game.colDisplayNames[key];
  closeListCellEditor();
  saveAndRender();
  toast(val ? '已重命名' : '已恢复默认名称');
};

/** 保存版本备注编辑 */
window.saveListVerEdit = function(gameId, tenths) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;
  if (!game.verNotes) game.verNotes = {};
  const noteVal = document.getElementById('le-note').value.trim();
  if (noteVal) game.verNotes[String(tenths)] = noteVal;
  else delete game.verNotes[String(tenths)];
  closeListCellEditor();
  saveAndRender();
  toast('已保存版本备注');
};

/** 保存更新日期修改（逐版本绝对日期覆盖） */
window.saveListUpdateDate = function(gameId, tenths) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;
  const newDateStr = document.getElementById('le-date').value;
  if (!newDateStr) { toast('请选择日期'); return; }
  // 直接存绝对日期覆盖
  if (!game.verUpdateDates) game.verUpdateDates = {};
  game.verUpdateDates[String(tenths)] = newDateStr;
  closeListCellEditor();
  saveAndRender();
  toast(`已将版本${verLabel(game, tenths)}更新日期改为${newDateStr}`);
};

/** 保存事件单元格编辑 */
window.saveListEvEdit = function(gameId, tenths, hk) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;
  const hideCb = document.getElementById('le-hide');
  const hideThis = hideCb ? hideCb.checked : false;
  const hideKey = tenths + '|' + hk;

  // 处理「此版本无该事件」隐藏标志
  if (!game.verHiddenEvents) game.verHiddenEvents = {};
  if (hideThis) {
    game.verHiddenEvents[hideKey] = true;
  } else {
    delete game.verHiddenEvents[hideKey];
  }

  // 如果隐藏了，不需要保存日期/标题
  if (hideThis) {
    closeListCellEditor();
    saveAndRender();
    toast('已隐藏该事件');
    return;
  }

  const dateStr = document.getElementById('le-date').value;
  // 角色事件：保存到 charNames（本版本该角色通用）；普通事件：保存到 eventTitles
  const charNameInput = document.getElementById('le-char-name');
  if (charNameInput) {
    // 角色事件
    const charNameVal = charNameInput.value.trim();
    if (!game.charNames) game.charNames = {};
    const v = genGameVersions(game).find(v => v.tenths === tenths);
    const ev = v ? v.events.find(e => e.historyKey === hk) : null;
    const ci = ev && ev.charIndex != null ? ev.charIndex : 0;
    const cnKey = String(tenths) + '|' + ci;
    if (charNameVal) game.charNames[cnKey] = charNameVal;
    else delete game.charNames[cnKey];
  } else {
    // 普通事件
    const titleVal = (document.getElementById('le-title') || {}).value?.trim() || '';
    if (!game.eventTitles) game.eventTitles = {};
    const tkey = evTitleKey(tenths, hk);
    if (titleVal) game.eventTitles[tkey] = titleVal;
    else delete game.eventTitles[tkey];
  }
  // 保存日期偏移（逐版本覆盖，存入 verEventOffsets）
  if (dateStr) {
    const v = genGameVersions(game).find(v => v.tenths === tenths);
    if (v) {
      const ev = v.events.find(e => e.historyKey === hk);
      if (ev) {
        const newDate = parseDate(dateStr);
        // 存储绝对偏移量（相对版本更新日期）
        // eventOffset() 返回值直接用于 addDays(updateDate, off)，所以必须存绝对偏移
        const absOff = diffDays(newDate, v.updateDate);
        // 查找事件定义的默认偏移量，用于判断是否改回了默认值
        let defOff = null;
        for (const def of activeEvents()) {
          const idx = def.offsets.findIndex((o, i) => {
            const k = def.key + (def.offsets.length > 1 ? '_' + i : '');
            return k === hk;
          });
          if (idx >= 0) { defOff = def.offsets[idx]; break; }
        }
        // 获取用户自定义的全局基准偏移（如有）
        const customBase = getDefaultOffset(game, hk);
        const effectiveDefault = (customBase !== null) ? customBase : defOff;
        if (absOff !== effectiveDefault) {
          if (!game.verEventOffsets) game.verEventOffsets = {};
          game.verEventOffsets[tenths + '|' + hk] = absOff;
        } else {
          // 改回了默认值，删除覆盖让系统用回默认计算
          if (game.verEventOffsets) delete game.verEventOffsets[tenths + '|' + hk];
        }
      }
    }
  }
  closeListCellEditor();
  saveAndRender();
  toast('已保存修改');
};

/** 保存新角色爆料编辑（目标版本的角色备注名） */
window.saveListTeaseEdit = function(gameId, targetTenths, charIndex, rowTenths) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;
  const teaseHk = 'char_tease_' + charIndex;
  // 隐藏 key 用当前行版本（per-row），不用目标版本
  const hideKey = String(rowTenths) + '|' + teaseHk;

  // 处理「此版本无该事件」隐藏标志
  const hideCb = document.getElementById('le-tease-hide');
  const hideThis = hideCb ? hideCb.checked : false;
  if (!game.verHiddenEvents) game.verHiddenEvents = {};
  if (hideThis) {
    game.verHiddenEvents[hideKey] = true;
  } else {
    delete game.verHiddenEvents[hideKey];
  }

  // 如果隐藏了，不需要保存日期/备注名
  if (hideThis) {
    closeListCellEditor();
    saveAndRender();
    toast('已隐藏该事件');
    return;
  }

  // 备注名
  const nameInput = document.getElementById('le-tease-name');
  const nameVal = nameInput ? nameInput.value.trim() : '';
  const cnKey = String(targetTenths) + '|' + charIndex;
  if (!game.charNames) game.charNames = {};
  if (nameVal) {
    game.charNames[cnKey] = nameVal;
  } else {
    delete game.charNames[cnKey];
  }
  // 爆料事件日期（存相对目标版本更新日的偏移，复用 verEventOffsets 机制）
  const dateInput = document.getElementById('le-tease-date');
  const dateStr = dateInput ? dateInput.value : '';
  if (dateStr) {
    const targetVer = genGameVersions(game).find(v => v.tenths === targetTenths);
    if (targetVer) {
      if (!game.verEventOffsets) game.verEventOffsets = {};
      const off = diffDays(parseDate(dateStr), targetVer.updateDate);
      game.verEventOffsets[String(targetTenths) + '|' + teaseHk] = off;
    }
  }
  closeListCellEditor();
  saveAndRender();
  toast(nameVal ? '已保存备注名与日期' : '已保存日期');
};

/* ----------------------------- 列设置面板（按游戏隐藏/显示事件列） ----------------------------- */

/** 打开某个游戏的列设置浮层 */
window.openColSettings = function(gameId, btnEl) {
  // 关闭已打开的
  if (_colSettingsEl) { _colSettingsEl.remove(); _colSettingsEl = null; }
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;

  const hidden = (game.hiddenEventKeys || []);
  const hiddenSet = new Set(hidden);

  const panel = document.createElement('div');
  panel.className = 'le-inline-editor col-settings-panel';
  panel.onclick = (e) => e.stopPropagation();

  let itemsHtml = '';
  allGameEventsForSettings(game).forEach(def => {
    def.offsets.forEach((off, idx) => {
      const subKey = def.key + '_' + (def.charIndex != null ? def.charIndex : idx);
      const subName = def.sub ? def.sub[idx] : '';
      const label = def.name + (subName ? ' · ' + subName : '');
      const isHidden = hiddenSet.has(subKey);
      const dotColor = eventColor(def.key, def.charIndex != null ? def.charIndex : idx);
      itemsHtml += `
        <label class="col-set-item">
          <input type="checkbox" data-subkey="${subKey}" ${isHidden ? '' : 'checked'} />
          <span class="chip-dot" style="background:${dotColor};display:inline-block;width:10px;height:10px;border-radius:50%;flex-shrink:0"></span>
          <span class="col-set-name">${escapeHtml(label)}</span>
        </label>`;
    });
  });

  panel.innerHTML = `
    <div class="le-editor-title">⚙️ 列设置 — ${escapeHtml(game.name)}</div>
    <div class="col-set-hint">勾选要显示的列，取消勾选可隐藏（隐藏后可随时在此恢复）</div>
    <div class="col-set-list">${itemsHtml}</div>
    <div class="modal-actions">
      <button onclick="closeColSettings()">取消</button>
      <button class="primary" onclick="saveColSettings('${gameId}')">确定</button>
    </div>`;

  // 定位到按钮旁边
  const rect = btnEl.getBoundingClientRect();
  panel.style.position = 'fixed';
  panel.style.left = Math.min(rect.right, window.innerWidth - 280) + 'px';
  panel.style.top = rect.bottom + 4 + 'px';
  panel.style.zIndex = '200';
  panel.style.width = '260px';

  document.body.appendChild(panel);
  _colSettingsEl = panel;

  // 用 mousedown 监听外部点击关闭（比 click 更可靠，不受按钮冒泡干扰）
  // 加 150ms 防抖，避免打开按钮的同一次 mousedown 立刻触发关闭
  _colSettingsCloseGuard = true;
  setTimeout(() => { _colSettingsCloseGuard = false; }, 150);
  if (!_colSettingsMousedownHandler) {
    _colSettingsMousedownHandler = function(e) {
      if (_colSettingsEl && !_colSettingsCloseGuard && !_colSettingsEl.contains(e.target)) {
        closeColSettings();
      }
    };
  }
  document.addEventListener('mousedown', _colSettingsMousedownHandler, true); // capture phase
};

// 列设置面板状态变量
var _colSettingsEl = null;
var _colSettingsMousedownHandler = null;
var _colSettingsCloseGuard = false;

function closeColSettings() {
  if (_colSettingsEl) { _colSettingsEl.remove(); _colSettingsEl = null; }
  if (_colSettingsMousedownHandler) {
    document.removeEventListener('mousedown', _colSettingsMousedownHandler, true);
  }
}

/** 保存列设置 */
window.saveColSettings = function(gameId) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;
  if (!game.hiddenEventKeys) game.hiddenEventKeys = [];
  const hidden = [];

  document.querySelectorAll('.col-settings-panel input[data-subkey]').forEach(cb => {
    const subKey = cb.dataset.subkey;
    if (!cb.checked) hidden.push(subKey);
  });

  game.hiddenEventKeys = hidden;
  closeColSettings();
  saveAndRender();
  toast('已更新列设置');
};

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
      `${gameIconHTML(it.game, 'chip-ico')}<span class="chip-dot" style="background:${eventColor(it.ev.defKey, it.ev.charIndex ?? it.ev.sub)}"></span>` +
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
      <span class="ev-name"><span class="chip-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${eventColor(ev.defKey, ev.charIndex ?? ev.sub)}"></span> ${escapeHtml(ev.name)}</span>
      <input type="text" class="m-title" data-tkey="${tkey}" placeholder="自定义名称" value="${escapeAttr(custom)}" style="max-width:120px">
      <input type="date" data-hk="${ev.historyKey}" data-defkey="${ev.defKey}" data-sub="${ev.sub}" value="${fmtDate(ev.date)}">
      <span class="ev-offset">+${off}天</span>
    </div>`;
  });
  html += `</div>`;
  body.innerHTML = html;

  document.getElementById('m-dur-reset').onclick = () => { delete game.versionDurations[String(tenths)]; if (game.verUpdateDates) delete game.verUpdateDates[String(tenths)]; saveAndRender(); openVersionModal(gameId, tenths, focusHk); };
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

/* ----------------------------- 游戏统一设置面板（替代：编辑游戏+版本弹窗+✏️修改+⚙️列） ----------------------------- */
/**
 * 四个 Tab：
 *   📋 基本信息 — 名称/周期/图标/锚点（原 openGameModal 基础Tab）
 *   📅 版本日程表 — 所有版本的可编辑表格（原 版本弹窗+✏️修改+⚙️列 三合一）
 *   ⚙️ 默认偏移与规则 — 全局偏移/进位规则（原 openGameModal 高级Tab）
 *   🗑️ 危险操作 — 删除游戏
 */
let _gpGameId = null; // 当前打开的面板对应的 gameId
let _gpCurTab = 'gp-basic';

function openGamePanel(gameId, focusTenths) {
  _gpGameId = gameId || null;
  const game = gameId ? state.games.find(g => g.id === gameId) : null;
  document.getElementById('modal-title').textContent = game ? `${game.name} — 设置` : '添加游戏';
  const body = document.getElementById('modal-body');
  const ic = game ? (game.icon || { type: 'letter', value: game.name[0], color: game.color }) : { type: 'letter', value: '', color: '#22c55e' };

  /* ---- 色板 ---- */
  let swatches = '';
  PALETTE.forEach(c => { swatches += `<button type="button" class="swatch" data-c="${c}" style="background:${c}"></button>`; });

  body.innerHTML = `
    <div class="modal-tabs">
      <button type="button" class="mtab active" data-tab="gp-basic">📋 基本信息</button>
      <button type="button" class="mtab ${!game ? 'muted-tab' : ''}" data-tab="gp-rules" ${!game ? 'disabled' : ''}>⚙️ 偏移与规则</button>
      <button type="button" class="mtab ${!game ? 'muted-tab' : ''}" data-tab="gp-danger" ${!game ? 'disabled' : ''}>🗑️ 危险操作</button>
    </div>

    <!-- Tab 1: 基本信息 -->
    <div id="tab-gp-basic">
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
            <option value="image"${ic.type === 'image' ? ' selected' : ''}>上传图片 / URL</option>
          </select>
        </div>
        <div class="row" style="margin-top:8px" id="g-ic-text-wrap">
          <input type="text" id="g-ic-val" value="${ic.type === 'emoji' || ic.type === 'letter' ? escapeAttr(ic.value || '') : ''}" placeholder="文字或 emoji">
        </div>
        <div class="row" style="margin-top:8px" id="g-ic-img-wrap">
          <input type="text" id="g-ic-img-url" value="${ic.type === 'image' ? escapeAttr(ic.value || '') : ''}" placeholder="粘贴图片 URL，或选文件">
          <input type="file" id="g-ic-file" accept="image/*">
        </div>
        <div class="icon-gallery hidden" id="g-ic-gallery" style="margin-top:8px"></div>
        <input type="hidden" id="g-ic-filepath" value="${ic.type === 'file' ? escapeAttr(ic.value || '') : ''}">
        <div class="muted" style="margin-top:4px">选「图库」可从统一图标库点选；用自己的图选「上传图片」。</div>
      </div>
      <div class="field"><label>版本基础周期（天）</label><input type="number" id="g-cycle" min="7" max="120" value="${game ? game.baseCycleDays : DEFAULT_CYCLE}"></div>
      <div class="field"><label>默认小版本号上限</label><input type="number" id="g-minormax" min="0" max="11" value="${game ? game.minorMax : 9}"></div>
      <div class="field"><label>每版角色数</label><input type="number" id="g-charcount" min="1" max="6" value="${game ? game.charCount : 2}"><span class="muted" style="margin-left:6px;font-size:11px">每个版本的角色卡池/预告/PV 组数（大部分游戏为 2）</span></div>
      <div class="field"><label>锚点版本号（如 5.0）</label><input type="text" id="g-anchorv" value="${game ? verLabel(game, game.anchorTenths) : '1.0'}"></div>
      <div class="field"><label>锚点版本更新日期</label><input type="date" id="g-anchord" value="${game ? game.anchorDate : fmtDate(todayNoon())}"></div>
    </div>

    <!-- Tab 2: 默认偏移与规则 -->
    <div id="tab-gp-rules" class="hidden">
      ${game ? buildGpRulesTab(game) : ''}
    </div>

    <!-- Tab 4: 危险操作 -->
    <div id="tab-gp-danger" class="hidden">
      ${game ? `<div class="field"><button class="danger" id="g-del" style="padding:10px 20px;font-size:14px">🗑 删除该游戏</button>
        <div class="muted" style="margin-top:8px">删除后不可恢复，该游戏的所有版本数据、自定义偏移、备注等将全部清除。</div></div>` : ''}
    </div>
  `;

  /* ---- Tab 切换 ---- */
  function switchTab(tab) {
    _gpCurTab = tab;
    body.querySelectorAll('.mtab').forEach(x => {
      const canSwitch = !x.disabled;
      x.classList.toggle('active', x.dataset.tab === tab && canSwitch);
      x.style.opacity = x.disabled ? '.4' : '1';
      x.style.pointerEvents = x.disabled ? 'none' : 'auto';
    });
    ['gp-basic','gp-rules','gp-danger'].forEach(t => {
      const el = document.getElementById('tab-' + t);
      if (el) el.classList.toggle('hidden', t !== tab);
    });
  }
  body.querySelectorAll('.mtab').forEach(t => {
    if (!t.disabled) t.onclick = () => switchTab(t.dataset.tab);
  });

  /* ---- 基本信息：图标预览同步（复用原逻辑）---- */
  setupIconSync(body, game, ic);

  /* ---- 保存按钮 ---- */
  document.getElementById('modal-save').onclick = () => saveGamePanel(game);
  const del = body.querySelector('#g-del');
  if (del) del.onclick = () => {
    if (!confirm('确定删除该游戏及其全部版本数据？')) return;
    state.games = state.games.filter(g => g.id !== gameId);
    delete visibleGames[gameId];
    saveAndRender(); hideModal(); toast('已删除');
  };

  switchTab(_gpCurTab);
  showModal();
}

function buildGpRulesTab(game) {
  const anchorDt = parseDate(game.anchorDate);
  let offHtml = '<div class="field"><label>事件默认日期 / 偏移（相对版本更新日）</label>' +
    '<div class="muted" style="margin-bottom:6px">选择参考日期 → 自动算偏移天数。有手动记录时按历史平均优先。</div>';
  activeEvents().forEach(def => {
    def.offsets.forEach((defOff, idx) => {
      const hk = def.key + (def.offsets.length > 1 ? '_' + idx : '');
      const base = (game.baseOffsets && typeof game.baseOffsets[hk] === 'number') ? game.baseOffsets[hk] : defOff;
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

  const bps = game.minorMaxBreakpoints || [];
  let bpHtml = '<div class="field"><label>版本号进位规则</label>' +
    '<div class="muted" style="margin-bottom:6px">添加例外：例如设「从 v5.8 起上限=8」，则 5.8 之后直接变为 6.0。</div><div id="bp-list">';
  bps.forEach((bp, i) => {
    bpHtml += `<div class="bp-row" data-i="${i}"><span class="muted" style="font-size:12px">从</span> ` +
      `<input type="text" class="bp-ver" value="${verLabel(game, bp.atTenths)}" placeholder="如 5.8" style="width:64px">` +
      `<span class="muted" style="font-size:12px">起 上限=</span>` +
      `<input type="number" class="bp-mm" min="0" max="11" value="${bp.minorMax}" style="width:48px">` +
      `<button type="button" class="ghost bp-del" data-i="${i}" style="font-size:11px;padding:1px 6px;color:#dc2626">✕</button></div>`;
  });
  bpHtml += '</div><button type="button" class="ghost" id="bp-add" style="font-size:12px">+ 添加进位规则</button></div>';

  return offHtml + bpHtml;
}

/** 图标预览同步逻辑（从原 openGameModal 提取） */
function setupIconSync(body, game, ic) {
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
      el.classList.add('sel'); syncPrev();
    });
    const addBtn = gallery.querySelector('#g-ic-gallery-add');
    if (addBtn) addBtn.onclick = () => { icType.value = 'image'; switchGpTab('gp-rules'); syncPrev(); };
  }

  function syncPrev() {
    const type = icType.value;
    const nameEl = body.querySelector('#g-name');
    const textWrap = document.getElementById('g-ic-text-wrap');
    const imgWrap = document.getElementById('g-ic-img-wrap');
    const gallery = document.getElementById('g-ic-gallery');
    if (type === 'image') { textWrap.classList.add('hidden'); if (imgWrap) imgWrap.classList.remove('hidden'); gallery.classList.add('hidden');
      const url = (document.getElementById('g-ic-img-url') || {}).value || ''; icPrev.innerHTML = url ? `<img src="${url}">` : ''; }
    else if (type === 'file') { textWrap.classList.add('hidden'); if (imgWrap) imgWrap.classList.add('hidden'); gallery.classList.remove('hidden'); loadIconGallery();
      const f = (document.getElementById('g-ic-filepath') || {}).value || ''; icPrev.innerHTML = f ? `<img src="${f}">` : ''; }
    else { textWrap.classList.remove('hidden'); if (imgWrap) imgWrap.classList.add('hidden'); gallery.classList.add('hidden');
      const valEl = document.getElementById('g-ic-val'); const val = valEl ? valEl.value : '';
      icPrev.textContent = val || (nameEl && nameEl.value ? nameEl.value[0] : '?'); }
    icPrev.style.background = colorInp.value;
  }

  icType.onchange = () => { if (icType.value === 'image') switchGpTab('gp-rules'); syncPrev(); };
  const valEl = document.getElementById('g-ic-val');
  if (valEl) valEl.oninput = syncPrev;
  icFile.onchange = () => { const f = icFile.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { const url = r.result; const t = document.getElementById('g-ic-img-url'); if (t) t.value = url; syncPrev(); }; r.readAsDataURL(f); };
  colorInp.oninput = () => { colorTxt.value = colorInp.value; syncPrev(); };
  colorTxt.oninput = () => { colorInp.value = colorTxt.value; syncPrev(); };
  body.querySelector('#g-name').oninput = syncPrev;
  body.querySelectorAll('.swatch').forEach(s => s.onclick = () => { colorInp.value = s.dataset.c; colorTxt.value = s.dataset.c; syncPrev(); });

  // 偏移日期选择器联动
  body.querySelectorAll('.off-date').forEach(inp => {
    inp.onchange = () => {
      const hk = inp.dataset.hk; const picked = parseDate(inp.value);
      const anch = parseDate(body.querySelector('#g-anchord').value);
      if (!anch.getTime()) { toast('请先填写锚点日期'); return; }
      const off = diffDays(picked, anch);
      const hidden = body.querySelector('.off-inp[data-hk="' + hk + '"]');
      if (hidden) hidden.value = off;
      const calc = body.querySelector('.off-calc[data-hk="' + hk + '"]');
      if (calc) calc.textContent = off;
    };
  });
  body.querySelector('#g-anchord').onchange = () => {
    const anch = parseDate(body.querySelector('#g-anchord').value); if (!anch.getTime()) return;
    body.querySelectorAll('.off-date').forEach(inp => {
      const hidden = body.querySelector('.off-inp[data-hk="' + inp.dataset.hk + '"]');
      const baseOff = hidden ? Number(hidden.value) : 0; inp.value = fmtDate(addDays(anch, baseOff));
    });
  };
  body.querySelectorAll('.off-reset').forEach(b => b.onclick = () => {
    const hk = b.dataset.hk; const game = _gpGameId ? state.games.find(g => g.id === _gpGameId) : null;
    if (game && game.eventHistory) delete game.eventHistory[hk];
    saveAndRender(); openGamePanel(_gpGameId); toast('已重置学习记录');
  });

  // 进位规则增删
  body.querySelector('#bp-add').onclick = () => {
    const list = body.querySelector('#bp-list'); const row = document.createElement('div');
    row.className = 'bp-row'; row.innerHTML = `<span class="muted" style="font-size:12px">从</span> ` +
      `<input type="text" class="bp-ver" placeholder="如 5.8" style="width:64px">` +
      `<span class="muted" style="font-size:12px">起 上限=</span>` +
      `<input type="number" class="bp-mm" min="0" max="11" value="8" style="width:48px">` +
      `<button type="button" class="ghost bp-del" style="font-size:11px;padding:1px 6px;color:#dc2626">✕</button>`;
    list.appendChild(row); row.querySelector('.bp-del').onclick = () => row.remove();
  };
  body.querySelectorAll('.bp-del').forEach(b => b.onclick = () => b.parentElement.remove());

  if (ic && ic.type === 'image') switchGpTab('gp-rules');
  syncPrev();
}

function switchGpTab(tab) {
  _gpCurTab = tab;
  const body = document.getElementById('modal-body');
  body.querySelectorAll('.mtab').forEach(x => {
    const canSwitch = !x.disabled;
    x.classList.toggle('active', x.dataset.tab === tab && canSwitch);
  });
  ['gp-basic','gp-rules','gp-danger'].forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.toggle('hidden', t !== tab);
  });
}

/** 保存游戏面板的所有修改 */
function saveGamePanel(game) {
  const body = document.getElementById('modal-body');

  // --- 基本信息 ---
  const name = body.querySelector('#g-name').value.trim();
  if (!name) { toast('请填写昵称'); switchGpTab('gp-basic'); return; }
  const colorInp = body.querySelector('#g-color');
  const icType = body.querySelector('#g-ic-type');
  let ival;
  if (icType.value === 'image') {
    ival = (document.getElementById('g-ic-img-url') || {}).value || '';
    if (!ival) { toast('请在「偏移与规则」中上传或填 URL'); switchGpTab('gp-rules'); return; }
  } else if (icType.value === 'file') {
    ival = (document.getElementById('g-ic-filepath') || {}).value || '';
    if (!ival) { toast('请在图库里点选一个图标'); switchGpTab('gp-basic'); return; }
  } else { ival = (document.getElementById('g-ic-val') || {}).value || ''; if (!ival) ival = name[0]; }
  const cycle = Math.max(7, Math.min(120, Number(body.querySelector('#g-cycle').value) || DEFAULT_CYCLE));
  const minorMax = Math.max(0, Math.min(11, Number(body.querySelector('#g-minormax').value) || 9));
  const charCount = Math.max(1, Math.min(6, Number(body.querySelector('#g-charcount').value) || 2));
  const anchorTenths = Math.round(parseFloat(body.querySelector('#g-anchorv').value || '1.0') * 10);
  const anchorDate = body.querySelector('#g-anchord').value;
  const baseOffsets = {};
  body.querySelectorAll('.off-inp').forEach(inp => { baseOffsets[inp.dataset.hk] = Number(inp.value) || 0; });

  // 进位规则
  const minorMaxBreakpoints = [];
  body.querySelectorAll('.bp-row').forEach(row => {
    const verStr = row.querySelector('.bp-ver').value.trim();
    const mm = Number(row.querySelector('.bp-mm').value);
    if (verStr && !isNaN(mm)) {
      const parts = verStr.split('.');
      const atMaj = parseInt(parts[0]) || 0; const atMin = parseInt(parts[1]) || 0;
      const aMaj = Math.floor(game ? game.anchorTenths / 10 : (atMaj * 10));
      const aMin = game ? (game.anchorTenths % 10) : 0;
      const eff = atMin - aMin + (atMaj - aMaj) * (game ? (game.minorMax || 9) + 1 : 10);
      minorMaxBreakpoints.push({ atTenths: game ? (game.anchorTenths + eff) : (atMaj * 10 + atMin), minorMax: mm });
    }
  });

  if (game) {
    game.name = name; game.fullName = body.querySelector('#g-full').value.trim();
    game.color = colorInp.value; game.icon = { type: icType.value, value: ival, color: colorInp.value };
    game.baseCycleDays = cycle; game.minorMax = minorMax; game.charCount = charCount;
    game.anchorTenths = anchorTenths; game.anchorDate = anchorDate;
    game.baseOffsets = baseOffsets; game.minorMaxBreakpoints = minorMaxBreakpoints;
  } else {
    const ng = {
      id: 'g_' + Math.random().toString(36).slice(2, 9), name,
      fullName: body.querySelector('#g-full').value.trim(), color: colorInp.value,
      icon: { type: icType.value, value: ival, color: colorInp.value },
      baseCycleDays: cycle, minorMax, charCount, anchorTenths, anchorDate,
      eventHistory: {}, baseOffsets, eventTitles: {}, versionDurations: {},
      verNotes: {}, verEventOffsets: {}, verUpdateDates: {}, hiddenEventKeys: [], verHiddenEvents: {},
      minorMaxBreakpoints
    };
    state.games.push(ng); visibleGames[ng.id] = true; state.visibleGames = visibleGames;
    _gpGameId = ng.id; game = ng;
  }

  // --- 版本日程表数据 ---
  saveGpVersionData(game);

  saveAndRender(); hideModal(); toast('已保存');
}

/** 从版本日程表 DOM 收集所有修改并写入 game 对象 */
function saveGpVersionData(game) {
  // 更新日期
  document.querySelectorAll('.gp-inp-date[data-field="updateDate"]').forEach(inp => {
    const tenths = Number(inp.dataset.tenths);
    const val = inp.value;
    if (val) {
      if (!game.verUpdateDates) game.verUpdateDates = {};
      game.verUpdateDates[String(tenths)] = val;
    }
  });

  // 事件日期 + 标题
  document.querySelectorAll('.gp-ev-date').forEach(inp => {
    const tenths = Number(inp.dataset.tenths);
    const hk = inp.dataset.hk;
    const dateStr = inp.value;
    if (!dateStr) return;
    const v = genGameVersions(game).find(v => v.tenths === tenths);
    if (!v) return;
    const newDate = parseDate(dateStr);
    const absOff = diffDays(newDate, v.updateDate);
    let defOff = null;
    for (const def of activeEvents()) {
      const idx = def.offsets.findIndex((o, i) => { const k = def.key + (def.offsets.length > 1 ? '_' + i : ''); return k === hk; });
      if (idx >= 0) { defOff = def.offsets[idx]; break; }
    }
    const customBase = getDefaultOffset(game, hk);
    const effectiveDefault = (customBase !== null) ? customBase : defOff;
    if (absOff !== effectiveDefault) {
      if (!game.verEventOffsets) game.verEventOffsets = {};
      game.verEventOffsets[tenths + '|' + hk] = absOff;
    } else { if (game.verEventOffsets) delete game.verEventOffsets[tenths + '|' + hk]; }
  });

  // 事件标题
  document.querySelectorAll('.gp-inp-title').forEach(inp => {
    const tenths = Number(inp.dataset.tenths);
    const hk = inp.dataset.hk;
    const val = inp.value.trim();
    if (!game.eventTitles) game.eventTitles = {};
    const tkey = evTitleKey(tenths, hk);
    if (val) game.eventTitles[tkey] = val; else delete game.eventTitles[tkey];
  });

  // 版本备注
  document.querySelectorAll('.gp-inp-note').forEach(inp => {
    const tenths = Number(inp.dataset.tenths);
    const val = inp.value.trim();
    if (!game.verNotes) game.verNotes = {};
    if (val) game.verNotes[String(tenths)] = val; else delete game.verNotes[String(tenths)];
  });

  // 隐藏/恢复事件
  document.querySelectorAll('.gp-hide-ev').forEach(cb => {
    const tenths = Number(cb.dataset.tenths);
    const hk = cb.dataset.hk;
    const hideKey = tenths + '|' + hk;
    if (!game.verHiddenEvents) game.verHiddenEvents = {};
    if (cb.checked) game.verHiddenEvents[hideKey] = true; else delete game.verHiddenEvents[hideKey];
  });

  // 恢复默认（↺ 按钮）— 在 onclick 中直接处理，不在此处
}

/* openGameModal → 兼容入口，统一调用 openGamePanel */
let editingGameId = null;
function openGameModal(gameId) { editingGameId = gameId || null; openGamePanel(gameId); }


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
      state.listEditMode = false; // 导入后默认关闭编辑模式
      visibleGames = state.visibleGames;
      saveAndRender(); toast('导入成功');
    } catch (e) { toast('导入失败：' + e.message); }
  };
  r.readAsText(file);
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s); }
function saveAndRender() { Storage.save(state); render(); }
function saveLocalOnly() { Storage.saveLocal(state); render(); }

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
  // 过滤已废弃的旧 key（与 activeEvents 渲染源头一致），但保留原始索引用于操作
  const rawEvts = state.customEvents || [];
  let evRows = '';
  rawEvts.forEach((ev, i) => {
    // 跳过已废弃的旧 key（与 activeEvents 渲染源头一致）
    if (ev.key === 'char_pv' || ev.key === 'char_preview' || ev.key === 'banner' || ev.key === 'char_tease') return;
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

  // 角色事件分组（角色一/角色二/…，组内卡池/预告/PV 可排序）
  const charCount = (state.games && state.games[0] && state.games[0].charCount) || 2;
  const CHARS = ['一', '二', '三', '四', '五', '六'];
  let charGroupHtml = '';
  if (charCount > 0) {
    const gOrder = (state.charGroupOrder || []).filter(i => i >= 0 && i < charCount);
    for (let i = 0; i < charCount; i++) if (!gOrder.includes(i)) gOrder.push(i);
    const sOrder = (state.charSubOrder && state.charSubOrder.length) ? state.charSubOrder : ['char_banner', 'char_preview', 'char_pv'];
    const SUB_LABEL = { char_banner: '卡池', char_preview: '预告', char_pv: 'PV' };
    const SUB_OFF = { char_banner: 0, char_preview: -2, char_pv: -3 };
    gOrder.forEach(ci => {
      const label = CHARS[ci] || String(ci + 1);
      let subRows = '';
      sOrder.forEach(key => {
        if (key !== 'char_banner' && key !== 'char_preview' && key !== 'char_pv') return;
        const color = eventColor(key, ci);
        const off = SUB_OFF[key];
        const offTxt = off === 0 ? '与卡池同天' : (off < 0 ? '提前 ' + (-off) + ' 天' : '延后 ' + off + ' 天');
        subRows += `<div class="set-ev-sub" draggable="true" data-ci="${ci}" data-key="${key}">
          <span class="set-ev-grab">⠿</span>
          <span class="set-ev-dot" style="background:${color}"></span>
          <span class="set-ev-sub-name">${SUB_LABEL[key]}</span>
          <span class="muted set-ev-sub-off">偏移 ${offTxt}</span>
        </div>`;
      });
      const headColor = eventColor('char_banner', ci);
      charGroupHtml += `<div class="set-ev-group" data-ci="${ci}">
        <div class="set-ev-group-header" draggable="true" data-ci="${ci}">
          <span class="set-ev-grab">⠿</span>
          <span class="set-ev-collapse" data-ci="${ci}" title="展开/收起">▾</span>
          <span class="set-ev-dot" style="background:${headColor}"></span>
          <span class="set-ev-group-title">角色${label}</span>
          <span class="muted">卡池 / 预告 / PV（可组内排序）</span>
        </div>
        <div class="set-ev-group-body" data-ci="${ci}">${subRows}</div>
      </div>`;
    });
  }

  // 新角色爆料分组（独立成块；数量=每版角色数；绑定到当前版本+偏移的目标版本角色备注名）
  let teaseHtml = '';
  if (charCount > 0) {
    const tOrder = (state.charGroupOrder || []).filter(i => i >= 0 && i < charCount);
    for (let i = 0; i < charCount; i++) if (!tOrder.includes(i)) tOrder.push(i);
    let tSubRows = '';
    tOrder.forEach(ci => {
      const label = CHARS[ci] || String(ci + 1);
      const color = eventColor('char_tease', ci);
      tSubRows += `<div class="set-ev-sub set-ev-tease-sub" draggable="true" data-ci="${ci}">
        <span class="set-ev-grab">⠿</span>
        <span class="set-ev-dot" style="background:${color}"></span>
        <span class="set-ev-sub-name">角色${label}爆料</span>
        <span class="muted set-ev-sub-off">显示目标版本「角色${label}」的备注名</span>
      </div>`;
    });
    const tHeadColor = eventColor('char_tease', 0);
    const offOpts = [0, 1, 2, 3, 4, 5].map(o => {
      const txt = o === 0 ? '当前版本' : ('下 ' + o + ' 个版本');
      return `<option value="${o}" ${state.teaseVersionOffset === o ? 'selected' : ''}>${txt}</option>`;
    }).join('');
    teaseHtml = `<div class="set-ev-group" data-tease="1">
      <div class="set-ev-group-header" data-tease="1" style="cursor:default">
        <span class="set-ev-dot" style="background:${tHeadColor}"></span>
        <span class="set-ev-group-title">新角色爆料</span>
        <label class="muted" style="margin-left:8px">绑定：<select id="s-tease-off" onmousedown="event.stopPropagation()" style="font-size:11px;padding:1px 4px">${offOpts}</select></label>
      </div>
      <div class="set-ev-group-body" data-tease="1">${tSubRows}</div>
    </div>`;
  }

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
      <hr class="set-sep">
      <div class="field"><label>🧹 清除缓存并刷新（解决页面显示旧版本/修复不生效）</label>
        <div class="muted" style="margin-bottom:8px">当修改已上线但页面仍显示旧效果时（多为浏览器缓存了旧的 JS/CSS 文件），点此按钮强制重新加载最新文件。<b>只清除浏览器对资源的缓存，不影响</b>你存在 localStorage / 云端 / 本机文件里的任何游戏数据。</div>
        <button type="button" class="primary" id="s-clear-cache">🧹 清除缓存并刷新</button>
      </div>
    </div>
      <div id="tab-s-events" class="hidden">
        <div class="field"><label>① 通用事件类型（可增删、隐藏/显示、改名称和偏移天数，可拖拽排序）</label>
          <div class="muted" style="margin-bottom:8px">隐藏后该事件不会在时间轴/月历/列表中显示。偏移天数为相对「版本更新日」的天数，多个值用逗号分隔。修改后所有游戏立即生效。</div>
          <div id="set-ev-list">${evRows}</div>
          <button type="button" class="ghost" id="set-ev-add" style="margin-top:8px">＋ 添加新事件</button>
        </div>
        <div class="field"><label>② 角色事件（按「每版角色数」自动生成；角色之间可拖拽排序，组内卡池/预告/PV 仅可在本角色内排序）</label>
          <div class="muted" style="margin-bottom:8px">这部分无需手动添加。拖动「角色一/角色二…」标题可调整角色先后；展开后拖动「卡池/预告/PV」可调整该角色内三项的先后顺序，且不会影响其他角色。</div>
          <div id="set-char-groups">${charGroupHtml}</div>
        </div>
        <div class="field"><label>③ 新角色爆料（独立分组；数量=每版角色数，绑定未来版本的角色备注名）</label>
          <div class="muted" style="margin-bottom:8px">「新角色爆料」从角色分组里独立成一块，按角色拆成多个子类（角色一爆料/角色二爆料…）。它们绑定的是「当前版本 + 偏移」那个<b>未来版本</b>的角色备注名（角色爆料通常提前放出），所以填了未来版本的角色备注名后这里会自动显示。在上方分组标题旁可设置绑定的版本偏移（默认下 1 个版本）。拖拽子类可调整爆料列的先后顺序（与角色分组顺序一致）。想要 1 个或更多子类，改上方「每版角色数」即可。</div>
          <div id="set-tease-group">${teaseHtml}</div>
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
  if (zoomInp) { zoomInp.oninput = () => { state.dayW = Number(zoomInp.value) || 4; zoomV.textContent = state.dayW + 'px'; saveLocalOnly(); }; }
  const labelsCb = body.querySelector('#s-labels');
  if (labelsCb) { labelsCb.onchange = () => { state.showLabels = labelsCb.checked; saveLocalOnly(); }; }

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

  /* ---- 缓存清理（只破资源缓存，不动数据）---- */
  const clearCacheBtn = body.querySelector('#s-clear-cache');
  if (clearCacheBtn) clearCacheBtn.onclick = () => {
    // 用时间戳参数强制浏览器重新拉取 index.html + 所有版本化资源（app.js?v= / styles.css?v=）
    // 不触碰 localStorage / Supabase / 本机文件，游戏数据完全保留
    const sep = location.search.indexOf('?') >= 0 ? '&' : '?';
    location.href = location.pathname + sep + '_cache=' + Date.now();
  };
  document.getElementById('modal-save').onclick = () => {
    // 基础
    state.leadDays = Math.max(1, Math.min(30, Number(body.querySelector('#s-lead').value) || LEAD_DEFAULT));
    state.listCount = Math.max(1, Math.min(30, Number(body.querySelector('#s-list').value) || 8));
    state.listPast = Math.max(0, Math.min(30, Number(body.querySelector('#s-listpast').value) || 0));
    const back = Math.max(0, Number(body.querySelector('#s-back').value) || 60);
    const fwd = Math.max(30, Number(body.querySelector('#s-fwd').value) || 400);
    state.viewStart = fmtDate(addDays(todayNoon(), -back));
    state.viewEnd = fmtDate(addDays(todayNoon(), fwd));
    // 新角色爆料绑定的版本偏移
    const offEl = body.querySelector('#s-tease-off');
    if (offEl) state.teaseVersionOffset = Math.max(0, Math.min(5, Number(offEl.value) || 0));
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

  // 角色组标题拖拽排序（角色一/角色二/… 之间）
  body.querySelectorAll('.set-ev-group-header').forEach(hdr => {
    hdr.addEventListener('dragstart', (e) => {
      hdr.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'chargroup|' + hdr.dataset.ci);
    });
    hdr.addEventListener('dragend', () => {
      hdr.classList.remove('dragging');
      body.querySelectorAll('.set-ev-group-header').forEach(h => h.classList.remove('drag-over'));
    });
    hdr.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; hdr.classList.add('drag-over'); });
    hdr.addEventListener('dragleave', () => hdr.classList.remove('drag-over'));
    hdr.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      hdr.classList.remove('drag-over');
      const data = e.dataTransfer.getData('text/plain');
      if (data.indexOf('chargroup|') !== 0) return; // 只允许角色组之间互拖
      reorderCharGroups(Number(data.split('|')[1]), Number(hdr.dataset.ci));
    });
  });
  // 角色内子项拖拽排序（卡池/预告/PV，仅同组内）
  body.querySelectorAll('.set-ev-sub').forEach(sub => {
    sub.addEventListener('dragstart', (e) => {
      sub.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'charsub|' + sub.dataset.ci + '|' + sub.dataset.key);
    });
    sub.addEventListener('dragend', () => {
      sub.classList.remove('dragging');
      body.querySelectorAll('.set-ev-sub').forEach(s => s.classList.remove('drag-over'));
    });
    sub.addEventListener('dragover', (e) => {
      const data = e.dataTransfer.getData('text/plain');
      if (data.indexOf('charsub|') === 0 && data.split('|')[1] === sub.dataset.ci) {
        e.preventDefault(); e.dataTransfer.dropEffect = 'move'; sub.classList.add('drag-over');
      }
    });
    sub.addEventListener('dragleave', () => sub.classList.remove('drag-over'));
    sub.addEventListener('drop', (e) => {
      const data = e.dataTransfer.getData('text/plain');
      sub.classList.remove('drag-over');
      if (data.indexOf('charsub|') !== 0) return;
      const parts = data.split('|');
      if (parts[1] !== sub.dataset.ci) return; // 不允许跨角色组拖拽
      e.preventDefault(); e.stopPropagation();
      reorderCharSubs(parts[2], sub.dataset.key);
    });
  });
  // 新角色爆料子项拖拽排序（与角色分组顺序一致，复用 reorderCharGroups）
  body.querySelectorAll('.set-ev-tease-sub').forEach(sub => {
    sub.addEventListener('dragstart', (e) => {
      sub.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'teasesub|' + sub.dataset.ci);
    });
    sub.addEventListener('dragend', () => {
      sub.classList.remove('dragging');
      body.querySelectorAll('.set-ev-tease-sub').forEach(s => s.classList.remove('drag-over'));
    });
    sub.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; sub.classList.add('drag-over'); });
    sub.addEventListener('dragleave', () => sub.classList.remove('drag-over'));
    sub.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      sub.classList.remove('drag-over');
      const data = e.dataTransfer.getData('text/plain');
      if (data.indexOf('teasesub|') !== 0) return;
      const fromCi = Number(data.split('|')[1]);
      const toCi = Number(sub.dataset.ci);
      if (fromCi === toCi) return;
      reorderCharGroups(fromCi, toCi); // 复用：爆料子项顺序=角色顺序
    });
  });
  // 角色组展开/收起
  body.querySelectorAll('.set-ev-collapse').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const ci = btn.dataset.ci;
      const gbody = document.querySelector('.set-ev-group-body[data-ci="' + ci + '"]');
      if (!gbody) return;
      const hidden = gbody.classList.toggle('hidden');
      btn.textContent = hidden ? '▸' : '▾';
    };
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
