document.addEventListener('DOMContentLoaded', () => {
    const colorPreview = document.getElementById('colorPreview');
    const hexCodeDisplay = document.getElementById('hexCode');
    const colorPicker = document.getElementById('colorPicker');
    const eyeDropperBtn = document.getElementById('eyeDropperBtn');
    const applyBtn = document.getElementById('applyBtn');
    const resetBtn = document.getElementById('resetBtn');

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

    // Initialize popup with current color from the page
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
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs || tabs.length === 0) return;
            chrome.scripting.executeScript({
                target: {tabId: tabs[0].id, allFrames: true},
                func: setPageBackgroundColor,
                args: [defaultColor]
            });
        });
    });
});
