let deferredPrompt = null;
let installPromptDismissed = false;
let installPromptDismissedTime = null;
let dotNetRef = null;

// Check if the prompt was already captured before module loaded
if (window.deferredPwaPrompt) {
    deferredPrompt = window.deferredPwaPrompt;
}

// Listen for the beforeinstallprompt event (in case it fires after module loads)
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    window.deferredPwaPrompt = e;
    
    // Notify the Blazor component
    if (dotNetRef) {
        dotNetRef.invokeMethodAsync('OnBeforeInstallPrompt');
    }
});

// Listen for app installed event
window.addEventListener('appinstalled', () => {
    console.log('PWA was installed');
    deferredPrompt = null;
    window.deferredPwaPrompt = null;
    // Clear any dismissal state since app is now installed
    localStorage.removeItem('pwa-install-dismissed');
    if (dotNetRef) {
        dotNetRef.invokeMethodAsync('OnBeforeInstallPrompt');
    }
});

export function initializePwaInstall(dotNetObjectReference) {
    dotNetRef = dotNetObjectReference;
    window.pwaInstallDotNetRef = dotNetObjectReference; // Store globally for early event handling
    
    // Check if prompt was already captured
    if (window.deferredPwaPrompt && !deferredPrompt) {
        deferredPrompt = window.deferredPwaPrompt;
    }
    
    // Check if prompt was previously dismissed
    const dismissedData = localStorage.getItem('pwa-install-dismissed');
    if (dismissedData) {
        const data = JSON.parse(dismissedData);
        installPromptDismissed = data.dismissed;
        installPromptDismissedTime = data.timestamp;
    }
}

// Detect iOS Safari
export function isIosSafari() {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);
    return isIOS && isSafari;
}

export function shouldShowInstallPrompt() {
    // Don't show if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || 
        window.navigator.standalone === true) {
        return false;
    }
    
    const isIOS = isIosSafari();
    
    // For iOS Safari, show prompt if not installed and not dismissed
    if (isIOS) {
        // Don't show if user dismissed it recently (within 7 days)
        if (installPromptDismissed) {
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            const timeSinceDismissal = Date.now() - installPromptDismissedTime;
            if (timeSinceDismissal < sevenDays) {
                return false;
            }
        }
        return true; // Show iOS instructions
    }
    
    // For other browsers, check for beforeinstallprompt event
    // Check global variable if local one is null (might have been captured before module loaded)
    if (!deferredPrompt && window.deferredPwaPrompt) {
        deferredPrompt = window.deferredPwaPrompt;
    }
    
    // Don't show if no install prompt is available
    if (!deferredPrompt) {
        return false;
    }
    
    // Don't show if user dismissed it recently (within 7 days)
    if (installPromptDismissed) {
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        const timeSinceDismissal = Date.now() - installPromptDismissedTime;
        if (timeSinceDismissal < sevenDays) {
            return false;
        }
    }
    
    return true;
}

export async function installPwa() {
    // Check global variable if local one is null
    if (!deferredPrompt && window.deferredPwaPrompt) {
        deferredPrompt = window.deferredPwaPrompt;
    }
    
    if (!deferredPrompt) {
        return false;
    }
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    console.log(`User response to install prompt: ${outcome}`);
    
    // Clear the deferredPrompt variable
    deferredPrompt = null;
    window.deferredPwaPrompt = null;
    
    return outcome === 'accepted';
}

export function dismissInstallPrompt() {
    installPromptDismissed = true;
    installPromptDismissedTime = Date.now();
    localStorage.setItem('pwa-install-dismissed', JSON.stringify({
        dismissed: true,
        timestamp: installPromptDismissedTime
    }));
}

export async function getManifestData() {
    try {
        const response = await fetch('/manifest.webmanifest');
        const manifest = await response.json();
        
        // Get the largest icon
        let icon = 'icon-512.png';
        if (manifest.icons && manifest.icons.length > 0) {
            // Sort by size (descending) and get the largest
            const sortedIcons = manifest.icons
                .filter(icon => icon.sizes)
                .sort((a, b) => {
                    const sizeA = parseInt(a.sizes.split('x')[0]) || 0;
                    const sizeB = parseInt(b.sizes.split('x')[0]) || 0;
                    return sizeB - sizeA;
                });
            if (sortedIcons.length > 0) {
                icon = sortedIcons[0].src;
            }
        }
        
        return {
            name: manifest.name || manifest.short_name || 'App',
            description: manifest.description || '',
            icon: icon
        };
    } catch (error) {
        console.error('Error loading manifest:', error);
        return {
            name: 'Metra Commuter',
            description: 'Your personal Metra commuter rail companion.',
            icon: 'icon-512.png'
        };
    }
}
