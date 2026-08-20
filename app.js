/* =========================================================================
 * 游戏版本周期日程表  —  Game Version Schedule
 * 纯前端单页应用。数据存 localStorage，预留云端同步接口。
 * 版本: app.js (单一源文件，v20260817ad) — 部署时通过 index.html 的 ?v= 查询参数破坏缓存
 * ========================================================================= */
console.log('[GVS] ✅ 加载 app.js (v20260817ad) — 偏移改用最邻近确认值，不再平均');

'use strict';

/* ----------------------------- 事件类型定义 ----------------------------- */
/* 每个版本周期内派生的固定事件。offsets 为相对"版本更新日(第0天)"的默认偏移天数。
 * 卡池更新由「角色卡池」事件替代，故默认模板不再含 banner。
 * 这是默认模板；用户可在设置中增删隐藏，实际使用 state.customEvents。 */
/** 新角色爆料（teaser）默认偏移天数——相对版本更新日的偏移（版本末期预告），列表/时间轴/弹窗共用 */
const TEASE_OFF = 33;
const EVENT_DEFS_TEMPLATE = [
  { key: 'version_update',  name: '版本更新', offsets: [0] },
  // 新角色爆料不再作为静态顶层事件；改为按 game.charCount 动态生成（每个角色一个子类，见 generateCharEvents），直接显示对应角色的备注名
  // 角色预告/PV 不再作为独立顶层事件，改为按 game.charCount 动态生成（见 generateCharEvents）
  { key: 'version_preview', name: '版本前瞻', offsets: [35] },
];

/**
 * 根据角色数量动态生成角色相关事件定义。
 * 每个角色产生：角色卡池N / 预告N(-2天) / PVN(-3天)
 * 默认 charCount=2，第1个角色与卡池上半同天，第2个角色延后1天
 */
function generateCharEvents(charCount) {
  const n = Math.max(1, Math.min(6, charCount || 2)); // 限制 1~6 个角色
  const CHARS = ['一', '二', '三', '四', '五', '六'];
  // 基准偏移：角色1卡池=版本更新当天(0)，角色2卡池=版本更新+21天（下半卡池）
  const baseOffsets = [0, 21, 2, 3, 4, 5];
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
      // 统一格式：[类型]·角色X（卡池·角色二 / PV·角色二 / 预告·角色二）
      evts.push({
        key, name: sd.sub[0], offsets: [base + sd.off], sub: ['·角色' + label],
        charIndex: i, _isChar: true,
        // 卡池事件绑定到版本更新日期（固定偏移 = 角色基准偏移）
        ...(isBanner ? { _bindTo: { src: 'version_update', off: base } } : {})
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
  const staticEvts = base.filter(e => !e._isChar && !e._tease);
  const charCount = (game && game.charCount) || 2;
  return staticEvts.concat(generateCharEvents(charCount));
}

/* 事件类型配色 — 每个角色一个独立色系，同角色的爆料/卡池/预告/PV共用同一色系 */
const EVENT_COLORS = {
  version_update: '#16a34a',
  banner_0: '#2563eb', banner_1: '#38bdf8',
  char_tease: '#ea580c',
  char_preview: '#8b5cf6', char_pv: '#ec4899',
  version_preview: '#dc2626',
  // 角色一：玫红系（醒目暖色）
  char_banner_0:  '#e11d48',
  char_preview_0: '#fb7185',
  char_pv_0:      '#fda4af',
  // 角色二：靛蓝紫系（冷艳深邃）
  char_banner_1:  '#6366f1',
  char_preview_1: '#a5b4fc',
  char_pv_1:      '#c7d2fe',
  // 角色三：青绿系（清新明亮）
  char_banner_2:  '#0891b2',
  char_preview_2: '#22d3ee',
  char_pv_2:      '#67e8f9',
  // 角色四：翠绿系（自然活力）
  char_banner_3:  '#059669',
  char_preview_3: '#34d399',
  char_pv_3:      '#86efac',
  // 角色五：琥珀橙系（温暖亮眼）
  char_banner_4:  '#d97706',
  char_preview_4: '#fbbf24',
  char_pv_4:      '#fde68a',
  // 角色六：品红洋红系（华丽独特）
  char_banner_5:  '#c026d3',
  char_preview_5: '#e879f9',
  char_pv_5:      '#f5d0fe',
  // 爆料：独立的深橙色（不与任何角色共用，确保组头区分度）
  _tease_color:   '#ea580c',
};

/* —— 组头颜色池（鲜艳实色，按分组语义/位置分配，保证相邻分组色相差异明显）——
   版本前瞻=红、新角色爆料=橙；角色位从紫→蓝→青→金→琥珀→品红…依次拉开，避免与红/绿撞色 */
const GROUP_HEADER_COLORS = {
  version_preview: '#dc2626',                              // 版本前瞻 - 红
  version_update:  '#16a34a',                              // 版本更新 - 绿
  banner:          ['#0284c7', '#0891b2'],                // 卡池0/1 - 蓝 / 蓝绿
  tease:           '#ea580c',                              // 新角色爆料 - 橙
  char: ['#7c3aed', '#2563eb', '#0d9488', '#ca8a04', '#d97706', '#c026d3',
         '#0284c7', '#ef4444', '#15803d', '#0891b2', '#db2777', '#9333ea'],
};

/* —— 角色备注标签颜色池（淡底+深字，按角色身份分配，12色轮转复用）——
   身份名来自 game.charNames 去重值；超过12个身份时按序号 % 12 复用最早用过的颜色 */
const CHAR_TAG_COLORS = [
  { bg: '#fde7ec', fg: '#be123c' }, // 玫红
  { bg: '#e7e9fd', fg: '#3730a3' }, // 靛蓝
  { bg: '#d9f5f1', fg: '#0f766e' }, // 青绿
  { bg: '#e3f7e8', fg: '#15803d' }, // 翠绿
  { bg: '#fdecd8', fg: '#b45309' }, // 琥珀
  { bg: '#fbeafd', fg: '#86198f' }, // 品红
  { bg: '#e0f2fe', fg: '#075985' }, // 天蓝
  { bg: '#fde8e8', fg: '#b91c1c' }, // 番茄
  { bg: '#f1e9fd', fg: '#5b21b6' }, // 紫罗兰
  { bg: '#f3f9e0', fg: '#3f6212' }, // 橄榄
  { bg: '#ffedd5', fg: '#c2410c' }, // 粉橙
  { bg: '#d6f3f8', fg: '#0e7490' }, // 蓝绿
];

// 组头（分组）取鲜艳实色
function headerColorFor(origKey, type, charIndex) {
  if (type === 'tease') return GROUP_HEADER_COLORS.tease;
  if (type === 'char') return GROUP_HEADER_COLORS.char[(charIndex || 0) % GROUP_HEADER_COLORS.char.length];
  if (origKey === 'version_preview') return GROUP_HEADER_COLORS.version_preview;
  if (origKey === 'version_update') return GROUP_HEADER_COLORS.version_update;
  if (origKey === 'banner_0' || origKey === 'banner') return GROUP_HEADER_COLORS.banner[0];
  if (origKey === 'banner_1') return GROUP_HEADER_COLORS.banner[1];
  return '#64748b';
}

// 角色身份 → 颜色序号映射（同名共享同一序号；身份名 = game.charNames 全部去重值）
function buildIdentityColors(game) {
  const map = {}; let i = 0;
  if (game.charNames) {
    for (const k in game.charNames) {
      const n = game.charNames[k];
      if (n && !(n in map)) map[n] = i++;
    }
  }
  return map;
}

// 按角色名取标签配色；未匹配返回 null（调用方回退旧逻辑）
function tagColorFor(name, identityColors) {
  if (identityColors && name && identityColors[name] != null) {
    return CHAR_TAG_COLORS[identityColors[name] % CHAR_TAG_COLORS.length];
  }
  return null;
}

/* —— 标签尺寸等级（按重要程度）——
   默认优先级（5 级）：版本更新 > 版本前瞻 > 角色卡池 > 新角色爆料 > 角色预告/PV
   每个游戏可通过 game.tagSizeMap 独立调整（设置面板排序），不设置时回退到全局默认 state.tagSizeMap，再回退到本常量
   尺寸等级：0=xl(特大) 1=lg(大) 2=md(中) 3=sm(小) 4=xs(极小) */
const DEFAULT_TAG_SIZES = {
  version_update:  0,    // xl — 最重要
  version_preview: 1,    // lg
  char_banner:     2,    // md
  char_tease:      3,    // sm
  char_preview:    4,    // xs
  char_pv:         4,    // xs
  banner_0:        2,
  banner_1:        2,
};
const TAG_SIZE_CLASSES = ['tag-xl', 'tag-lg', 'tag-md', 'tag-sm', 'tag-xs'];
const TAG_SIZE_LABELS = ['特大', '大', '中', '小', '极小'];
// 设置面板里可排序的「事件类型 → 尺寸」条目（按类型统一，不区分角色索引）
const TAG_SIZE_DEFS = [
  { key: 'version_update', label: '版本更新',   def: 0 },
  { key: 'version_preview', label: '版本前瞻',   def: 1 },
  { key: 'char_banner',    label: '角色卡池',   def: 2 },
  { key: 'char_tease',     label: '新角色爆料', def: 3 },
  { key: 'char_preview',   label: '角色预告',   def: 4 },
  { key: 'char_pv',        label: '角色PV',     def: 4 },
];
// 当前正在设置「标签大小排序」的目标：'__default__' = 全局默认，否则为 game.id
let curTagSizeGame = '__default__';

/** 获取事件标签的尺寸 CSS 类名 */
function getTagSizeClass(defKey, charIndex, game) {
  // 优先用每游戏自定义配置，其次全局默认，最后常量默认
  const map = (game && game.tagSizeMap) || state.tagSizeMap || DEFAULT_TAG_SIZES;
  let key = defKey;
  // 角色类事件按类型统一取尺寸（不区分角色索引）
  if (key === 'char_banner' || key === 'char_preview' || key === 'char_pv' || key === 'char_tease') {
    key = defKey;
  }
  const level = (map && map[key]) != null ? map[key] : DEFAULT_TAG_SIZES[defKey] ?? 2;
  return TAG_SIZE_CLASSES[level] || 'tag-sm';
}
function eventColor(defKey, idx) {
  if (defKey === 'banner') return EVENT_COLORS['banner_' + idx];
  // 角色事件（卡池/预告/PV）：按角色索引取各自色系
  if (defKey === 'char_banner' || defKey === 'char_preview' || defKey === 'char_pv') {
    return EVENT_COLORS[defKey + '_' + (idx ?? 0)] || '#64748b';
  }
  // 爆料：使用独立橙色（不再映射到 char_banner，避免与角色一组头撞色）
  if (defKey === 'char_tease') {
    return EVENT_COLORS['_tease_color'] || '#ea580c';
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

// 倒计时颜色分级：根据剩余天数返回对应颜色（优先用设置里自定义的值，缺省回落默认）
function cdColor(cd) {
  const c = state.cdColors || {};
  const soon = state.cdSoonDays || 10;
  const mid = state.cdMidDays || 30;
  if (cd == null) return c.past || '#6b7280';
  if (cd < 0) return c.past || '#6b7280';
  if (cd === 0) return c.today || '#3b82f6';
  if (cd <= soon) return c.soon || '#22c55e';
  if (cd <= mid) return c.mid || '#eab308';
  return c.far || '#06b6d4';
}

// 倒计时调色板预设（16 色）
const CD_PALETTE = ['#ef4444', '#f97316', '#fb923c', '#eab308', '#facc15', '#a3e635', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e'];

// 外观设置页：倒计时颜色分级卡片
function renderAppearanceTab() {
  const c = state.cdColors || {};
  const soon = state.cdSoonDays || 10;
  const mid = state.cdMidDays || 30;
  const tiers = [
    { key: 'past', name: '已过去', desc: '倒计时为负（含更早版本）' },
    { key: 'today', name: '今天', desc: '倒计时恰好为 0 天' },
    { key: 'soon', name: '临近', desc: '1 天至', thr: soon, thrId: 's-cd-soon' },
    { key: 'mid', name: '中期', desc: '至', thr: mid, thrId: 's-cd-mid' },
    { key: 'far', name: '远期', desc: '超过 ' + mid + ' 天的未来事件' }
  ];
  let cards = '';
  tiers.forEach(t => {
    const col = (c[t.key] || '#6b7280').toUpperCase();
    let thrHtml = '';
    if (t.thrId) {
      thrHtml = `<span class="cd-thr"><input type="number" class="cd-thr-inp" id="${t.thrId}" min="1" max="365" value="${t.thr}" style="width:44px"> 天</span>`;
    }
    const palSw = CD_PALETTE.map(p => `<span class="cd-pal-sw${p.toUpperCase() === col ? ' sel' : ''}" data-col="${p}" style="background:${p}"></span>`).join('');
    cards += `<div class="cd-tier" data-tier="${t.key}">` +
      `<div class="cd-tier-main">` +
        `<span class="cd-tier-dot" style="background:${col}"></span>` +
        `<div class="cd-tier-info"><div class="cd-tier-name">${t.name}</div>` +
          `<div class="cd-tier-desc">${t.desc} ${thrHtml}</div></div>` +
        `<button type="button" class="cd-swatch" data-tier="${t.key}" data-color="${col}" style="background:${col}" title="点击展开调色板"></button>` +
      `</div>` +
      `<div class="cd-palette hidden" data-tier="${t.key}">` +
        `<div class="cd-pal-grid">${palSw}</div>` +
        `<div class="cd-pal-custom"><input type="color" class="cd-color-inp" value="${col}"><span>HEX</span>` +
          `<input type="text" class="cd-hex-inp" value="${col}" style="width:84px"></div>` +
      `</div>` +
    `</div>`;
  });
  return `<div class="field"><label>倒计时颜色分级</label>` +
    `<div class="muted" style="margin-bottom:8px">列表 / 时间轴 / 月历中的倒计时数字按剩余天数套用以下颜色。点色块可展开调色板（16 预设色 + 自定义），「临近 / 中期」的分界天数也可改。</div>` +
    `<div class="cd-tiers">${cards}</div></div>`;
}

// 外观：把某档颜色同步到色块/圆点/取色器/HEX/预设高亮
function setTierColor(body, tier, col, skipColorInp, skipHexInp) {
  col = col.toUpperCase();
  const wrap = body.querySelector('.cd-tier[data-tier="' + tier + '"]');
  if (!wrap) return;
  const sw = wrap.querySelector('.cd-swatch');
  const dot = wrap.querySelector('.cd-tier-dot');
  const ci = wrap.querySelector('.cd-color-inp');
  const hx = wrap.querySelector('.cd-hex-inp');
  if (sw) { sw.style.background = col; sw.dataset.color = col; }
  if (dot) dot.style.background = col;
  if (ci && !skipColorInp) ci.value = col;
  if (hx && !skipHexInp) hx.value = col;
  wrap.querySelectorAll('.cd-pal-sw').forEach(ps => ps.classList.toggle('sel', ps.dataset.col.toUpperCase() === col));
}

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
  _pushTimer: null,
  _pending: null,
  load() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); } catch (e) { console.warn('load fail', e); }
    return null;
  },
  _writeLocal(state) {
    try { state.updatedAt = Date.now(); localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { console.warn('save fail', e); }
    if (fileHandle) { try { persistToFile(); } catch (e) { console.warn('persist fail', e); } }
  },
  // 仅存本地 + 本机文件，不碰云端（浏览/显隐/缩放等基础操作）
  saveLocal(state) { this._writeLocal(state); },
  // 存本地并同步到云端（改了自定义数据时才调）
  save(state) {
    this._writeLocal(state);
    if (this.syncAdapter && typeof this.syncAdapter.push === 'function') {
      this._pending = state;
      clearTimeout(this._pushTimer);
      this._pushTimer = setTimeout(() => this._flushPush(), 1500);
    }
  },
  // 立即把待推送的数据发出去（缩短等待 / 退出页面前兜底）
  _flushPush() {
    if (this._pending && this.syncAdapter && typeof this.syncAdapter.push === 'function') {
      try { this.syncAdapter.push(this._pending); } catch (e) { console.warn('sync push fail', e); }
      this._pending = null;
    }
  },
  enableCloud(adapter) { this.syncAdapter = adapter; this.backend = 'cloud'; },
  disableCloud() { this.syncAdapter = null; this.backend = 'local'; }
};

/* 退出页面 / 切到后台前，把待推送的改动兜底发出，避免关页面丢数据 */
window.addEventListener('beforeunload', () => { try { Storage._flushPush(); } catch (e) {} });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { try { Storage._flushPush(); } catch (e) {} } });

