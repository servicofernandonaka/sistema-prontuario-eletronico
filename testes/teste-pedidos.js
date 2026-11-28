const {chromium}=require('playwright'); const {instalar,dia}=require('./supa-sim.js');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'..');
const srv=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split(/[?#]/)[0]));if(f.endsWith('/'))f+='index.html';
  fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':'application/octet-stream'});r.end(d);});}).listen(8765);
(async()=>{
  const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
  const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  const popups=[]; ctx.on('page',p=>popups.push(p.url()));
  await page.addInitScript(()=>{ window.confirm=()=>true; window.open=(u)=>{ (window._abertos=window._abertos||[]).push(u); return null; }; });
  const {db,log}=await instalar(page);
  await page.goto('http://localhost:8765/index.html'); await page.waitForTimeout(2500);
  const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
  ok(await page.isVisible('#view-app'),'app aberto com sessão simulada');
  ok((await page.textContent('#ped-n'))==='2' && await page.isVisible('#ped-n'),'contador lateral mostra 2 pedidos (ignora pedido passado)');
  ok(await page.isVisible('#st-pedbox'),'card de pedidos no painel inicial');
  await page.screenshot({path:require('path').join(require('os').tmpdir(),'home.png')});
  await page.click('#btn-pedidos'); await page.waitForTimeout(800);
  const txt=await page.textContent('#pd-corpo');
  ok(txt.includes('João Pedido')&&txt.includes('Ana Pedido')&&!txt.includes('Velho Pedido'),'lista os 2 pedidos futuros');
  ok(txt.includes('Maria Aparecida Souza')&&txt.includes('Carlos Avulso'),'lembretes de amanhã com cadastrado e avulso');
  await page.screenshot({path:require('path').join(require('os').tmpdir(),'pedidos.png'),fullPage:true});
  await page.click('[data-aprovar="a1"]'); await page.waitForTimeout(800);
  const a1=db.pep_agenda.find(x=>x.id==='a1');
  ok(a1.status==='marcada'&&/^[0-9a-f]{64}$/.test(a1.token_hash||''),'aprovar → marcada com token_hash');
  let ab=await page.evaluate(()=>window._abertos||[]);
  ok(ab.length===1&&ab[0].includes('wa.me/5511977776666')&&decodeURIComponent(ab[0]).includes('consulta.html#'),'WhatsApp de aprovação com link pessoal');
  console.log('   msg:',decodeURIComponent(ab[0].split('text=')[1]).replace(/\n/g,' | '));
  ok((await page.textContent('#ped-n'))==='1','contador cai para 1');
  await page.click('[data-recusar="a2"]'); await page.waitForTimeout(800);
  ok(db.pep_agenda.find(x=>x.id==='a2').status==='cancelada','recusar → cancelada');
  ok(await page.isHidden('#ped-n'),'contador some com 0 pedidos');
  await page.click('[data-lembrar="a3"]'); await page.waitForTimeout(800);
  const a3=db.pep_agenda.find(x=>x.id==='a3');
  ab=await page.evaluate(()=>window._abertos||[]);
  ok(a3.lembrado_em&&a3.token_hash&&ab[ab.length-1].includes('wa.me/5511988887777'),'lembrete usa telefone do cadastro e registra lembrado_em');
  console.log('   msg:',decodeURIComponent(ab[ab.length-1].split('text=')[1]).replace(/\n/g,' | '));
  // o link gerado bate com o hash gravado
  const tok=decodeURIComponent(ab[ab.length-1]).split('#')[1];
  const h=require('crypto').createHash('sha256').update(tok).digest('hex'); ok(h===a3.token_hash,'hash do link confere com o banco');
  ok((await page.textContent('#pd-corpo')).includes('lembrete enviado'),'mostra "lembrete enviado"');
  await page.screenshot({path:require('path').join(require('os').tmpdir(),'pedidos-depois.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(300);
  await page.screenshot({path:require('path').join(require('os').tmpdir(),'pedidos-celular.png'),fullPage:true});
  const sw=await page.evaluate(()=>document.documentElement.scrollWidth); ok(sw<=390,'sem rolagem horizontal no celular ('+sw+')');
  // cadastrar a partir do lembrete de um paciente avulso
  await page.setViewportSize({width:1280,height:900}); await page.click('#btn-pedidos'); await page.waitForTimeout(700);
  await page.click('[data-cadastrar="a4"]'); await page.waitForTimeout(300);
  ok(await page.inputValue('#np-nome')==='Carlos Avulso'&&(await page.inputValue('#np-tel')).includes('(11) 93333-2222'),'Cadastrar abre o cadastro com nome e telefone');
  await page.fill('#np-cpf','529.982.247-25'); await page.fill('#np-nasc','1980-02-03'); await page.click('#np-save'); await page.waitForTimeout(1200);
  const a4=db.pep_agenda.find(x=>x.id==='a4'), novoP=db.pep_pacientes.find(x=>x.nome==='Carlos Avulso');
  ok(novoP&&a4.paciente_id===novoP.id&&a4.nome===null,'consulta ligada ao paciente recém-cadastrado');
  await page.click('#btn-novo-pac'); await page.waitForTimeout(200); await page.fill('#np-nome','Outro Paciente'); await page.click('#np-save'); await page.waitForTimeout(900);
  ok(db.pep_agenda.filter(x=>x.paciente_id&&x.paciente_id===(db.pep_pacientes.find(y=>y.nome==='Outro Paciente')||{}).id).length===0,'cadastro comum não mexe em consulta nenhuma');
  // duplicados: pedido online de quem já é paciente (mesmo celular) → oferece vincular
  db.pep_agenda.push({id:'a7',profissional_id:db.pep_agenda[0].profissional_id,nome:'Maria A Souza',telefone:'11988887777',data:db.pep_agenda[0].data,hora:'11:30',duracao_min:30,status:'solicitada',origem:'publico'});
  await page.click('#btn-agconsultas'); await page.click('#btn-pedidos'); await page.waitForTimeout(800);
  await page.click('[data-cadastrar="a7"]'); await page.waitForTimeout(500);
  ok(await page.isVisible('#m-dup')&&(await page.textContent('#dup-lista')).includes('Maria Aparecida Souza')&&(await page.textContent('#dup-lista')).includes('mesmo celular'),'Cadastrar acha o paciente existente pelo celular');
  await page.click('[data-dupv="p1"]'); await page.waitForTimeout(600);
  ok(db.pep_agenda.find(x=>x.id==='a7').paciente_id==='p1','vincula ao cadastro existente em vez de duplicar');
  // cadastro manual com mesmo nome e nascimento → pede confirmação
  await page.evaluate(()=>{ window._conf=[]; window.confirm=m=>{ window._conf.push(m); return false; }; });
  await page.click('#btn-novo-pac'); await page.waitForTimeout(200); await page.fill('#np-nome','Maria Aparecida de Souza'); await page.fill('#np-nasc','1960-05-01');
  const nAntes=db.pep_pacientes.length; await page.click('#np-save'); await page.waitForTimeout(700);
  const cf=await page.evaluate(()=>window._conf.join('|'));
  ok(cf.includes('já está cadastrado')&&cf.includes('mesmo nome e data de nascimento')&&db.pep_pacientes.length===nAntes,'cadastro novo com mesmo nome e nascimento: avisa e não salva se cancelar');
  await page.evaluate(()=>{ window.confirm=()=>true; closeM('m-pac'); });
  // navegação nas páginas do paciente
  for(const pg of ['agendar.html?m=xxxxxxxx','consulta.html#tokenFalsoTokenFalsoTokenFalso','portal.html']){ const p2=await ctx.newPage(); await p2.goto('http://localhost:8765/'+pg); await p2.waitForTimeout(300);
    ok(await p2.isVisible('a[href="./"]'),pg.split(/[?#]/)[0]+' tem link para a página inicial'); await p2.close(); }
  // paleta
  await page.keyboard.press('Control+k'); await page.fill('#cmdk-q','pedidos'); await page.waitForTimeout(200);
  ok((await page.textContent('#cmdk-l')).includes('Pedidos e lembretes'),'Ctrl+K encontra a tela');
  console.log('erros:',errs.filter(e=>!/favicon|Failed to load resource/.test(e)));
  await b.close(); srv.close();
})();
