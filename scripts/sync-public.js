const fs = require('fs');
const path = require('path');

const uiDir = path.join(__dirname, '..', 'ui');
const publicDir = path.join(__dirname, '..', 'public');
const iconsDir = path.join(__dirname, '..', 'icons');
const publicIconsDir = path.join(publicDir, 'icons');

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(publicIconsDir)) fs.mkdirSync(publicIconsDir, { recursive: true });

const rootDir = path.join(__dirname, '..');

// Copy all files from ui to public and root
const uiFiles = fs.readdirSync(uiDir);
for (const file of uiFiles) {
  const src = path.join(uiDir, file);
  const destPublic = path.join(publicDir, file);
  const destRoot = path.join(rootDir, file);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, destPublic);
    if (['index.html', 'styles.css', 'app.js', 'sw.js', 'manifest.json', 'logo.svg', 'favicon.ico'].includes(file)) {
      fs.copyFileSync(src, destRoot);
    }
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

console.log('Public assets synchronized successfully to both public/ and root.');
