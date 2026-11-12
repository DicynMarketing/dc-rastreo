/* Service worker de la app del cliente: solo para mostrar los avisos (no guarda nada en caché). */
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("push",e=>{let d={};try{d=e.data?e.data.json():{}}catch(x){d={body:e.data&&e.data.text()}}
  e.waitUntil(self.registration.showNotification(d.title||"Dicyn Marketing",{body:d.body||"",icon:"../assets/icon-192.png",badge:"../assets/icon-192.png",tag:d.tag||undefined,data:{url:d.url||"./"}}))});
self.addEventListener("notificationclick",e=>{e.notification.close();const url=new URL((e.notification.data&&e.notification.data.url)||"./",self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(l=>{for(const c of l){if(c.url.startsWith(self.registration.scope)&&"focus" in c){return c.focus().then(w=>w&&w.navigate?w.navigate(url):null)}}return self.clients.openWindow(url)}))});
