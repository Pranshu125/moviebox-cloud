# MovieBox Studio — Vercel Cloud Deployment & Mobile PWA Guide

Run MovieBox Studio 24/7 on your iPhone, iPad, Android device, or Smart TV from anywhere in the world without opening `cmd` or keeping your computer on.

---

## 1. Quick Deploy Methods

### Method 1: Deploy via GitHub (Recommended & Easiest)

1. **Create a GitHub Repository:**
   - Go to [github.com/new](https://github.com/new) and create a new repository (name it `moviebox-cloud` or any name you prefer). You can make it **Private** or **Public**.

2. **Push this directory to your repository:**
   Open a command prompt or terminal in `D:\Home Theater\MovieBox_Windows_x64` and run:
   ```cmd
   git init
   git add .
   git commit -m "Deploy MovieBox Studio Liquid Glass & Claymorphism PWA"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/moviebox-cloud.git
   git push -u origin main
   ```
   *(Note: The included `.vercelignore` automatically prevents large Windows executables from uploading, keeping the repository light and fast).*

3. **Deploy on Vercel:**
   - Log into [vercel.com](https://vercel.com) (free account).
   - Click **Add New...** -> **Project**.
   - Select your `moviebox-cloud` repository and click **Import**.
   - Keep all default settings (the included `vercel.json` and `package.json` configure everything automatically).
   - Click **Deploy**.

4. **Done:**
   - Within 60 seconds, Vercel will give you a live production URL:
     `https://moviebox-cloud.vercel.app`

---

### Method 2: Deploy directly from your PC with 1 Click

Double-click the newly created launcher:
- [Deploy-To-Vercel.bat](file:///d:/Home%20Theater/MovieBox_Windows_x64/Deploy-To-Vercel.bat)

This script automatically synchronizes your static assets, runs `npx vercel --prod`, and provides your live cloud URL.

---

## 2. How to Run as a Native App on Your Phone

Once your Vercel URL is live:

### On iPhone & iPad (Safari):
1. Open your Vercel URL in Safari (e.g. `https://moviebox-cloud.vercel.app`).
2. Tap the **Share** button (box with an arrow pointing up) at the bottom of the screen.
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add** in the top-right corner.
5. Tap the new **MovieBox** icon on your home screen. It will open in full-screen standalone mode with zero browser address bars, native gestures, and smooth claymorphic touch feedback!

### On Android (Chrome):
1. Open your Vercel URL in Google Chrome.
2. Tap the **Install App** button in the topbar or tap Chrome's three dots menu (⋮).
3. Select **Install app** or **Add to Home Screen**.
4. The MovieBox icon will install to your app drawer and home screen.

---

## 3. What Features Work in Cloud Mode

| Feature | Local PC Mode | Vercel Cloud Mode (Phone) |
| :--- | :--- | :--- |
| **MovieBox Global Streaming** | Full 4K / 1080p | Full 4K / 1080p |
| **MovieBox Real-Time Search & Details** | Supported | Supported |
| **NetMirror Integration** | Supported | Supported |
| **GaiaFlix 260+ Live TV Channels** | Supported | Supported |
| **Real-Time Live Sports Feeds** | Supported | Supported |
| **PWA App Offline Caching** | Supported | Supported |
| **Video Player (Loading ring, gestures, EQ)** | Supported | Supported |
| **Local Hard Drive (`D:\Home Theater`)** | Supported | N/A (Cloud Mode) |
| **VLC Player Desktop Spawn** | Supported | N/A (Web & Phone Player) |

---

## 4. Design Upgrades Included

- **Liquid Glass:** Refractive backdrop blur, translucent specular edge highlights, and glossy acrylic light sheens.
- **Claymorphism:** Tactile 3D puffy pill buttons, dual inner shadows (top-left specular highlight + bottom-right depth shadow), and smooth squishy click depression.
- **Deep Matte Obsidian Canvas:** Minimizes glare and delivers striking contrast against the glowing glass and clay elements.
