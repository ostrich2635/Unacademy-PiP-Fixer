// Listen for the user to click the extension icon
chrome.action.onClicked.addListener((tab) => {
  runPiPFix(tab);
});

// Listen for the Alt+C command
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "_execute_action") {
    runPiPFix(tab);
  }
});

// Helper function to execute the script
function runPiPFix(tab) {
  chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: triggerPiP
  });
}

// The function that runs inside the actual webpage/iframe
function triggerPiP() {
  const cameraContainer = document.querySelector('div[class*="RectangleCamera__CameraContainer"]');
  const video = cameraContainer ? cameraContainer.querySelector('video') : null;
  const drawingArea = document.getElementById('drawing-area');

  if (!video) return;

  // 1. Toggle Logic
  if (document.pictureInPictureElement) {
    // If already in PiP, exit PiP (the event listener below will handle the layout reset)
    document.exitPictureInPicture().catch(err => console.error(err));
  } else {
    // If not in PiP, enter PiP and modify layout
    video.removeAttribute('disablePictureInPicture');
    video.requestPictureInPicture().then(() => {
      if (cameraContainer) cameraContainer.style.display = 'none';
      if (drawingArea) drawingArea.style.width = '87%';
    }).catch(err => {
      console.error("PiP failed to launch:", err);
      alert("Please click anywhere on the video player first to focus the page, then try Alt+C again.");
    });
  }

  // 2. Cleanup Event Listener (triggers when PiP is closed via shortcut OR the native 'X' button)
  if (!video.dataset.pipListenerAdded) {
    video.addEventListener('leavepictureinpicture', () => {
      // Revert styles to their original CSS state
      if (cameraContainer) cameraContainer.style.display = ''; 
      if (drawingArea) drawingArea.style.width = ''; 
    });
    // Mark that we've added the listener so we don't attach multiple copies
    video.dataset.pipListenerAdded = 'true'; 
  }
}
