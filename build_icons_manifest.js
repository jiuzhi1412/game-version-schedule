// 扫描 icons/ 目录下所有图片，重新生成 icons/manifest.json（图库清单）
// 用法：node build_icons_manifest.js
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'icons');
const exts = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);
const files = fs.readdirSync(dir).filter(f => exts.has(path.extname(f).toLowerCase()) && f !== 'manifest.json');
const list = files.map(f => {
  const name = f.replace(/\.\w+$/, '');
  return { file: 'icons/' + f, name };
});
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(list, null, 2) + '\n', 'utf8');
console.log('已生成图标清单，共 ' + list.length + ' 个：');
list.forEach(x => console.log('  ' + x.file + '  (' + x.name + ')'));
