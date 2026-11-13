// PEP Clínico — service worker
// Guarda só o APLICATIVO (a página e as bibliotecas), nunca dados de paciente:
// os dados ficam a cargo do próprio app, no IndexedDB, e só se o uso offline
// estiver ligado no aparelho.
//   • página: rede primeiro — com internet, a versão nova chega na hora;
//     sem internet, abre a última que foi guardada;
//   • bibliotecas (versão fixa na URL) e ícones: guardados e servidos daqui;
//   • Supabase: não passa por aqui.
const VERSAO='2026-11-13.1';
const CACHE='pep-'+VERSAO;
const SHELL=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const LIBS=[
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    await Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})));
    await Promise.all(LIBS.map(u=>fetch(u,{mode:'cors'}).then(r=>{ if(r.ok) return c.put(u,r); }).catch(()=>{})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    for(const k of await caches.keys()) if(k.startsWith('pep-')&&k!==CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.hostname.endsWith('supabase.co')) return;
  const mesma=url.origin===self.location.origin;
  const pagina=mesma&&(req.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('.html'));
  if(pagina){
    e.respondWith((async()=>{
      try{
        const r=await fetch(req);
        if(r.ok){ const c=await caches.open(CACHE); await c.put('./index.html',r.clone()); }
        return r;
      }catch(err){
        return (await caches.match('./index.html'))||(await caches.match('./'))||Response.error();
      }
    })());
    return;
  }
  if(mesma||LIBS.includes(req.url)){
    e.respondWith((async()=>{
      const hit=await caches.match(req); if(hit) return hit;
      const r=await fetch(req);
      if(r.ok){ const c=await caches.open(CACHE); c.put(req,r.clone()); }
      return r;
    })());
  }
});