/* ----------------------------- 云端同步（Supabase） ----------------------------- */
/* 启用方法：去 https://supabase.com 建免费项目 → SQL Editor 执行 buildSql() → 把下面两项填好。
   未填写/离线时自动降级为纯本地（localStorage + 本机文件），不影响现有功能。 */
const SUPABASE_URL = 'https://zvgeldnvmzwhjrjaimau.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ag80tkGzn9UIFhbNpqYMUg_ViZP0qfC';

let supabase = null;
let cloudUser = null;           // { id, email }

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
    if (remote && Array.isArray(remote.games)) {
      const remoteTs = remote.updatedAt || 0;
      const localTs = state.updatedAt || 0;
      if (remoteTs > localTs) { applyRemoteState(remote); toast('已从云端同步最新数据'); }
      else if (localTs > remoteTs) { Storage.save(state); toast('本地数据较新，已上传到云端'); }
      else { toast('云端与本地数据一致，无需同步'); }
    }
    else { Storage.save(state); toast('已把本地数据上传到云端'); }
  }).catch(e => { console.warn('cloud pull fail', e); toast('云端拉取失败：' + (e && e.message ? e.message : '未知错误')); });
}

function onCloudLogout() {
  cloudUser = null;
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
  if (typeof state.offsetOnlyConfirmed !== 'boolean') state.offsetOnlyConfirmed = false;
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

// 立即把本地 / 云端按「后写者胜」手动同步一次
async function syncNow() {
  if (!supabaseConfigured()) { alert('未配置 Supabase（app.js 顶部填好 URL 与 anon key），无法同步。'); return; }
  if (!supabaseLibReady()) { alert('Supabase 库尚未加载完成（可能网络问题），请稍后重试。'); return; }
  if (!cloudUser) { alert('请先在上方登录云端账号，再点「立即同步」。'); return; }
  toast('正在同步…');
  try {
    const remote = await supabaseAdapter().pull();
    if (remote && Array.isArray(remote.games)) {
      const remoteTs = remote.updatedAt || 0;
      const localTs = state.updatedAt || 0;
      if (remoteTs > localTs) { applyRemoteState(remote); toast('已从云端拉取最新数据'); }
      else { await supabaseAdapter().push(state); toast('已把本地数据上传到云端'); }
    } else {
      await supabaseAdapter().push(state); toast('已把本地数据上传到云端');
    }
  } catch (e) {
    console.warn('syncNow fail', e);
    toast('同步失败：' + (e && e.message ? e.message : '未知错误'));
  }
}

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
    visibleGames: vis, dayW: 4, listCount: 8, listPast: 2, showLabels: true, listEditMode: false,
    offsetOnlyConfirmed: false,
    // 倒计时颜色分级（五档）：已过去 / 今天 / 临近 / 中期 / 远期
    cdColors: { past: '#6b7280', today: '#3b82f6', soon: '#22c55e', mid: '#eab308', far: '#06b6d4' },
    cdSoonDays: 10, // 临近上限（含）
    cdMidDays: 30   // 中期上限（含）；超过则为远期
  };
}

function migrateGame(g) {
  if (typeof g.minorMax !== 'number') g.minorMax = 9;
  if (!g.minorMaxBreakpoints) g.minorMaxBreakpoints = [];
  if (!g.baseOffsets) g.baseOffsets = {};
  if (!g.eventTitles) g.eventTitles = {};
  delete g.eventHistory; // 清空历史学习（猜测）数据；偏移只来自你填的日期/全局基准/默认
  if (!g.versionDurations) g.versionDurations = {};
  if (!g.verNotes) g.verNotes = {};
  if (!g.verEventOffsets) g.verEventOffsets = {};
  if (!g.verUpdateDates) g.verUpdateDates = {};
  if (!g.hiddenEventKeys) g.hiddenEventKeys = [];
  if (!g.verHiddenEvents) g.verHiddenEvents = {};
  if (!g.charNames) g.charNames = {}; // key: "tenths|charIndex" → 角色名，如 "70|0": "奥黛塔"
  if (!g.colDisplayNames) g.colDisplayNames = {}; // 表头自定义名覆盖：key=groupId 或 colId → 显示名（独立于备注）
  if (typeof g.charCount !== 'number') g.charCount = 2;
  // 数据迁移：teaser offset 从旧 key（target 版本）搬到新 key（src 版本）
  migrateTeaserOffsetsToSrc(g);
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
/** 一次性数据迁移：把旧版 teaser 数据（按 target 版本存）搬到新版位置（按 src 版本存）
 *  旧：verEventOffsets['71|char_tease_X'] = -37（v7.1 updateDate + (-37) = 8月17）
 *  新：verEventOffsets['70|char_tease_X'] = +5（v7.0 updateDate + (+5) = 8月17）
 *  同一日期不同 offset，但渲染效果相同。
 */
function migrateTeaserOffsetsToSrc(game) {
  if (!game || !game.verEventOffsets) return;
  if (game._teaserMigrated) return; // 防止反复跑
  game._teaserMigrated = true;
  const tOff = game.teaseVersionOffset || 1;
  const sorted = listGameVersions(game).slice().sort((a, b) => a.tenths - b.tenths);
  sorted.forEach((v, idx) => {
    if (tOff <= 0) return;
    const target = sorted[idx + tOff];
    if (!target) return;
    ['char_tease_0', 'char_tease_1', 'char_tease_2', 'char_tease_3', 'char_tease_4', 'char_tease_5'].forEach(hk => {
      const oldKey = String(target.tenths) + '|' + hk;
      const newKey = String(v.tenths) + '|' + hk;
      if (game.verEventOffsets[oldKey] !== undefined && game.verEventOffsets[newKey] === undefined) {
        // 旧 offset 是相对 target.updateDate 的；新 offset 相对 src.updateDate
        // 转换：newOff = oldOff + (target.updateDate - src.updateDate)
        const oldOff = game.verEventOffsets[oldKey];
        const newOff = oldOff + diffDays(target.updateDate, v.updateDate);
        game.verEventOffsets[newKey] = newOff;
      }
    });
  });
}
function durationOf(game, seq) {
  const d = game.versionDurations[String(seq)];
  if (typeof d === 'number' && d >= 7) return d;
  // 无自定义时长时返回 baseCycleDays（后续 genGameVersions 会用日期间隔覆盖）
  return game.baseCycleDays;
}
function evTitleKey(seq, hk) { return seq + '|' + hk; }

/* 推荐偏移：优先取逐版本覆盖 → 有历史取平均 → 自定义基准 baseOffsets → 默认 */
function eventOffset(game, hk, defOff, tenths) {
  // 1. 逐版本逐事件覆盖（列表/版本弹窗里用户亲手填的日期）= 已确认数据
  if (tenths !== undefined && tenths !== null) {
    const veo = game && game.verEventOffsets && game.verEventOffsets[tenths + '|' + hk];
    if (typeof veo === 'number') return veo;
  }
  // 2. 全局自定义基准（用户在设置里配的）
  const bo = game && game.baseOffsets && game.baseOffsets[hk];
  if (typeof bo === 'number') return bo;
  // 3. 默认值（代码写死，如 爆料=33天）
  return defOff;
}
/** 判断某事件在某版本是否用了用户确认的日期（用于来源标记） */
function offsetIsConfirmed(game, hk, tenths) {
  return !!(game && game.verEventOffsets && typeof game.verEventOffsets[tenths + '|' + hk] === 'number');
}
/** 偏移来源标记（纯色小圆点，图例在控制栏） */
function offsetSrcDot(source) {
  if (!source || source === 'confirmed') {
    return `<span class="off-dot off-dot-confirmed" title="官方日期（你已确认填写）"></span>`;
  }
  if (source === 'inherited') {
    return `<span class="off-dot off-dot-inherited" title="计算所得（自动沿用你最近填过的日期）"></span>`;
  }
  if (source === 'base') {
    return `<span class="off-dot off-dot-base" title="按全局基准偏移量推算"></span>`;
  }
  if (source === 'bound') {
    return `<span class="off-dot off-dot-bound" title="绑定（自动跟随源事件日期）"></span>`;
  }
  return `<span class="off-dot off-dot-default" title="未设置（无参考数据，系统默认占位）"></span>`;
}
/** 偏移来源图例 HTML（放在列表视图控制栏） */
function offsetLegendHtml() {
  return `<span class="off-legend" id="off-legend">` +
    `<span class="off-dot off-dot-confirmed"></span><span class="muted" style="font-size:11px">✓ 官方日期（已确认）</span>` +
    `<span class="off-dot off-dot-bound"></span><span class="muted" style="font-size:11px">🔗 绑定（自动跟随源事件）</span>` +
    `<span class="off-dot off-dot-inherited"></span><span class="muted" style="font-size:11px">↻ 计算所得（自动沿用）</span>` +
    `<span class="off-dot off-dot-base"></span><span class="muted" style="font-size:11px">⚙ 基准推算</span>` +
    `<span class="off-dot off-dot-default"></span><span class="muted" style="font-size:11px">○ 未设置（无参考数据）</span>` +
    `</span>`;
}
/** 获取默认偏移量（不含逐版本覆盖，用于判断是否需要存储覆盖） */
function getDefaultOffset(game, hk) {
  const h = game && game.eventHistory && game.eventHistory[hk];
  if (h && h.length) return Math.round(h.reduce((a, b) => a + b, 0) / h.length);
  const bo = game && game.baseOffsets && game.baseOffsets[hk];
  return (typeof bo === 'number') ? bo : null; // null = 使用 defOff（由调用方传入）
}

function genGameVersions(game, optRangeStart, optRangeEnd) {
  // optRangeStart/optRangeEnd: 可选，列表视图等需要不受"视图起始/结束"限制时传入
  const vStart = optRangeStart ? parseDate(optRangeStart) : parseDate(state.viewStart);
  const vEnd = optRangeEnd ? parseDate(optRangeEnd) : parseDate(state.viewEnd);
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
          def, defKey: def.key, historyKey: hk, sub: def.offsets.length > 1 ? idx : null,
          charIndex: def.charIndex != null ? def.charIndex : null,
          _isChar: !!def._isChar, _tease: !!def._tease,
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
  resolveInherited(game, out);
  // 自动计算时长：没有自定义时长的版本，用与下一版本的日期间隔作为时长
  // 这样在列表里改了更新日期后，时长自动同步到时间轴/月历/弹窗
  // 最后一个版本（无下一版本）至少保持 baseCycleDays 完整显示
  const sorted = [...out].sort((a, b) => a.updateDate.getTime() - b.updateDate.getTime());
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i];
    if (game.versionDurations[String(v.tenths)] != null) continue; // 有自定义则跳过
    if (i < sorted.length - 1) {
      const gap = diffDays(sorted[i + 1].updateDate, v.updateDate);
      if (gap >= 7) v.duration = gap; // 至少7天才有效
    } else {
      // 最后一个版本：没有下一版本衔接，确保至少显示完整周期
      if (v.duration < game.baseCycleDays) v.duration = game.baseCycleDays;
    }
  }
  return out;
}

/**
 * 为每个事件标注偏移来源，并按「最近确认值」回填未填写版本的偏移。
 * 来源优先级：confirmed(你填的) > inherited(计算所得/沿用) > bound(绑定派生) > base(全局基准) > default(默认)
 * 反转语义：无论 state.offsetOnlyConfirmed 开关是否开启，只要有你填过的参考数据就自动沿用（黄点填充真实日期）。
 * 仅当开关开启且某事件「完全没有任何你填过的参考数据」时，才标为 noRef（列表视图留空，不显示基准/默认推算日期）。
 * @param {Array} versions genGameVersions 已生成的版本数组（按时间无序，本函数内部排序）
 */
function resolveInherited(game, versions) {
  const onlyConfirmed = !!state.offsetOnlyConfirmed;
  // 按更新日期排序，便于找「最近」的已确认版本
  const sorted = [...versions].sort((a, b) => a.updateDate.getTime() - b.updateDate.getTime());
  // 收集每个 hk 的已确认偏移（来自 verEventOffsets = 用户亲手填的日期）
  const conf = {};
  sorted.forEach(v => v.events.forEach(ev => {
    const key = v.tenths + '|' + ev.historyKey;
    const o = game.verEventOffsets && game.verEventOffsets[key];
    if (typeof o === 'number') (conf[ev.historyKey] || (conf[ev.historyKey] = [])).push({ ms: v.updateDate.getTime(), off: o });
  }));
  Object.values(conf).forEach(arr => arr.sort((a, b) => a.ms - b.ms));

  // 诊断：打印找到的已确认数据
  const confKeys = Object.keys(conf);
  const stats = { confirmed: 0, bound: 0, inherited: 0, base: 0, default: 0, empty: 0 };
  if (confKeys.length) {
    console.debug(`[GVS] 🔍 ${game.name} 偏移继承：找到 ${confKeys.length} 个事件有确认值`, confKeys.map(k => `${k}(${conf[k].length}个)`).join(', '), 'onlyConfirmed=', onlyConfirmed);
  }

  // 辅助：获取某版本某事件的最终日期（用于绑定源解析）
  // 当前仅支持绑定到 version_update（用户确认需求：卡池跟随版本更新）
  function srcEventDate(v, srcHk) {
    if (srcHk === 'version_update') return v.updateDate;
    return null;
  }

  versions.forEach(v => v.events.forEach(ev => {
    // 版本更新事件的日期 = v.updateDate，单独存在 verUpdateDates 里，verEventOffsets 里查不到（偏移永远为0）
    // 需特殊判断：用户显式设过本版本日期→已确认；本游戏有任意已设日期→沿用推算；都没有→默认
    if (ev.defKey === 'version_update') {
      if (game.verUpdateDates && game.verUpdateDates[String(v.tenths)]) {
        ev.source = 'confirmed'; ev.noRef = false; stats.confirmed++;
      } else if (game.verUpdateDates && Object.keys(game.verUpdateDates).length > 0) {
        ev.source = 'inherited'; ev.noRef = false; stats.inherited++;
      } else {
        ev.source = 'default'; ev.noRef = false; stats.default++;
      }
      return;
    }
    if (offsetIsConfirmed(game, ev.historyKey, v.tenths)) { ev.source = 'confirmed'; ev.noRef = false; stats.confirmed++; return; }
    // 继承：沿用最近一次你填过的偏移（计算所得，优先级高于绑定）
    const arr = conf[ev.historyKey];
    if (arr && arr.length) {
      let best = arr[0], bd = Math.abs(arr[0].ms - v.updateDate.getTime());
      for (const c of arr) { const d = Math.abs(c.ms - v.updateDate.getTime()); if (d < bd) { bd = d; best = c; } }
      ev.offset = best.off;
      ev.date = addDays(v.updateDate, best.off);
      ev.source = 'inherited';
      ev.noRef = false;
      stats.inherited++;
      return;
    }
    // 绑定事件：从源事件派生日期（仅当无继承数据时才生效，作为初始默认值）
    if (ev.def && ev.def._bindTo) {
      const binding = ev.def._bindTo;
      const srcDate = srcEventDate(v, binding.src);
      if (srcDate) {
        ev.date = addDays(srcDate, binding.off);
        ev.offset = diffDays(ev.date, v.updateDate);
        ev.source = 'bound';
        ev.noRef = false;
        stats.bound++;
        return;
      }
    }
    const bo = game.baseOffsets && game.baseOffsets[ev.historyKey];
    if (typeof bo === 'number' && !onlyConfirmed) { ev.source = 'base'; ev.noRef = false; stats.base++; return; }
    // 开关开启且无任何你填过的参考数据：标为未填（列表视图留空，不显示基准/默认推算日期）
    ev.source = 'default';
    ev.noRef = onlyConfirmed;
    stats.default++;
    if (onlyConfirmed) stats.empty++;
  }));
  console.debug(`[GVS] 📊 ${game.name} 偏移来源统计：确认${stats.confirmed} 绑定${stats.bound} 沿用${stats.inherited} 基准${stats.base} 默认${stats.default}` + (onlyConfirmed ? ` 留空${stats.empty}` : ''));
}

