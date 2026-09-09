
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