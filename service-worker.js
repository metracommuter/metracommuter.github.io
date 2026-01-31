/* Manifest version: dDP2X5wy */
// Caution! Be sure you understand the caveats before publishing an application with
// offline support. See https://aka.ms/blazor-offline-considerations
// Service Worker Version: 2.0.0 - Updated to bypass cache for real-time payload data
// Last updated: 2024

self.importScripts('./service-worker-assets.js');
self.addEventListener('install', event => event.waitUntil(onInstall(event)));
self.addEventListener('activate', event => event.waitUntil(onActivate(event)));
self.addEventListener('fetch', event => event.respondWith(onFetch(event)));

const cacheNamePrefix = 'offline-cache-';
const cacheName = `${cacheNamePrefix}${self.assetsManifest.version}`;
const offlineAssetsInclude = [ /\.dll$/, /\.pdb$/, /\.wasm/, /\.html/, /\.js$/, /\.json$/, /\.css$/, /\.woff$/, /\.png$/, /\.jpe?g$/, /\.gif$/, /\.ico$/, /\.blat$/, /\.dat$/ ];
const offlineAssetsExclude = [ /^service-worker\.js$/, /\/payload\/crowding\.txt$/, /\/payload\/trip_updates\.json$/, /\/payload\/alerts\.json$/ ];

// Replace with your base path if you are hosting on a subfolder. Ensure there is a trailing '/'.
const base = "/";
// Prefixing the base URL with `self.origin` to make the service worker independent of the site's location
const baseUrl = new URL(base, self.origin);
// Mapping the asset URLs to complete URLs using the base URL
const manifestUrlList = self.assetsManifest.assets.map(asset => new URL(asset.url, baseUrl).href);

async function onInstall(event) {
    console.info('Service worker: Install');

    const cache = await caches.open(cacheName);
    
    // Fetch and cache all matching items from the assets manifest
    const assetsToCache = self.assetsManifest.assets
        .filter(asset => offlineAssetsInclude.some(pattern => pattern.test(asset.url)))
        .filter(asset => !offlineAssetsExclude.some(pattern => pattern.test(asset.url)));
    
    // Fetch each asset individually to handle integrity check failures gracefully
    await Promise.all(assetsToCache.map(async (asset) => {
        const url = new URL(asset.url, baseUrl).href;
        try {
            // Try fetching with integrity check first
            const request = new Request(url, { integrity: asset.hash, cache: 'no-cache' });
            await cache.add(request);
        } catch (error) {
            // If integrity check fails, fall back to fetching without integrity
            console.warn(`Integrity check failed for ${asset.url}, falling back to fetch without integrity:`, error);
            try {
                const fallbackRequest = new Request(url, { cache: 'no-cache' });
                await cache.add(fallbackRequest);
            } catch (fallbackError) {
                console.error(`Failed to cache ${asset.url} even without integrity check:`, fallbackError);
            }
        }
    }));
    
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
}

async function onActivate(event) {
    console.info('Service worker: Activate');

    // Delete unused caches
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys
        .filter(key => key.startsWith(cacheNamePrefix) && key !== cacheName)
        .map(key => caches.delete(key)));
    
    // Take control of all clients immediately
    return self.clients.claim();
}

async function onFetch(event) {
    let cachedResponse = null;
    if (event.request.method === 'GET') {
        // Bypass cache for real-time data files
        const url = new URL(event.request.url);
        const isRealTimeData = url.pathname.includes('/payload/crowding.txt') ||
                              url.pathname.includes('/payload/trip_updates.json') ||
                              url.pathname.includes('/payload/alerts.json');
        
        if (isRealTimeData) {
            // Always fetch fresh data for real-time files
            return fetch(event.request);
        }
        
        // For all navigation requests, try to serve index.html from cache,
        // unless that request is for an offline resource.
        // If you need some URLs to be server-rendered, edit the following check to exclude those URLs
        const shouldServeIndexHtml = event.request.mode === 'navigate'
            && !manifestUrlList.some(url => url === event.request.url);

        const request = shouldServeIndexHtml ? 'index.html' : event.request;
        const cache = await caches.open(cacheName);
        cachedResponse = await cache.match(request);
    }

    return cachedResponse || fetch(event.request);
}