function collectEvents() {
  const raw = [];
  state.games.forEach(game => {
    if (visibleGames[game.id] === false) return;
    genGameVersions(game).forEach(v => {
      v.events.forEach(ev => {
        // 过滤隐藏的事件（与列表视图一致：per-version 隐藏 + 列级隐藏）
        if (ev.hidden) return;
        raw.push({ game, version: v, ev, date: ev.date, key: game.id + '|' + ev.historyKey + '|' + v.tenths });
      });
    });
  });
  // 去重：同一游戏同一角色同类事件（爆料/卡池/预告/PV）只保留日期最接近今天的一条
  // 避免 v7.0 和 v7.1 各出一条「爆料·角色二」导致月历重复
  const todayMs = todayNoon().getTime();
  const seen = new Map(); // dedupeKey → best item
  raw.forEach(item => {
    const dk = item.ev.defKey !== 'version_update' && item.ev.defKey !== 'version_preview'
      ? (item.game.id + '|' + item.ev.defKey + '|' + (item.ev.charIndex ?? 0))
      : null;
    if (!dk) { seen.set('__raw__' + item.key, item); return; }
    const existing = seen.get(dk);
    if (!existing) { seen.set(dk, item); return; }
    // 统一选日期更接近今天的（月历/即将到来是时间线视图，最近的最相关）
    const dExist = Math.abs(existing.date.getTime() - todayMs);
    const dNew = Math.abs(item.date.getTime() - todayMs);
    if (dNew < dExist) seen.set(dk, item);
  });
  return Array.from(seen.values());
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
  // 切到列表/时间轴时重置页面滚动位置（避免从月历切回时停留在中间）
  if (viewMode !== 'calendar') window.scrollTo(0, 0);
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
  char_tease_0: '爆料·一', char_tease_1: '爆料·二', char_tease_2: '爆料·三', char_tease_3: '爆料·四', char_tease_4: '爆料·五', char_tease_5: '爆料·六',
  char_banner_0: '卡池·一', char_banner_1: '卡池·二', char_banner_2: '卡池·三', char_banner_3: '卡池·四', char_banner_4: '卡池·五', char_banner_5: '卡池·六',
  char_preview_0: '预告·一', char_preview_1: '预告·二', char_preview_2: '预告·三', char_preview_3: '预告·四', char_preview_4: '预告·五', char_preview_5: '预告·六',
  char_pv_0: 'PV·一', char_pv_1: 'PV·二', char_pv_2: 'PV·三', char_pv_3: 'PV·四', char_pv_4: 'PV·五', char_pv_5: 'PV·六' };
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
/** 根据爆料源版本查找目标版本 tenths（用于即将到来等视图显示备注名） */
function findTargetTenthsForTease(game, srcTenths, charIndex, offset) {
  if (!offset || offset <= 0) return null;
  const versions = listGameVersions(game);
  const sorted = [...versions].sort((a, b) => a.updateDate.getTime() - b.updateDate.getTime());
  const idx = sorted.findIndex(v => v.tenths === srcTenths);
  if (idx < 0 || idx + offset >= sorted.length) return null;
  return sorted[idx + offset].tenths;
}
function timelineSidebarHTML() {
  let up = '';
  const list = upcomingEvents(12);
  if (!list.length) up = '<p class="muted">暂无临近事件</p>';
  list.forEach(it => {
    const cd = diffDays(it.date, todayNoon());
    const cdTxt = cd === 0 ? '今天' : (cd > 0 ? cd + ' 天后' : '已过');
    const soon = cd >= 0 && cd <= (state.leadDays || 3);
    const ev = it.ev;
    const g = it.game;
    // 显示名优先级（与时间轴 L1434 一致）：colDisplayNames(列级标签名) > ev.title(版本级自定义标题) > 默认名
    let displayName = (g.colDisplayNames && g.colDisplayNames[ev.historyKey]) || ev.title || ev.name;
    let remarkSuffix = '';
    // 角色备注名作为后缀（不替换主标题，仅追加）
    if (ev._isChar && g.charNames) {
      const cn = g.charNames[String(it.version.tenths) + '|' + ev.charIndex];
      if (cn) remarkSuffix = `（${escapeHtml(cn)}）`;
    } else if (ev._tease && g.charNames) {
      const ci = ev.charIndex != null ? ev.charIndex : 0;
      const offset = g.teaseVersionOffset || 1;
      const targetTenths = findTargetTenthsForTease(g, it.version.tenths, ci, offset);
      let cn = null;
      if (targetTenths != null) cn = g.charNames[String(targetTenths) + '|' + ci];
      if (!cn) cn = g.charNames[String(it.version.tenths) + '|' + ci];
      if (cn) remarkSuffix = `（${escapeHtml(cn)}）`;
    }
    const sizeCls = getTagSizeClass(ev.defKey, ev.charIndex, g);
    up += `<div class="up-item${soon ? ' soon' : ''} ${sizeCls}" data-game="${it.game.id}" data-tenths="${it.version.tenths}" data-hk="${it.ev.historyKey}">` +
      `<div class="up-when">${fmtDate(it.date)}<span class="up-cd" style="color:${cdColor(cd)}">${cdTxt}</span></div>` +
      `<div class="up-game">${gameIconHTML(it.game, 'chip-ico')}<b>${escapeHtml(it.game.name)}</b> v${it.version.label}</div>` +
      `<div class="up-ev">${escapeHtml(displayName)}${remarkSuffix}</div></div>`;
  });
  return `<aside class="tl-side">` +
    `<div class="tl-card"><div class="tl-card-h">即将到来（${state.leadDays || 3}天内高亮）</div>${up}</div></aside>`;
}
function renderViewControls() {
  const bar = document.getElementById('view-controls');
  if (viewMode === 'timeline') {
    bar.innerHTML = `<span class="vc-label">缩放</span>` +
      `<button id="vc-zoom-out" class="vc-btn" title="缩小">－</button>` +
      `<input type="range" id="vc-zoom" min="2" max="48" value="${state.dayW || 4}">` +
      `<button id="vc-zoom-in" class="vc-btn" title="放大">＋</button>` +
      `<label class="vc-check"><input type="checkbox" id="vc-labels" ${state.showLabels ? 'checked' : ''}> 显示事件标签</label>` +
      `<button id="vc-today" class="vc-btn">跳到今天</button>` +
      `<span class="muted">拖版本块右缘可改时长 · 点事件可编辑</span>`;
    bar.classList.remove('hidden');
    document.getElementById('vc-zoom-out').onclick = () => { state.dayW = Math.max(2, (state.dayW || 4) - 1); saveLocalOnly(); };
    document.getElementById('vc-zoom-in').onclick = () => { state.dayW = Math.min(48, (state.dayW || 4) + 1); saveLocalOnly(); };
    document.getElementById('vc-zoom').oninput = (e) => { state.dayW = Number(e.target.value) || 4; Storage.saveLocal(state); renderTimeline(); };
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
    // 注意：滚动到今天居中由 renderCalendar() 末尾统一处理，这里不再额外 scrollIntoView，
    // 否则 smooth 滚动会与居中逻辑冲突导致页面自动滑动。
  } else {
    bar.innerHTML = `<span class="vc-label">显示过去</span>` +
      `<input type="number" id="vc-listpast" min="0" max="30" value="${state.listPast || 2}" style="width:56px">` +
      `<span class="muted">个版本 · 未来</span>` +
      `<input type="number" id="vc-listcount" min="1" max="30" value="${state.listCount || 8}" style="width:56px">` +
      `<span class="muted">个版本</span>` +
      `<span class="dd" id="offset-dd"><button class="vc-btn" id="vc-offset-btn" style="margin-left:8px">偏移 ▾</button>` +
        `<div class="dd-menu hidden" id="offset-dd-menu">` +
          `<button type="button" class="ghost" id="vc-calc-offset" style="display:block;width:100%;text-align:left;margin:2px 0">🧮 计算偏移</button>` +
          `<label class="vc-check" style="display:block;margin:4px 0;white-space:nowrap"><input type="checkbox" id="vc-only-confirmed" ${state.offsetOnlyConfirmed ? 'checked' : ''}> 只用我填的（无参考数据的格子留空）</label>` +
        `</div>` +
      `</span>` +
      offsetLegendHtml() +
      `<span class="muted">点游戏右侧"编辑"改周期/进位规则</span>`;
    bar.classList.remove('hidden');
    document.getElementById('vc-listpast').onchange = (e) => { state.listPast = Math.max(0, Math.min(30, Number(e.target.value) || 0)); saveAndRender(); };
    document.getElementById('vc-listcount').onchange = (e) => { state.listCount = Math.max(1, Math.min(30, Number(e.target.value) || 8)); saveAndRender(); };
    // 偏移下拉菜单
    const oddMenu = document.getElementById('offset-dd-menu');
    document.getElementById('vc-offset-btn').onclick = (e) => { e.stopPropagation(); oddMenu.classList.toggle('hidden'); };
    document.getElementById('vc-calc-offset').onclick = (e) => { e.stopPropagation(); oddMenu.classList.add('hidden'); showOffsetSummary(); };
    document.getElementById('vc-only-confirmed').onchange = (e) => {
      state.offsetOnlyConfirmed = e.target.checked; saveAndRender();
      toast(e.target.checked ? '已开启：未填版本只用默认偏移（不自动沿用）' : '已关闭：未填版本沿用你最近填的日期');
    };
  }
}

