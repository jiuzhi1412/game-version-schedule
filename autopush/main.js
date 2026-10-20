const { app, Tray, Menu, BrowserWindow, ipcMain, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP_DIR = __dirname;
const CONFIG_PATH = path.join(APP_DIR, 'config.json');
const PUSH_TARGET = 'https://github.com/jiuzhi1412/game-version-schedule.git';

let config = loadConfig();
let tray = null;
let win = null;
let timer = null;
const logs = [];

function loadConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { repo: '', interval: 60, pat: '', ...c };
  } catch (e) {
    return { repo: '', interval: 60, pat: '' };
  }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  config = cfg;
}
function log(msg) {
  const line = `[${new Date().toLocaleString()}] ${msg}`;
  logs.push(line);
  if (logs.length > 300) logs.shift();
  if (win && !win.isDestroyed()) win.webContents.send('log', line);
  console.log(line);
}
function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}
// 仅监测会发布到网页的核心文件（避免误推 .workbuddy/ 等工作区私有文件）
const PUSH_FILES = ['app.js', 'index.html', 'styles.css', 'data/overrides.json', 'autopush'];
function repoDirty(repo) {
  try {
    const s = git(['status', '--porcelain', '--', ...PUSH_FILES], repo).trim();
    return s.length > 0;
  } catch (e) {
    return false;
  }
}
async function pushOnce() {
  if (!config.repo || !config.pat) {
    log('⚠ 未配置 repo 或 pat，已跳过（请在面板填写）');
    return;
  }
  const repo = config.repo;
  if (!repoDirty(repo)) {
    log('· 无改动，跳过');
    return;
  }
  try {
    git(['add', ...PUSH_FILES], repo);
    // 仅当确有暂存改动时才提交（白名单里可能含未改动文件）
    const staged = git(['diff', '--cached', '--name-only'], repo).trim();
    if (!staged) { log('· 无实际改动，跳过'); return; }
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const fileList = staged.replace(/\n/g, ', ');
    git(['commit', '-m', `autopush: 同步 ${fileList} ${ts}`], repo);
    const remote = `https://${config.pat}@github.com/jiuzhi1412/game-version-schedule.git`;
    git(['remote', 'set-url', '--push', 'origin', remote], repo);
    try {
      const out = git(['push', 'origin', 'main'], repo).trim();
      log('✅ 已推送到网页：' + (out || 'ok'));
    } finally {
      git(['remote', 'set-url', '--push', 'origin', PUSH_TARGET], repo);
    }
  } catch (e) {
    log('❌ 推送失败: ' + (e.message || e));
    try { git(['remote', 'set-url', '--push', 'origin', PUSH_TARGET], repo); } catch (_) {}
  }
}
function startTimer() {
  if (timer) clearInterval(timer);
  const sec = Math.max(10, Number(config.interval) || 60);
  timer = setInterval(() => pushOnce(), sec * 1000);
  log(`⏱ 定时器已启动，每 ${sec} 秒检测一次`);
}
function createWindow() {
  win = new BrowserWindow({
    width: 560, height: 600, show: false,
    webPreferences: { preload: path.join(APP_DIR, 'preload.js') }
  });
  win.loadFile(path.join(APP_DIR, 'index.html'));
  win.on('close', (e) => { e.preventDefault(); win.hide(); });
}
function createTray() {
  const iconPath = path.join(APP_DIR, 'icon.png');
  const img = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  tray = new Tray(img);
  const menu = Menu.buildFromTemplate([
    { label: '打开面板', click: () => win.show() },
    { label: '立即同步一次', click: () => pushOnce() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);
  tray.setToolTip('游戏日程自动同步');
  tray.setContextMenu(menu);
  tray.on('click', () => win.show());
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  startTimer();
  pushOnce(); // 启动即检测一次
});

ipcMain.handle('get-state', () => ({ config, logs: logs.slice() }));
ipcMain.handle('save-config', (_e, cfg) => {
  saveConfig(cfg);
  startTimer();
  return true;
});
ipcMain.on('sync-now', () => pushOnce());

// 单实例保护
app.on('window-all-closed', (e) => e.preventDefault());
