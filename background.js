
// ===== Screenshot-based Live Tracker =====
let trackingTabId = null;
let trackingRelX = 0;
let trackingRelY = 0;
let trackingInterval = null;
let lastTrackedHex = '';

function rgbaToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function stopTracking() {
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
    trackingTabId = null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'request-screenshot') {
        chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, (dataUrl) => {
            sendResponse({ dataUrl });
        });
        return true; // Keep channel open for async response
        
    } else if (msg.type === 'start-tracking') {
        trackingTabId = sender.tab.id;
        trackingRelX = msg.relX;
        trackingRelY = msg.relY;
        lastTrackedHex = msg.initialHex;

        chrome.storage.local.set({ samplerActive: true });
        
        stopTracking();
        trackingInterval = setInterval(async () => {
            if (!trackingTabId) return;
            try {
                const tab = await chrome.tabs.get(trackingTabId);
                if (!tab) { stopTracking(); return; }
                
                // Screenshot the entire visual tab viewport
                const dataUrl = await new Promise(resolve => {
                    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 10 }, resolve);
                });
                if (!dataUrl) return;

                // Load screenshot into OffscreenCanvas in background worker
                const response = await fetch(dataUrl);
                const blob = await response.blob();
                const bitmap = await createImageBitmap(blob);
                
                const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(bitmap, 0, 0);
                
                // Map top-window relative coordinates directly to screenshot dimensions
                const cx = Math.floor(trackingRelX * bitmap.width);
                const cy = Math.floor(trackingRelY * bitmap.height);
                
                const size = 11;
                const startX = Math.max(0, cx - Math.floor(size/2));
                const startY = Math.max(0, cy - Math.floor(size/2));
                const w = Math.min(size, bitmap.width - startX);
                const h = Math.min(size, bitmap.height - startY);
                
                const imgData = ctx.getImageData(startX, startY, w, h).data;
                let r=0, g=0, b=0, c=0;
                for(let i=0; i<imgData.length; i+=4) {
                    r+=imgData[i]; g+=imgData[i+1]; b+=imgData[i+2]; c++;
                }
                if (c===0) return;
                r = Math.round(r/c); g = Math.round(g/c); b = Math.round(b/c);
                const hex = rgbaToHex(r, g, b);
                
                if (hex && hex !== lastTrackedHex) {
                    lastTrackedHex = hex;
                    chrome.storage.local.set({ savedColor: hex });
                    // Execute in ALL frames to catch the App__Wrapper wherever it is
                    chrome.scripting.executeScript({
                        target: { tabId: trackingTabId, allFrames: true },
                        func: (color) => {
                            const appWrapper = document.querySelector('div[class*="App__Wrapper"]');
                            if (appWrapper) appWrapper.style.setProperty('background-color', color, 'important');
                        },
                        args: [hex]
                    }).catch(()=>{});
                }
            } catch (e) {
                // Ignore tab removed errors
            }
        }, 500); // 500ms loop — smooth and reliable
        
    } else if (msg.type === 'sampler-stopped' || msg.type === 'stop-sampler-from-popup') {
        stopTracking();
        chrome.storage.local.set({ samplerActive: false });
        if (msg.type === 'stop-sampler-from-popup') {
            // Forward stop command to active tab
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs && tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { type: 'stop-sampler' }).catch(() => {});
                }
            });
        }
    }
    return true;
});

// Listen for commands
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "toggle-pip") {
    runPiPFix(tab, false);
  } else if (command === "toggle-layout") {
    runPiPFix(tab, true);
  }
});

// Helper function to execute the script
function runPiPFix(tab, skipPiP) {
  chrome.storage.local.get(['savedColor'], (result) => {
    const color = result.savedColor || '#202022';
    chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: triggerPiP,
      args: [color, skipPiP]
    });
  });
}

// The function that runs inside the actual webpage/iframe
function triggerPiP(bgColor, skipPiP) {
  const cameraContainer = document.querySelector('div[class*="CameraContainer"]');
  const video = cameraContainer ? cameraContainer.querySelector('video') : null;
  const drawingArea = document.getElementById('drawing-area');
  const appWrapper = document.querySelector('div[class*="App__Wrapper"]');
  const sidebar = document.getElementById('clx-sidebar');

  if (skipPiP) {
    // Manual layout toggle without PiP
    if (appWrapper && appWrapper.dataset.layoutToggled === 'true') {
      // Revert layout
      if (drawingArea) {
        drawingArea.style.width = '';
        drawingArea.style.height = '';
        drawingArea.style.maxWidth = '';
        drawingArea.style.maxHeight = '';
        drawingArea.style.display = '';
        drawingArea.style.justifyContent = '';
        drawingArea.style.alignItems = '';
      }
      if (appWrapper) {
        appWrapper.style.removeProperty('background-color');
        delete appWrapper.dataset.layoutToggled;
      }
      if (sidebar) {
        sidebar.style.display = ''; 
      }
    } else {
      // Apply layout
      // Maximize drawing area to fill space
      if (drawingArea) {
        drawingArea.style.width = '100vw';
        drawingArea.style.height = '100vh';
        drawingArea.style.maxWidth = '100%';
        drawingArea.style.maxHeight = '100%';
        drawingArea.style.display = 'flex';
        drawingArea.style.justifyContent = 'center';
        drawingArea.style.alignItems = 'center';
      }
      
      if (appWrapper) {
        appWrapper.style.setProperty('background-color', bgColor, 'important');
        appWrapper.dataset.layoutToggled = 'true';
      }
      if (sidebar) {
        sidebar.style.display = 'none'; 
      }
      if (!document.getElementById('pip-fixer-style')) {
        let style = document.createElement('style');
        style.id = 'pip-fixer-style';
        style.innerHTML = `*, *::before, *::after { box-shadow: none !important; }`;
        document.head.appendChild(style);
      }
    }
    return;
  }

  if (!video) return;

  // 1. Toggle Logic for PiP
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(err => console.error(err));
  } else {
    video.removeAttribute('disablePictureInPicture');
    video.requestPictureInPicture().then(() => {
      if (cameraContainer) cameraContainer.style.display = 'none';
      if (drawingArea) drawingArea.style.width = '82%';
    }).catch(err => {
      console.error("PiP failed to launch:", err);
      alert("Please click anywhere on the video player first to focus the page, then try Alt+C again.");
    });
  }

  // 2. Cleanup Event Listener
  if (!video.dataset.pipListenerAdded) {
    video.addEventListener('leavepictureinpicture', () => {
      if (cameraContainer) cameraContainer.style.display = ''; 
      if (drawingArea) drawingArea.style.width = ''; 
    });
    video.dataset.pipListenerAdded = 'true'; 
  }

  // 3. Styling fixes
  if (appWrapper) {
    appWrapper.style.setProperty('background-color', bgColor, 'important');
  }
  if (sidebar) {
    sidebar.style.display = 'none';
  }
  if (!document.getElementById('pip-fixer-style')) {
    let style = document.createElement('style');
    style.id = 'pip-fixer-style';
    style.innerHTML = `*, *::before, *::after { box-shadow: none !important; }`;
    document.head.appendChild(style);
  }
}