/* ----------------------------- 时间轴渲染 ----------------------------- */
function renderTimeline() {
  const host = document.getElementById('view-timeline');
  const vStart = parseDate(state.viewStart);
  const vEnd = parseDate(state.viewEnd);
  const totalDays = diffDays(vEnd, vStart);
  const dayW = state.dayW || 4;
  const laneH = 180;
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
    // 预计算：有效的 teaser（目标版本存在即可显示，角色名为空时用默认标签）
    const validTease = new Set();
    const allVers = listGameVersions(game).slice().sort((a, b) => a.updateDate.getTime() - b.updateDate.getTime());
    const tOff = game.teaseVersionOffset || 1;
    versions.forEach(v => v.events.forEach(ev => {
      if (!ev._tease) return;
      const ci = ev.charIndex != null ? ev.charIndex : 0;
      const idx = allVers.findIndex(x => x.tenths === v.tenths);
      const targetVer = (idx >= 0 && tOff > 0) ? allVers[idx + tOff] : (tOff <= 0 ? v : null);
      if (targetVer) validTease.add(v.tenths + '|' + ci);
    }));
    let blocks = '', marks = '', labelItems = [];
    // 预计算版本块位置，确保相邻版本无缝衔接（消除日期间隙）
    const vPositions = versions.map(v => ({
      left: xBody(v.updateDate),
      w: v.duration * dayW,
      v
    })).sort((a, b) => a.left - b.left);
    // 每个版本延伸到下一个版本的起始位置，消除间隙
    for (let i = 0; i < vPositions.length - 1; i++) {
      const gap = vPositions[i + 1].left - (vPositions[i].left + vPositions[i].w);
      if (gap > 0) vPositions[i].w += gap;
    }
    // 末尾对齐：所有游戏行的版本块右边缘统一对齐到视图结束日期
    // 1) 找到最后一个实际可见的版本（left < viewRight），延伸至 viewRight
    // 2) 对超出 viewRight 的版本做截断，避免行与行之间右边缘参差不齐
    const viewRight = totalDays * dayW; // 视图内容区右边缘 x 坐标
    if (vPositions.length > 0) {
      // 从后往前找第一个 left < viewRight 的可见版本
      let lastVisible = null;
      for (let i = vPositions.length - 1; i >= 0; i--) {
        if (vPositions[i].left < viewRight) { lastVisible = vPositions[i]; break; }
      }
      if (lastVisible) {
        const endX = lastVisible.left + lastVisible.w;
        if (endX < viewRight) lastVisible.w = viewRight - lastVisible.left;
      }
      // 截断所有超出 viewRight 的版本，确保右边缘整齐
      for (let i = 0; i < vPositions.length; i++) {
        if (vPositions[i].left + vPositions[i].w > viewRight) {
          vPositions[i].w = Math.max(viewRight - vPositions[i].left, 0);
        }
      }
    }
    const vWidthMap = new Map(vPositions.map(vp => [vp.v.tenths, vp.w]));
    // 时间轴事件渲染：每个版本独立渲染本版本的事件，不再做跨版本去重
    // （之前的跨版本去重会让 v4.4 的事件被 v4.5 的事件过滤掉，导致每个版本块看不到自己的角色事件）
    versions.forEach(v => {
      const left = xBody(v.updateDate);
      const w = vWidthMap.get(v.tenths) || (v.duration * dayW); // 使用衔接后的宽度
      // 允许负偏移事件（如前瞻 -12天）也显示在版本块左侧附近
      const maxNegOff = 14; // 最大向前延伸天数
      blocks += `<div class="tl-version" data-game="${game.id}" data-tenths="${v.tenths}" style="left:${left}px;width:${w}px;background:linear-gradient(135deg,${game.color},${shade(game.color,-18)})">` +
        `<span class="tl-vname">${escapeHtml(game.name)}</span> <span class="tl-vlabel">v${v.label}</span>` +
        `<div class="resize" data-game="${game.id}" data-tenths="${v.tenths}"></div></div>`;
      v.events.forEach(rawEv => {
        if (rawEv.hidden) return; // 跳过隐藏事件
        let ev = rawEv;
        // teaser：目标版本不存在 → 跳过
        if (ev._tease) {
          const ci = ev.charIndex != null ? ev.charIndex : 0;
          if (!validTease.has(v.tenths + '|' + ci)) return;
        }
        // 按版本渲染：本版本的所有事件都渲染，不做跨版本去重
        const isCharEv = (ev.defKey === 'char_banner' || ev.defKey === 'char_tease'
          || ev.defKey === 'char_preview' || ev.defKey === 'char_pv'
          || ev.defKey === 'banner');
        const mLeft = xBody(ev.date);
        // 范围检查：版本更新/前瞻等非角色事件按版本块附近范围；
        // 角色类事件（已通过全局去重，选的是距今天最近的）放宽到整个视图范围，
        // 因为爆料/预告的日期可能离所属版本块很远（如 v7.1 的爆料日期在 v7.0 附近）
        const inRange = isCharEv
          ? (mLeft >= 0 && mLeft <= totalDays * dayW)  // 全视图范围
          : (mLeft >= left - maxNegOff * dayW && mLeft <= left + w + 2 * dayW);  // 版本块附近
        if (inRange) {
          // 查角色备注名
          let remarkSuffix = ''; let remarkName = '';
          if (ev._isChar && game.charNames) {
            const cn = game.charNames[String(v.tenths) + '|' + ev.charIndex];
            if (cn) { remarkSuffix = `（${escapeHtml(cn)}）`; remarkName = cn; }
          } else if (ev._tease && game.charNames) {
            const ci = ev.charIndex != null ? ev.charIndex : 0;
            const offset = game.teaseVersionOffset || 1;
            const targetTenths = findTargetTenthsForTease(game, v.tenths, ci, offset);
            // teaser 只用目标版本的 charNames，不回退到源版本（避免两个 teaser 重复显示同一角色）
            const cn = targetTenths != null ? game.charNames[String(targetTenths) + '|' + ci] : null;
            if (cn) { remarkSuffix = `（${escapeHtml(cn)}）`; remarkName = cn; }
          }
          // 版本更新/前瞻显示版本号
          const verLabel = (ev.defKey === 'version_update' || ev.defKey === 'version_preview')
            ? ' v' + v.label : '';
          // 事件显示名：colDisplayNames（列级）> eventTitles（版本级）> 默认名
          const displayName = (game.colDisplayNames && game.colDisplayNames[ev.historyKey]) || ev.title;
          const tip = escapeHtml(displayName) + verLabel + ' ' + fmtDate(ev.date) + ' (+' + ev.offset + '天)' + remarkSuffix;
          const tSizeCls = getTagSizeClass(ev.defKey, ev.charIndex, game);
          marks += `<div class="tl-event-mark" data-game="${game.id}" data-tenths="${v.tenths}" data-hk="${ev.historyKey}"` +
            ` data-date="${fmtDate(ev.date)}" data-name="${escapeHtml(displayName)}" data-ver="${escapeHtml(v.label)}"` +
            ` data-offset="${ev.offset}" data-remark="${escapeHtml(remarkName)}" data-gname="${escapeHtml(game.name)}"` +
            ` data-cycle="${game.baseCycleDays}" data-type="${ev.defKey}" data-source="${ev.source || ''}"` +
            ` data-charidx="${ev.charIndex ?? ''}" data-ischar="${ev._isChar ? 1 : 0}" data-istease="${ev._tease ? 1 : 0}"` +
            ` data-tagname="${escapeAttr(game.colDisplayNames && game.colDisplayNames[ev.historyKey] || '')}"` +
            ` style="left:${mLeft}px;background:${eventColor(ev.defKey, ev.charIndex ?? ev.sub)}"></div>`;
          // 标签文本优先级：colDisplayNames 自定义名 > SHORT 缩写 > 默认名
          const finalLabel = (game.colDisplayNames && game.colDisplayNames[ev.historyKey])
            ? displayName
            : (SHORT[evShortKey(ev)] || displayName);
          if (state.showLabels) {
            labelItems.push({
              left: mLeft,
              defKey: ev.defKey,
              charIndex: ev.charIndex ?? 0,
              html: `<div class="tl-evt-tag ${tSizeCls}" data-game="${game.id}" data-tenths="${v.tenths}" data-hk="${ev.historyKey}" data-date="${fmtDate(ev.date)}" style="left:${mLeft}px;--c:${eventColor(ev.defKey, ev.charIndex ?? ev.sub)}">${escapeHtml(finalLabel)}${verLabel}${remarkSuffix}</div>`
            });
          }
        }
      });
    });
    // 标签位置：默认紧贴轴体；多数类型在下方(y=118)，PV/预告在上方(y=46)
    // 只有确实水平重叠时才向该侧顺次错位——不按类型固定行
    const TL_BASE_BOT = 118;     // 轴体下方基准
    const TL_BASE_TOP = 46;      // 轴体上方基准（PV/预告）
    const TL_ROW_H = 18;         // 每行高度
    const TL_OVERLAP_PX = 60;    // 水平距离 < 此值视为重叠
    function tlIsTop(defKey, ci) {
      if (defKey === 'char_pv' || defKey === 'char_preview') return true;
      if (defKey === 'char_tease' && ci === 1) return true; // 爆料·角色二在上
      return false;
    }
    if (labelItems.length > 0) {
      labelItems.sort((a, b) => a.left - b.left);
      const placed = [];         // 已放置的 { left, top }
      labelItems.forEach(item => {
        const up = tlIsTop(item.defKey, item.charIndex);
        let top = up ? TL_BASE_TOP : TL_BASE_BOT;
        // 与已放置标签逐个检测碰撞，碰撞则向当前侧错一行
        for (;;) {
          const hit = placed.some(p => Math.abs(p.left - item.left) < TL_OVERLAP_PX && p.top === top);
          if (!hit) break;
          top += up ? -TL_ROW_H : TL_ROW_H;
        }
        placed.push({ left: item.left, top });
        item.html = item.html.replace(' style="left:', ' style="top:' + top + 'px;left:');
      });
    }
    const labels = labelItems.map(it => it.html).join('');
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
      // 点版本块空白区：打开原版编辑弹窗（事件竖线/标签由下方的 handler 处理）
      if (e.target.closest('.tl-event-mark, .tl-evt-tag')) return;
      openVersionModal(el.dataset.game, Number(el.dataset.tenths));
    });
  });
  // 悬停事件标记：同日所有事件标签等比放大 + 显示详情浮层
  const tlInner = host.querySelector('.timeline-inner');
  let tlCard = null;
  const TL_WK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const TL_SRC = {
    confirmed: ['✓ 官方日期（已确认）', 'thc-src-confirmed'],
    inherited: ['↻ 计算所得（自动沿用）', 'thc-src-inherited'],
    base: ['⚙ 基准推算', 'thc-src-base'],
    default: ['○ 未设置（无参考数据）', 'thc-src-default']
  };
  function buildEventCard(marksSame, opts) {
    const editMode = !!(opts && opts.edit);
    const blocks = Array.from(marksSame).map(m => {
      const date = new Date(m.dataset.date + 'T12:00:00');
      const days = diffDays(date, todayNoon());
      const dAbs = Math.abs(days);
      const dayTxt = days === 0 ? '今天' : (days > 0 ? '还有 ' + dAbs + ' 天' : dAbs + ' 天前');
      const dayCls = days >= 0 ? 'thc-day-future' : 'thc-day-past';
      const off = Number(m.dataset.offset);
      const offTxt = (off > 0 ? '+' : '') + off + ' 天';
      const src = TL_SRC[m.dataset.source] || TL_SRC.default;
      const dot = m.style.background;
      const remark = m.dataset.remark
        ? `<div class="thc-row"><span class="thc-k">备注</span><span class="thc-v" style="color:#7c3aed">${m.dataset.remark}</span></div>` : '';
      // 编辑模式下：标题、日期、备注变输入框；自定义名称与外面的标签名都可改
      const hk = m.dataset.hk;
      const gameId = m.dataset.game;
      const tenths = m.dataset.tenths;
      const charIdx = (m.dataset.charIdx != null && m.dataset.charIdx !== '') ? Number(m.dataset.charIdx) : null;
      const mkey = escapeAttr(gameId + '|' + tenths + '|' + hk);
      let nameHtml, dateHtml, remarkHtml;
      if (editMode) {
        nameHtml = `<input type="text" class="thc-inp thc-inp-name" data-field="title" data-key="${mkey}" value="${escapeAttr(m.dataset.name)}" placeholder="自定义名称">`;
        dateHtml = `<input type="date" class="thc-inp thc-inp-date" data-field="date" data-key="${mkey}" data-hk="${escapeAttr(hk)}" data-game="${escapeAttr(gameId)}" data-tenths="${escapeAttr(tenths)}" data-charidx="${charIdx ?? ''}" value="${escapeAttr(m.dataset.date)}" onchange="this.setAttribute('data-dirty','1')">`;
        // 备注：仅 _isChar/_tease 事件才有 charNames
        const remarkInput = (m.dataset.ischar === '1' || m.dataset.istease === '1')
          ? `<input type="text" class="thc-inp thc-inp-remark" data-field="remark" data-game="${escapeAttr(gameId)}" data-tenths="${escapeAttr(tenths)}" data-charidx="${charIdx ?? ''}" value="${escapeAttr(m.dataset.remark || '')}" placeholder="角色备注">`
          : `<span class="thc-v muted">—</span>`;
        remarkHtml = `<div class="thc-row"><span class="thc-k">备注</span>${remarkInput}</div>`;
      } else {
        nameHtml = `${m.dataset.name}<span class="thc-pill">v${m.dataset.ver}</span>`;
        dateHtml = `<span class="thc-v">${m.dataset.date} ${TL_WK[date.getDay()]}</span>`;
        remarkHtml = remark;
      }
      // 标签名输入（仅编辑态显示在头部下方）
      const tagNameKey = gameId + '|' + hk;
      const tagNameSection = editMode
        ? `<div class="thc-row"><span class="thc-k">标签名</span><input type="text" class="thc-inp thc-inp-tagname" data-field="tagname" data-game="${escapeAttr(gameId)}" data-hk="${escapeAttr(hk)}" value="${escapeAttr(m.dataset.tagname || '')}" placeholder="留空用默认名"></div>`
        : '';
      return `<div class="thc-block" data-mkey="${mkey}">` +
        `<div class="thc-title"><span class="thc-dot" style="background:${dot}"></span>${nameHtml}</div>` +
        tagNameSection +
        `<div class="thc-row"><span class="thc-k">日期</span>${dateHtml}</div>` +
        `<div class="thc-row"><span class="thc-k">距今</span><span class="thc-v ${dayCls}">${dayTxt}</span></div>` +
        `<div class="thc-row"><span class="thc-k">相对版本</span><span class="thc-v">${offTxt}</span></div>` +
        `<div class="thc-row"><span class="thc-k">数据来源</span><span class="thc-v"><span class="thc-pill ${src[1]}">${src[0]}</span></span></div>` +
        (editMode ? remarkHtml : remark) +
        `</div>`;
    }).join('<div class="thc-sep"></div>');
    const first = marksSame[0];
    const sub = `<div class="thc-sub">${first.dataset.gname} · v${first.dataset.ver} · 周期 ${first.dataset.cycle} 天` +
      (marksSame.length > 1 ? ` · 同日 ${marksSame.length} 个事件` : '') + `</div>`;
    // 底部按钮区（编辑态显示保存/取消，只读态显示关闭+编辑）
    const actions = editMode
      ? `<div class="thc-actions"><button class="thc-btn" data-act="cancel">取消</button><button class="thc-btn primary" data-act="save">保存</button></div>`
      : `<div class="thc-actions"><button class="thc-btn" data-act="close">关闭</button><button class="thc-btn primary" data-act="edit">✏️ 编辑</button></div>`;
    return blocks + sub + actions;
  }
  host.querySelectorAll('.tl-event-mark').forEach(el => {
    el.addEventListener('mouseenter', () => {
      // 已固定（或正在编辑）的卡片不再被 hover 覆盖，避免鼠标移动打断编辑
      if (tlCard && tlCard.classList.contains('tl-pinned')) return;
      const date = el.dataset.date;
      // 只在同一个游戏行（lane-body）内查找同日标记和标签，不跨游戏合并
      const laneBody = el.closest('.tl-lane-body');
      const sameMarks = (laneBody || host).querySelectorAll('.tl-event-mark[data-date="' + date + '"]');
      const sameTags = (laneBody || host).querySelectorAll('.tl-evt-tag[data-date="' + date + '"]');
      sameMarks.forEach(m => m.classList.add('hl'));
      sameTags.forEach(t => t.classList.add('hl'));
      if (!tlCard) { tlCard = document.createElement('div'); tlCard.className = 'tl-hover-card'; tlInner.appendChild(tlCard); bindCardActions(tlCard); }
      // 也记录上下文（hover 后直接点编辑也能工作）
      tlCard.dataset.ctx = JSON.stringify({ game: el.dataset.game, tenths: el.dataset.tenths, hk: el.dataset.hk, date: date });
      tlCard.innerHTML = buildEventCard(sameMarks);
      // 定位：默认右侧弹出，水平/垂直都自适应避开可见边界遮挡
      const ir = tlInner.getBoundingClientRect();
      const lr = (laneBody || el.parentElement).getBoundingClientRect();
      const mr = el.getBoundingClientRect();
      const laneOffsetTop = lr.top - ir.top;
      const laneOffsetLeft = lr.left - ir.left;
      const markTop = mr.top - lr.top;
      const markLeft = mr.left - lr.left;
      const laneH = lr.height;
      const cardW = tlCard.offsetWidth || 240;
      const cardH = tlCard.offsetHeight || 180;
      // tlInner 可见边界（viewport 坐标），自然处理被右侧栏遮挡的情况
      const visLeftVp = ir.left + 4;
      const visRightVp = ir.right - 4;
      const visTopVp = ir.top + 4;
      const visBottomVp = ir.bottom - 4;
      // 默认右侧弹出
      let localLeft = markLeft + mr.width + 14;
      let dirCls = 'thc-right';
      // 检查右侧是否被可见边界遮挡（卡片右边缘超出 tlInner 可见右边缘）
      const cardRightVpRight = ir.left + laneOffsetLeft + localLeft + cardW;
      if (cardRightVpRight > visRightVp) {
        // 翻到左侧
        localLeft = markLeft - cardW - 14;
        dirCls = 'thc-left';
      }
      // 转换到 tlInner 坐标系
      let left = laneOffsetLeft + localLeft;
      // 水平最终安全边界：以 tlInner 可见范围为准
      const cardLeftVp = ir.left + left;
      const cardRightVp = cardLeftVp + cardW;
      if (cardRightVp > visRightVp) left -= (cardRightVp - visRightVp);
      if (cardLeftVp < visLeftVp) left += (visLeftVp - cardLeftVp);
      left = Math.max(4, left);
      // 垂直居中对齐标记
      let top = laneOffsetTop + markTop + mr.height / 2 - cardH / 2;
      // 垂直安全边界：以 tlInner 可见范围为准（避免卡片被视口剪裁）
      const cardTopVp = ir.top + top;
      const cardBottomVp = cardTopVp + cardH;
      if (cardBottomVp > visBottomVp) top -= (cardBottomVp - visBottomVp);
      if (cardTopVp < visTopVp) top += (visTopVp - cardTopVp);
      // 箭头 Y = 标记中心在卡片内的相对位置（夹在卡片内）
      const arrowYRaw = (markTop + mr.height / 2) - (top - laneOffsetTop);
      const arrowY = Math.max(14, Math.min(cardH - 14, arrowYRaw));
      tlCard.style.setProperty('--arrow-y', arrowY + 'px');
      // 保留 tl-pinned 状态（防止 hover 移动时覆盖掉固定标记）
      const wasPinned = tlCard.classList.contains('tl-pinned');
      tlCard.className = 'tl-hover-card show ' + dirCls + (wasPinned ? ' tl-pinned' : '');
      tlCard.style.top = top + 'px';
      tlCard.style.left = left + 'px';
    });
    el.addEventListener('mouseleave', () => {
      // 若卡片已固定，不收起
      if (tlCard && tlCard.classList.contains('tl-pinned')) return;
      host.querySelectorAll('.tl-event-mark.hl').forEach(m => m.classList.remove('hl'));
      host.querySelectorAll('.tl-evt-tag.hl').forEach(t => t.classList.remove('hl'));
      if (tlCard) tlCard.classList.remove('show');
    });
    // 点击事件竖线：固定浮窗（替换原 openVersionModal）
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const date = el.dataset.date;
      const laneBody = el.closest('.tl-lane-body');
      const sameMarks = (laneBody || host).querySelectorAll('.tl-event-mark[data-date="' + date + '"]');
      sameMarks.forEach(m => m.classList.add('hl'));
      if (!tlCard) { tlCard = document.createElement('div'); tlCard.className = 'tl-hover-card'; tlInner.appendChild(tlCard); bindCardActions(tlCard); }
      // 把上下文存到卡片本身，编辑/退出时直接读取（不依赖 .hl 类，避免交互中丢失）
      tlCard.dataset.ctx = JSON.stringify({ game: el.dataset.game, tenths: el.dataset.tenths, hk: el.dataset.hk, date: date });
      tlCard.innerHTML = buildEventCard(sameMarks);
      positionTlCard(tlInner, tlCard, sameMarks[0]);
      tlCard.classList.add('tl-pinned', 'show');
      tlCard.classList.remove('thc-edit');
    });
  });
  // 卡片底部按钮：关闭 / 编辑 / 保存 / 取消（每次创建卡片时绑定）
  function bindCardActions(card) {
    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      e.stopPropagation();
      try {
        const act = btn.dataset.act;
        if (act === 'close') { unpinHoverCard(host, card); }
        else if (act === 'edit') { enterEditMode(host, tlInner, card); }
        else if (act === 'cancel') { exitEditMode(host, tlInner, card); }
        else if (act === 'save') { saveEditChanges(host, tlInner, card); }
      } catch (err) {
        console.error('[GVS] 卡片操作出错', err);
        toast('操作出错：' + err.message);
      }
    });
  }
  if (tlCard) bindCardActions(tlCard);
  // 点击外部关闭固定浮窗
  document.addEventListener('click', function outsideClose(e) {
    if (!tlCard || !tlCard.classList.contains('tl-pinned')) return;
    if (tlCard.contains(e.target)) return;
    if (e.target.closest('.tl-event-mark, .tl-evt-tag')) return;
    unpinHoverCard(host, tlCard);
  });

  function positionTlCard(tlInner, tlCard, el) {
    if (!el || !el.getBoundingClientRect) return;
    const ir = tlInner.getBoundingClientRect();
    const laneBody = el.closest('.tl-lane-body');
    const lr = (laneBody || el.parentElement).getBoundingClientRect();
    const mr = el.getBoundingClientRect();
    const laneOffsetTop = lr.top - ir.top, laneOffsetLeft = lr.left - ir.left;
    const markTop = mr.top - lr.top, markLeft = mr.left - lr.left;
    const laneH = lr.height;
    const cardW = tlCard.offsetWidth || 240;
    const cardH = tlCard.offsetHeight || 180;
    const visLeftVp = ir.left + 4, visRightVp = ir.right - 4, visTopVp = ir.top + 4, visBottomVp = ir.bottom - 4;
    let localLeft = markLeft + mr.width + 14, dirCls = 'thc-right';
    if (ir.left + laneOffsetLeft + localLeft + cardW > visRightVp) { localLeft = markLeft - cardW - 14; dirCls = 'thc-left'; }
    let left = laneOffsetLeft + localLeft;
    const cardLeftVp = ir.left + left, cardRightVp = cardLeftVp + cardW;
    if (cardRightVp > visRightVp) left -= (cardRightVp - visRightVp);
    if (cardLeftVp < visLeftVp) left += (visLeftVp - cardLeftVp);
    left = Math.max(4, left);
    let top = laneOffsetTop + markTop + mr.height / 2 - cardH / 2;
    const cardTopVp = ir.top + top, cardBottomVp = cardTopVp + cardH;
    if (cardBottomVp > visBottomVp) top -= (cardBottomVp - visBottomVp);
    if (cardTopVp < visTopVp) top += (visTopVp - cardTopVp);
    const arrowYRaw = (markTop + mr.height / 2) - (top - laneOffsetTop);
    const arrowY = Math.max(14, Math.min(cardH - 14, arrowYRaw));
    tlCard.style.setProperty('--arrow-y', arrowY + 'px');
    tlCard.classList.add(dirCls);
    tlCard.style.top = top + 'px';
    tlCard.style.left = left + 'px';
  }

  function unpinHoverCard(host, tlCard) {
    host.querySelectorAll('.tl-event-mark.hl').forEach(m => m.classList.remove('hl'));
    host.querySelectorAll('.tl-evt-tag.hl').forEach(t => t.classList.remove('hl'));
    tlCard.classList.remove('tl-pinned', 'show', 'thc-edit');
  }

  function findCtxMarks(host, tlCard) {
    let ctx = null;
    try { ctx = tlCard.dataset.ctx ? JSON.parse(tlCard.dataset.ctx) : null; } catch (err) { ctx = null; }
    if (!ctx || !ctx.date) return null;
    // 优先在同一游戏行（lane-body）内查找，避免跨游戏合并
    const laneBody = host.querySelector(`.tl-event-mark[data-game="${ctx.game}"][data-tenths="${ctx.tenths}"][data-hk="${ctx.hk}"]`)?.closest('.tl-lane-body');
    return (laneBody || host).querySelectorAll(`.tl-event-mark[data-date="${ctx.date}"]`);
  }

  function enterEditMode(host, tlInner, tlCard) {
    const sameMarks = findCtxMarks(host, tlCard);
    if (!sameMarks || !sameMarks.length) return;
    tlCard.innerHTML = buildEventCard(sameMarks, { edit: true });
    positionTlCard(tlInner, tlCard, sameMarks[0]);
    tlCard.classList.add('thc-edit');
  }

  function exitEditMode(host, tlInner, tlCard) {
    const sameMarks = findCtxMarks(host, tlCard);
    if (!sameMarks || !sameMarks.length) return;
    tlCard.innerHTML = buildEventCard(sameMarks);
    tlCard.classList.remove('thc-edit');
    positionTlCard(tlInner, tlCard, sameMarks[0]);
  }

  function saveEditChanges(host, tlInner, tlCard) {
    const inputs = tlCard.querySelectorAll('.thc-inp');
    let anyChange = false;
    inputs.forEach(inp => {
      const field = inp.dataset.field;
      const gameId = inp.dataset.game;
      const hk = inp.dataset.hk;
      const tenths = inp.dataset.tenths;
      const charIdxRaw = inp.dataset.charidx;
      const game = state.games.find(g => g.id === gameId);
      if (!game) return;
      const val = inp.value.trim();
      if (field === 'title') {
        // 自定义名称（per-version）→ eventTitles
        if (!game.eventTitles) game.eventTitles = {};
        const tkey = tenths + '|' + hk;
        if (val) { game.eventTitles[tkey] = val; anyChange = true; }
        else { delete game.eventTitles[tkey]; anyChange = true; }
      } else if (field === 'tagname') {
        // 列级标签名 → colDisplayNames
        if (!game.colDisplayNames) game.colDisplayNames = {};
        if (val) { game.colDisplayNames[hk] = val; anyChange = true; }
        else { delete game.colDisplayNames[hk]; anyChange = true; }
      } else if (field === 'remark') {
        // 角色备注 → charNames
        if (!game.charNames) game.charNames = {};
        const cidx = charIdxRaw !== '' && charIdxRaw != null ? Number(charIdxRaw) : 0;
        const rkey = tenths + '|' + cidx;
        if (val) { game.charNames[rkey] = val; anyChange = true; }
        else { delete game.charNames[rkey]; anyChange = true; }
      } else if (field === 'date') {
        // 日期 → verEventOffsets（version_update 走 verUpdateDates）
        // ⚠️ 只有用户实际改过该日期输入框才处理，避免把卡片里未编辑的绑定/继承自事件误升级为「已确认」而被后续偏移调整卡死
        if (inp.dataset.dirty !== '1') return;
        if (hk === 'version_update') {
          if (!game.verUpdateDates) game.verUpdateDates = {};
          if (val) { game.verUpdateDates[String(tenths)] = val; anyChange = true; }
          else { delete game.verUpdateDates[String(tenths)]; anyChange = true; }
        } else {
          if (!game.verEventOffsets) game.verEventOffsets = {};
          if (val) {
            const newDate = parseDate(val);
            const v = genGameVersions(game).find(x => String(x.tenths) === String(tenths));
            const upd = v ? v.updateDate : null;
            const off = upd ? diffDays(newDate, upd) : 0;
            game.verEventOffsets[tenths + '|' + hk] = off;
            anyChange = true;
          } else {
            delete game.verEventOffsets[tenths + '|' + hk];
            anyChange = true;
          }
        }
      }
    });
    if (anyChange) {
      saveAndRender();
      toast('已保存，修改已同步到所有视图');
    } else {
      exitEditMode(host, tlInner, tlCard);
    }
  }

  host.querySelectorAll('.tl-evt-tag').forEach(el => {
    // 点击标签同样触发固定浮窗（而非弹窗）
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = el.closest('.tl-lane-body')?.querySelector(`.tl-event-mark[data-hk="${el.dataset.hk}"][data-tenths="${el.dataset.tenths}"]`);
      if (m) m.dispatchEvent(new MouseEvent('click', { bubbles: false }));
    });
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
function listEvCellHTML(game, v, ev, editMode, identityColors) {
  const cd = (ev.date && !ev.noRef) ? diffDays(ev.date, todayNoon()) : null;
  const cdTxt = cd === null ? '' : (cd === 0 ? '今天' : (cd > 0 ? '+' + cd : String(cd)));
  // 开关开启且无任何你填过的参考数据：列表视图留空（不显示基准/默认推算日期）
  const dateHtml = ev.noRef
    ? '<span class="muted">— 未填</span>'
    : `<span style="font-size:13px;font-weight:600;color:#334155">${fmtDate(ev.date)}</span>` +
      `<span style="font-size:11px;font-weight:400;margin-left:4px;color:${cdColor(cd)}">${cdTxt}</span>`;
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
      const tc = tagColorFor(displayName, identityColors);
      if (tc) {
        customHtml = `<div class="ev-char-tag" style="background:${tc.bg};color:${tc.fg};border:1px solid ${tc.fg}55;font-weight:700">${escapeHtml(displayName)}</div>`;
      } else {
        const tagColor = eventColor(ev.defKey, ci);
        customHtml = `<div class="ev-char-tag" style="background:${tagColor}1a;color:${tagColor};border:1px solid ${tagColor}55;font-weight:700">${escapeHtml(displayName)}</div>`;
      }
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
    return `<td title="${escapeHtml(ev.title)}">` +
      `<div class="le-cell-date">${dateHtml}${offsetSrcDot(ev.source)}</div>` +
      `${customHtml ? '<div class="le-cell-tag">' + customHtml + '</div>' : ''}</td>`;
  }
  // 编辑模式：可点击编辑
  return `<td class="le-editable" data-game="${game.id}" data-tenths="${v.tenths}"` +
    ` data-hk="${ev.historyKey}" data-ev-name="${escapeAttr(ev.name)}" title="点击编辑：${escapeHtml(ev.title)}">` +
    `<div class="le-cell-date">${dateHtml}${offsetSrcDot(ev.source)}</div>` +
    `${customHtml ? '<div class="le-cell-tag">' + customHtml + '</div>' : ''}` +
    `<span class="le-edit-hint">✏️</span></td>`;
}

