const CACHE_NAME = 'drivescan-v1';
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') return;
  evt.respondWith(
    caches.match(evt.request).then(resp => {
      return resp || fetch(evt.request).then(fetchResp => {
        return caches.open(CACHE_NAME).then(cache => { cache.put(evt.request, fetchResp.clone()); return fetchResp; });
      }).catch(()=> caches.match('/index.html'));
    })
  );
});