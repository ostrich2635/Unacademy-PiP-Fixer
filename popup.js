// Standalone sampler function — injected into the page via executeScript
// Must have ZERO closures or references to popup.js variables
function startLiveSampler() {
    // Find the slide image (largest img in the frame — the rendered PDF slide)
    const imgs = document.querySelectorAll('img');
    let slideImg = null;
    let maxArea = 0;

    for (const img of imgs) {
        const rect = img.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > maxArea && area > 10000) {
            maxArea = area;
            slideImg = img;
        }
    }

    if (!slideImg) {
        // No slide image in this frame — just listen for stop command
        chrome.runtime.onMessage.addListener(function handler(msg) {
            if (msg.type === 'stop-sampler') {
                chrome.runtime.onMessage.removeListener(handler);
            }
        });
        return;
    }

    // Prevent duplicate sampler
    if (document.getElementById('pip-sampler-overlay')) return;

    let samplerActive = true;
    let trackingX = 0;
    let trackingY = 0;
    let lastColor = '';
    let lastSrc = '';
    let cachedCanvas = null;
    let cachedCtx = null;
    let pollInterval = null;
    let observer = null;

    // --- Create overlay ---
    const overlay = document.createElement('div');
    overlay.id = 'pip-sampler-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;cursor:crosshair;';

    // --- Create tooltip ---
    const tooltip = document.createElement('div');
    tooltip.id = 'pip-sampler-tooltip';
    tooltip.style.cssText = 'position:fixed;pointer-events:none;z-index:1000000;background:#1a1a1c;color:#f0f0f0;padding:6px 10px;border-radius:8px;font-family:monospace;font-size:12px;display:flex;align-items:center;gap:8px;border:1px solid #3f3f46;box-shadow:0 4px 12px rgba(0,0,0,0.4);';

    const swatch = document.createElement('div');
    swatch.style.cssText = 'width:16px;height:16px;border-radius:50%;border:1px solid #3f3f46;flex-shrink:0;';

    const hexText = document.createElement('span');
    hexText.textContent = 'Loading slide...';

    tooltip.appendChild(swatch);
    tooltip.appendChild(hexText);
    document.body.appendChild(overlay);
    document.body.appendChild(tooltip);

    function rgbaToHex(r, g, b) {
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    // Load the slide image with CORS so we can read pixels
    function loadSlideImage(callback) {
        const currentSrc = slideImg.src;
        if (currentSrc === lastSrc && cachedCanvas) {
            callback(true);
            return;
        }

        const newImg = new Image();
        newImg.crossOrigin = 'anonymous';
        newImg.onload = () => {
            cachedCanvas = document.createElement('canvas');
            cachedCanvas.width = newImg.naturalWidth;
            cachedCanvas.height = newImg.naturalHeight;
            cachedCtx = cachedCanvas.getContext('2d');
            cachedCtx.drawImage(newImg, 0, 0);
            lastSrc = currentSrc;
            callback(true);
        };
        newImg.onerror = () => callback(false);
        newImg.src = currentSrc;
    }

    // Read pixel from cached canvas at client coordinates
    function getPixelAt(clientX, clientY) {
        if (!cachedCanvas || !cachedCtx) return null;

        const rect = slideImg.getBoundingClientRect();
        const scaleX = cachedCanvas.width / rect.width;
        const scaleY = cachedCanvas.height / rect.height;
        const cx = Math.round((clientX - rect.left) * scaleX);
        const cy = Math.round((clientY - rect.top) * scaleY);
        const clampedX = Math.max(0, Math.min(cx, cachedCanvas.width - 1));
        const clampedY = Math.max(0, Math.min(cy, cachedCanvas.height - 1));

        try {
            const pixel = cachedCtx.getImageData(clampedX, clampedY, 1, 1).data;
            return { hex: rgbaToHex(pixel[0], pixel[1], pixel[2]), cx: clampedX, cy: clampedY };
        } catch (e) {
            return null;
        }
    }

    // Read pixel from cached canvas at stored image coordinates
    function readTrackedPixel() {
        if (!cachedCanvas || !cachedCtx) return null;
        try {
            const pixel = cachedCtx.getImageData(trackingX, trackingY, 1, 1).data;
            return rgbaToHex(pixel[0], pixel[1], pixel[2]);
        } catch (e) {
            return null;
        }
    }

    function applyColor(hex) {
        if (!hex || hex === lastColor) return;
        lastColor = hex;
        const appWrapper = document.querySelector('div[class*="App__Wrapper"]');
        if (appWrapper) {
            appWrapper.style.setProperty('background-color', hex, 'important');
        }
        chrome.runtime.sendMessage({ type: 'sampler-color-update', color: hex });
    }

    // Initial load of slide image
    loadSlideImage((ok) => {
        hexText.textContent = ok ? 'Click to track a pixel' : 'Failed to load slide';
    });

    // ===== PHASE 1: Pixel selection =====

    overlay.addEventListener('mousemove', (e) => {
        tooltip.style.left = (e.clientX + 16) + 'px';
        tooltip.style.top = (e.clientY + 16) + 'px';

        const result = getPixelAt(e.clientX, e.clientY);
        if (result) {
            swatch.style.backgroundColor = result.hex;
            hexText.textContent = result.hex.toUpperCase();
        }
    });

    overlay.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const result = getPixelAt(e.clientX, e.clientY);
        if (!result) {
            hexText.textContent = '\u26a0 Try again!';
            setTimeout(() => { hexText.textContent = 'Click to track'; }, 1500);
            return;
        }

        // Lock coordinates
        trackingX = result.cx;
        trackingY = result.cy;

        // Remove selection UI
        overlay.remove();
        tooltip.remove();

        // Apply initial color
        applyColor(result.hex);

        // Notify background
        chrome.runtime.sendMessage({ type: 'sampler-started' });

        // ===== PHASE 2: Continuous tracking =====
        startTracking();
    });

    // Escape to cancel
    function escHandler(e) {
        if (e.key === 'Escape') {
            cleanup();
            document.removeEventListener('keydown', escHandler);
        }
    }
    document.addEventListener('keydown', escHandler);

    function startTracking() {
        // Watch for slide changes (img src attribute changes)
        observer = new MutationObserver(() => {
            loadSlideImage((ok) => {
                if (ok) {
                    const hex = readTrackedPixel();
                    applyColor(hex);
                }
            });
        });
        observer.observe(slideImg, { attributes: true, attributeFilter: ['src'] });

        // Also poll every second as backup
        pollInterval = setInterval(() => {
            if (!samplerActive) return;
            if (slideImg.src !== lastSrc) {
                loadSlideImage((ok) => {
                    if (ok) {
                        const hex = readTrackedPixel();
                        applyColor(hex);
                    }
                });
            }
        }, 1000);
    }

    function cleanup() {
        samplerActive = false;
        if (pollInterval) clearInterval(pollInterval);
        if (observer) observer.disconnect();
        const o = document.getElementById('pip-sampler-overlay');
        if (o) o.remove();
        const t = document.getElementById('pip-sampler-tooltip');
        if (t) t.remove();
        chrome.runtime.sendMessage({ type: 'sampler-stopped' });
    }

    // Listen for stop command from popup/background
    chrome.runtime.onMessage.addListener(function stopHandler(msg) {
        if (msg.type === 'stop-sampler') {
            cleanup();
            chrome.runtime.onMessage.removeListener(stopHandler);
        }
    });
}


