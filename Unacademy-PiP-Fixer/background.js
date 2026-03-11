// Listen for the user to click the extension icon
chrome.action.onClicked.addListener((tab) => {
  // Inject the function into the page AND any iframes (player.uacdn.net)
  chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: triggerPiP
  });
});

// The function that runs inside the actual webpage/iframe
function triggerPiP() {
  // 1. Find the specific container box
  const cameraContainer = document.querySelector('div[class*="RectangleCamera__CameraContainer"]');
  
  // 2. Find the video INSIDE that specific container
  const video = cameraContainer ? cameraContainer.querySelector('video') : null;

  if (video) {
    // Hide the original container so it stops getting in the way
    cameraContainer.style.display = 'none';

    // Strip away Unacademy's PiP blocker
    video.removeAttribute('disablePictureInPicture');

    // Force it into Picture-in-Picture
    video.requestPictureInPicture().catch(err => {
      console.error("PiP failed to launch:", err);
      alert("Please click anywhere on the video player first, then click the extension icon again.");
    });
  }
}