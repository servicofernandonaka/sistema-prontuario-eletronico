// Página de entrada (três portas) e login do paciente por CPF + data + código por e-mail.
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os'),{execSync}=require('child_process'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..');
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split(/[?#]/)[0]));if(f.endsWith('/'))f+='index.html';
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(d);});}).listen(8771);
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const shot=(pg,n)=>pg.screenshot({path:path.join(os.tmpdir(),n+'.png'),fullPage:true});
(async()=>{
  const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'fn-')),'p.mjs');
  execSync(`npx -y esbuild@0.24.0 "${path.join(ROOT,'supabase/functions/portal-paciente/handler.ts')}" --bundle --format=esm --platform=neutral --outfile="${out}" --log-level=warning`);
  const {handle}=await import('file://'+out);
  const DR='dr1', db={pac:[{id:'p1',nome:'Maria Souza',cpf:'123.456.789-09',data_nascimento:'1960-05-01',email:'maria@exemplo.com',telefone:'11988887777',owner:null}],
    codigos:[],sessoes:[],log:[],agenda:[{id:'g1',profissional_id:DR,paciente_id:'p1',data:'2030-01-10',hora:'09:00',duracao_min:30,status:'marcada',tipo:'Consulta',preconsulta_em:null}]};
  const emails=[]; let seq=0; let slug='slugDaClinica01';
  const deps={env:{},agora:()=>Date.now(),aleatorio:n=>crypto.randomBytes(n),
    convitePorHash:async()=>null,atualizarConvite:async()=>{},paciente:async id=>db.pac.find(p=>p.id===id)||null,
    criarSessao:async r=>{const id='s'+ ++seq; db.sessoes.push({id,revogada:false,...r}); return id;},
    sessaoPorHash:async h=>db.sessoes.find(s=>s.token_hash===h)||null, atualizarSessao:async(id,p)=>Object.assign(db.sessoes.find(s=>s.id===id),p),
    registrar:async r=>db.log.push({em:new Date().toISOString(),...r}), ultimoLog:async()=>null,
    consultas:async pid=>db.agenda.filter(x=>x.paciente_id===pid), atualizarConsulta:async()=>{}, documentos:async()=>[], marcarBaixado:async()=>{}, urlAssinada:async()=>null,
    acessos:async pid=>db.log.filter(l=>l.paciente_id===pid).reverse(), configPorOwner:async()=>({slug,config:{ativo:true,nome_publico:'Dr. Teste'}}), ocupados:async()=>[], inserirConsulta:async()=>({ok:true}),
    pacientesPorNascimento:async n=>db.pac.filter(p=>p.data_nascimento===n), ownerPadrao:async()=>DR,
    contarCodigos:async(pid,desde)=>db.codigos.filter(c=>c.paciente_id===pid&&c.criado_em>=desde).length,
    salvarCodigo:async r=>db.codigos.push({id:'k'+ ++seq,tentativas:0,usado_em:null,...r}),
    ultimoCodigo:async pid=>[...db.codigos].reverse().find(c=>c.paciente_id===pid)||null,
    atualizarCodigo:async(id,p)=>Object.assign(db.codigos.find(c=>c.id===id),p),
    enviarEmail:async(para,assunto,texto)=>{emails.push({para,texto}); return 'ok';}, slugAtivo:async()=>slug};
  const b=await chromium.launch(); const ctx=await b.newContext({serviceWorkers:'block'}); const errs=[]; await ctx.addInitScript(()=>{ window.confirm=()=>true; });
  await ctx.route('**/functions/v1/portal-paciente',async route=>{ const rq=route.request();
    const r=await handle(new Request('https://x/',{method:rq.method(),headers:{'user-agent':await rq.headerValue('user-agent')||''},body:rq.method()==='POST'?rq.postData():undefined}),deps);
    route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()}); });
  await ctx.route('**/joygodczajayygjxerno.supabase.co/auth/**',r=>r.fulfill({status:401,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:'{}'}));
  await ctx.route('**/joygodczajayygjxerno.supabase.co/rest/**',r=>r.fulfill({status:200,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:'[]'}));
  // ---------- página de entrada ----------
  const pg=await ctx.newPage(); await pg.setViewportSize({width:1280,height:860}); pg.on('pageerror',e=>errs.push(e.message));
  await pg.goto('http://localhost:8771/'); await pg.waitForTimeout(1200);
  ok(await pg.isVisible('#portas')&&await pg.isHidden('#login-card'),'sem login: mostra as três portas, não o login');
  ok((await pg.getAttribute('#porta-marcar','href'))==='agendar.html?m=slugDaClinica01'&&!(await pg.getAttribute('#porta-marcar','class')).includes('off'),'"Marcar consulta" aponta para o agendamento ativo');
  await pg.click('#porta-pac'); ok(await pg.isVisible('#pac-card')&&await pg.isHidden('#portas'),'"Sou paciente" abre o login do paciente na mesma página');
  await pg.fill('#pl-cpf','12345678909'); await pg.fill('#pl-nasc','01051960'); await pg.click('#pl-pedir'); await pg.waitForTimeout(500);
  ok(await pg.isVisible('#pl-passo2')&&(await pg.textContent('#pl-info')).includes('ma***@exemplo.com'),'pede o código na página em comum');
  await shot(pg,'entrada-paciente-codigo');
  const c0=emails.at(-1).texto.match(/\b(\d{6})\b/)[1]; await pg.fill('#pl-cod',c0); await pg.click('#pl-entrar'); await pg.waitForTimeout(1200);
  ok(pg.url().endsWith('/portal.html')&&(await pg.textContent('#t1')).includes('Olá, Maria'),'entra e abre o portal já conectado');
  await pg.goto('http://localhost:8771/'); await pg.waitForTimeout(1000);
  ok((await pg.textContent('#porta-pac')).includes('já está conectado'),'na volta, a porta do paciente avisa que já está conectado');
  await pg.evaluate(()=>localStorage.removeItem('pep_portal_sessao')); emails.length=0; db.codigos.length=0;
  await shot(pg,'entrada-portas');
  await pg.click('#porta-prof'); ok(await pg.isVisible('#login-card')&&await pg.isHidden('#portas'),'"Sou profissional" abre o login');
  await pg.reload(); await pg.waitForTimeout(1000); ok(await pg.isVisible('#login-card'),'neste aparelho, o profissional cai direto no login');
  await pg.click('#li-voltar'); ok(await pg.isVisible('#portas'),'"Outras opções" volta às portas');
  await pg.reload(); await pg.waitForTimeout(1000); ok(await pg.isVisible('#portas'),'depois de voltar, mostra as portas de novo');
  slug=null; const pg2=await ctx.newPage(); await pg2.goto('http://localhost:8771/'); await pg2.waitForTimeout(1200);
  ok((await pg2.getAttribute('#porta-marcar','class')).includes('off')&&(await pg2.textContent('#porta-marcar')).includes('desligado'),'agendamento desligado: porta desativada com aviso'); slug='slugDaClinica01';
  await pg.setViewportSize({width:390,height:844}); await shot(pg,'entrada-portas-celular');
  ok(await pg.evaluate(()=>document.documentElement.scrollWidth)<=390,'sem rolagem horizontal no celular');
  // ---------- login do paciente ----------
  const pac=await ctx.newPage(); await pac.setViewportSize({width:390,height:844}); pac.on('pageerror',e=>errs.push('pac: '+e.message));
  await pac.goto('http://localhost:8771/portal.html'); await pac.waitForTimeout(300);
  ok(await pac.isVisible('#l-cpf'),'portal sem sessão: pede CPF e data');
  await shot(pac,'portal-login');
  await pac.fill('#l-cpf','12345678909'); ok(await pac.inputValue('#l-cpf')==='123.456.789-09','máscara do CPF');
  await pac.fill('#l-nasc','02051960'); await pac.click('button:has-text("Receber código")'); await pac.waitForTimeout(400);
  ok((await pac.textContent('.msg')).includes('Não encontramos'),'dados que não batem: avisa');
  await pac.fill('#l-nasc','01/05/1960'); await pac.click('button:has-text("Receber código")'); await pac.waitForTimeout(500);
  ok((await pac.textContent('#bd')).includes('ma***@exemplo.com')&&emails.length===1,'envia o código e mostra o e-mail mascarado');
  await shot(pac,'portal-codigo');
  const cod=emails[0].texto.match(/\b(\d{6})\b/)[1];
  await pac.fill('#l-cod',cod==='123456'?'654321':'123456'); await pac.click('button:has-text("Entrar")'); await pac.waitForTimeout(400);
  ok((await pac.textContent('.msg')).includes('restantes: 4'),'código errado: avisa');
  await pac.fill('#l-cod',cod); await pac.click('button:has-text("Entrar")'); await pac.waitForTimeout(800);
  ok((await pac.textContent('#t1')).includes('Olá, Maria')&&(await pac.textContent('#bd')).includes('Próximas consultas'),'código certo: entra no portal');
  ok(db.log.some(l=>l.acao.startsWith('conectou um aparelho (código'))&&db.log.some(l=>l.acao==='pediu código de acesso por e-mail'),'entrada registrada no histórico');
  await pac.click('[data-aba="acessos"]'); await pac.click('button:has-text("Desconectar este aparelho")'); await pac.waitForTimeout(500);
  ok(await pac.isVisible('button:has-text("Entrar com CPF")'),'depois de sair, oferece entrar de novo com CPF');
  console.log('erros:',errs);
  await b.close(); srv.close();
})();
