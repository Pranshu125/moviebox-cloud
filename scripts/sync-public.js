const fs = require('fs');
const path = require('path');

const uiDir = path.join(__dirname, '..', 'ui');
const publicDir = path.join(__dirname, '..', 'public');
const iconsDir = path.join(__dirname, '..', 'icons');
const publicIconsDir = path.join(publicDir, 'icons');

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(publicIconsDir)) fs.mkdirSync(publicIconsDir, { recursive: true });

// Copy all files from ui to public
const uiFiles = fs.readdirSync(uiDir);
for (const file of uiFiles) {
  const src = path.join(uiDir, file);
  const dest = path.join(publicDir, file);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, dest);
  }
}

// Copy icons
if (fs.existsSync(iconsDir)) {
  const iconFiles = fs.readdirSync(iconsDir);
  for (const file of iconFiles) {
    const src = path.join(iconsDir, file);
    const dest = path.join(publicIconsDir, file);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, dest);
    }
  }
}

console.log('Public assets synchronized successfully.');
