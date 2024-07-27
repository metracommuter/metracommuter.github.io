// Caution! Be sure you understand the caveats before publishing an application with
// offline support. See https://aka.ms/blazor-offline-considerations

self.importScripts('./service-worker-assets.js');
self.addEventListener('install', event => event.waitUntil(onInstall(event)));
self.addEventListener('activate', event => event.waitUntil(onActivate(event)));
self.addEventListener('fetch', event => event.respondWith(onFetch(event)));

const cacheNamePrefix = 'offline-cache-';
const cacheName = `${cacheNamePrefix}${self.assetsManifest.version}`;
const offlineAssetsInclude = [/\.dll$/, /\.pdb$/, /\.wasm/, /\.html/, /\.js$/, /\.json$/, /\.css$/, /\.woff$/, /\.png$/, /\.jpe?g$/, /\.gif$/, /\.ico$/, /\.blat$/, /\.dat$/, /\.txt$/];
const offlineAssetsExclude = [/^service-worker\.js$/];

async function onInstall(event) {
	console.info('Service worker: Install');

	// Fetch and cache all matching items from the assets manifest
	const assetsRequests = self.assetsManifest.assets
		.filter(asset => offlineAssetsInclude.some(pattern => pattern.test(asset.url)))
		.filter(asset => !offlineAssetsExclude.some(pattern => pattern.test(asset.url)))
		/*.map(asset => new Request(asset.url, { integrity: asset.hash, cache: 'no-cache' }));*/
		.map(asset => new Request(asset.url));
	await caches.open(cacheName).then(cache => cache.addAll(assetsRequests));
}

async function onActivate(event) {
	console.info('Service worker: Activate');

	// Delete unused caches
	const cacheKeys = await caches.keys();
	await Promise.all(cacheKeys
		.filter(key => key.startsWith(cacheNamePrefix) && key !== cacheName)
		.map(key => caches.delete(key)));
}

async function onFetch(event) {
	let cachedResponse = null;
	if (event.request.method === 'GET') {

		if (event.request.url.indexOf('tripUpdates.json') > -1) {
			fetch(event.request)
				.then(response => {
					// If the request succeeds, clone and store the response in the cache
					const clone = response.clone();
					caches.open(cacheName).then(cache => cache.put(event.request, clone));
					return response;
				})
				.catch(() => {
					// If the request fails, try to get the response from the cache
					return caches.match(event.request);
				})
		}

		// For all navigation requests, try to serve index.html from cache
		// If you need some URLs to be server-rendered, edit the following check to exclude those URLs
		const shouldServeIndexHtml = event.request.mode === 'navigate';

		const request = shouldServeIndexHtml ? 'index.html' : event.request;
		const cache = await caches.open(cacheName);
		cachedResponse = await cache.match(request);
	}

	return cachedResponse || fetch(event.request);
}
/* Manifest version: Fy/9EGoS */