// ===== Main popup logic =====
document.addEventListener('DOMContentLoaded', () => {
    const colorPreview = document.getElementById('colorPreview');
    const hexCodeDisplay = document.getElementById('hexCode');
    const colorPicker = document.getElementById('colorPicker');
    const eyeDropperBtn = document.getElementById('eyeDropperBtn');
    const applyBtn = document.getElementById('applyBtn');
    const resetBtn = document.getElementById('resetBtn');
    const liveSamplerBtn = document.getElementById('liveSamplerBtn');

    // Default Unacademy dark mode color
    const defaultColor = '#202022';

    // Function to convert RGB to Hex
    function rgbToHex(rgb) {
        if (!rgb || rgb === 'rgba(0, 0, 0, 0)') return null;
        let match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!match) {
            match = rgb.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/);
        }
        if (!match) return null;
        
        function hex(x) {
            return ("0" + parseInt(x).toString(16)).slice(-2);
        }
        return "#" + hex(match[1]) + hex(match[2]) + hex(match[3]);
    }

    // Function injected into the page to get the background color
    function getPageBackgroundColor() {
        const appWrapper = document.querySelector('div[class*="App__Wrapper"]');
        if (appWrapper) {
            return window.getComputedStyle(appWrapper).backgroundColor;
        }
        return window.getComputedStyle(document.body).backgroundColor;
    }

    // Function injected into the page to set the background color
    function setPageBackgroundColor(color) {
        const appWrapper = document.querySelector('div[class*="App__Wrapper"]');
        if (appWrapper) {
            appWrapper.style.setProperty('background-color', color, 'important');
        } else {
            document.body.style.setProperty('background-color', color, 'important');
        }
    }

    // Initialize popup with saved color or fallback to current color from the page
    chrome.storage.local.get(['savedColor'], (storageResult) => {
        if (storageResult.savedColor) {
            updateUI(storageResult.savedColor);
        } else {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (!tabs || tabs.length === 0) return;
                
                chrome.scripting.executeScript({
                    target: {tabId: tabs[0].id, allFrames: true},
                    func: getPageBackgroundColor,
                }, (results) => {
                    if (chrome.runtime.lastError || !results || !results[0]) {
                        console.error("Error getting background color", chrome.runtime.lastError);
                        return;
                    }
                    
                    let rgbColor = results[0].result;
                    let hex = rgbToHex(rgbColor);
                    
                    if (!hex) {
                        hex = defaultColor; // fallback
                    }

                    // Update UI
                    updateUI(hex);
                });
            });
        }
    });

    // Check if sampler is currently active and update button state
    chrome.storage.local.get(['samplerActive'], (result) => {
        if (result.samplerActive) {
            liveSamplerBtn.textContent = '\u23f9 Stop Sampling';
            liveSamplerBtn.classList.add('sampler-active');
        }
    });

    function updateUI(color) {
        colorPreview.style.backgroundColor = color;
        hexCodeDisplay.textContent = color.toUpperCase();
        colorPicker.value = color;
    }

    // When user picks a new color in the color picker
    colorPicker.addEventListener('input', (e) => {
        const newColor = e.target.value;
        updateUI(newColor);
    });

    // EyeDropper API support
    if (!window.EyeDropper) {
        eyeDropperBtn.style.display = 'none';
    } else {
        eyeDropperBtn.addEventListener('click', async () => {
            const eyeDropper = new EyeDropper();
            try {
                const result = await eyeDropper.open();
                updateUI(result.sRGBHex);
            } catch (e) {
                // User canceled the eyedropper
                console.log(e);
            }
        });
    }

    // When user clicks Apply
    applyBtn.addEventListener('click', () => {
        const selectedColor = colorPicker.value;
        chrome.storage.local.set({ savedColor: selectedColor });
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs || tabs.length === 0) return;
            chrome.scripting.executeScript({
                target: {tabId: tabs[0].id, allFrames: true},
                func: setPageBackgroundColor,
                args: [selectedColor]
            });
        });
    });

    // When user clicks Reset
    resetBtn.addEventListener('click', () => {
        updateUI(defaultColor);
        chrome.storage.local.set({ savedColor: defaultColor });
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs || tabs.length === 0) return;
            chrome.scripting.executeScript({
                target: {tabId: tabs[0].id, allFrames: true},
                func: setPageBackgroundColor,
                args: [defaultColor]
            });
        });
    });

    // Live Sampler button
    liveSamplerBtn.addEventListener('click', () => {
        chrome.storage.local.get(['samplerActive'], (result) => {
            if (result.samplerActive) {
                // Stop the sampler
                chrome.runtime.sendMessage({ type: 'stop-sampler-from-popup' });
                liveSamplerBtn.textContent = '\ud83c\udfaf Live Sample';
                liveSamplerBtn.classList.remove('sampler-active');
            } else {
                // Start the sampler — inject into active tab and close popup
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (!tabs || tabs.length === 0) return;
                    chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id, allFrames: true },
                        func: startLiveSampler
                    });
                    window.close();
                });
            }
        });
    });
});
