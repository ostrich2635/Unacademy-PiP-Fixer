# Unacademy PiP Fixer 🎥

A lightweight Chrome extension that bypasses Picture-in-Picture (PiP) blocks on Unacademy's video player. It allows you to pop the educator's camera (or the main whiteboard) out into a native, floating, and fully resizable window, completely bypassing the restricted in-browser dragging limits.
![Unacademy PiP Fixer Demo](tutorial.gif)
## ✨ Features
* **Forces Native PiP:** Strips away the `disablePictureInPicture` attributes hidden in the site's code.
* **Fixes Dragging Boundaries:** By moving the video to your OS's native PiP player, you are no longer restricted by the website's invisible HTML padding or CSS boundaries.
* **One-Click Execution:** Click the extension icon to instantly pop the video out.
* **Privacy First:** Requires no logins, tracks no data, and runs entirely locally in your browser.

## 🚀 Installation

Since this extension is not currently on the Chrome Web Store, you can install it manually in just a few seconds:

1. **Download the code:** Download it from the [release page](https://github.com/aISHWARYsINHA/Unacademy-PiP-Fixer/releases) and extract it to a folder on your computer.
2. **Open Extensions:** Open Google Chrome and type `chrome://extensions/` into your address bar.
3. **Enable Developer Mode:** Toggle the **Developer mode** switch in the top-right corner of the page.
4. **Load the Extension:** Click the **Load unpacked** button in the top-left corner and select the folder where you extracted the code.

The extension is now installed and should appear in your Chrome toolbar! (You may need to click the puzzle piece icon 🧩 to pin it).

## 🛠️ Usage

1. Open an Unacademy live class or recorded lesson.
2. **Important:** Click anywhere on the webpage at least once. (Modern browsers require a "user gesture" before allowing PiP to trigger).
3. Click the **Unacademy PiP Fixer** icon in your toolbar or just activate/deactivate Picture-in-Picture mode using **Alt + C** (Windows/Linux) or **Command + Shift + C** (Mac).
4. The educator's camera will instantly pop out into a floating window. You can now resize it and drag it anywhere on your screen.

## 🧠 How It Works

Unacademy houses its video players inside cross-domain `iframes` (usually hosted on `player.uacdn.net`) and uses React to strictly enforce where the video can be dragged. It also actively blocks standard PiP using HTML attributes.

This extension uses Chrome's `scripting` API to inject a small JavaScript payload directly into all frames on the page. It finds the specific styled-component class (`RectangleCamera__CameraContainer`), hides the restrictive HTML box, removes the PiP blocker, and triggers the browser's native `requestPictureInPicture()` method.

## ⚠️ Disclaimer

This is an unofficial tool created for personal accessibility and convenience. It is not affiliated with, endorsed by, or connected to Unacademy. If Unacademy updates their CSS class names or underlying video infrastructure, this extension may require an update to continue functioning. 

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.
