// Portal do paciente de ponta a ponta: o médico envia o acesso; o paciente entra, confirma, baixa, marca e sai; o médico vê o histórico.
const {chromium}=require('playwright'); const {instalar,USER}=require('./supa-sim.js');
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{execSync}=require('child_process'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..');
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split(/[?#]/)[0]));if(f.endsWith('/'))f+='index.html';
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(d);});}).listen(8769);
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const shot=(pg,n,full=true)=>pg.screenshot({path:path.join(os.tmpdir(),n+'.png'),fullPage:full});
(async()=>{
  const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'fn-')),'p.mjs');
  execSync(`npx -y esbuild@0.24.0 "${path.join(ROOT,'supabase/functions/portal-paciente/handler.ts')}" --bundle --format=esm --platform=neutral --outfile="${out}" --log-level=warning`);
  const {handle}=await import('file://'+out);
  const b=await chromium.launch(); const ctx=await b.newContext({serviceWorkers:'block'}); const errs=[];
  // ---------- médico ----------
  const med=await ctx.newPage(); await med.setViewportSize({width:1280,height:900}); med.on('pageerror',e=>errs.push('med: '+e.message));
  await med.addInitScript(()=>{ window.confirm=()=>true; window.open=u=>{(window._ab=window._ab||[]).push(u);return null;}; });
  const {db,log}=await instalar(med);
  db.pep_agenda_config=[{owner_id:USER.id,slug:'slugteste01',config:{ativo:true,nome_publico:'Dr. Teste',modo:'aprovar',duracao_min:30,antecedencia_horas:0,janela_dias:14,
    dias:{0:[['08:00','18:00']],1:[['08:00','18:00']],2:[['08:00','18:00']],3:[['08:00','18:00']],4:[['08:00','18:00']],5:[['08:00','18:00']],6:[['08:00','18:00']]}}}];
  await med.goto('http://localhost:8769/index.html'); await med.waitForTimeout(1800);
  await med.evaluate(()=>abrirPacientePorId('p1',false)); await med.waitForTimeout(1200);
  ok((await med.textContent('#card-portal')).includes('sem acesso'),'ficha mostra o quadro do portal (sem acesso)');
  await med.click('#pt-conv'); await med.waitForTimeout(800);
  const wa=(await med.evaluate(()=>window._ab||[])).pop()||''; const txt=decodeURIComponent(wa.split('text=')[1]||'');
  const conv=(txt.match(/portal\.html#c=([A-Za-z0-9_-]+)/)||[])[1];
  ok(wa.includes('wa.me/5511988887777')&&conv&&db.pep_portal_convites.length===1&&db.pep_portal_convites[0].token_hash===crypto.createHash('sha256').update(conv).digest('hex'),'convite pelo WhatsApp (só o hash no banco)');
  ok((await med.textContent('#card-portal')).includes('convite enviado'),'quadro passa para "convite enviado"');
  await shot(med,'portal-ficha',false);
  // documento enviado vai para o portal
  await med.evaluate(()=>guardarNoPortal({arquivo:{bytes:new Uint8Array(2000),nome:'receita-maria.pdf'}},pacienteSel,'Receita simples'));
  ok(db.pep_portal_docs&&db.pep_portal_docs.length===1&&db.pep_portal_docs[0].storage_path.startsWith(USER.id+'/p1/')&&db._storage.some(x=>x.includes('portal-documentos/'+USER.id+'/p1/')),'cópia do documento guardada na pasta do médico');
  await med.evaluate(()=>{ const e={arquivo:{bytes:new Uint8Array(10),nome:'x.pdf'}}; return guardarNoPortal(e,pacienteSel,'A').then(()=>guardarNoPortal(e,pacienteSel,'A')); });
  ok(db.pep_portal_docs.length===2,'o mesmo envio não é guardado duas vezes');
  db.pep_portal_docs.pop();
  // ---------- paciente ----------
  const pac=await ctx.newPage(); await pac.setViewportSize({width:390,height:844}); pac.on('pageerror',e=>errs.push('pac: '+e.message));
  await pac.addInitScript(()=>{ window.confirm=()=>true; window.alert=m=>{(window._al=window._al||[]).push(m);}; });
  const T=n=>db[n]=db[n]||[];
  const deps={env:{},agora:()=>Date.now(),aleatorio:n=>crypto.randomBytes(n),
    convitePorHash:async h=>T('pep_portal_convites').find(x=>x.token_hash===h)||null,
    atualizarConvite:async(id,p)=>Object.assign(T('pep_portal_convites').find(x=>x.id===id),p),
    paciente:async id=>db.pep_pacientes.find(x=>x.id===id)||null,
    criarSessao:async r=>{ const id='s'+crypto.randomBytes(3).toString('hex'); T('pep_portal_sessoes').push({id,revogada:false,...r}); return id; },
    sessaoPorHash:async h=>T('pep_portal_sessoes').find(x=>x.token_hash===h)||null,
    atualizarSessao:async(id,p)=>Object.assign(T('pep_portal_sessoes').find(x=>x.id===id),p),
    registrar:async r=>T('pep_portal_log').push({em:new Date().toISOString(),...r}),
    ultimoLog:async(sid,a)=>[...T('pep_portal_log')].reverse().find(l=>l.sessao_id===sid&&l.acao===a)?.em??null,
    consultas:async pid=>db.pep_agenda.filter(x=>x.paciente_id===pid).map(x=>({preconsulta_em:null,tipo:null,...x})),
    atualizarConsulta:async(id,p)=>Object.assign(db.pep_agenda.find(x=>x.id===id),p),
    documentos:async pid=>T('pep_portal_docs').filter(x=>x.paciente_id===pid),
    marcarBaixado:async id=>{ T('pep_portal_docs').find(x=>x.id===id).baixado_em=new Date().toISOString(); },
    urlAssinada:async(p,n)=>'http://localhost:8769/testes/doc-falso.pdf',
    acessos:async pid=>[...T('pep_portal_log')].filter(l=>l.paciente_id===pid).reverse().map(({em,acao,detalhe})=>({em,acao,detalhe:detalhe??null})),
    configPorOwner:async o=>db.pep_agenda_config.find(x=>x.owner_id===o)||null,
    ocupados:async(o,de,ate)=>db.pep_agenda.filter(x=>x.profissional_id===o&&x.data>=de&&x.data<=ate&&x.status!=='cancelada'),
    inserirConsulta:async r=>{ db.pep_agenda.push({id:'q'+crypto.randomBytes(3).toString('hex'),...r}); return {ok:true}; }};
  await pac.route('**/functions/v1/portal-paciente',async route=>{ const rq=route.request();
    const r=await handle(new Request('https://x/',{method:rq.method(),headers:{'user-agent':await rq.headerValue('user-agent')||''},body:rq.method()==='POST'?rq.postData():undefined}),deps);
    route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()}); });
  await pac.route('**/testes/doc-falso.pdf',r=>r.fulfill({status:200,headers:{'content-type':'application/pdf','content-disposition':'attachment; filename=r.pdf'},body:'%PDF-1.4'}));
  await pac.goto('http://localhost:8769/portal.html'); await pac.waitForTimeout(300);
  ok((await pac.textContent('#bd')).includes('use o link'),'sem convite nem sessão: pede o link');
  await pac.goto('about:blank'); await pac.goto('http://localhost:8769/portal.html#c='+conv); await pac.waitForTimeout(400);
  await shot(pac,'portal-entrar');
  await pac.fill('#nasc','01051960'); await pac.fill('#cpf4','1234'); await pac.click('button:has-text("Entrar")'); await pac.waitForTimeout(500);
  ok((await pac.textContent('.msg')).includes('restantes: 4'),'dados errados: avisa tentativas restantes');
  ok(await pac.inputValue('#nasc')==='01/05/1960','máscara da data');
  await pac.fill('#cpf4','8909'); await pac.click('button:has-text("Entrar")'); await pac.waitForTimeout(900);
  ok((await pac.textContent('#t1')).includes('Olá, Maria')&&!(await pac.evaluate(()=>location.hash)),'entra, e o convite some do endereço');
  const sess=await pac.evaluate(()=>localStorage.getItem('pep_portal_sessao')); ok(sess&&sess.length>30,'sessão guardada no aparelho');
  const txtC=await pac.textContent('#bd');
  ok(txtC.includes('Próximas consultas')&&txtC.includes('Confirmar presença'),'vê as próximas consultas');
  await shot(pac,'portal-consultas');
  const a3=db.pep_agenda.find(x=>x.id==='a3');
  await pac.click('text=✔ Confirmar presença'); await pac.waitForTimeout(800);
  ok(a3.status==='confirmada'||db.pep_agenda.find(x=>x.id==='a6').status==='confirmada','confirma a consulta');
  // pré-consulta
  await pac.click('text=📝 Pré-consulta >> nth=0'); await pac.fill('#pc-motivo','Revisão da pressão'); await pac.check('#pc-aceite'); await pac.click('text=Enviar respostas'); await pac.waitForTimeout(800);
  ok(db.pep_agenda.some(x=>x.paciente_id==='p1'&&x.preconsulta&&x.preconsulta.motivo==='Revisão da pressão'),'pré-consulta pelo portal');
  // documentos
  await pac.click('[data-aba="documentos"]'); await pac.waitForTimeout(200);
  ok((await pac.textContent('#bd')).includes('Receita simples'),'vê o documento');
  await shot(pac,'portal-documentos');
  const [dl]=await Promise.all([pac.waitForEvent('download',{timeout:5000}).catch(()=>null),pac.click('text=Baixar')]); await pac.waitForTimeout(500);
  ok(!!dl&&db.pep_portal_docs[0].baixado_em,'baixa o documento e fica marcado');
  // marcar
  await pac.click('[data-aba="marcar"]'); await pac.waitForTimeout(600);
  await pac.click('.dias button >> nth=2'); await pac.click('.horas button >> nth=0'); await pac.fill('#motivo','Retorno');
  const antes=db.pep_agenda.length; await pac.click('text=Pedir este horário'); await pac.waitForTimeout(800);
  const nova=db.pep_agenda[db.pep_agenda.length-1];
  ok(db.pep_agenda.length===antes+1&&nova.origem==='portal'&&nova.paciente_id==='p1'&&nova.status==='solicitada','pede nova consulta pelo portal');
  // acessos
  await pac.click('[data-aba="acessos"]'); await pac.waitForTimeout(200);
  const ac=await pac.textContent('#bd');
  ok(['Conectou um aparelho','Confirmou a consulta','Respondeu a pré-consulta','Baixou um documento','Pediu uma consulta'].every(x=>ac.includes(x)),'histórico mostra tudo para o paciente');
  await shot(pac,'portal-acessos');
  // recarregar mantém a sessão
  await pac.goto('about:blank'); await pac.goto('http://localhost:8769/portal.html'); await pac.waitForTimeout(700);
  ok((await pac.textContent('#t1')).includes('Olá, Maria'),'reabrir o portal não pede o convite de novo');
  ok(await pac.evaluate(()=>document.documentElement.scrollWidth)<=390,'sem rolagem horizontal no celular');
  // ---------- médico vê e desconecta ----------
  await med.evaluate(()=>{ renderMain(); }); await med.waitForTimeout(1200);
  const card=await med.textContent('#card-portal');
  ok(card.includes('ativo')&&card.includes('1 aparelho(s) conectado(s)'),'quadro mostra aparelho conectado');
  await med.click('#pt-hist'); const hist=await med.textContent('#pt-log');
  ok(hist.includes('confirmou a consulta')&&hist.includes('baixou um documento')&&hist.includes('pediu uma consulta'),'médico vê o histórico de acessos');
  await shot(med,'portal-ficha-hist',false);
  await med.click('#pt-desc'); await med.waitForTimeout(700);
  ok(db.pep_portal_sessoes.every(x=>x.revogada),'desconectar aparelhos revoga as sessões');
  await pac.goto('about:blank'); await pac.goto('http://localhost:8769/portal.html'); await pac.waitForTimeout(700);
  ok((await pac.textContent('#t1')).includes('acesso terminou')&&!(await pac.evaluate(()=>localStorage.getItem('pep_portal_sessao'))),'paciente desconectado vê o aviso');
  // convite reutilizado
  await pac.goto('about:blank'); await pac.goto('http://localhost:8769/portal.html#c='+conv); await pac.waitForTimeout(300);
  await pac.fill('#nasc','01/05/1960'); await pac.fill('#cpf4','8909'); await pac.click('button:has-text("Entrar")'); await pac.waitForTimeout(600);
  ok((await pac.textContent('#t1')).includes('Link inválido'),'convite usado não entra de novo');
  console.log('erros:',errs);
  await b.close(); srv.close();
})();
