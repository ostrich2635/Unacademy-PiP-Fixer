// Helper to convert RGB to Hex
function rgb2hex(rgb) {
  if (/^#[0-9A-F]{6}$/i.test(rgb)) return rgb;
  const rgbMatch = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!rgbMatch) return "#202022";
  function hex(x) {
    return ("0" + parseInt(x).toString(16)).slice(-2);
  }
  return "#" + hex(rgbMatch[1]) + hex(rgbMatch[2]) + hex(rgbMatch[3]);
}

document.addEventListener('DOMContentLoaded', () => {
  const togglePipBtn = document.getElementById('toggle-pip');
  const colorPicker = document.getElementById('bg-color-picker');
  const hexCodeDisplay = document.getElementById('hex-code');

  // Update hex display & apply color instantly when user changes the color picker
  colorPicker.addEventListener('input', (e) => {
    const newColor = e.target.value.toUpperCase();
    hexCodeDisplay.textContent = newColor;
    
    // Apply color to the active tab immediately
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes("unacademy.com")) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (color) => {
            const appWrapper = document.querySelector('div[class*="App__Wrapper"]');
            if (appWrapper) {
              appWrapper.style.backgroundColor = color;
              // Set custom color flag so triggerPiP doesn't override it
              appWrapper.dataset.customColor = "true"; 
            }
          },
          args: [newColor]
        });
      }
    });
  });

  // Get current color from active tab to initialize the popup
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url.includes("unacademy.com")) {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          func: () => {
            const appWrapper = document.querySelector('div[class*="App__Wrapper"]');
            if (appWrapper) {
              return window.getComputedStyle(appWrapper).backgroundColor;
            }
            return null;
          }
        },
        (results) => {
          if (results && results[0] && results[0].result) {
            const hex = rgb2hex(results[0].result);
            colorPicker.value = hex;
            hexCodeDisplay.textContent = hex.toUpperCase();
          }
        }
      );
    }
  });

  // Toggle PiP
  togglePipBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes("unacademy.com")) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id, allFrames: true },
          func: () => {
            const cameraContainer = document.querySelector('div[class*="RectangleCamera__CameraContainer"]');
            const video = cameraContainer ? cameraContainer.querySelector('video') : null;
            const drawingArea = document.getElementById('drawing-area');

            if (!video) {
              alert("No video found to PiP!");
              return;
            }

            if (document.pictureInPictureElement) {
              document.exitPictureInPicture().catch(err => console.error(err));
            } else {
              video.removeAttribute('disablePictureInPicture');
              video.requestPictureInPicture().then(() => {
                if (cameraContainer) cameraContainer.style.display = 'none';
                if (drawingArea) drawingArea.style.width = '82%';
                
                // Background & Sidebar fix when entering PiP
                const appWrapper = document.querySelector('div[class*="App__Wrapper"]');
                const sidebar = document.getElementById('clx-sidebar');

                if (appWrapper) {
                  // Only set to default dark if the user hasn't set a custom color
                  if (!appWrapper.dataset.customColor) {
                    appWrapper.style.backgroundColor = '#202022';
                  }
                }
                if (sidebar) {
                  sidebar.style.display = 'none';
                }
              }).catch(err => {
                console.error("PiP failed to launch:", err);
                alert("Please click anywhere on the video player first to focus the page, then try again.");
              });
            }
          }
        });
      } else {
        alert("This extension only works on Unacademy.");
      }
    });
  });
});
