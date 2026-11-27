// PEP Clínico — service worker
// Guarda só o APLICATIVO (a página, as bibliotecas e os ícones), nunca dados de paciente:
// os dados ficam a cargo do próprio app, no IndexedDB, e só se o uso offline
// estiver ligado no aparelho.
//   • página do app (/ e /index.html): rede primeiro — com internet, a versão nova chega na hora;
//     sem internet, abre a última que foi guardada. Outras páginas (ex.: verificar.html) NÃO passam por aqui;
//   • arquivos do próprio site (assinador.js etc.): rede primeiro, com cópia guardada como reserva —
//     assim uma versão nova nunca fica presa atrás de uma cópia velha;
//   • bibliotecas (vendor/) e ícones: guardados e servidos daqui, porque só mudam com a VERSAO;
//   • Supabase: não passa por aqui.
const VERSAO='2026-11-27.2';
const CACHE='pep-'+VERSAO;
const FIXOS=['./vendor/supabase.js','./vendor/jszip.min.js','./vendor/pdf-lib.min.js','./vendor/xlsx.full.min.js','./vendor/qrcode.js',
  './vendor/pdf.min.js','./vendor/pdf.worker.min.js','./icon-192.png','./icon-512.png','./apple-touch-icon.png','./manifest.webmanifest'];
const SHELL=['./','./index.html','./assinador.js',...FIXOS];

self.addEventListener('install',e=>{
  e.waitUntil((async()=>{
    const c=await caches.open(CACHE);
    await Promise.all(SHELL.map(u=>c.add(u).catch(()=>{})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    for(const k of await caches.keys()) if(k.startsWith('pep-')&&k!==CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const paginaDoApp=url=>url.pathname.endsWith('/')||url.pathname.endsWith('/index.html');

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.hostname.endsWith('supabase.co')) return;
  if(url.origin!==self.location.origin) return;                 // CDN (OCR) e demais: direto da rede

  if(req.mode==='navigate'){
    if(!paginaDoApp(url)) return;                               // verificar.html e outras páginas: não mexe
    e.respondWith((async()=>{
      try{
        const r=await fetch(req);
        if(r.ok&&r.type==='basic'){ const c=await caches.open(CACHE); await c.put('./index.html',r.clone()); }
        return r;
      }catch(err){
        return (await caches.match('./index.html'))||(await caches.match('./'))||Response.error();
      }
    })());
    return;
  }

  const fixo=FIXOS.some(f=>new URL(f,self.location).href===url.href);
  e.respondWith((async()=>{
    if(fixo){ const hit=await caches.match(req); if(hit) return hit; }
    try{
      const r=await fetch(req);
      if(r.ok&&r.type==='basic'){ const c=await caches.open(CACHE); c.put(req,r.clone()); }
      return r;
    }catch(err){
      const hit=await caches.match(req);
      if(hit) return hit;
      throw err;
    }
  })());
});
