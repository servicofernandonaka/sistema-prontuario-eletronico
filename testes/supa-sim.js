// Simulador mínimo do Supabase (PostgREST + auth) para testes com Playwright.
const iso=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
const dia=n=>iso(Date.now()+n*864e5);
const USER={id:'00000000-0000-4000-8000-000000000001',email:'medico@teste.local',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
function criarDB(){
  return {
    pep_pacientes:[{id:'p1',nome:'Maria Aparecida Souza',telefone:'(11) 98888-7777',data_nascimento:'1960-05-01',sexo:'F'}],
    pep_profissional:[{user_id:USER.id,nome:'Dr. Teste',crm:'1',uf_crm:'SP'}],
    pep_agenda:[
      {id:'a1',profissional_id:USER.id,nome:'João Pedido',telefone:'11977776666',data:dia(2),hora:'09:00',duracao_min:30,status:'solicitada',origem:'publico',observacao:'Dor nas costas'},
      {id:'a2',profissional_id:USER.id,nome:'Ana Pedido',telefone:'11955554444',data:dia(3),hora:'10:30',duracao_min:30,status:'solicitada',origem:'publico',observacao:null},
      {id:'a3',profissional_id:USER.id,paciente_id:'p1',nome:null,telefone:null,data:dia(1),hora:'08:00',duracao_min:30,status:'marcada',origem:'manual'},
      {id:'a4',profissional_id:USER.id,nome:'Carlos Avulso',telefone:'11933332222',data:dia(1),hora:'14:00',duracao_min:45,status:'confirmada',origem:'publico'},
      {id:'a5',profissional_id:USER.id,nome:'Velho Pedido',telefone:'11911112222',data:dia(-2),hora:'09:00',duracao_min:30,status:'solicitada',origem:'publico'},
      {id:'a6',profissional_id:USER.id,paciente_id:'p1',data:dia(0),hora:'11:00',duracao_min:30,status:'marcada',origem:'manual'}]};
}
function filtrar(rows,params){
  for(const [k,v] of params){
    if(['select','order','limit','offset','on_conflict','columns'].includes(k)) continue;
    const m=/^(not\.)?(eq|neq|gt|gte|lt|lte|in|ilike|like|is)\.(.*)$/s.exec(v); if(!m) continue;
    const [,neg,op,val]=m;
    const t=r=>{const x=r[k];switch(op){
      case 'eq':return String(x)===val; case 'neq':return String(x)!==val;
      case 'gt':return x!=null&&x>val; case 'gte':return x!=null&&x>=val; case 'lt':return x!=null&&x<val; case 'lte':return x!=null&&x<=val;
      case 'in':return val.replace(/^\(|\)$/g,'').split(',').map(s=>s.replace(/^"|"$/g,'')).includes(String(x));
      case 'ilike':case 'like':{const re=new RegExp('^'+val.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/[%*]/g,'.*')+'$','i');return re.test(String(x??''));}
      case 'is':return val==='null'?x==null:String(x)===val;}};
    rows=rows.filter(r=>neg?!t(r):t(r));
  }
  return rows;
}
function ordenar(rows,order){ if(!order) return rows; const ks=order.split(',').map(s=>s.split('.'));
  return rows.slice().sort((a,b)=>{for(const [k,dir] of ks){const x=a[k]??'',y=b[k]??''; if(x<y) return dir==='desc'?1:-1; if(x>y) return dir==='desc'?-1:1;} return 0;}); }
async function instalar(page,{db=criarDB(),log=[]}={}){
  await page.addInitScript(([u])=>{ const s={access_token:'fake.jwt.token',token_type:'bearer',expires_in:36000,expires_at:Math.floor(Date.now()/1000)+36000,refresh_token:'r',user:u};
    localStorage.setItem('sb-joygodczajayygjxerno-auth-token',JSON.stringify(s)); },[USER]);
  await page.route('**/joygodczajayygjxerno.supabase.co/**',async route=>{
    const req=route.request(), url=new URL(req.url()), meth=req.method();
    const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','access-control-expose-headers':'content-range'};
    const J=(st,b,h={})=>route.fulfill({status:st,headers:{...cors,'content-type':'application/json',...h},body:JSON.stringify(b)});
    if(meth==='OPTIONS') return route.fulfill({status:204,headers:cors});
    if(url.pathname.startsWith('/auth/v1/user')) return J(200,USER);
    if(url.pathname.startsWith('/auth/v1/')) return J(200,{});
    if(url.pathname.startsWith('/storage/')) return J(200,[]);
    if(url.pathname.startsWith('/functions/')){ const b=req.postData()?JSON.parse(req.postData()):{}; log.push({fn:b});
      if(b.acao==='horarios') return J(200,{ok:true,dias:{[dia(1)]:['08:00','08:30','09:00','09:30'],[dia(2)]:['14:00']}});
      return J(200,{ok:true}); }
    const m=/^\/rest\/v1\/(rpc\/)?([^/?]+)/.exec(url.pathname); if(!m) return J(404,{});
    if(m[1]) return J(200,[]);
    const tb=m[2]; db[tb]=db[tb]||[]; const p=[...url.searchParams];
    const body=req.postData()?JSON.parse(req.postData()):null;
    log.push({meth,tb,q:url.search,body});
    if(meth==='GET'||meth==='HEAD'){
      let rows=ordenar(filtrar(db[tb],p),url.searchParams.get('order'));
      const total=rows.length, lim=+url.searchParams.get('limit')||0; if(lim) rows=rows.slice(0,lim);
      const single=/vnd\.pgrst\.object/.test(req.headers()['accept']||'');
      const h={'content-range':(rows.length?'0-'+(rows.length-1):'*')+'/'+total};
      if(meth==='HEAD') return route.fulfill({status:200,headers:{...cors,...h}});
      return J(200,single?(rows[0]||null):rows,h);
    }
    if(meth==='PATCH'){ const rows=filtrar(db[tb],p); rows.forEach(r=>Object.assign(r,body)); return J(200,rows); }
    if(meth==='DELETE'){ const rows=filtrar(db[tb],p); db[tb]=db[tb].filter(r=>!rows.includes(r)); return J(200,rows); }
    if(meth==='POST'&&url.searchParams.get('on_conflict')){ const k=url.searchParams.get('on_conflict'); const out=[];
      for(const r of (Array.isArray(body)?body:[body])){ const ex=db[tb].find(x=>x[k]===r[k]); if(ex){ Object.assign(ex,r); out.push(ex);} else { db[tb].push(r); out.push(r);} } return J(201,out); }
    if(meth==='POST'){ const arr=(Array.isArray(body)?body:[body]).map(r=>({id:'n'+Math.random().toString(36).slice(2,8),...r})); db[tb].push(...arr); return J(201,arr); }
    return J(200,[]);
  });
  return {db,log};
}
module.exports={instalar,criarDB,dia,USER};
