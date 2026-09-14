// Standalone sampler function — injected into the TOP PAGE via executeScript
// Must have ZERO closures or references to popup.js variables
function startLiveSampler() {
    if (document.getElementById('pip-sampler-overlay')) return;

    // --- Create overlay covering the entire viewport ---
    const overlay = document.createElement('div');
    overlay.id = 'pip-sampler-overlay';
    // Added rgba(0,0,0,0.15) so the user gets visual feedback that sampling started
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,0.15);';

    // --- Create tooltip ---
    const tooltip = document.createElement('div');
    tooltip.id = 'pip-sampler-tooltip';
    tooltip.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;background:#1a1a1c;color:#f0f0f0;padding:6px 10px;border-radius:8px;font-family:monospace;font-size:12px;display:flex;align-items:center;gap:8px;border:1px solid #3f3f46;box-shadow:0 4px 12px rgba(0,0,0,0.4);';

    const swatch = document.createElement('div');
    swatch.style.cssText = 'width:16px;height:16px;border-radius:50%;border:1px solid #3f3f46;flex-shrink:0;';

    const hexText = document.createElement('span');
    hexText.textContent = 'Loading screen...';

    tooltip.appendChild(swatch);
    tooltip.appendChild(hexText);
    document.body.appendChild(overlay);
    document.body.appendChild(tooltip);

    let cachedCanvas = null;
    let cachedCtx = null;

    function rgbaToHex(r, g, b) {
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    // Phase 1: Ask background script for a screenshot of the current visual state
    chrome.runtime.sendMessage({ type: 'request-screenshot' }, (response) => {
        if (!response || !response.dataUrl) {
            hexText.textContent = 'Screenshot failed';
            return;
        }
        const img = new Image();
        img.onload = () => {
            cachedCanvas = document.createElement('canvas');
            cachedCanvas.width = img.width;
            cachedCanvas.height = img.height;
            cachedCtx = cachedCanvas.getContext('2d');
            cachedCtx.drawImage(img, 0, 0);
            hexText.textContent = 'Click to track';
        };
        img.src = response.dataUrl;
    });

    function getAverageColor(cx, cy) {
        if (!cachedCanvas || !cachedCtx) return null;
        try {
            const size = 11;
            const startX = Math.max(0, cx - Math.floor(size/2));
            const startY = Math.max(0, cy - Math.floor(size/2));
            const width = Math.min(size, cachedCanvas.width - startX);
            const height = Math.min(size, cachedCanvas.height - startY);
            
            const imgData = cachedCtx.getImageData(startX, startY, width, height).data;
            let r=0, g=0, b=0, c=0;
            for (let i=0; i<imgData.length; i+=4) {
                r+=imgData[i]; g+=imgData[i+1]; b+=imgData[i+2]; c++;
            }
            if (c===0) return null;
            return rgbaToHex(Math.round(r/c), Math.round(g/c), Math.round(b/c));
        } catch (e) { return null; }
    }

    overlay.addEventListener('mousemove', (e) => {
        tooltip.style.left = (e.clientX + 16) + 'px';
        tooltip.style.top = (e.clientY + 16) + 'px';

        if (!cachedCanvas) return;
        
        // Map viewport coordinates directly to screenshot resolution
        const relX = e.clientX / window.innerWidth;
        const relY = e.clientY / window.innerHeight;
        const cx = Math.floor(relX * cachedCanvas.width);
        const cy = Math.floor(relY * cachedCanvas.height);
        
        const hex = getAverageColor(cx, cy);
        if (hex) {
            swatch.style.backgroundColor = hex;
            hexText.textContent = hex.toUpperCase();
        }
    });

    overlay.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!cachedCanvas) return;

        const relX = e.clientX / window.innerWidth;
        const relY = e.clientY / window.innerHeight;
        const cx = Math.floor(relX * cachedCanvas.width);
        const cy = Math.floor(relY * cachedCanvas.height);
        const hex = getAverageColor(cx, cy);

        // Remove UI
        overlay.remove();
        tooltip.remove();
        document.removeEventListener('keydown', escHandler);

        // Apply immediately locally
        if (hex) {
            const appWrapper = document.querySelector('div[class*="App__Wrapper"]');
            if (appWrapper) appWrapper.style.setProperty('background-color', hex, 'important');
        }

        // Delegate Phase 2 continuous tracking to Background Script
        chrome.runtime.sendMessage({ type: 'start-tracking', relX, relY, initialHex: hex }).catch(()=>{});
    });

    function escHandler(e) {
        if (e.key === 'Escape') {
            overlay.remove();
            tooltip.remove();
            document.removeEventListener('keydown', escHandler);
            chrome.runtime.sendMessage({ type: 'sampler-stopped' }).catch(()=>{});
        }
    }
    document.addEventListener('keydown', escHandler);
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
                chrome.runtime.sendMessage({ type: 'stop-sampler-from-popup' }).catch(() => {});
                liveSamplerBtn.textContent = '\ud83c\udfaf Live Sample';
                liveSamplerBtn.classList.remove('sampler-active');
            } else {
                // Start the sampler — inject into active tab and close popup
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id, allFrames: false },
                        func: startLiveSampler
                    }).then(() => {
                        // Close popup AFTER script is injected
                        window.close();
                    }).catch((err) => {
                        console.error("Injection failed:", err);
                    });
                });
            }
        });
    });
});
