// Pré-consulta de ponta a ponta: paciente responde em consulta.html (com a lógica real da função) e o médico vê no app.
const {chromium}=require('playwright'); const {instalar,dia}=require('./supa-sim.js');
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{execSync}=require('child_process'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..');
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split(/[?#]/)[0]));if(f.endsWith('/'))f+='index.html';
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(d);});}).listen(8767);
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
(async()=>{
  const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'fn-')),'h.mjs');
  execSync(`npx -y esbuild@0.24.0 "${path.join(ROOT,'supabase/functions/agenda-publica/handler.ts')}" --format=esm --outfile="${out}" --log-level=warning`);
  const {handle}=await import('file://'+out);
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  // ---- paciente ----
  const pac=await ctx.newPage(); const errs=[]; pac.on('pageerror',e=>errs.push(e.message));
  const {db}=await instalar(pac);
  const TOK='tokenPessoalDaMariaParaTeste_01'; const a3=db.pep_agenda.find(x=>x.id==='a3'); a3.token_hash=crypto.createHash('sha256').update(TOK).digest('hex');
  const deps={env:{},agora:()=>Date.now(),aleatorio:n=>crypto.randomBytes(n),configPorSlug:async()=>null,
    configPorOwner:async()=>({slug:'slugteste01',config:{ativo:true,nome_publico:'Dr. Teste'}}),ocupados:async()=>[],contarPendentes:async()=>0,contarAtivosTelefone:async()=>0,
    inserir:async()=>({ok:true}),porHash:async h=>db.pep_agenda.find(x=>x.token_hash===h)||null,atualizar:async(id,p)=>Object.assign(db.pep_agenda.find(x=>x.id===id),p)};
  await pac.route('**/functions/v1/agenda-publica',async route=>{ const rq=route.request();
    const r=await handle(new Request('https://x/',{method:rq.method(),body:rq.method()==='POST'?rq.postData():undefined}),deps);
    route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()}); });
  await pac.goto('http://localhost:8767/consulta.html#'+TOK); await pac.waitForTimeout(800);
  ok((await pac.textContent('#bd')).includes('Pré-consulta'),'paciente vê o convite da pré-consulta');
  await pac.click('text=Responder agora'); await pac.waitForTimeout(200);
  await pac.screenshot({path:path.join(os.tmpdir(),'pc-form.png'),fullPage:true});
  await pac.click('text=Enviar respostas'); ok((await pac.textContent('.msg')).includes('motivo'),'pede o motivo');
  await pac.fill('#pc-motivo','Tontura ao levantar'); await pac.fill('#pc-desde','há 10 dias'); await pac.fill('#pc-remedios','Losartana 50 mg 2x/dia\nAAS 100 mg');
  await pac.click('text=Enviar respostas'); ok((await pac.textContent('.msg')).includes('autorização'),'pede autorização');
  for(const [n,v] of [['phq2_0',2],['phq2_1',2],['gad2_0',0],['gad2_1',1]]) await pac.check(`input[name="${n}"][value="${v}"]`);
  await pac.check('#pc-aceite'); await pac.click('text=Enviar respostas'); await pac.waitForTimeout(800);
  ok((await pac.textContent('#bd')).includes('Pré-consulta enviada'),'confirmação para o paciente');
  ok(a3.preconsulta&&a3.preconsulta.motivo==='Tontura ao levantar'&&a3.preconsulta.phq2.join()==='2,2'&&a3.preconsulta.gad2.join()==='0,1'&&a3.preconsulta_em,'gravado no banco');
  await pac.screenshot({path:path.join(os.tmpdir(),'pc-enviada.png'),fullPage:true});
  // ---- médico ----
  const med=await ctx.newPage(); med.on('pageerror',e=>errs.push(e.message)); await med.setViewportSize({width:1280,height:900});
  await med.addInitScript(()=>{ window.confirm=()=>true; window.open=u=>{(window._ab=window._ab||[]).push(u);return null;}; });
  await instalar(med,{db}); await med.goto('http://localhost:8767/index.html'); await med.waitForTimeout(2000);
  await med.click('#btn-pedidos'); await med.waitForTimeout(700);
  ok(await med.isVisible('[data-pc="a3"]')&&(await med.textContent('[data-pc="a3"]')).includes('⚠️'),'chip com alerta (PHQ-2 = 4) nos lembretes');
  await med.click('[data-pc="a3"]'); await med.waitForTimeout(200);
  const corpo=await med.textContent('#pcm-corpo');
  ok(corpo.includes('Tontura')&&corpo.includes('PHQ-9')&&!corpo.includes('GAD-7'),'modal mostra respostas e alerta só do PHQ-2');
  ok(await med.isHidden('#pcm-inserir'),'sem atendimento aberto, não oferece inserir');
  await med.screenshot({path:path.join(os.tmpdir(),'pc-modal.png')});
  await med.click('#m-preconsulta [data-close]');
  await med.click('[data-lembrar="a3"]'); await med.waitForTimeout(600);
  const msg=decodeURIComponent((await med.evaluate(()=>window._ab||[])).pop().split('text=')[1]);
  ok(!msg.includes('responda a pré-consulta'),'lembrete não pede pré-consulta já respondida');
  ok((await med.textContent('#pd-corpo')).includes('pré-consulta'),'chip continua após reenviar');
  // atendimento: consulta de amanhã do mesmo paciente aparece no botão
  await med.click('#btn-agconsultas'); await med.waitForTimeout(300); await med.click('#ag-prox'); await med.waitForTimeout(700);
  ok(await med.isVisible('#ag-corpo [data-pc="a3"]'),'chip na agenda do dia');
  await med.click('[data-atend="p1"]'); await med.waitForTimeout(1200);
  ok(await med.isVisible('text=📝 Pré-consulta'),'botão no atendimento');
  await med.fill('#f-s','Paciente refere tontura.'); await med.click('text=📝 Pré-consulta'); await med.waitForTimeout(200);
  await med.click('#pcm-inserir'); const sv=await med.inputValue('#f-s');
  ok(sv.startsWith('Paciente refere tontura.\n\nPré-consulta respondida')&&sv.includes('Losartana')&&sv.includes('PHQ-2: 4/6 (rastreio positivo'),'insere no Subjetivo sem apagar o que havia');
  await med.click('text=📝 Pré-consulta'); await med.click('#pcm-inserir'); ok((await med.inputValue('#f-s'))===sv,'não duplica');
  console.log('erros:',errs);
  await b.close(); srv.close();
})();