/** 新角色爆料列单元格：显示绑定目标版本的角色备注名 + 爆料事件日期（可点击编辑） */
function teaseCellHTML(def, remark, editMode, game, v, targetVer, teaseDate, verHidden, teaseSource, identityColors) {
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
  const tc = tagColorFor(remark, identityColors);
  const tag = (remark && tc)
    ? `<div class="ev-char-tag" style="background:${tc.bg};color:${tc.fg};border:1px solid ${tc.fg}55;font-weight:700">${escapeHtml(remark)}</div>`
    : (remark ? `<div class="ev-char-tag" style="background:${color}1a;color:${color};border:1px solid ${color}55;font-weight:700">${escapeHtml(remark)}</div>` : '');
  // 日期倒计时（与 listEvCellHTML 算法一致）
  const cd = teaseDate ? diffDays(teaseDate, todayNoon()) : null;
  const cdTxt = cd === null ? '' : (cd === 0 ? '今天' : (cd > 0 ? '+' + cd : String(cd)));
  // 日期行（日期+倒计时内联）+ 元数据行（圆点+标签并排）
  const dateLine = teaseDate
    ? `<span style="font-size:13px;font-weight:600;color:#334155">${fmtDate(teaseDate)}</span><span style="font-size:11px;font-weight:400;margin-left:4px;color:${cdColor(cd)}">${cdTxt}</span>`
    : '—';
  // 爆料列可点击编辑：修改目标版本的角色备注名 + 爆料事件日期
  if (!editMode) {
    return `<td title="新角色爆料·角色${ci + 1} → 绑定到「${escapeAttr(targetLabel)}」">` +
      `<div class="le-cell-date">${dateLine}${offsetSrcDot(teaseSource)}</div>` +
      `${tag ? '<div class="le-cell-tag">' + tag + '</div>' : ''}</td>`;
  }
  return `<td class="le-editable" style="border:1px solid var(--border);border-bottom:0!important;outline:0!important;box-shadow:none!important" data-game="${game.id}" data-tenths="${v.tenths}"` +
    ` data-cell-type="tease" data-char-index="${ci}"` +
    (targetVer ? ` data-target-tenths="${targetVer.tenths}"` : '') +
    ` title="点击编辑：新角色爆料·角色${ci + 1} → 绑定到「${escapeAttr(targetLabel)}」的备注名与日期">` +
      `<div class="le-cell-date">${dateLine}${offsetSrcDot(teaseSource)}</div>` +
      `${tag ? '<div class="le-cell-tag">' + tag + '</div>' : ''}` +
    `<span class="le-edit-hint">✏️</span></td>`;
}

/** 获取列表视图用的宽范围版本列表（与 renderList 的范围一致，避免时间轴窄范围导致查不到） */
function listGameVersions(game) {
  const lp = state.listPast || 2, lc = state.listCount || 8;
  const estCycle = (game.baseCycleDays || 42) * 2;
  return genGameVersions(game,
    fmtDate(addDays(todayNoon(), -(lp * estCycle))),
    fmtDate(addDays(todayNoon(), +(lc * estCycle)))
  );
}

