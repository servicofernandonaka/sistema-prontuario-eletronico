const {chromium}=require('playwright'); const {instalar}=require('./supa-sim.js');
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const ROOT=path.resolve(__dirname,'..');
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split(/[?#]/)[0]));if(f.endsWith('/'))f+='index.html';
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(d);});}).listen(8766);
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:900},serviceWorkers:'block',permissions:['clipboard-read','clipboard-write']});
  const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await page.addInitScript(()=>{ window.confirm=()=>true; });
  const {db,log}=await instalar(page);
  const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
  await page.goto('http://localhost:8766/index.html'); await page.waitForTimeout(2000);
  await page.click('#btn-agonline'); await page.waitForTimeout(800);
  ok((await page.textContent('#ao-linkbox')).includes('Salvar'),'sem configuração: pede para salvar');
  ok(await page.isChecked('[data-on="1"]') && !(await page.isChecked('[data-on="0"]')),'padrão seg–sex');
  // erro: período invertido
  await page.fill('[data-d="3"][data-p="1"][data-l="b"]','13:00'); await page.click('#ao-salvar'); await page.waitForTimeout(300);
  ok(!db.pep_agenda_config||!db.pep_agenda_config.length,'não salva com período inválido');
  await page.fill('[data-d="3"][data-p="1"][data-l="b"]','',); await page.fill('[data-d="3"][data-p="1"][data-l="a"]','');
  await page.check('[data-on="6"]'); await page.waitForTimeout(100);
  ok(await page.inputValue('[data-d="6"][data-p="0"][data-l="a"]')==='08:00','sábado ligado preenche 08:00–12:00');
  await page.selectOption('#ao-dur','45'); await page.fill('#ao-bde','2026-12-24'); await page.fill('#ao-bate','2026-12-31'); await page.click('#ao-badd');
  await page.click('#ao-salvar'); await page.waitForTimeout(800);
  const reg=(db.pep_agenda_config||[])[0];
  ok(reg&&/^[A-Za-z0-9]{10}$/.test(reg.slug)&&reg.owner_id,'salvou com slug '+(reg&&reg.slug));
  const cf=reg.config;
  ok(cf.duracao_min===45&&cf.dias[3].length===1&&cf.dias[6].length===1&&cf.dias[0].length===0&&cf.bloqueios[0].de==='2026-12-24'&&cf.ativo===false,'config gravada corretamente');
  ok((await page.textContent('#ao-linkbox')).includes('agendar.html?m='+reg.slug),'link aparece');
  ok(await page.evaluate(()=>{const i=document.getElementById('ao-qr');return !!(i&&i.src.startsWith('data:image/png')&&i.naturalWidth>100);}),'QR gerado');
  // ligar sem nome público
  await page.fill('#ao-nome',''); await page.click('#ao-ativo'); await page.waitForTimeout(500);
  ok(!(await page.isChecked('#ao-ativo'))&&db.pep_agenda_config[0].config.ativo===false,'não liga sem nome público');
  await page.fill('#ao-nome','Dr. Teste — Clínica geral'); await page.check('#ao-ativo'); await page.waitForTimeout(900);
  ok(db.pep_agenda_config[0].config.ativo===true,'liga e salva');
  ok((await page.textContent('#ao-prevtx')).includes('5 horário'),'prévia consulta a função: '+(await page.textContent('#ao-prevtx')));
  await page.click('#ao-cop'); ok((await page.evaluate(()=>navigator.clipboard.readText())).endsWith('?m='+reg.slug),'copiar link');
  const s1=reg.slug; await page.click('#ao-trocar'); await page.waitForTimeout(800);
  ok(db.pep_agenda_config[0].slug!==s1&&(await page.textContent('#ao-linkbox')).includes(db.pep_agenda_config[0].slug),'trocar link');
  await page.screenshot({path:path.join(os.tmpdir(),'agonline.png'),fullPage:true});
  // reabrir: carrega o que foi salvo
  await page.click('#btn-pedidos'); await page.waitForTimeout(300); await page.click('#btn-agonline'); await page.waitForTimeout(800);
  ok(await page.inputValue('#ao-dur')==='45'&&await page.isChecked('#ao-ativo')&&(await page.textContent('#ao-bls')).includes('24/12/2026'),'reabre com dados salvos');
  await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(300);
  await page.screenshot({path:path.join(os.tmpdir(),'agonline-celular.png'),fullPage:true});
  ok(await page.evaluate(()=>document.documentElement.scrollWidth)<=390,'sem rolagem horizontal no celular');
  console.log('erros:',errs.filter(e=>!/favicon|Failed to load resource/.test(e)));
  await b.close(); srv.close();
})();
