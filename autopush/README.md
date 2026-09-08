# 游戏日程 · 本地自动同步工具

把你在网页上的「内容编辑」自动推送到 GitHub Pages，让任何人（不登录、新设备）打开网页都和你编辑后一致。

## 它解决什么

你编辑的数据原本只存在浏览器 `localStorage`，别人/新设备打开看不到。之前的方案是手动「📤 发布」把 `overrides.json` 发给我、我写仓库再推送。这个工具把最后一步**自动化**：本地常驻，定时检测 `data/overrides.json` 有无改动，有就自动提交并推送，无就不动。

## 架构

```
网页（你的编辑）
  └─「💾 保存到本机仓库」按钮（File System Access API）
       └─ 写入 仓库/data/overrides.json
            └─ 本工具（托盘常驻，每 N 秒检测 git 改动）
                 └─ 有改动 → git commit + git push → GitHub Pages 部署 → 所有人一致
```

- 仅自动推送 `data/overrides.json`（你的编辑）。代码改动（`app.js` 等）不走这个工具，仍由你手动控制。
- PAT 存在本机 `autopush/config.json`（已被 `.gitignore` 排除，不会进仓库）。

## 使用步骤

### 1. 安装依赖（首次）
```bash
cd autopush
npm install        # 安装 electron（约几百 MB，需联网）
```

### 2. 配置（面板填写，或手动建 config.json）
```json
{
  "repo": "D:/Jiuzhi/Documents/WorkBuddy/2026-08-16-19-06-27/game-version-schedule",
  "interval": 60,
  "pat": "github_pat_你的token"
}
```
或在运行后托盘 → 打开面板，填三项点「保存并应用」。

> PAT 建议用 **细粒度 token**，仅授予 `jiuzhi1412/game-version-schedule` 仓库的 `contents` 读写权限。

### 3. 运行
```bash
npm start
```
启动后托盘出现图标，面板显示检测日志。工具启动即检测一次，之后每 `interval` 秒检测一次。

### 4. 网页端一键落库
打开网页（需 **https 或 localhost** 安全上下文，`file://` 下浏览器不允许写本机文件，会退化为下载），点顶栏「⬇ 数据 → 💾 保存到本机仓库」：
- 首次会让你选仓库根目录（含 `data/` 的那个），之后记住。
- 它会把你的编辑写成 `data/overrides.json`，本工具下一轮检测即自动推送。

若你用 `file://` 直接打开网页：点「📤 发布我的编辑到网页」下载 `overrides.json`，手动覆盖到仓库 `data/` 目录，工具下一轮自动推送。

## 安全说明

- `config.json` 含 PAT，**已加入 `.gitignore`，切勿提交到仓库**（否则 token 泄露）。
- 推送后工具会立即把 git 的 push URL 还原为干净地址，token 不会残留在仓库配置。
- 仅监控 `data/overrides.json` 一个文件，不会动你的其他仓库内容。

## 退出

托盘右键 → 退出。