function renderList() {
  const host = document.getElementById('view-list');
  let html = '';
  const list = state.games.filter(g => visibleGames[g.id] !== false);
  const editMode = !!state.listEditMode;
  if (!list.length) { host.innerHTML = '<p class="muted">暂无游戏</p>'; return; }

  // 编辑模式：表头改名入口（所有游戏共用）
  const renameBtnHTML = (gId, key, kind) => editMode
    ? `<button type="button" class="le-rename-btn" draggable="false" onmousedown="event.stopPropagation()" onclick="openColRenameEditor('${gId}','${escapeAttr(key)}','${kind}', this.closest('th'))" title="重命名此列">✏️</button>`
    : '';

  list.forEach(game => {
    // 角色身份 → 颜色序号（同名共享），用于备注标签按角色分配颜色
    const identityColors = buildIdentityColors(game);
    // 列表视图使用独立范围，不受"视图起始/结束"限制
    const lp = state.listPast || 2, lc = state.listCount || 8;
    const estCycle = (game.baseCycleDays || 42) * 2;
    const listStart = fmtDate(addDays(todayNoon(), -(lp * estCycle)));
    const listEnd = fmtDate(addDays(todayNoon(), +(lc * estCycle)));
    const all = genGameVersions(game, listStart, listEnd);
    const tMs = addDays(todayNoon(), -1).getTime();
    const sorted = [...all].sort((a, b) => a.updateDate.getTime() - b.updateDate.getTime());
    const past = sorted.filter(v => v.updateDate.getTime() < tMs);
    const future = sorted.filter(v => v.updateDate.getTime() >= tMs);
    const currentVer = past.length > 0 ? past[past.length - 1] : null;
    const olderVersions = currentVer ? past.slice(0, -1).slice(-(state.listPast || 2)) : past.slice(-(state.listPast || 2));
    const futureN = future.slice(0, state.listCount || 8);
    const teaseOff = state.teaseVersionOffset || 0;
    const allSorted = sorted;

    // 该游戏可见的事件列（全局 + 按游戏隐藏过滤后）
    const gEvts = gameActiveEvents(game).filter(e => e.key !== 'version_update');

    const cols = 1 + gEvts.reduce((a, d) => a + d.offsets.length, 0);

    // 构建分组表头数据（用于 headRow1 的分组行，含 colspan）
    const charGroupDefs = [];
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
    const CHARS = ['一', '二', '三', '四', '五', '六'];
    function mkCol(c, type, ci) {
      if (type === 'tease') return { colId: 'tease_' + ci, type, def: c.def, idx: c.idx, groupCi: ci };
      if (type === 'char') return { colId: (c.def._origKey || c.def.key) + '_' + ci, type, def: c.def, idx: c.idx, groupCi: ci };
      return { colId: c.def.key, type: 'normal', def: c.def, idx: c.idx };
    }
    let groups = [];
    normalCols.forEach(c => {
      const col = mkCol(c, 'normal');
      groups.push({ id: 'norm__' + col.colId, type: 'normal', singleton: true, label: c.def.name, color: headerColorFor(c.def._origKey || c.def.key, 'normal', c.idx), cols: [col] });
    });
    teaseGroupDefs.forEach(g => {
      const cols = g.cols.map(c => mkCol(c, 'tease', c.def.charIndex != null ? c.def.charIndex : c.idx));
      groups.push({ id: 'tease', type: 'tease', singleton: false, label: '新角色爆料', color: GROUP_HEADER_COLORS.tease, cols });
    });
    charGroupDefs.forEach(g => {
      const cols = g.cols.map(c => mkCol(c, 'char', g.ci));
      groups.push({ id: 'char__' + g.ci, type: 'char', singleton: false, label: g.label, color: headerColorFor(g.cols[0].def._origKey || g.cols[0].def.key, 'char', g.ci), charIndex: g.ci, cols });
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
        g.cols.sort((a, b) => ((a.colId in m ? m[a.colId] : max) - (b.colId in m ? b.colId : max)));
      }
    });

    // 扁平有序列（表头/数据单元格/拖拽都按它），保证三者严格一致
    const flatCols = [];
    groups.forEach(g => g.cols.forEach(c => flatCols.push(c)));

    let rows = '';

    // 辅助函数：按 flatCols 顺序渲染可见事件单元格（与表头严格一一对应）
    const renderEvCells = (v, editMode) => {
      let html = '';
      const evMap = {};
      v.events.forEach(ev => { evMap[ev.historyKey] = ev; });
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
          let teaseDate = null;
          let teaseEv = null;
          // teaser 日期：从 row（src）版本的同名 teaser 事件读——与 makeVersion / 弹窗存值用同一 key
          const rowTeaseEv = v.events.find(e => e.historyKey === ('char_tease_' + ci) && !e.hidden);
          teaseDate = rowTeaseEv ? rowTeaseEv.date : (rowTarget ? addDays(rowTarget.updateDate, TEASE_OFF) : null);
          teaseEv = rowTeaseEv;
          const teaseHk = 'char_tease_' + ci;
          const verHidden = !!(game.verHiddenEvents && game.verHiddenEvents[String(v.tenths) + '|' + teaseHk]);
          cell = teaseCellHTML(col.def, remark, editMode, game, v, rowTarget, teaseDate, verHidden, teaseEv ? teaseEv.source : null, identityColors);
        } else {
          const ev = lookupEv(col.def, col.idx);
          if (ev) {
            cell = listEvCellHTML(game, v, ev, editMode, identityColors);
          } else if (!editMode) {
            cell = '<td></td>';
          } else {
            // 编辑模式：没有数据的格子也显示可点击占位符（ax fix）
            const origKey = col.def._origKey || col.def.key;
            let cellText;
            if (col.def.sub) {
              cellText = col.type === 'char' ? col.def.name : (col.def.name + col.def.sub[col.idx]);
            } else {
              cellText = col.def.name;
              if (col.type === 'tease') cellText = cellText.replace(/^新角色爆料·/, '');
            }
            cell = `<td class="le-editable vt-empty" data-game="${game.id}" data-tenths="${v.tenths}"` +
              ` data-hk="${escapeAttr(origKey + (col.def.charIndex != null ? '_' + col.def.charIndex : (col.def.offsets.length > 1 ? '_' + col.idx : '')))}"` +
              ` data-ev-name="${escapeAttr(cellText)}" title="点击填写：${escapeAttr(cellText)}">` +
              `<span class="le-add-hint">＋ 填写</span></td>`;
          }
        }
        // 整列 FLIP + 语义宽度 class（对齐用）
        const widthCls = col.type === 'tease' ? 'col-tease' : (col.type === 'char' ? 'col-char' : 'col-normal');
        html += cell.replace(/^<td/, `<td data-col-key="${escapeAttr(col.colId)}"`)
          .replace('class="', `class="${widthCls} `);
      });
      return html;
    };

    // 渲染顺序：更早历史(灰) → —今天— → 📍当前版本(高亮) → 未来(正常)
    // 两行布局：第1行=版本号（突出），第2行=日期+倒计时（小字）
    const verDateTd = (v, isCurrent) => {
      const prefix = isCurrent ? '📍 ' : '';
      const dateStr = fmtDate(v.updateDate);
      const cd = diffDays(v.updateDate, todayNoon());
      const cdTxt = cd === 0 ? '今天' : (cd > 0 ? `+${cd}` : String(cd));
      // 版本持续天数 = 下一版本更新日 − 本版本更新日
      const nextV = allSorted.find(sv => sv.tenths === v.tenths + 1);
      const durDays = nextV ? diffDays(nextV.updateDate, v.updateDate) : null;
      const durTxt = durDays != null ? ` · ${durDays}天` : '';
      // 版本更新日期的来源标识（与事件列一致）
      const verEv = v.events.find(e => e.defKey === 'version_update');
      const verSrcDot = verEv ? offsetSrcDot(verEv.source) : '';
      if (editMode) {
        return `<td class="vt-ver">` +
          `<div style="font-size:15px;font-weight:600;line-height:1.4">` +
          `<span class="le-editable" data-game="${game.id}" data-tenths="${v.tenths}" data-cell-type="ver" title="点击编辑版本信息">${prefix}${v.label}<span class="le-edit-hint">✏️</span></span>` +
          `</div>` +
          `<div class="muted" style="font-size:11px;line-height:1.3">` +
          `(<span class="le-editable" data-game="${game.id}" data-tenths="${v.tenths}" data-cell-type="update" title="点击修改更新日期">${dateStr}<span class="le-edit-hint">✏️</span></span> · <span style="color:${cdColor(cd)};font-weight:600">${cdTxt}</span>${verSrcDot}${durTxt})` +
          `</div></td>`;
      }
      return `<td class="vt-ver">` +
        `<div style="font-size:15px;font-weight:600;line-height:1.4">${prefix}${v.label}</div>` +
        `<div class="muted" style="font-size:11px;line-height:1.3">(${dateStr} · <span style="color:${cdColor(cd)};font-weight:600">${cdTxt}</span>${verSrcDot}${durTxt})</div></td>`;
    };
    // ---- 更早的历史版本 ----
    olderVersions.forEach(v => {
      rows += `<tr class="vt-past">${verDateTd(v, false)}`;
      rows += renderEvCells(v, editMode);
      rows += `</tr>`;
    });
    // ---- 分隔线 ----
    if ((olderVersions.length > 0 || currentVer) && futureN.length > 0) {
      rows += `<tr class="vt-divider"><td colspan="${cols}">— 今天 —</td></tr>`;
    }
    // ---- 当前版本（高亮） ----
    if (currentVer) {
      rows += `<tr class="vt-current">${verDateTd(currentVer, true)}`;
      rows += renderEvCells(currentVer, editMode);
      rows += `</tr>`;
    }
    // ---- 未来版本 ----
    futureN.forEach(v => {
      rows += `<tr>${verDateTd(v, false)}`;
      rows += renderEvCells(v, editMode);
      rows += `</tr>`;
    });
    // 第一行：分组标题（普通列 rowspan=2，角色组 colspan）
    const isDefHidden = (d) => !!(d._hidden);
    // 辅助：根据 group 类型返回宽度 class
    const grpWidthCls = g => g.type === 'tease' ? 'col-tease' : (g.type === 'char' ? 'col-char' : 'col-normal');
    let headRow1 = '<th rowspan="2" class="col-ver">版本</th>';
    groups.forEach(g => {
      const hid = g.cols.every(c => isDefHidden(c.def));
      const gDrag = editMode ? ` draggable="true" data-group-id="${escapeAttr(g.id)}"` : '';
      const grab = editMode ? '<span class="set-ev-grab" style="font-size:9px;margin-right:2px;opacity:.5">⠿</span>' : '';
      const wcls = grpWidthCls(g);
      if (g.singleton) {
        const c = g.cols[0];
        const origKey = c.def._origKey || c.def.key;
        const dName = (game.colDisplayNames && game.colDisplayNames[g.id]) || (c.def.name + (c.def.sub ? c.def.sub[c.idx] : ''));
        headRow1 += `<th class="le-group-drag ${wcls}" data-col-key="${escapeAttr(g.id)}" rowspan="2" style="background:${g.color};color:#fff${hid ? ';opacity:.35;text-decoration:line-through' : ''};cursor:${editMode ? 'grab' : 'default'}"${gDrag}>${grab}<span class="chip-dot" style="background:#fff;display:inline-block;width:8px;height:8px;border-radius:50%"></span> ${escapeHtml(dName)}${renameBtnHTML(game.id, g.id, 'group')}</th>`;
      } else {
        const colSpan = g.cols.length;
        const dName = (game.colDisplayNames && game.colDisplayNames[g.id]) || g.label;
        headRow1 += `<th colspan="${colSpan}" class="char-group-head le-group-drag ${wcls}" data-col-key="${escapeAttr(g.id)}" style="background:${g.color};color:#fff;font-size:11px;font-weight:700;padding:4px 6px;border-bottom:3px solid rgba(255,255,255,.55)${hid ? ';opacity:.35;text-decoration:line-through' : ''};cursor:${editMode ? 'grab' : 'default'}"${gDrag}>${grab}<span class="chip-dot" style="background:#fff;width:6px;height:6px"></span> ${escapeHtml(dName)}${renameBtnHTML(game.id, g.id, 'group')}</th>`;
      }
    });
    // 第二行：子列名（仅非单列的组才占第二行；编辑模式可拖拽，但只能在所属组内移动）
    let headRow2 = '';
    groups.forEach(g => {
      if (g.singleton) return;
      g.cols.forEach(col => {
        const origKey = col.def._origKey || col.def.key;
        const color = g.color;
        const hid = isDefHidden(col.def);
        // 去掉与大项重复的部分：char 子项只显示类型名（卡池/预告/PV），tease 子项只显示角色名
        let cellText;
        if (col.def.sub) {
          cellText = col.type === 'char' ? col.def.name : (col.def.name + col.def.sub[col.idx]);
        } else {
          cellText = col.def.name;
          if (col.type === 'tease') cellText = cellText.replace(/^新角色爆料·/, '');
        }
        const dName = (game.colDisplayNames && game.colDisplayNames[col.colId]) || cellText;
        const subWcls = col.type === 'tease' ? 'col-tease' : (col.type === 'char' ? 'col-char' : 'col-normal');
        const dragAttrs = editMode
          ? ` draggable="true" data-col-id="${escapeAttr(col.colId)}" data-group-id="${escapeAttr(g.id)}" data-col-key="${escapeAttr(col.colId)}" class="le-col-drag ${subWcls}"`
          : ` class="${subWcls}"`;
        headRow2 += `<th style="font-size:10px;color:${color};padding:2px 4px;border-bottom:2px solid ${color}44;background:${color}1a${hid ? ';opacity:.35;text-decoration:line-through' : ''};cursor:${editMode ? 'grab' : 'default'}"${dragAttrs}>${editMode ? '<span class="set-ev-grab" style="font-size:9px;margin-right:2px;opacity:.5">⠿</span>' : ''}${escapeHtml(dName)}${renameBtnHTML(game.id, col.colId, 'col')}</th>`;
      });
    });
    const head = `<tr>${headRow1}</tr>${headRow2 ? '<tr>' + headRow2 + '</tr>' : ''}`;
    // 编辑模式切换 + 列设置按钮（仅编辑模式显示）
    const editBtn = `<button class="vc-btn ${editMode ? 'le-btn-on' : ''}" onclick="toggleListEditMode()" style="margin-left:8px;${editMode ? 'background:var(--primary);color:#fff;border-color:var(--primary)' : ''}">${editMode ? '✏️ 修改中' : '✏️ 修改'}</button>`;
    const colBtn = editMode
      ? `<button class="vc-btn" onclick="openColSettings('${game.id}', this)" title="设置显示/隐藏的列">⚙️ 列</button>`
      : '';
    const hiddenCount = (game.hiddenEventKeys || []).length;
    const hiddenHint = !editMode && hiddenCount > 0
      ? ` <span class="muted" style="cursor:pointer;font-size:11px;color:var(--danger);font-weight:600" onclick="toggleListEditMode();setTimeout(function(){openColSettings('${game.id}',document.querySelector('[data-game-id=&quot;${game.id}&quot;] .vc-btn[title*=列]'))},100)" title="点击进入修改模式恢复隐藏的${hiddenCount}列">🔒${hiddenCount}列已隐藏</span>`
      : '';
    html += `<div class="list-game ${editMode ? 'le-mode' : ''}" data-game-id="${game.id}"><div class="list-game-title">${gameIconHTML(game, 'icon')} <b>${escapeHtml(game.name)}</b>` +
      `<span class="muted">基础 ${game.baseCycleDays}天 · 小版本上限 ${game.minorMax} · 显示过去 ${state.listPast || 2} / 未来 ${state.listCount || 8} 个版本</span>` +
      `${editBtn}${colBtn}${hiddenHint}` +
      `<button class="ghost" style="margin-left:auto;font-size:12px" onclick="showOffsetSummary('${game.id}')">🧮 偏移</button>` +
      `<button class="ghost" onclick="openGameModal('${game.id}')">编辑游戏</button></div>` +
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
function playColumnFlip(oldMap, movedKey) {
  const moved = [];
  document.querySelectorAll('#view-list [data-col-key]').forEach(el => {
    const k = el.getAttribute('data-col-key');
    // 只让被拖动的那一列滑动；其余列位置虽变，但瞬间归位，不播放动画（避免整表跟随移动）
    if (movedKey && k !== movedKey) return;
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
      saveLocalOnly(); playColumnFlip(snap, srcId); toast('分组顺序已调整');
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
      saveLocalOnly(); playColumnFlip(snap, srcCol); toast('组内列顺序已调整');
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
var _leScrollHandler = null; // 滚动跟随监听器
function openListCellEditor(gameId, tenths, cellType, hk, cellEl) {
  // 如果已有打开的编辑器，先关闭
  closeListCellEditor();

  const game = state.games.find(g => g.id === gameId);
  if (!game) return;

  // 用列表视图的宽范围查找版本（避免时间轴窄范围导致列表中的版本查不到）
  const v = listGameVersions(game).find(v => v.tenths === tenths);
  if (!v) return;

  _leActiveCell = cellEl;

  // 创建内联编辑浮层
  const editor = document.createElement('div');
  editor.className = 'le-inline-editor';
  editor.onclick = (e) => e.stopPropagation();

  if (cellType === 'ver') {
    // 版本备注编辑（日期请通过下方日期格单独修改）
    editor.innerHTML = `
      <div class="le-editor-title">📋 版本 ${escapeHtml(v.label)}</div>
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
    const targetVer = targetTenths != null ? listGameVersions(game).find(v => v.tenths === targetTenths) : null;
    const targetLabel = targetVer ? targetVer.label : '（目标版本不存在）';
    const cnKey = String(targetTenths) + '|' + ci;
    const currentName = (targetTenths != null && game.charNames && game.charNames[cnKey]) || '';
    // 当前爆料事件日期：从行版本（src）的 teaser 事件读——与保存/时间轴都用同一 key（verEventOffsets[rowTenths + '|' + hk]）
    let currentDateStr = '';
    const rowVer = rowTenths != null ? listGameVersions(game).find(v => v.tenths === rowTenths) : null;
    if (rowVer) {
      const rowTeaseEv = rowVer.events.find(e => e.historyKey === ('char_tease_' + ci) && !e.hidden);
      const d = rowTeaseEv ? rowTeaseEv.date : addDays(rowVer.updateDate, TEASE_OFF);
      currentDateStr = fmtDate(d);
    }
    // 若行版本查不到（理论不会），回退用目标版本
    if (!currentDateStr && targetVer) {
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
        <input type="date" id="le-tease-date" value="${escapeAttr(currentDateStr || '')}" placeholder="留空用默认" ${isHidden ? 'disabled' : ''}>
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
    // 检测是否为绑定事件（如卡池→版本更新）
    const binding = ev.def && ev.def._bindTo ? ev.def._bindTo : null;
    const bindLabel = binding
      ? (binding.src === 'version_update' ? '🔗 绑定：跟随版本更新日期' + (binding.off !== 0 ? `（偏移 ${binding.off >= 0 ? '+' : ''}${binding.off} 天）` : '')
        : `🔗 绑定：跟随 ${binding.src}（偏移 ${binding.off >= 0 ? '+' : ''}${binding.off} 天）`)
      : '';
    // 当前日期（有值显示值；无值时默认版本更新日期，方便用户从该版本当天开始选）
    const displayDate = (ev.date && !ev.noRef) ? fmtDate(ev.date) : fmtDate(v.updateDate);
    editor.innerHTML = `
      <div class="le-editor-title"><span class="chip-dot" style="background:${eventColor(ev.defKey, ev.charIndex ?? ev.sub ?? 0)};display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:middle"></span> ${escapeHtml(ev.name)} — 版本 ${escapeHtml(v.label)}</div>
      ${bindLabel ? `<div class="muted" style="font-size:11px;margin-bottom:8px">${escapeHtml(bindLabel)}</div>` : ''}
      <div class="field">
        <label>事件日期${binding ? '（修改将覆盖自动绑定）' : '（默认版本更新日期）'}</label>
        <input type="date" id="le-date" value="${escapeAttr(displayDate)}" data-dirty="1" ${isHidden ? 'disabled' : ''}>
        ${binding ? '<div class="muted" style="font-size:11px;margin-top:4px">💡 留空则继续跟随源事件；填写后以你填的为准</div>' : ''}
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

  // 定位到单元格旁边（fixed 定位 + 滚动跟随 + 底部防截断）
  function positionEditor() {
    if (!editor.parentElement || !cellEl.getBoundingClientRect) return;
    const rect = cellEl.getBoundingClientRect();
    const ew = 300; // 弹窗预估宽度
    const eh = editor.offsetHeight || 280; // 弹窗实际高度（首次为0用默认值）
    const gap = 4;
    // 左：贴单元格右侧，超屏则靠右
    let left = Math.min(rect.right + gap, window.innerWidth - ew);
    if (left < 4) left = 4;
    // 上：默认在单元格右侧对齐顶部；若底部空间不足则翻到单元格上方
    let top = rect.top;
    if (top + eh > window.innerHeight - 12) {
      top = rect.bottom - eh; // 翻到上方，底部与单元格底部对齐
      if (top < 4) top = 4; // 极端情况保证不超出视口顶
    }
    editor.style.left = left + 'px';
    editor.style.top = top + 'px';
  }
  editor.style.position = 'fixed';
  editor.style.zIndex = '200';
  document.body.appendChild(editor);
  positionEditor();
  // 首次渲染后弹窗有实际高度了，再校正一次（防止底部被截断）
  requestAnimationFrame(positionEditor);

  // 滚动时跟随单元格重新定位
  _leScrollHandler = () => { if (document.querySelector('.le-inline-editor') === editor) positionEditor(); };
  window.addEventListener('scroll', _leScrollHandler, { passive: true });

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
  if (_leScrollHandler) { window.removeEventListener('scroll', _leScrollHandler); _leScrollHandler = null; }
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

  const dateInput = document.getElementById('le-date');
  const dateStr = dateInput ? dateInput.value : '';
  // ⚠️ 只有用户实际改过日期输入框才写 verEventOffsets；预填值（确认/绑定/继承）不动，避免调别的偏移时被误删/误升级
  const dateDirty = !!(dateInput && dateInput.dataset.dirty === '1');
  // 角色事件：保存到 charNames（本版本该角色通用）；普通事件：保存到 eventTitles
  const charNameInput = document.getElementById('le-char-name');
  if (charNameInput) {
    // 角色事件
    const charNameVal = charNameInput.value.trim();
    if (!game.charNames) game.charNames = {};
    const v = listGameVersions(game).find(v => v.tenths === tenths);
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
  // 保存日期偏移（逐版本覆盖，存入 verEventOffsets）——仅当用户实际改过日期
  if (dateDirty) {
    if (dateStr) {
      const v = listGameVersions(game).find(v => v.tenths === tenths);
      if (v) {
        const ev = v.events.find(e => e.historyKey === hk);
        if (ev) {
          const newDate = parseDate(dateStr);
          // 存储绝对偏移量（相对版本更新日期）
          // eventOffset() 返回值直接用于 addDays(updateDate, off)，所以必须存绝对偏移
          const absOff = diffDays(newDate, v.updateDate);
          if (!game.verEventOffsets) game.verEventOffsets = {};
          game.verEventOffsets[tenths + '|' + hk] = absOff;
        }
      }
    } else {
      // 用户清空了日期 → 删除该版本该事件的确认偏移（回归自动计算）
      if (game.verEventOffsets) delete game.verEventOffsets[tenths + '|' + hk];
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

  // 如果隐藏了，同时清除日期偏移+备注名数据，避免残留影响时间轴计算
  if (hideThis) {
    if (game.verEventOffsets) {
      const offKey = String(targetTenths) + '|' + teaseHk;
      delete game.verEventOffsets[offKey];
    }
    const cnKey = String(targetTenths) + '|' + charIndex;
    if (game.charNames) delete game.charNames[cnKey];
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
  // 爆料事件日期（存到行版本号对应的 verEventOffsets——与时间轴 makeVersion 查同一 key）
  const dateInput = document.getElementById('le-tease-date');
  const dateStr = dateInput ? dateInput.value : '';
  if (dateStr) {
    if (!game.verEventOffsets) game.verEventOffsets = {};
    const rowVer = listGameVersions(game).find(v => v.tenths === rowTenths);
    if (rowVer) {
      // 偏移相对行版本（src）更新日，makeVersion 用同一规则读这个 key
      game.verEventOffsets[String(rowTenths) + '|' + teaseHk] = diffDays(parseDate(dateStr), rowVer.updateDate);
    }
  }
  // 一次性数据迁移：旧版 teaser 存到 target 版本（如 '71|char_tease_X'），新版按 src 存（'70|...'）
  // 把每个 src 版本对应的 target 版本（旧逻辑位置）的 teaser 数据搬到 src
  migrateTeaserOffsetsToSrc(game);
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
  // 滚动到今天所在的格子（垂直居中）——双 rAF 确保所有布局完成后再滚动
  const todayCell = host.querySelector('.cal-cell.today');
  if (todayCell) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { todayCell.scrollIntoView({ block: 'center' }); });
    });
  }
}

function cellHTML(dt, byDate, out) {
  const k = fmtDate(dt);
  const isToday = diffDays(dt, todayNoon()) === 0;
  const evs = byDate[k] || [];
  let chips = '';
  evs.slice(0, 4).forEach(it => {
    // 查角色备注名（与即将到来视图相同逻辑）
    const ev = it.ev, g = it.game;
    let remarkSuffix = '';
    if (ev._isChar && g.charNames) {
      const cn = g.charNames[String(it.version.tenths) + '|' + ev.charIndex];
      if (cn) remarkSuffix = `（${escapeHtml(cn)}）`;
    } else if (ev._tease && g.charNames) {
      const ci = ev.charIndex != null ? ev.charIndex : 0;
      const offset = g.teaseVersionOffset || 1;
      const targetTenths = findTargetTenthsForTease(g, it.version.tenths, ci, offset);
      // teaser 只用目标版本的 charNames，不回退到源版本
      const cn = targetTenths != null ? g.charNames[String(targetTenths) + '|' + ci] : null;
      if (cn) remarkSuffix = `（${escapeHtml(cn)}）`;
    }
    // 版本更新/前瞻显示版本号
    const verLabel = (ev.defKey === 'version_update' || ev.defKey === 'version_preview')
      ? ' v' + it.version.label : '';
    const sizeCls = getTagSizeClass(ev.defKey, ev.charIndex, g);
    // 显示名：colDisplayNames（列级）> eventTitles（版本级）> 默认名
    const chipName = (g.colDisplayNames && g.colDisplayNames[ev.historyKey]) || ev.title;
    chips += `<div class="ev-chip ${sizeCls}" data-game="${it.game.id}" data-tenths="${it.version.tenths}" data-hk="${it.ev.historyKey}" title="${escapeHtml(it.game.name)} v${it.version.label} ${escapeHtml(chipName)}${remarkSuffix}">` +
      `${gameIconHTML(it.game, 'chip-ico')}<span class="chip-dot" style="background:${eventColor(it.ev.defKey, it.ev.charIndex ?? it.ev.sub)}"></span>` +
      `<span class="chip-txt">${escapeHtml(chipName)}${verLabel}${remarkSuffix}</span></div>`;
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

  html += `<div class="field"><label>事件（改日期即记为「你填的」确认数据，参与后续自动沿用；可填自定义名称，如角色名）</label>`;
  v.events.forEach(ev => {
    const off = diffDays(ev.date, v.updateDate);
    const tkey = evTitleKey(v.tenths, ev.historyKey);
    const custom = game.eventTitles && game.eventTitles[tkey] ? game.eventTitles[tkey] : '';
    html += `<div class="ev-row">
      <span class="ev-name"><span class="chip-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${eventColor(ev.defKey, ev.charIndex ?? ev.sub)}"></span> ${escapeHtml(ev.name)}</span>
      <input type="text" class="m-title" data-tkey="${tkey}" placeholder="自定义名称" value="${escapeAttr(custom)}" style="max-width:120px">
      <input type="date" data-hk="${ev.historyKey}" data-defkey="${ev.defKey}" data-sub="${ev.sub}" value="${fmtDate(ev.date)}">
      <span class="ev-offset">+${off}天</span>${offsetSrcDot(ev.source)}
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
      const hk = inp.dataset.hk;
      const val = e.target.value;
      if (!game.verEventOffsets) game.verEventOffsets = {};
      if (!val) {
        // 清空日期 = 删除该版本该事件的确认偏移（回归自动计算）
        delete game.verEventOffsets[String(tenths) + '|' + hk];
        saveAndRender(); openVersionModal(gameId, tenths, focusHk);
        toast('已清除该日期，偏移回归自动计算');
        return;
      }
      const newDate = parseDate(val);
      const upd = parseDate(document.getElementById('m-update').value);
      const off = diffDays(newDate, upd);
      game.verEventOffsets[String(tenths) + '|' + hk] = off; // 存为「你填的」确认日期
      saveAndRender(); openVersionModal(gameId, tenths, focusHk);
      toast(`已保存你填的日期（偏移 ${off >= 0 ? '+' : ''}${off} 天），参与后续自动沿用`);
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
    '<div class="muted" style="margin-bottom:6px">你填的日期优先于默认偏移；未填版本会沿用你最近一次填的同一事件真实偏移（不做平均）。</div>';
  activeEvents().forEach(def => {
    def.offsets.forEach((defOff, idx) => {
      const hk = def.key + (def.offsets.length > 1 || def.charIndex != null ? '_' + (def.charIndex != null ? def.charIndex : idx) : '');
      const base = (game.baseOffsets && typeof game.baseOffsets[hk] === 'number') ? game.baseOffsets[hk] : defOff;
      const refDate = fmtDate(addDays(anchorDt, base));
      const confCount = game.verEventOffsets ? Object.keys(game.verEventOffsets).filter(k => k.endsWith('|' + hk)).length : 0;
      const clearBtn = confCount > 0
        ? `<button type="button" class="ghost off-clear" data-hk="${hk}" style="font-size:11px;padding:2px 6px">清除已填(${confCount})</button>`
        : '';
      offHtml += `<div class="ev-row"><span class="ev-name">${escapeHtml(def.name + (def.sub ? def.sub[idx] : ''))}</span>` +
        `<input type="date" class="off-date" data-hk="${hk}" value="${refDate}">` +
        `<span class="muted" style="font-size:11px;min-width:72px;text-align:center">→ <strong class="off-calc" data-hk="${hk}">${base}</strong> 天</span>` +
        `<span class="muted" style="font-size:11px">${confCount > 0 ? ('已填 ' + confCount + ' 个版本') : '默认'}</span>${clearBtn}` +
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
  body.querySelectorAll('.off-clear').forEach(b => b.onclick = () => {
    const hk = b.dataset.hk; const game = _gpGameId ? state.games.find(g => g.id === _gpGameId) : null;
    if (game && game.verEventOffsets) {
      Object.keys(game.verEventOffsets).forEach(k => { if (k.endsWith('|' + hk)) delete game.verEventOffsets[k]; });
    }
    saveAndRender(); openGamePanel(_gpGameId); toast('已清除该事件所有已填日期');
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

  // --- 版本日程表数据 ---（已统一由各视图的就地编辑器保存，无需在此批量收集）

  saveAndRender(); hideModal(); toast('已保存');
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

/* ----------------------------- 列表格子变化检测 ----------------------------- */

/** 快照列表视图中每个数据格子的内容（用于渲染前后对比） */
function snapshotListCells() {
  const host = document.getElementById('view-list');
  if (!host) return {};
  const snap = {};
  // 每行 <tr> 的 data 属性标识游戏+版本
  host.querySelectorAll('.ver-table tbody tr').forEach(tr => {
    const gameTd = tr.querySelector('.vt-ver');
    if (!gameTd) return;
    // 从版本列的 editable span 获取 game id
    const editSpan = gameTd.querySelector('[data-game]');
    const gameId = editSpan ? editSpan.dataset.game : '';
    const tenths = editSpan ? editSpan.dataset.tenths : '';
    // 遍历该行的所有数据 td（跳过第一列版本列）
    tr.querySelectorAll('td').forEach((td, ci) => {
      if (ci === 0) return; // 跳过版本列
      const dateEl = td.querySelector('.le-cell-date');
      const dotEl = td.querySelector('.off-dot');
      if (dateEl) {
        const key = `${gameId}|${tenths}|${ci}`;
        snap[key] = {
          text: dateEl.textContent.trim(),
          dotCls: dotEl ? Array.from(dotEl.classList).filter(c => c.startsWith('off-dot-')).join(' ') : ''
        };
      }
    });
  });
  return snap;
}

/** 对比快照与当前 DOM，高亮变化的格子，返回 { total, detail } */
function highlightChangedCells(oldSnap) {
  const host = document.getElementById('view-list');
  if (!host || !oldSnap) return { total: 0, detail: '' };
  let changed = 0;
  const detail = { d2i: 0, i2d: 0, d2c: 0, date: 0, other: 0 }; // default→inherited, inherited→default, etc.
  host.querySelectorAll('.ver-table tbody tr').forEach(tr => {
    const gameTd = tr.querySelector('.vt-ver');
    if (!gameTd) return;
    const editSpan = gameTd.querySelector('[data-game]');
    const gameId = editSpan ? editSpan.dataset.game : '';
    const tenths = editSpan ? editSpan.dataset.tenths : '';
    tr.querySelectorAll('td').forEach((td, ci) => {
      if (ci === 0) return;
      const dateEl = td.querySelector('.le-cell-date');
      const dotEl = td.querySelector('.off-dot');
      if (!dateEl) return;
      const key = `${gameId}|${tenths}|${ci}`;
      const old = oldSnap[key];
      const newText = dateEl.textContent.trim();
      const newDotCls = dotEl ? Array.from(dotEl.classList).filter(c => c.startsWith('off-dot-')).join(' ') : '';
      if (!old) { changed++; detail.other++; td.classList.add('le-cell-new'); return; }
      if (old.text !== newText && old.dotCls === newDotCls) { changed++; detail.date++; td.classList.add('le-cell-changed'); return; }
      if (old.text === newText && old.dotCls !== newDotCls) {
        changed++;
        td.classList.add('le-cell-changed');
        // 追踪来源变化方向
        if (old.dotCls.includes('off-dot-default') && newDotCls.includes('off-dot-inherited')) detail.d2i++;
        else if (old.dotCls.includes('off-dot-inherited') && newDotCls.includes('off-dot-default')) detail.i2d++;
        else if (old.dotCls.includes('off-dot-default') && newDotCls.includes('off-dot-confirmed')) detail.d2c++;
        else detail.other++;
        return;
      }
      if (old.text !== newText && old.dotCls !== newDotCls) { changed++; detail.date++; td.classList.add('le-cell-changed'); }
    });
  });
  // 1.5秒后移除高亮类
  if (changed > 0) setTimeout(() => {
    document.querySelectorAll('.le-cell-changed, .le-cell-new').forEach(el => el.classList.remove('le-cell-changed', 'le-cell-new'));
  }, 1500);
  // 构建详细描述
  let desc = [];
  if (detail.d2i) desc.push(`${detail.d2i}格默认→沿用`);
  if (detail.d2c) desc.push(`${detail.d2c}格默认→你填`);
  if (detail.date) desc.push(`${detail.date}格日期变`);
  if (detail.other) desc.push(`${detail.other}格其他`);
  return { total: changed, detail: desc.join('、') || '无变化' };
}

/**
 * 偏移计算汇总
 * @param {string} [optGameId] - 传入游戏 ID 时只显示该游戏的独立计算卡片；不传则显示全部游戏汇总
 */
function showOffsetSummary(optGameId) {
  const only = state.offsetOnlyConfirmed
    ? '当前模式：<b>只用我填的</b>（无任何你填过数据的版本留空，不显示基准/默认推算日期）'
    : '当前模式：未填版本<b>沿用你最近填的日期</b>（不做平均）';

  // 构建单个游戏的偏移卡片 HTML
  function buildGameCard(game) {
    const vers = genGameVersions(game);
    let gc = 0, gi = 0, gb = 0, gd = 0;
    const evDetails = [];
    vers.forEach(v => v.events.forEach(ev => {
      if (ev.source === 'confirmed') gc++;
      else if (ev.source === 'inherited') gi++;
      else if (ev.source === 'base') gb++;
      else gd++;
      const ek = ev.name;
      let d = evDetails.find(e => e.n === ek);
      if (!d) { d = { n: ek, c: 0, i: 0, b: 0, dd: 0 }; evDetails.push(d); }
      if (ev.source === 'confirmed') d.c++;
      else if (ev.source === 'inherited') d.i++;
      else if (ev.source === 'base') d.b++;
      else d.dd++;
    }));
    const total = gc + gi + gb + gd;
    if (total === 0) return '';
    const evLines = evDetails.map(d =>
      `<div style="font-size:11px;color:var(--text-muted);padding:2px 0;padding-left:14px">· ${escapeHtml(d.n)}：🟢${d.c} 🟡${d.i} 🔵${d.b} ⚪${d.dd}</div>`
    ).join('');
    return (
      `<div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;background:var(--bg-card,#fff)">` +
      `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">` +
      `<span style="font-size:15px;font-weight:700">${escapeHtml(game.name)}</span>` +
      `<span class="muted" style="font-size:12px">共 <b>${total}</b> 个偏移点</span>` +
      `</div>` +
      `<div style="font-size:13px;margin-bottom:6px">🟢官方日期（已确认） <b>${gc}</b> · 🟡计算所得（自动沿用） <b>${gi}</b> · 🔵基准推算 <b>${gb}</b> · ⚪未设置（无参考数据） <b>${gd}</b></div>` +
      (evLines ? `<div style="border-top:1px dashed var(--border);padding-top:6px">${evLines}</div>` : '') +
      `</div>`
    );
  }

  let body;
  if (optGameId) {
    // 单游戏模式：只展示该游戏的独立计算
    const game = state.games.find(g => g.id === optGameId);
    if (!game) { toast('游戏不存在'); return; }
    const card = buildGameCard(game);
    body =
      `<p class="muted" style="font-size:12px">${only}</p>` +
      (card || '<p class="muted">该游戏暂无偏移数据</p>');
    document.getElementById('modal-title').textContent = `🧮 偏移计算 — ${game.name}`;
  } else {
    // 全部游戏汇总模式
    const cards = [];
    let gTotal = 0, gConfirmed = 0, gInherited = 0, gBase = 0, gDef = 0;
    state.games.filter(g => visibleGames[g.id] !== false).forEach(game => {
      const vers = genGameVersions(game);
      let gc = 0, gi = 0, gb = 0, gd = 0;
      vers.forEach(v => v.events.forEach(ev => {
        gTotal++;
        if (ev.source === 'confirmed') { gConfirmed++; gc++; }
        else if (ev.source === 'inherited') { gInherited++; gi++; }
        else if (ev.source === 'base') { gBase++; gb++; }
        else { gDef++; gd++; }
      }));
      if (gc + gi + gb + gd > 0) {
        cards.push(buildGameCard(game));
      }
    });
    body =
      `<p class="muted" style="font-size:12px">${only}</p>` +
      `<div style="max-height:360px;overflow:auto;margin-top:6px">${cards.join('') || '<p class="muted">暂无可见游戏</p>'}</div>` +
      `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:12px" class="muted">` +
      `全部合计：${gTotal} 个 · 🟢${gConfirmed} · 🟡${gInherited} · 🔵${gBase} · ⚪${gDef}` +
      `</div>`;
    document.getElementById('modal-title').textContent = '🧮 偏移计算汇总（全部游戏）';
  }
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-save').onclick = () => {
    hideModal();
    // 快照当前所有数据格子的内容，用于渲染后对比变化
    const snap = snapshotListCells();
    render();
    const result = highlightChangedCells(snap);
    if (result.total > 0) {
      toast(`已重新计算：${result.total} 个格子变化（${result.detail}）`);
    } else {
      toast('已重新计算，无变化');
    }
  };
  showModal();
}

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

/* —— 标签大小排序（设置面板 ④）—— 每个游戏可独立，或编辑全局默认 */
function saveTagSizeMap(map) {
  if (curTagSizeGame === '__default__') {
    state.tagSizeMap = map;
  } else {
    const g = state.games.find(x => x.id === curTagSizeGame);
    if (g) g.tagSizeMap = map;
  }
  saveLocalOnly();
}
function currentTagSizeMap() {
  if (curTagSizeGame === '__default__') return state.tagSizeMap || null;
  const g = state.games.find(x => x.id === curTagSizeGame);
  return g ? (g.tagSizeMap || null) : null;
}
// 按「重要程度」排序的 {key,label,level} 列表（level 越小 = 越重要 = 越大）
function orderedTagSizeList() {
  const map = currentTagSizeMap();
  return TAG_SIZE_DEFS.map(d => {
    const level = (map && map[d.key] != null) ? map[d.key] : d.def;
    return { key: d.key, label: d.label, level };
  }).sort((a, b) => a.level - b.level || (TAG_SIZE_DEFS.findIndex(x => x.key === a.key) - TAG_SIZE_DEFS.findIndex(x => x.key === b.key)));
}
function renderTagSizeSettings() {
  const gameOpts = ['<option value="__default__"' + (curTagSizeGame === '__default__' ? ' selected' : '') + '>🌐 全局默认（所有游戏）</option>']
    .concat((state.games || []).map(g => '<option value="' + escapeAttr(g.id) + '"' + (curTagSizeGame === g.id ? ' selected' : '') + '>' + escapeHtml(g.name) + '</option>'));
  const list = orderedTagSizeList();
  const rows = list.map((it, i) => {
    const lab = TAG_SIZE_LABELS[it.level] || '中';
    const canUp = i > 0, canDown = i < list.length - 1;
    return `<div class="tag-size-row" data-key="${it.key}">
      <span class="ts-grip">⠿</span>
      <span class="ts-name">${escapeHtml(it.label)}</span>
      <span class="ts-badge">${lab}</span>
      <button type="button" class="ghost ts-up" data-key="${it.key}" ${canUp ? '' : 'disabled'} title="调大（更重要）">▲</button>
      <button type="button" class="ghost ts-down" data-key="${it.key}" ${canDown ? '' : 'disabled'} title="调小（更次要）">▼</button>
    </div>`;
  }).join('');
  return `<select class="tag-size-sel" id="s-tagsize-game">${gameOpts.join('')}</select>
    <div class="muted" style="margin:2px 0 4px">越靠上 = 越重要 = 标签越大。用「▲/▼」调整重要程度，立即生效。</div>
    <div class="tag-size-list">${rows}</div>
    <button type="button" class="ghost" id="s-tagsize-reset" style="margin-top:8px">↺ 重置为默认顺序</button>`;
}
function bindTagSizeSettings(body) {
  const sel = body.querySelector('#s-tagsize-game');
  if (sel) sel.onchange = () => {
    curTagSizeGame = sel.value;
    const box = body.querySelector('#set-tag-sizes');
    if (box) { box.innerHTML = renderTagSizeSettings(); bindTagSizeSettings(body); }
  };
  const reset = body.querySelector('#s-tagsize-reset');
  if (reset) reset.onclick = () => {
    if (curTagSizeGame === '__default__') delete state.tagSizeMap;
    else { const g = state.games.find(x => x.id === curTagSizeGame); if (g) delete g.tagSizeMap; }
    saveLocalOnly();
    const box = body.querySelector('#set-tag-sizes');
    if (box) { box.innerHTML = renderTagSizeSettings(); bindTagSizeSettings(body); }
    toast('已重置为默认顺序');
  };
  body.querySelectorAll('.ts-up').forEach(b => b.onclick = () => moveTagSize(b.dataset.key, -1, body));
  body.querySelectorAll('.ts-down').forEach(b => b.onclick = () => moveTagSize(b.dataset.key, 1, body));
}
function moveTagSize(key, dir, body) {
  const list = orderedTagSizeList();
  const idx = list.findIndex(x => x.key === key);
  if (idx < 0) return;
  const ni = idx + dir;
  if (ni < 0 || ni >= list.length) return;
  const a = list[idx], b = list[ni];
  const tmp = a.level; a.level = b.level; b.level = tmp;
  const map = {};
  list.forEach(it => { map[it.key] = it.level; });
  saveTagSizeMap(map);
  const box = body.querySelector('#set-tag-sizes');
  if (box) { box.innerHTML = renderTagSizeSettings(); bindTagSizeSettings(body); }
}

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
  document.addEventListener('click', (e) => {
    if (dd && !dd.contains(e.target)) ddMenu.classList.add('hidden');
    const odd = document.getElementById('offset-dd');
    const oddMenu = document.getElementById('offset-dd-menu');
    if (odd && oddMenu && !odd.contains(e.target)) oddMenu.classList.add('hidden');
  });
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
      <button type="button" class="mtab" data-tab="s-appearance">外观</button>
    </div>
    <div id="tab-s-basic">
      <div class="field"><label>临近提醒提前天数</label><input type="number" id="s-lead" min="1" max="30" value="${state.leadDays || LEAD_DEFAULT}"></div>
      <div class="field"><label>列表视图显示版本数（过去 / 未来）</label><div style="display:flex;gap:8px;align-items:center"><input type="number" id="s-listpast" min="0" max="30" value="${state.listPast || 2}" style="width:72px"> 过去 <input type="number" id="s-list" min="1" max="30" value="${state.listCount || 8}" style="width:72px"> 未来</div></div>
      <div class="field"><label>视图起始（今天往前，天）</label><input type="number" id="s-back" min="0" max="365" value="${diffDays(todayNoon(), parseDate(state.viewStart))}"></div>
      <div class="field"><label>视图结束（今天往后，天）</label><input type="number" id="s-fwd" min="30" max="1095" value="${diffDays(parseDate(state.viewEnd), todayNoon())}"></div>
      <div class="field"><label>时间轴缩放（像素/天）</label><input type="range" id="s-zoom" min="2" max="48" value="${state.dayW || 4}" style="width:200px"> <span id="s-zoom-v">${state.dayW || 4}px</span></div>
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
          <button type="button" class="primary" id="c-sync">☁ 立即同步到云端</button>
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
        <div class="field"><label>④ 标签大小排序（拖拽调整重要程度 → 决定月历/即将到来/时间轴的标签尺寸）</label>
          <div class="muted" style="margin-bottom:8px">越靠上 = 越重要 = 标签越大。默认：版本更新 > 版本前瞻 > 角色卡池 > 新角色爆料 > 角色预告/PV。每个游戏可独立调整（选择上方游戏后修改），不调整时使用下方全局默认。</div>
          <div id="set-tag-sizes">${renderTagSizeSettings()}</div>
        </div>
      </div>
      <div id="tab-s-appearance" class="hidden">
        ${renderAppearanceTab()}
      </div>
  `;

  /* ---- Tab 切换 ---- */
  function switchTab(tab) {
    curSettingsTab = tab;
    body.querySelectorAll('.mtab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
    document.getElementById('tab-s-basic').classList.toggle('hidden', tab !== 's-basic');
    document.getElementById('tab-s-events').classList.toggle('hidden', tab !== 's-events');
    document.getElementById('tab-s-appearance').classList.toggle('hidden', tab !== 's-appearance');
  }
  body.querySelectorAll('.mtab').forEach(t => t.onclick = () => switchTab(t.dataset.tab));

  /* ---- ④ 标签大小排序（每个游戏独立 / 全局默认）---- */
  bindTagSizeSettings(body);

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
  const cSync = body.querySelector('#c-sync');
  if (cSync) cSync.onclick = () => { syncNow(); };
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
    // 外观：倒计时颜色分级
    const cdColors = {};
    ['past', 'today', 'soon', 'mid', 'far'].forEach(k => {
      const sw = body.querySelector('.cd-swatch[data-tier="' + k + '"]');
      if (sw) cdColors[k] = (sw.dataset.color || '#6b7280').toUpperCase();
    });
    state.cdColors = cdColors;
    const soonInp = body.querySelector('#s-cd-soon');
    const midInp = body.querySelector('#s-cd-mid');
    if (soonInp) state.cdSoonDays = Math.max(1, Number(soonInp.value) || 10);
    if (midInp) state.cdMidDays = Math.max((state.cdSoonDays || 10) + 1, Number(midInp.value) || 30);
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

  // 外观：倒计时调色板交互
  body.querySelectorAll('.cd-swatch').forEach(sw => {
    sw.onclick = (e) => {
      e.stopPropagation();
      const tier = sw.dataset.tier;
      const pal = body.querySelector('.cd-palette[data-tier="' + tier + '"]');
      if (!pal) return;
      const open = pal.classList.contains('hidden');
      body.querySelectorAll('.cd-palette').forEach(p => p.classList.add('hidden'));
      if (open) pal.classList.remove('hidden');
    };
  });
  body.querySelectorAll('.cd-pal-sw').forEach(ps => {
    ps.onclick = (e) => {
      e.stopPropagation();
      const tier = ps.closest('.cd-palette').dataset.tier;
      setTierColor(body, tier, ps.dataset.col);
    };
  });
  body.querySelectorAll('.cd-color-inp').forEach(ci => {
    ci.oninput = (e) => { e.stopPropagation(); setTierColor(body, ci.closest('.cd-palette').dataset.tier, ci.value, true); };
  });
  body.querySelectorAll('.cd-hex-inp').forEach(hx => {
    hx.oninput = (e) => {
      e.stopPropagation();
      let v = hx.value.trim();
      if (!v.startsWith('#')) v = '#' + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) setTierColor(body, hx.closest('.cd-palette').dataset.tier, v, false, true);
    };
  });

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
