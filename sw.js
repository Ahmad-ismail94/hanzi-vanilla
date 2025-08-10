const CACHE='hanzi-vanilla-v1';
function basePath(){const p=new URL(self.registration.scope).pathname.replace(/\/$/,'');return p===''?'':p;}
const BASE=basePath();
const CORE=[`${BASE}/`,`${BASE}/index.html`,`${BASE}/manifest.webmanifest`,`${BASE}/data/words-50.json`,`${BASE}/data/strokes/characters.json`,
`${BASE}/js/app.js`,`${BASE}/js/audio.js`,`${BASE}/js/srs.js`,`${BASE}/js/draw-rdp.js`,`${BASE}/js/draw-frechet.js`,`${BASE}/js/draw-capture.js`,`${BASE}/js/validate.js`];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))) });
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;e.respondWith(caches.match(r).then(res=>res||fetch(r).then(net=>{const copy=net.clone();caches.open(CACHE).then(c=>c.put(r,copy));return net;}).catch(()=>caches.match(`${BASE}/index.html`))))});