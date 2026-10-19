const fs = require('fs');
const path = require('path');

const uiDir = path.join(__dirname, '..', 'ui');
const publicDir = path.join(__dirname, '..', 'public');
const iconsDir = path.join(__dirname, '..', 'icons');
const publicIconsDir = path.join(publicDir, 'icons');
const rootDir = path.join(__dirname, '..');

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(publicIconsDir)) fs.mkdirSync(publicIconsDir, { recursive: true });

// Copy all files from ui to public
const uiFiles = fs.readdirSync(uiDir);
for (const file of uiFiles) {
  const src = path.join(uiDir, file);
  const destPublic = path.join(publicDir, file);
  if (fs.statSync(src).isFile()) {
    fs.copyFileSync(src, destPublic);
  }
}

// Copy icons to public/icons
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

// Clean any accidental root client files so Vercel does not treat app.js as a Node serverless function
const rootArtifactsToRemove = ['app.js', 'styles.css', 'sw.js', 'manifest.json', 'index.html', 'robots.txt', 'sitemap.xml', 'logo.svg', 'favicon.ico'];
for (const f of rootArtifactsToRemove) {
  const p = path.join(rootDir, f);
  if (fs.existsSync(p)) {
    try { fs.unlinkSync(p); } catch {}
  }
}

console.log('Public assets synchronized cleanly to public/ and root cleaned for Vercel CDN.');
