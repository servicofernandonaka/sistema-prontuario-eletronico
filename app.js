"use strict";
/* =============== constantes =============== */
const KEY="pep-demo-v1";
/* Supabase: preencha as duas linhas abaixo (Project Settings → API). Vazio = modo local (só para desenvolvimento). */
const SUPABASE_URL="https://joygodczajayygjxerno.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpveWdvZGN6YWpheXlnanhlcm5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxODI5MjMsImV4cCI6MjEwODc1ODkyM30.D5WdaqV6k1oN19TTffLPQ1NQejBFu91p9nlT2kV51Rs";   // chave "anon public" (a service_role NUNCA entra aqui)
const SB_ON=!!(SUPABASE_URL&&SUPABASE_ANON_KEY&&window.supabase);
const sb=SB_ON?window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY):null;
let UID=null;
const CID=[["I10","Hipertensão essencial"],["E11","Diabetes mellitus tipo 2"],["E78","Dislipidemia"],["J06","Infecção aguda de vias aéreas superiores"],["J45","Asma"],["M54","Dorsalgia"],["N39","Transtornos do trato urinário (ITU)"],["F32","Episódio depressivo"],["F41","Transtornos ansiosos"],["K29","Gastrite e duodenite"],["R51","Cefaleia"],["Z00","Exame médico geral"],["G30","Doença de Alzheimer"],["F03","Demência não especificada"],["E03","Hipotireoidismo"]];
const MEDS=["Losartana 50 mg cp","Hidroclorotiazida 25 mg cp","Anlodipino 5 mg cp","Enalapril 10 mg cp","Metformina 850 mg cp","Glibenclamida 5 mg cp","Sinvastatina 20 mg cp","AAS 100 mg cp","Omeprazol 20 mg cp","Dipirona 500 mg cp","Paracetamol 500 mg cp","Ibuprofeno 600 mg cp","Amoxicilina 500 mg cp","Azitromicina 500 mg cp","Salbutamol spray 100 mcg","Sertralina 50 mg cp","Levotiroxina 50 mcg cp","Donepezila 5 mg cp","Memantina 10 mg cp","Insulina NPH 100 UI/mL"];
const EXAMES=[["Hemograma completo","Laboratorial"],["Glicemia de jejum","Laboratorial"],["Hemoglobina glicada","Laboratorial"],["Colesterol total e frações","Laboratorial"],["Triglicerídeos","Laboratorial"],["Creatinina","Laboratorial"],["Ureia","Laboratorial"],["TSH","Laboratorial"],["Vitamina B12","Laboratorial"],["EAS (urina tipo 1)","Laboratorial"],["Urocultura","Laboratorial"],["TGO/TGP","Laboratorial"],["Raio-X de tórax PA e perfil","Imagem"],["Ecografia de abdome total","Imagem"],["Ecografia de tireoide","Imagem"],["Mamografia bilateral","Imagem"],["RM de crânio","Imagem"],["ECG","Imagem"]];
const CARATER=["Eletivo","Urgência","Acidente de trabalho","Demanda espontânea","Retorno"];
const STATUS_EX=["Solicitado","Coletado","Em análise","Resultado","Cancelado"];
const STCOLOR={Solicitado:"warn",Coletado:"",["Em análise"]:"",Resultado:"ok",Cancelado:"bad"};

/* =============== utilidades =============== */
const uid=()=>Math.random().toString(36).slice(2,10);
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fdate=d=>d?new Date(d).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"";
const fday=d=>d?new Date(d+"T12:00").toLocaleDateString("pt-BR"):"";
const nowLocal=()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)};
/* idade a partir de "AAAA-MM-DD" sem passar por Date (new Date("AAAA-MM-DD") é UTC e erra um dia no fuso do Brasil) */
const idade=n=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(n||"");if(!m)return"";const h=new Date(),mes=h.getMonth()+1;let a=h.getFullYear()-+m[1];if(mes<+m[2]||(mes===+m[2]&&h.getDate()<+m[3]))a--;return a};
const fsize=n=>n>1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB";
const nrm=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
const dg=s=>String(s||"").replace(/\D/g,"");
const SEXO={F:"Feminino",M:"Masculino"};
/* anexos: só PDF e imagens raster (SVG e HTML podem executar script quando abertos) */
const MIMES={pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp"};
const MAX_ARQ=15*1024*1024;
const mimeDe=nome=>MIMES[(String(nome||"").split(".").pop()||"").toLowerCase()]||"";
const okArquivo=f=>{if(!mimeDe(f.name)){toast("“"+f.name+"”: só PDF, PNG, JPG ou WebP");return false}if(f.size>MAX_ARQ){toast("“"+f.name+"”: acima de 15 MB");return false}return true};
/* CPF / CNS */
const cpfOk=v=>{v=dg(v);if(v.length!==11||/^(\d)\1+$/.test(v))return false;const c=n=>{let s=0;for(let i=0;i<n;i++)s+=+v[i]*(n+1-i);const r=(s*10)%11;return r===10?0:r};return c(9)===+v[9]&&c(10)===+v[10]};
const cnsOk=v=>{v=dg(v);if(v.length!==15)return false;
  if(/^[12]/.test(v)){const pis=v.slice(0,11);let s=0;for(let i=0;i<11;i++)s+=+pis[i]*(15-i);let r=s%11,d=r===0?0:11-r;if(d===10){s+=2;r=s%11;d=11-r;return v===pis+"001"+d}return v===pis+"000"+d}
  if(/^[789]/.test(v)){let s=0;for(let i=0;i<15;i++)s+=+v[i]*(15-i);return s%11===0}
  return false};
/* alergias: texto livre → palavras-chave + classes (penicilinas, AINEs…) comparadas com o nome do medicamento */
const STOPAL=new Set("alergia alergias alergico alergica reacao reacoes historia paciente referida refere relata relato grave leve moderada moderado urticaria angioedema anafilaxia anafilatico rash edema choque dispneia prurido cutanea cutaneo exantema nenhuma nenhum conhecida conhecidas desconhecida para com sem que por uso medicamento medicamentos droga drogas remedio remedios apos tomar tomou usar depois quando aos das dos nas nos ate ele ela".split(" "));
const CLASSES_AL=[
 ["penicilinas",/penicilin|amoxicilin|ampicilin|oxacilin|piperacilin|beta-?lact/,["amoxicilina","ampicilina","penicilina","benzilpenicilina","oxacilina","piperacilina","clavulanato"]],
 ["dipirona",/dipiron|metamizol|novalgina/,["dipirona","metamizol","novalgina"]],
 ["AAS/salicilatos",/\baas\b|aspirin|acetilsalicil/,["aas","aspirina","acetilsalicilico"]],
 ["sulfas",/sulfa|sulfonamid|bactrim/,["sulfametoxazol","sulfadiazina","trimetoprima","sulfa"]],
 ["AINEs",/\bain(e|es|s)?\b|anti-?inflamat|diclofen|ibuprofen|naproxen|cetoprofen|nimesulid|meloxicam|piroxicam/,["diclofenaco","ibuprofeno","naproxeno","cetoprofeno","nimesulida","meloxicam","piroxicam","aas","acetilsalicilico"]],
 ["cefalosporinas",/cefalospor|cefale|ceftriax|cefepim|cefalotin|cefazol|cefuroxim/,["cefalexina","ceftriaxona","cefepime","cefalotina","cefazolina","cefuroxima"]],
 ["macrolídeos",/macrol|azitromicin|claritromicin|eritromicin/,["azitromicina","claritromicina","eritromicina"]],
 ["quinolonas",/quinolon|ciprofloxacin|levofloxacin|norfloxacin/,["ciprofloxacino","levofloxacino","norfloxacino","ofloxacino"]]];
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const semAlergia=t=>!String(t||"").trim()||/^\s*(nenhum|sem\s+alerg|nega|nao\s+(ha|tem|refere|possui)|ndn|nkda)/.test(nrm(t));
function conflitoAlergia(med,txt){
  if(semAlergia(txt))return[];
  const m=nrm(med),a=nrm(txt),achou=new Set();
  for(const w of a.split(/[^a-z0-9]+/).filter(w=>w.length>=3&&!STOPAL.has(w)))if(new RegExp("(^|[^a-z0-9])"+reEsc(w)).test(m))achou.add(w);
  for(const [nome,re,lista] of CLASSES_AL)if(re.test(a)&&lista.some(x=>new RegExp("(^|[^a-z0-9])"+reEsc(x)).test(m)))achou.add(nome);
  return[...achou]}
const ICO={plus:"M12 5v14M5 12h14",print:"M6 9V3h12v6M6 18H4v-7h16v7h-2M6 14h12v7H6z",pen:"M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",trash:"M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",clip:"M21 12l-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8",copy:"M9 9h11v11H9zM5 15V4h11",eye:"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",lock:"M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z",dl:"M12 3v12m0 0-4-4m4 4 4-4M4 21h16",check:"M20 6 9 17l-5-5",edit:"M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",home:"M3 11l9-8 9 8M5 10v10h14V10",doc:"M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6",pulse:"M3 12h4l3-8 4 16 3-8h4",pill:"M10.5 20.5a5 5 0 0 1-7-7l9-9a5 5 0 0 1 7 7zM8.5 8.5l7 7",flask:"M9 3h6M10 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-10V3M7 15h10"};
const TABICO={Resumo:"home",Atendimentos:"doc","Evolução":"pulse","Prescrições":"pill",Exames:"flask"};
const ic=n=>`<svg class="i" viewBox="0 0 24 24"><path d="${ICO[n]}"/></svg>`;
const COLORS=["#3b82f6","#8b5cf6","#ec4899","#f59e0b","#10b981","#06b6d4","#ef4444"];
const avatar=(p,cls="")=>{const ini=p.nome.replace(/\(.*\)/,"").trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join("").toUpperCase();const c=COLORS[[...p.id].reduce((a,x)=>a+x.charCodeAt(0),0)%COLORS.length];return `<div class="av ${cls}" style="background:${c}">${esc(ini)}</div>`};
let tt;function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(tt);tt=setTimeout(()=>t.classList.remove("on"),2600)}

/* =============== armazenamento de arquivos (IndexedDB) =============== */
const DB=new Promise((res,rej)=>{const r=indexedDB.open("pep-files",1);r.onupgradeneeded=()=>r.result.createObjectStore("f");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const idb=async(mode,fn)=>{const db=await DB;return new Promise((res,rej)=>{const rq=fn(db.transaction("f",mode).objectStore("f"));rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error)})};
const bucket=()=>sb.storage.from("exames");
const chk=r=>{if(r.error)throw r.error;return r};
const fPut=async(id,blob)=>SB_ON?void chk(await bucket().upload(UID+"/"+id,blob,{upsert:true,contentType:blob.type||undefined})):idb("readwrite",s=>s.put(blob,id));
const fGet=async id=>SB_ON?(await bucket().download(UID+"/"+id)).data:idb("readonly",s=>s.get(id));
const fDel=async id=>SB_ON?void chk(await bucket().remove([UID+"/"+id])):idb("readwrite",s=>s.delete(id));
const b64=blob=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(blob)});

/* =============== dados =============== */
function seed(){return {cur:"p1",pacs:[
 {id:"p1",nome:"Maria Aparecida da Silva (FICTÍCIA)",social:"",sexo:"F",nasc:"1948-03-14",raca:"Parda",cns:"700 0000 0000 0001",cpf:"000.000.000-01",pront:"10001",end:"Rua Exemplo, 100 – Itapevi/SP",tel:"(11) 90000-0001",equipe:"INE 0000001 – ESF Jardim Fictício",alergias:"Dipirona (urticária)",
  aten:[{id:uid(),data:"2026-09-10T09:00",carater:"Eletivo",vit:{pa:"138/82",fc:"72",temp:"36,5",peso:"68",sat:"97"},S:"Queixa de esquecimentos há 1 ano. Filha refere perda de objetos e repetição de perguntas.",O:"MEEM 22/30.",A:"Comprometimento cognitivo – investigar.",P:"Solicitar exames de rastreio de causas reversíveis. Retorno em 30 dias.",cids:["F03 – Demência não especificada","I10 – Hipertensão essencial"],proc:"Consulta médica (03.01.01.007-2)",assinado:true,assinadoEm:"2026-09-10T09:40:00"}],
  presc:[{id:uid(),data:"2026-09-10T09:30",itens:[{med:"Losartana 50 mg cp",dose:"1 comprimido",via:"VO",freq:"12/12h",dur:"uso contínuo"}],assinatura:null}],
  exames:[{id:uid(),data:"2026-09-10T09:30",nome:"TSH",tipo:"Laboratorial",status:"Resultado",ind:"Investigação de declínio cognitivo",res:"2,1 mUI/L (normal)",anexos:[]},{id:uid(),data:"2026-09-10T09:30",nome:"Vitamina B12",tipo:"Laboratorial",status:"Solicitado",ind:"Investigação de declínio cognitivo",res:"",anexos:[]}]},
 {id:"p2",nome:"José Carlos Pereira (FICTÍCIO)",social:"",sexo:"M",nasc:"1975-11-02",raca:"Branca",cns:"700 0000 0000 0002",cpf:"000.000.000-02",pront:"10002",end:"Av. Modelo, 45 – Barueri/SP",tel:"(11) 90000-0002",equipe:"INE 0000002 – ESF Centro Fictício",alergias:"Nenhuma conhecida",aten:[],presc:[],exames:[]}]}}
let S=SB_ON?{cur:null,pacs:[]}:(()=>{try{return JSON.parse(localStorage[KEY])}catch{return seed()}})();
const normPac=p=>{p.aten=p.aten||[];p.presc=p.presc||[];p.exames=p.exames||[];p.exames.forEach(e=>{e.anexos=e.anexos||[]});return p};
if(!SB_ON)S.pacs.forEach(normPac);
/* Dados do profissional (saem nas receitas): ficam na conta (user_metadata) e, no modo local, no navegador. */
let PROF=(()=>{try{return JSON.parse(localStorage["pep-prof"]||"{}")}catch{return{}}})();
/* Persistência: cada paciente é uma linha da tabela "pacientes" (documento jsonb).
   Só o que mudou é enviado, e a gravação é condicionada à versão (updated_at) que este aparelho leu:
   se outro aparelho alterou o paciente nesse meio-tempo, abre o diálogo de conflito em vez de sobrescrever. */
let synced=new Map(),revs=new Map(),syncTimer=null,retryTimer=null,syncQ=Promise.resolve(),svState="ok",sessionLost=false,saindo=false;
const snap=()=>new Map(S.pacs.map(p=>[p.id,JSON.stringify(p)]));
function pendente(){if(!SB_ON)return false;const c=snap();return S.pacs.some(p=>synced.get(p.id)!==c.get(p.id))||[...synced.keys()].some(id=>!c.has(id))}
const SVTXT={ok:["● Salvo",""],loc:["● Salvo neste aparelho",""],pend:["● Salvando…","warn"],saving:["● Salvando…","warn"],err:["⚠ Não salvo — toque para tentar de novo","bad"],off:["⚠ Sem conexão — ainda não salvo","bad"]};
function setSv(s){svState=s;const el=$("#sv");if(!el)return;el.textContent=SVTXT[s][0];el.className="sv "+SVTXT[s][1]}
function save(){
  if(!SB_ON){try{localStorage[KEY]=JSON.stringify(S);setSv("loc")}catch{toast("Aviso: não foi possível salvar no navegador")}return}
  try{localStorage["pep-cur"]=S.cur||""}catch{}
  if(!UID||sessionLost)return;
  if(!pendente()){setSv("ok");return}
  setSv("pend");clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,400);
}
function syncNow(){clearTimeout(syncTimer);syncTimer=null;clearTimeout(retryTimer);syncQ=syncQ.then(syncRemote).catch(()=>{});return syncQ}
const agendaRetry=()=>{clearTimeout(retryTimer);retryTimer=setTimeout(syncNow,8000)};
async function syncRemote(){
  if(!UID||sessionLost)return;
  const cur=snap();
  const up=S.pacs.filter(p=>synced.get(p.id)!==cur.get(p.id));
  const del=[...synced.keys()].filter(id=>!cur.has(id));
  if(!up.length&&!del.length){setSv("ok");return}
  if(navigator.onLine===false){setSv("off");agendaRetry();return}
  setSv("saving");
  try{
    for(const p of up){
      const row={nome:p.nome,dados:p,updated_at:new Date().toISOString()};
      let r;
      if(revs.has(p.id)){
        r=chk(await sb.from("pacientes").update(row).eq("owner_id",UID).eq("id",p.id).eq("updated_at",revs.get(p.id)).select("updated_at"));
        if(!r.data.length){await conflito(p);return}
      }else{
        r=await sb.from("pacientes").insert({owner_id:UID,id:p.id,...row}).select("updated_at");
        if(r.error){if(r.error.code==="23505"){await conflito(p);return}throw r.error}
      }
      revs.set(p.id,r.data[0].updated_at);synced.set(p.id,cur.get(p.id));
    }
    if(del.length){chk(await sb.from("pacientes").delete().eq("owner_id",UID).in("id",del));del.forEach(id=>{synced.delete(id);revs.delete(id)})}
    if(pendente())save();else setSv("ok");
  }catch(e){await erroSync(e)}
}
async function erroSync(e){
  const msg=String(e&&(e.message||e));
  if(e&&(e.status===401||e.code==="PGRST301"||/jwt|token/i.test(msg))){
    try{const rs=await sb.auth.refreshSession();if(!rs.error&&rs.data.session){setSv("err");agendaRetry();return}}catch{}
    perdeuSessao();return}
  if(/failed to fetch|network|load failed/i.test(msg)||navigator.onLine===false){setSv("off");agendaRetry();return}
  setSv("err");agendaRetry();toast("Erro ao salvar no servidor: "+msg);
}
function perdeuSessao(){
  if(saindo||sessionLost)return;sessionLost=true;setSv("err");
  const m=$("#aMsg");if(m)m.textContent="Sessão expirada. Entre novamente: o que você digitou continua na tela e será salvo em seguida.";
  $("#auth").style.display="grid";
}
/* conflito: o servidor tem uma versão mais nova deste paciente (outro aparelho). Usa um diálogo próprio para não fechar o formulário aberto. */
async function conflito(p){
  const d=$("#dlgC");if(d.open)return;
  setSv("err");let sv=null;
  try{sv=chk(await sb.from("pacientes").select("dados,updated_at").eq("owner_id",UID).eq("id",p.id).maybeSingle()).data}catch(e){return erroSync(e)}
  d.innerHTML=sv?`<h3>Conflito de edição</h3><p><b>${esc(p.nome)}</b> foi alterado em outro aparelho (${fdate(sv.updated_at)}) depois que você abriu este paciente.</p><p style="color:var(--mut)">Escolha qual versão manter. A outra será descartada.</p><div class="bar"><button class="btn ghost" id="cv-srv">Usar a do servidor</button><button class="btn danger" id="cv-eu">Manter a minha (sobrescreve)</button></div>`
    :`<h3>Paciente removido em outro aparelho</h3><p><b>${esc(p.nome)}</b> não existe mais no servidor.</p><div class="bar"><button class="btn ghost" id="cv-srv">Descartar a minha versão</button><button class="btn" id="cv-eu">Recriar com a minha versão</button></div>`;
  d.showModal();
  const ok=await new Promise(res=>{
    $("#cv-srv").onclick=()=>{
      if(sv){const i=S.pacs.findIndex(x=>x.id===p.id);S.pacs[i]=normPac(sv.dados);synced.set(p.id,JSON.stringify(S.pacs[i]));revs.set(p.id,sv.updated_at)}
      else{S.pacs=S.pacs.filter(x=>x.id!==p.id);synced.delete(p.id);revs.delete(p.id);if(S.cur===p.id)S.cur=S.pacs[0]?.id||null}
      d.close();res(true)};
    $("#cv-eu").onclick=()=>{if(sv)revs.set(p.id,sv.updated_at);else revs.delete(p.id);d.close();res(true)};
    d.oncancel=()=>res(false);   /* Esc: o conflito continua pendente (aviso vermelho) */
  });
  if(ok)render();
}
async function loadRemote(){
  const r=chk(await sb.from("pacientes").select("id,dados,updated_at").order("created_at"));
  S.pacs=r.data.map(x=>{x.dados.id=x.id;return normPac(x.dados)});
  synced=new Map(S.pacs.map(p=>[p.id,JSON.stringify(p)]));revs=new Map(r.data.map(x=>[x.id,x.updated_at]));
  let c="";try{c=localStorage["pep-cur"]}catch{}S.cur=S.pacs.some(p=>p.id===c)?c:S.pacs[0]?.id||null;
}
/* ao voltar para a aba: se nada está pendente, traz o que foi alterado em outro aparelho (evita conflitos) */
async function refreshRemote(){
  if(!SB_ON||!UID||sessionLost||pendente()||$("#dlg").open||$("#dlgC").open||navigator.onLine===false)return;
  try{
    const r=chk(await sb.from("pacientes").select("id,dados,updated_at").order("created_at"));
    if(pendente()||$("#dlg").open)return;
    let mudou=false;const ids=new Set();
    for(const x of r.data){ids.add(x.id);if(revs.get(x.id)!==x.updated_at){x.dados.id=x.id;const n=normPac(x.dados),i=S.pacs.findIndex(p=>p.id===x.id);if(i<0)S.pacs.push(n);else S.pacs[i]=n;revs.set(x.id,x.updated_at);synced.set(x.id,JSON.stringify(n));mudou=true}}
    for(const p of [...S.pacs])if(!ids.has(p.id)){S.pacs=S.pacs.filter(q=>q.id!==p.id);revs.delete(p.id);synced.delete(p.id);mudou=true}
    if(mudou){if(!S.pacs.some(p=>p.id===S.cur))S.cur=S.pacs[0]?.id||null;render();toast("Dados atualizados com as alterações de outro aparelho")}
  }catch{}
}
const P=()=>S.pacs.find(p=>p.id===S.cur)||S.pacs[0];
let tab="Resumo",filtroEx="";
const TABS=["Resumo","Atendimentos","Evolução","Prescrições","Exames"];

/* =============== assinatura eletrônica (ponto de integração) ===============
   Para ligar um certificado em nuvem (ex.: VIDaaS, BirdID, SafeID, gov.br),
   registre um provedor em Signer.providers com um método sign(hashHex, ctx)
   que faça o fluxo OAuth/PSC do provedor e devolva {signature, signer, cert}.
   O hash SHA-256 do conteúdo clínico é calculado aqui; o conteúdo assinado
   fica travado (não editável) depois de assinado.                                */
const Signer={providers:{demo:{label:"Simulado (demonstração)",async sign(hash){return{signature:"DEMO-"+hash.slice(0,24),signer:"Dr(a). Fernando (assinatura simulada)",cert:"Sem validade legal"}}}}};
async function sha256(s){if(crypto&&crypto.subtle){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return("00000000"+(h>>>0).toString(16)).repeat(8)}
const canon=(tipo,pac,obj)=>JSON.stringify({tipo,pac:{id:pac.id,nome:pac.nome,cns:pac.cns,cpf:pac.cpf},doc:{...obj,adendos:undefined}});
function signDialog(tipo,obj,done){
  const pac=P();
  modal(`<h3>Assinar eletronicamente</h3><p style="color:var(--mut);margin:0">O conteúdo será travado após a assinatura.</p>
  <form><label>Provedor de certificado</label><select name="prov">${Object.entries(Signer.providers).map(([k,v])=>`<option value="${k}">${esc(v.label)}</option>`).join("")}</select>
  <p style="color:var(--mut);font-size:12.5px">Os provedores de certificado em nuvem (ICP-Brasil) serão adicionados aqui. Por ora só a assinatura simulada, sem validade legal.</p>
  <div class="bar"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn ok">${ic("pen")} Assinar</button></div></form>`,
  async f=>{const hash=await sha256(canon(tipo,pac,{...obj,assinatura:undefined}));
    try{const r=await Signer.providers[f.prov].sign(hash,{tipo,pac});obj.assinatura={provider:f.prov,hash,em:new Date().toISOString(),...r};}
    catch(e){toast("Falha na assinatura: "+e.message);return false}
    toast("Documento assinado");if(done)done()},false,{free:true});
}
const sigHtml=a=>a?`<div class="sigbox">${ic("lock")} Assinado por ${esc(a.signer)} em ${fdate(a.em)} · ${esc(a.cert||"")}<br>SHA-256: ${esc(a.hash)}</div>`:"";

/* =============== modal =============== */
/* liga cada <label> ao campo seguinte (clicar no rótulo foca o campo; leitores de tela leem o nome) */
function linkLabels(root){root.querySelectorAll("label").forEach(l=>{if(l.htmlFor||l.querySelector("input,select,textarea"))return;const n=l.nextElementSibling;const el=n&&(n.matches("input,select,textarea")?n:n.querySelector("input,select,textarea"));if(el){if(!el.id)el.id="f"+Math.random().toString(36).slice(2,8);l.htmlFor=el.id}})}
/* opts: free = não pede confirmação ao fechar; draft = o conteúdo é guardado à parte (fechar não perde nada);
   onInput = chamado a cada digitação (rascunho); onDiscard = chamado ao descartar. */
function modal(html,onSubmit,wide,opts={}){
  const d=$("#dlg");d.className=wide?"wide":"";d.innerHTML=html;if(!d.open)d.showModal();
  linkLabels(d);
  const f=d.querySelector("form");let sujo=false;
  if(f&&!opts.free){const m=()=>{sujo=true;if(opts.onInput)opts.onInput(f)};f.addEventListener("input",m);f.addEventListener("change",m)}
  const descartar=()=>{if(opts.onDiscard)opts.onDiscard();d.close()};
  d.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>{if(sujo&&!window.confirm(opts.draft?"Descartar o rascunho?":"Descartar o que foi digitado?"))return;descartar()});
  /* Esc / botão Voltar do celular: com rascunho, fecha (o texto fica guardado); sem rascunho, pergunta antes de perder */
  d.oncancel=e=>{if(!sujo||opts.draft)return;e.preventDefault();setTimeout(()=>{if(window.confirm("Descartar o que foi digitado?"))descartar()},0)};
  if(f)f.onsubmit=async e=>{e.preventDefault();try{const r=await onSubmit(Object.fromEntries(new FormData(f)),f);if(r===false)return;d.close();render()}catch(err){toast("Erro: "+(err.message||err))}};
  return f;
}
const confirmDlg=(msg,ok)=>modal(`<h3>Confirmar</h3><p>${msg}</p><form><div class="bar"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn danger">Confirmar</button></div></form>`,()=>ok());

/* =============== render =============== */
$("#dlCid").innerHTML=CID.map(([c,d])=>`<option value="${c} – ${d}">`).join("");
$("#dlMed").innerHTML=MEDS.map(m=>`<option value="${m}">`).join("");
$("#dlExame").innerHTML=EXAMES.map(e=>`<option value="${e[0]}">`).join("");

function render(){
  save();
  $("#pname").textContent=P()?P().nome.replace(/\(.*\)/,"").trim():"Nenhum paciente";
  $("#unid").textContent=PROF.unidade||"Definir unidade e profissional";
  document.querySelector(".who").textContent=PROF.nome?PROF.nome+(PROF.esp?" · "+PROF.esp:""):"";
  if(!S.pacs.length){$("#ficha").innerHTML='<div class="card empty">Nenhum paciente. Clique em “Novo paciente”.</div>';$("#tabs").innerHTML="";$("#view").innerHTML="";$("#plist").innerHTML="";return}
  const q=$("#q").value.toLowerCase().trim();
  $("#plist").innerHTML=S.pacs.filter(p=>!q||(p.nome+p.cpf+p.cns+p.pront).toLowerCase().includes(q)).map(p=>{
    const last=[...p.aten].sort((a,b)=>b.data.localeCompare(a.data))[0];
    return `<div class="pi ${p.id===S.cur?"on":""}" role="button" tabindex="0" data-act="sel" data-id="${esc(p.id)}">${avatar(p)}<div><b>${esc(p.nome.replace(/\(.*\)/,"").trim())}</b><small>${idade(p.nasc)} anos · ${last?"últ. "+new Date(last.data).toLocaleDateString("pt-BR"):"sem atendimento"}</small></div></div>`}).join("")||'<div style="color:#8ea0bd;padding:8px">Nenhum resultado</div>';
  const p=P();
  $("#ficha").innerHTML=`<div class="card"><div class="phead">${avatar(p)}<div style="flex:1;min-width:240px">
    <h2>${esc(p.nome)} <button class="btn ghost sm" data-act="editPac" title="Editar cadastro">${ic("edit")} Editar</button></h2>
    <div class="meta"><span><b>${SEXO[p.sexo]||"Sexo não informado"}</b>, ${idade(p.nasc)} anos (${fday(p.nasc)})</span><span>Prontuário <b>${esc(p.pront)}</b></span><span>CNS <b>${esc(p.cns)}</b></span><span>CPF <b>${esc(p.cpf)}</b></span><span>${esc(p.tel)}</span></div>
    <div class="meta"><span>${esc(p.end)}</span><span>${esc(p.equipe)}</span></div>
    ${!semAlergia(p.alergias)?`<div class="alert">⚠ Alergias: ${esc(p.alergias)}</div>`:`<div class="meta"><span>Alergias: <b>${esc(p.alergias||"não informado")}</b></span></div>`}
  </div></div></div>`;
  $("#tabs").innerHTML=TABS.map(t=>`<button class="${t===tab?"on":""}" role="tab" aria-selected="${t===tab}" data-act="tab" data-id="${t}">${ic(TABICO[t])}<span>${t}</span></button>`).join("");
  $("#view").innerHTML=({Resumo:vResumo,Atendimentos:vAten,"Evolução":vEvol,"Prescrições":vPresc,Exames:vEx})[tab]();
}

/* ---- resumo ---- */
function vResumo(){
  const p=P();const pend=p.exames.filter(e=>e.status==="Solicitado"||e.status==="Coletado"||e.status==="Em análise");
  const lastP=[...p.presc].sort((a,b)=>b.data.localeCompare(a.data))[0];
  const lastA=[...p.aten].sort((a,b)=>b.data.localeCompare(a.data))[0];
  return `<div class="stats"><div class="stat"><b>${p.aten.length}</b><span>Atendimentos</span></div><div class="stat"><b>${p.presc.length}</b><span>Prescrições</span></div><div class="stat"><b>${pend.length}</b><span>Exames pendentes</span></div><div class="stat"><b>${p.exames.reduce((n,e)=>n+(e.anexos||[]).length,0)}</b><span>Arquivos anexados</span></div></div>
  <div class="qa"><button class="btn" data-act="novoAten">${ic("plus")} Novo atendimento</button><button class="btn soft" data-act="novaPresc">${ic("plus")} Prescrever</button><button class="btn soft" data-act="novoEx">${ic("plus")} Solicitar exames</button><button class="btn soft" data-act="anexoAvulso">${ic("clip")} Anexar resultado</button></div>
  <div class="two"><div class="card"><h3>Último atendimento</h3>${lastA?atenHtml(lastA,false):'<div class="empty">Sem registros</div>'}</div>
  <div class="card"><h3>Última prescrição</h3>${lastP?`<table>${lastP.itens.map(i=>`<tr><td><b>${esc(i.med)}</b><br><small style="color:var(--mut)">${esc(i.dose)} · ${esc(i.via)} · ${esc(i.freq)} · ${esc(i.dur)}</small></td></tr>`).join("")}</table><small style="color:var(--mut)">${fdate(lastP.data)} ${lastP.assinatura?"· assinada":"· sem assinatura"}</small>`:'<div class="empty">Sem prescrições</div>'}
  <h3 style="margin-top:18px">Exames pendentes</h3>${pend.length?pend.map(e=>`<div>${esc(e.nome)} <span class="chip ${STCOLOR[e.status]||""}">${esc(e.status)}</span></div>`).join(""):'<div style="color:var(--mut)">Nenhum</div>'}</div></div>`;
}

/* ---- atendimentos ---- */
const atenHtml=(a,full=true)=>{const v=a.vit||{};const vit=[["PA",v.pa,""],["FC",v.fc,"bpm"],["T",v.temp,"°C"],["Peso",v.peso,"kg"],["SpO₂",v.sat,"%"]].filter(x=>x[1]);
  return `<div class="item"><div class="h"><div><b>${fdate(a.data)}</b> · ${esc(a.carater)} ${a.assinado?'<span class="chip ok">'+ic("lock")+' Assinado</span>':'<span class="chip warn">Rascunho</span>'}</div>
  ${full?`<div class="acts">${a.assinado?`<button class="btn sm ghost" data-act="adendoAten" data-id="${esc(a.id)}">${ic("plus")} Adendo</button>`:`<button class="btn sm ok" data-act="signAten" data-id="${esc(a.id)}">${ic("pen")} Assinar</button><button class="btn sm ghost" data-act="editAten" data-id="${esc(a.id)}">${ic("edit")} Editar</button><button class="btn sm danger" data-act="delAten" data-id="${esc(a.id)}">${ic("trash")}</button>`}</div>`:""}</div>
  ${vit.length?`<p style="color:var(--mut)">${vit.map(x=>`${x[0]} <b style="color:var(--ink)">${esc(x[1])}${x[2]}</b>`).join(" · ")}</p>`:""}
  ${["S","O","A","P"].filter(k=>a[k]).map(k=>`<p><b>${{S:"Subjetivo",O:"Objetivo",A:"Avaliação",P:"Plano"}[k]}:</b> ${esc(a[k])}</p>`).join("")}
  ${a.cids.length?`<p>${a.cids.map(c=>`<span class="chip">${esc(c)}</span>`).join(" ")}</p>`:""}
  ${a.proc&&full?`<p style="color:var(--mut)">Procedimento: ${esc(a.proc)}</p>`:""}${a.assinado&&a.assinatura?sigHtml(a.assinatura):""}
  ${(a.adendos||[]).map(x=>`<p style="border-left:3px solid var(--warn);padding-left:10px;margin-top:8px"><b>Adendo em ${fdate(x.em)}</b> <small style="color:var(--mut)">(acrescentado após a assinatura; não faz parte do documento assinado)</small><br>${esc(x.texto)}</p>`).join("")}</div>`};
function vAten(){const p=P();const l=[...p.aten].sort((a,b)=>b.data.localeCompare(a.data));
  return `<div class="card"><div class="head"><h3>Atendimentos</h3><button class="btn" data-act="novoAten">${ic("plus")} Novo atendimento</button></div>${l.length?l.map(a=>atenHtml(a)).join(""):'<div class="empty">Nenhum atendimento registrado.</div>'}</div>`}
function vEvol(){const p=P();const l=[...p.aten].sort((a,b)=>b.data.localeCompare(a.data));
  return `<div class="card"><h3>Evolução</h3>${l.length?`<div class="timeline">${l.map(a=>atenHtml(a,false)).join("")}</div>`:'<div class="empty">Sem evolução registrada.</div>'}</div>`}

function formAten(id){
  const ex=id?P().aten.find(a=>a.id===id):null;const cids=[...(ex?.cids||[])];const v=ex?.vit||{};
  /* rascunho automático: o que foi digitado fica guardado neste aparelho até salvar ou descartar */
  const dk=`pep-rascunho:${UID||"local"}:${S.cur}:${id||"novo"}`;
  let rasc=null;try{rasc=JSON.parse(localStorage[dk]||"null")}catch{}
  const guarda=f=>{try{localStorage[dk]=JSON.stringify({f:Object.fromEntries(new FormData(f)),cids,em:Date.now()})}catch{}};
  let gt;
  const form=modal(`<h3>${ex?"Editar":"Novo"} atendimento</h3><form>
  <div class="row"><div><label>Data/hora</label><div class="row"><input type="datetime-local" name="data" id="dt" value="${ex?.data||nowLocal()}"><button type="button" class="btn ghost sm fix" id="agora">Agora</button></div></div>
  <div><label>Caráter</label><select name="carater">${CARATER.map(c=>`<option ${ex?.carater===c?"selected":""}>${c}</option>`).join("")}</select></div></div>
  <div class="row"><div><label>PA</label><input name="pa" placeholder="120/80" value="${esc(v.pa)}"></div><div><label>FC (bpm)</label><input name="fc" value="${esc(v.fc)}"></div><div><label>Temp (°C)</label><input name="temp" value="${esc(v.temp)}"></div><div><label>Peso (kg)</label><input name="peso" value="${esc(v.peso)}"></div><div><label>SpO₂ (%)</label><input name="sat" value="${esc(v.sat)}"></div></div>
  <label>Subjetivo (queixa, HDA)</label><textarea name="S">${esc(ex?.S)}</textarea>
  <label>Objetivo (exame físico)</label><textarea name="O">${esc(ex?.O)}</textarea>
  <label>Avaliação</label><textarea name="A">${esc(ex?.A)}</textarea>
  <label>Plano / conduta</label><textarea name="P">${esc(ex?.P)}</textarea>
  <label>Diagnósticos (CID-10)</label><div class="row"><input id="cidIn" list="dlCid" placeholder="Buscar CID…"><button type="button" class="btn soft sm fix" id="addCid">Adicionar</button></div>
  <div id="cidList" style="margin-top:8px"></div>
  <label>Procedimento</label><input name="proc" value="${esc(ex?.proc??"Consulta médica (03.01.01.007-2)")}">
  <div class="bar"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Salvar rascunho</button></div></form>`,
  f=>{if(!(f.S||f.O||f.A||f.P)){toast("Preencha ao menos um campo clínico");return false}
    const o={data:f.data,carater:f.carater,vit:{pa:f.pa,fc:f.fc,temp:f.temp,peso:f.peso,sat:f.sat},S:f.S,O:f.O,A:f.A,P:f.P,cids:[...cids],proc:f.proc};
    if(ex)Object.assign(ex,o);else P().aten.push({id:uid(),assinado:false,...o});tab="Atendimentos";clearTimeout(gt);try{localStorage.removeItem(dk)}catch{}toast("Atendimento salvo")},true,
  {draft:true,onInput:f=>{clearTimeout(gt);gt=setTimeout(()=>guarda(f),300)},onDiscard:()=>{clearTimeout(gt);try{localStorage.removeItem(dk)}catch{}}});
  const draw=()=>$("#cidList").innerHTML=cids.map((c,i)=>`<span class="chip">${esc(c)} <a href="#" data-i="${i}" style="color:inherit;text-decoration:none">✕</a></span> `).join("");
  if(rasc){for(const [k,val] of Object.entries(rasc.f||{})){const el=form.elements[k];if(el&&el.type!=="file")el.value=val}cids.splice(0,cids.length,...(rasc.cids||[]));toast("Rascunho recuperado (guardado neste aparelho)")}
  draw();
  $("#agora").onclick=()=>$("#dt").value=nowLocal();
  $("#addCid").onclick=()=>{const x=$("#cidIn").value.trim();if(x){cids.push(x);$("#cidIn").value="";draw();guarda(form)}};
  $("#cidList").onclick=e=>{e.preventDefault();if(e.target.dataset.i){cids.splice(+e.target.dataset.i,1);draw();guarda(form)}};
}

/* ---- prescrições ---- */
function vPresc(){const p=P();const l=[...p.presc].sort((a,b)=>b.data.localeCompare(a.data));
  return `<div class="card"><div class="head"><h3>Prescrições</h3><button class="btn" data-act="novaPresc">${ic("plus")} Nova prescrição</button></div>
  ${l.length?l.map(r=>`<div class="item"><div class="h"><div><b>${fdate(r.data)}</b> ${r.assinatura?'<span class="chip ok">'+ic("lock")+' Assinada</span>':'<span class="chip warn">Sem assinatura</span>'}</div>
   <div class="acts">${r.assinatura?"":`<button class="btn sm ok" data-act="signPresc" data-id="${esc(r.id)}">${ic("pen")} Assinar</button>`}<button class="btn sm ghost" data-act="printPresc" data-id="${esc(r.id)}">${ic("print")} Imprimir</button><button class="btn sm ghost" data-act="repPresc" data-id="${esc(r.id)}">${ic("copy")} Repetir</button>${r.assinatura?"":`<button class="btn sm danger" data-act="delPresc" data-id="${esc(r.id)}">${ic("trash")}</button>`}</div></div>
   <table>${r.itens.map((i,n)=>`<tr><td style="width:28px;color:var(--mut)">${n+1}.</td><td><b>${esc(i.med)}</b><br><small style="color:var(--mut)">${esc(i.dose)} · ${esc(i.via)} · ${esc(i.freq)} · ${esc(i.dur)}</small></td><td style="text-align:right">${r.assinatura?'<span class="chip ok">'+ic("check")+'</span>':""}</td></tr>`).join("")}</table>${sigHtml(r.assinatura)}</div>`).join(""):'<div class="empty">Nenhuma prescrição.</div>'}</div>`}

function formPresc(base=[]){
  const itens=base.map(i=>({...i}));const aceitos=new Set();   /* itens com conflito que o médico já confirmou */
  const cfl=i=>conflitoAlergia(i.med,P().alergias);
  modal(`<h3>Nova prescrição</h3>${!semAlergia(P().alergias)?`<div class="alert">⚠ Alergias: ${esc(P().alergias)}</div>`:""}
  <div id="cfl"></div>
  <form><div class="row"><div style="flex:2"><label>Medicamento</label><input id="m" list="dlMed" placeholder="Digite para buscar"></div><div><label>Dose</label><input id="d" placeholder="1 cp"></div></div>
  <div class="row"><div><label>Via</label><select id="v"><option>VO</option><option>IM</option><option>EV</option><option>SC</option><option>Inalatória</option><option>Tópica</option></select></div><div><label>Frequência</label><input id="fq" placeholder="8/8h"></div><div><label>Duração</label><input id="du" placeholder="7 dias"></div><button type="button" class="btn soft fix" id="add">${ic("plus")} Item</button></div>
  <div id="lst" style="margin-top:14px"></div>
  <label style="display:flex;gap:8px;align-items:center;margin-top:14px"><input type="checkbox" name="sig"> Assinar ao salvar</label>
  <div class="bar"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Salvar prescrição</button></div></form>`,
  f=>{if(!itens.length){toast("Adicione ao menos um item");return false}
    const cf=itens.filter(i=>cfl(i).length&&!aceitos.has(i.med));
    if(cf.length&&!window.confirm("ATENÇÃO: possível conflito com a alergia registrada ("+P().alergias+") em: "+cf.map(i=>i.med).join("; ")+".\n\nSalvar mesmo assim?"))return false;
    const r={id:uid(),data:new Date().toISOString(),itens,assinatura:null};P().presc.push(r);tab="Prescrições";toast("Prescrição salva");
    if(f.sig)setTimeout(()=>signDialog("prescricao",r,render),50)},true);
  const draw=()=>{
    const cf=itens.map(i=>[i,cfl(i)]).filter(x=>x[1].length);
    $("#cfl").innerHTML=cf.length?`<div class="alert" style="display:block">⚠ Possível conflito com alergia: ${cf.map(([i,c])=>`<b>${esc(i.med)}</b> (${esc(c.join(", "))})`).join("; ")}. Remova o item ou confirme ao salvar.</div>`:"";
    $("#lst").innerHTML=itens.length?`<table>${itens.map((i,n)=>`<tr><td><b>${esc(i.med)}</b><br><small style="color:var(--mut)">${esc(i.dose)} · ${esc(i.via)} · ${esc(i.freq)} · ${esc(i.dur)}</small></td><td style="text-align:right"><a href="#" data-n="${n}" style="color:var(--bad)">remover</a></td></tr>`).join("")}</table>`:'<div style="color:var(--mut)">Nenhum item adicionado.</div>'};draw();
  $("#add").onclick=()=>{const med=$("#m").value.trim();if(!med)return;
    const c=conflitoAlergia(med,P().alergias);
    if(c.length){if(!window.confirm("ATENÇÃO: possível conflito com alergia registrada ("+c.join(", ")+") em “"+med+"”.\n\nAdicionar mesmo assim?"))return;aceitos.add(med)}
    itens.push({med,dose:$("#d").value,via:$("#v").value,freq:$("#fq").value,dur:$("#du").value||"uso contínuo"});["m","d","fq","du"].forEach(i=>$("#"+i).value="");draw();$("#m").focus()};
  $("#lst").onclick=e=>{e.preventDefault();if(e.target.dataset.n){itens.splice(+e.target.dataset.n,1);draw()}};
}

/* ---- exames ---- */
function vEx(){
  const p=P();const l=p.exames.filter(e=>!filtroEx||e.status===filtroEx).sort((a,b)=>b.data.localeCompare(a.data));
  return `<div class="card"><div class="head"><h3>Exames</h3><div class="row"><select id="fx" style="width:auto"><option value="">Todos os status</option>${STATUS_EX.map(s=>`<option ${s===filtroEx?"selected":""}>${s}</option>`).join("")}</select>
  <button class="btn ghost" data-act="printEx">${ic("print")} Imprimir pedido</button><button class="btn soft" data-act="anexoAvulso">${ic("clip")} Anexar resultado</button><button class="btn" data-act="novoEx">${ic("plus")} Solicitar</button></div></div>
  ${l.length?l.map(e=>`<div class="item"><div class="h"><div><b>${esc(e.nome)}</b> <span class="chip">${esc(e.tipo)}</span> <small style="color:var(--mut)">${e.soDia?new Date(e.data).toLocaleDateString("pt-BR"):fdate(e.data)}</small></div>
   <div class="acts"><select aria-label="Status do exame" data-act="stEx" data-id="${esc(e.id)}" style="width:auto;padding:4px 8px">${STATUS_EX.map(s=>`<option ${s===e.status?"selected":""}>${s}</option>`).join("")}</select><button class="btn sm soft" data-act="upEx" data-id="${esc(e.id)}">${ic("clip")} Anexar</button><button class="btn sm danger" aria-label="Excluir exame" data-act="delEx" data-id="${esc(e.id)}">${ic("trash")}</button></div></div>
   ${e.ind?`<p style="color:var(--mut)">Indicação: ${esc(e.ind)}</p>`:""}
   <div class="row" style="margin-top:6px"><input aria-label="Resultado do exame" data-act="resEx" data-id="${esc(e.id)}" value="${esc(e.res)}" placeholder="Resultado / observações (texto)"></div>
   <div style="margin-top:6px">${(e.anexos||[]).map(a=>`<span class="file">${ic("clip")} <a role="button" tabindex="0" data-act="openF" data-id="${esc(a.id)}" data-n="${esc(a.nome)}">${esc(a.nome)}</a> <small>${fsize(a.size)}</small> <a role="button" tabindex="0" data-act="dlF" data-id="${esc(a.id)}" data-n="${esc(a.nome)}" title="Baixar" aria-label="Baixar">${ic("dl")}</a> <a role="button" tabindex="0" data-act="delF" data-id="${esc(e.id)}" data-f="${esc(a.id)}" title="Remover" aria-label="Remover arquivo">✕</a></span>`).join("")}</div></div>`).join(""):'<div class="empty">Nenhum exame.</div>'}</div>`}

function formEx(){
  const extra=[];
  modal(`<h3>Solicitar exames</h3><form><label>Indicação clínica</label><input name="ind" required placeholder="Hipótese / motivo">
  <label>Buscar exame</label><div class="row"><input id="ex" list="dlExame" placeholder="Digite o nome"><button type="button" class="btn soft sm fix" id="addEx">Adicionar</button></div>
  <div id="extra" style="margin-top:8px"></div>
  <label>Ou marque rapidamente</label><div style="columns:2;gap:16px">${EXAMES.map(e=>`<label style="color:var(--ink);font-size:13px;font-weight:400;margin:3px 0;display:flex;gap:6px;align-items:center"><input type="checkbox" name="ck" value="${esc(e[0])}"> ${e[0]}</label>`).join("")}</div>
  <div class="bar"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Solicitar</button></div></form>`,
  (f,form)=>{const sel=new Set([...form.querySelectorAll("[name=ck]:checked")].map(c=>c.value));extra.forEach(x=>sel.add(x));
    if(!sel.size){toast("Selecione ao menos um exame");return false}
    const now=new Date().toISOString();sel.forEach(n=>P().exames.push({id:uid(),data:now,nome:n,tipo:(EXAMES.find(e=>e[0]===n)||[0,"Laboratorial"])[1],status:"Solicitado",ind:f.ind,res:"",anexos:[]}));tab="Exames";toast(sel.size+" exame(s) solicitado(s)")},true);
  $("#addEx").onclick=()=>{const v=$("#ex").value.trim();if(!v)return;const c=[...document.querySelectorAll("[name=ck]")].find(c=>c.value===v);if(c)c.checked=true;else{extra.push(v);$("#extra").innerHTML=extra.map(x=>`<span class="chip">${esc(x)}</span> `).join("")}$("#ex").value=""};
}
function formAvulso(){
  modal(`<h3>Anexar resultado de exame</h3><p style="color:var(--mut);margin:0">Guarda PDF/imagem de um exame já realizado.</p><form>
  <label>Nome do exame</label><input name="nome" list="dlExame" required><div class="row"><div><label>Data de realização</label><input type="date" name="dia" value="${nowLocal().slice(0,10)}"></div><div><label>Tipo</label><select name="tipo"><option>Laboratorial</option><option>Imagem</option></select></div></div>
  <label>Resultado / observações</label><textarea name="res"></textarea><label>Arquivo(s) (PDF, PNG, JPG ou WebP · até 15 MB)</label><input type="file" name="arq" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple>
  <div class="bar"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Salvar</button></div></form>`,
  async (f,form)=>{const files=[...form.arq.files];if(files.some(fl=>!okArquivo(fl)))return false;
    const e={id:uid(),data:new Date((f.dia||nowLocal().slice(0,10))+"T12:00").toISOString(),soDia:true,nome:f.nome,tipo:f.tipo,status:"Resultado",ind:"",res:f.res,anexos:[]};
    for(const fl of files)e.anexos.push(await addFile(fl));P().exames.push(e);tab="Exames";toast("Resultado guardado")});
}
async function addFile(fl){const id=uid();await fPut(id,fl);return{id,nome:fl.name,size:fl.size,mime:mimeDe(fl.name)}}
const achaAnexo=id=>{for(const p of S.pacs)for(const e of p.exames)for(const a of e.anexos||[])if(a.id===id)return a;return null};
/* o tipo vem da extensão (lista fechada), não do que o arquivo diz ser; a URL é liberada depois de 2 min */
async function getUrl(id,mime){const b=await fGet(id);if(!b)return null;const u=URL.createObjectURL(new Blob([b],{type:mime||"application/octet-stream"}));setTimeout(()=>URL.revokeObjectURL(u),120000);return u}

/* =============== impressão =============== */
function imprimir(tipo,id){
  const p=P();
  if(!PROF.nome||!PROF.crm){toast("Preencha nome e CRM em “Dados do profissional” antes de imprimir");formProf();return}
  const cab=`<h2>${tipo==="presc"?"Receituário":"Solicitação de exames"}</h2><div>${esc(PROF.unidade||"")}</div><p><b>${esc(p.nome)}</b> · ${SEXO[p.sexo]||"sexo não informado"} · ${idade(p.nasc)} anos (${fday(p.nasc)})<br>CNS ${esc(p.cns)} · CPF ${esc(p.cpf)}${p.end?"<br>"+esc(p.end):""}</p><hr>`;
  let corpo,ass="";
  if(tipo==="presc"){const r=p.presc.find(x=>x.id===id);corpo=`<ol>${r.itens.map(i=>`<li style="margin-bottom:10px"><b>${esc(i.med)}</b><br>${esc(i.dose)} · ${esc(i.via)} · ${esc(i.freq)} · ${esc(i.dur)}</li>`).join("")}</ol><p>${fdate(r.data)}</p>`;
    if(r.assinatura)ass=`Assinado eletronicamente por ${esc(r.assinatura.signer)} em ${fdate(r.assinatura.em)}<br>Certificado: ${esc(r.assinatura.cert||"")}<br>SHA-256: ${esc(r.assinatura.hash)}`}
  else{const l=p.exames.filter(e=>e.status==="Solicitado");if(!l.length){toast("Não há exames com status “Solicitado”");return}
    corpo=`<ul>${l.map(e=>`<li>${esc(e.nome)} <small>(${esc(e.tipo)})</small></li>`).join("")}</ul><p><b>Indicação:</b> ${esc([...new Set(l.map(e=>e.ind))].join("; "))}</p><p>${fdate(new Date().toISOString())}</p>`}
  const prof=`${esc(PROF.nome)} — CRM${PROF.uf?"/"+esc(PROF.uf):""} ${esc(PROF.crm)}${PROF.esp?" · "+esc(PROF.esp):""}`;
  $("#print").innerHTML=cab+corpo+`<div class="sig">${prof}<br>${ass||"sem assinatura eletrônica"}</div>`;
  window.print();
}

/* =============== ações (delegação) =============== */
function formPac(id){
  const ex=id?S.pacs.find(p=>p.id===id):{};const F=(n,l,t="text",x="")=>`<div><label>${l}</label><input type="${t}" name="${n}" value="${esc(ex[n]??"")}" ${x}></div>`;
  modal(`<h3>${id?"Editar cadastro":"Novo paciente"}</h3><p style="color:var(--mut);margin:0">Use apenas dados fictícios.</p><form>
  <div class="row">${F("nome","Nome completo","text","required")}${F("social","Nome social")}</div>
  <div class="row"><div><label>Sexo</label><select name="sexo"><option value="" ${!ex.sexo?"selected":""}>Não informado</option><option value="F" ${ex.sexo==="F"?"selected":""}>Feminino</option><option value="M" ${ex.sexo==="M"?"selected":""}>Masculino</option></select></div>${F("nasc","Nascimento","date","required")}${F("raca","Raça/cor")}</div>
  <div class="row">${F("cns","CNS")}${F("cpf","CPF")}${F("tel","Telefone")}</div>${F("end","Endereço")}${F("equipe","Equipe / INE")}${F("alergias","Alergias")}
  <div class="bar"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Salvar</button></div></form>`,
  f=>{
    const hoje=new Date().toISOString().slice(0,10);
    if(!f.nasc||f.nasc>hoje||f.nasc<"1900-01-01"){toast("Data de nascimento inválida (futura ou anterior a 1900)");return false}
    const outros=S.pacs.filter(x=>x.id!==id);
    const rep=outros.find(x=>(dg(f.cpf)&&dg(x.cpf)===dg(f.cpf))||(dg(f.cns)&&dg(x.cns)===dg(f.cns)));
    if(rep&&!window.confirm("Já existe um paciente com este CPF/CNS: "+rep.nome+".\n\nSalvar mesmo assim?"))return false;
    if(dg(f.cpf)&&!cpfOk(f.cpf)&&!window.confirm("CPF com dígitos verificadores inválidos.\n\nSalvar mesmo assim? (só aceitável para dados fictícios)"))return false;
    if(dg(f.cns)&&!cnsOk(f.cns)&&!window.confirm("CNS inválido (15 dígitos com dígito verificador).\n\nSalvar mesmo assim?"))return false;
    if(id)Object.assign(ex,f);
    else{const n=uid(),prox=Math.max(10000,...S.pacs.map(p=>parseInt(p.pront)||0))+1;S.pacs.push({id:n,pront:String(prox),aten:[],presc:[],exames:[],alergias:"Nenhuma conhecida",...f});S.cur=n;tab="Resumo"}
    toast("Cadastro salvo")},true);
}
function formProf(){
  const F=(n,l,ph="")=>`<div><label>${l}</label><input name="${n}" value="${esc(PROF[n]||"")}" placeholder="${esc(ph)}"></div>`;
  modal(`<h3>Dados do profissional</h3><p style="color:var(--mut);margin:0">Saem no cabeçalho e na assinatura de receitas e pedidos. Ficam salvos na sua conta.</p><form>
  ${F("nome","Nome completo","Dr(a). Nome Sobrenome")}<div class="row">${F("crm","CRM")}${F("uf","UF")}${F("esp","Especialidade")}</div>${F("unidade","Unidade de saúde (cabeçalho)","UBS …")}
  <div class="bar"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Salvar</button></div></form>`,
  async f=>{const n={nome:f.nome.trim(),crm:f.crm.trim(),uf:f.uf.trim().toUpperCase(),esp:f.esp.trim(),unidade:f.unidade.trim()};
    if(SB_ON){const r=await sb.auth.updateUser({data:{prof:n}});if(r.error)throw r.error}
    PROF=n;try{localStorage["pep-prof"]=JSON.stringify(PROF)}catch{}toast("Dados do profissional salvos")},false,{free:true});
}
async function removeAllFiles(list){for(const e of list)for(const a of e.anexos||[])await fDel(a.id)}
const A={
  sel(id){S.cur=id;render()},tab(id){tab=id;render()},
  editPac(){formPac(S.cur)},
  novoAten(){formAten()},editAten(id){formAten(id)},
  signAten(id){const a=P().aten.find(x=>x.id===id);signDialog("atendimento",a,()=>{a.assinado=true;a.assinadoEm=a.assinatura.em;render()})},
  delAten(id){confirmDlg("Excluir este rascunho de atendimento?",()=>{P().aten=P().aten.filter(a=>a.id!==id)})},
  novaPresc(){formPresc()},
  repPresc(id){formPresc(P().presc.find(r=>r.id===id).itens)},
  signPresc(id){const r=P().presc.find(x=>x.id===id);signDialog("prescricao",r,render)},
  printPresc(id){imprimir("presc",id)},
  delPresc(id){confirmDlg("Excluir esta prescrição?",()=>{P().presc=P().presc.filter(r=>r.id!==id)})},
  novoEx(){formEx()},anexoAvulso(){formAvulso()},printEx(){imprimir("ex")},
  delEx(id){confirmDlg("Excluir este exame e seus arquivos?",async()=>{const e=P().exames.find(x=>x.id===id);await removeAllFiles([e]);P().exames=P().exames.filter(x=>x.id!==id)})},
  upEx(id){const u=$("#upFile");u.value="";u.onchange=async()=>{const e=P().exames.find(x=>x.id===id);const fs=[...u.files];if(fs.some(f=>!okArquivo(f)))return;try{for(const f of fs)(e.anexos=e.anexos||[]).push(await addFile(f))}catch(err){return toast("Erro ao enviar arquivo: "+(err.message||err))}if(e.status==="Solicitado"||e.status==="Coletado"||e.status==="Em análise")e.status="Resultado";toast("Arquivo guardado");render()};u.click()},
  /* a janela é aberta no próprio toque (celulares bloqueiam window.open depois de um await) e só então recebe o arquivo */
  async openF(id){const a=achaAnexo(id),mime=a&&mimeDe(a.nome);if(!mime)return toast("Este tipo de arquivo não pode ser visualizado; use Baixar");
    const w=window.open("about:blank","_blank");if(w)w.opener=null;
    const u=await getUrl(id,mime);if(!u){if(w)w.close();return toast("Arquivo não encontrado")}
    if(w)w.location.href=u;else toast("O navegador bloqueou a janela; use Baixar")},
  async dlF(id,el){const u=await getUrl(id,"application/octet-stream");if(!u)return toast("Arquivo não encontrado");const a=document.createElement("a");a.href=u;a.download=(el.dataset.n||"arquivo").replace(/[\\/:*?"<>|]/g,"_");a.click()},
  prof(){formProf()},sync(){if(svState==="err"||svState==="off")syncNow()},
  adendoAten(id){const a=P().aten.find(x=>x.id===id);modal(`<h3>Adendo ao atendimento</h3><p style="color:var(--mut);margin:0">O atendimento assinado não é alterado. O adendo fica registrado com data e hora, abaixo dele.</p><form><label>Texto do adendo</label><textarea name="t" required></textarea><div class="bar"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn">Registrar adendo</button></div></form>`,f=>{(a.adendos=a.adendos||[]).push({id:uid(),em:new Date().toISOString(),texto:f.t.trim()});toast("Adendo registrado")})},
  delF(id,el){confirmDlg("Remover este arquivo?",async()=>{const e=P().exames.find(x=>x.id===id);await fDel(el.dataset.f);e.anexos=e.anexos.filter(a=>a.id!==el.dataset.f)})}
};
document.addEventListener("click",e=>{const t=e.target.closest("[data-act]");if(!t||t.tagName==="SELECT"||t.tagName==="INPUT")return;e.preventDefault();if(Object.hasOwn(A,t.dataset.act))A[t.dataset.act](t.dataset.id,t)});
/* teclado: Enter/Espaço ativam itens clicáveis que não são <button> (lista de pacientes, links de arquivo) */
document.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches&&e.target.matches("[data-act][tabindex]")){e.preventDefault();e.target.click()}});
document.addEventListener("change",e=>{const t=e.target;if(t.id==="fx"){filtroEx=t.value;render();return}
  if(t.dataset.act==="stEx"){P().exames.find(x=>x.id===t.dataset.id).status=t.value;render()}
  if(t.dataset.act==="resEx"){const x=P().exames.find(x=>x.id===t.dataset.id);x.res=t.value;if(t.value&&x.status==="Solicitado")x.status="Resultado";render()}});
$("#novoPac").onclick=()=>formPac();
/* menu lateral (celular) */
const menu=o=>document.body.classList.toggle("menu",o);
$("#menuBtn").onclick=()=>menu(true);$("#scrim").onclick=()=>menu(false);$("#menuClose").onclick=()=>menu(false);
document.querySelector("aside").addEventListener("click",e=>{if(e.target.closest(".pi,.sidefoot button,#novoPac"))menu(false)});
$("#q").oninput=render;
$("#reset").onclick=()=>confirmDlg("Restaurar dados de demonstração? Todos os pacientes e arquivos serão apagados.",async()=>{const db=await DB;db.transaction("f","readwrite").objectStore("f").clear();S=seed();tab="Resumo"});

/* backup */
$("#exp").onclick=async()=>{const files={};for(const p of S.pacs)for(const e of p.exames)for(const a of e.anexos||[]){const b=await fGet(a.id);if(b)files[a.id]=await b64(b)}
  const blob=new Blob([JSON.stringify({versao:1,exportadoEm:new Date().toISOString(),S,files})],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="backup-pep-"+new Date().toISOString().slice(0,10)+".json";a.click();toast("Backup exportado")};
$("#imp").onclick=()=>$("#impFile").click();
$("#impFile").onchange=async e=>{const f=e.target.files[0];if(!f)return;
  try{const d=JSON.parse(await f.text());
    if(!Array.isArray(d.S?.pacs)||d.S.pacs.some(p=>!p||typeof p.id!=="string"||typeof p.nome!=="string"))throw 0;
    d.S.pacs.forEach(p=>{p.id=p.id.replace(/[^\w-]/g,"");normPac(p)});
    const novos=new Set(d.S.pacs.map(p=>p.id)),somem=S.pacs.filter(p=>!novos.has(p.id));
    confirmDlg(`O arquivo tem <b>${d.S.pacs.length}</b> paciente(s). Importar <b>substitui todos os dados atuais</b>: ${somem.length?`<b>${somem.length}</b> paciente(s) que não estão no arquivo serão removidos`:"nenhum paciente atual será removido"}${SB_ON?", <b>inclusive do servidor</b> (não dá para desfazer)":""}.<br><br>Se tiver dúvida, cancele e use “Exportar backup” antes.`,
      async()=>{for(const [id,u] of Object.entries(d.files||{}))await fPut(String(id).replace(/[^\w-]/g,""),await (await fetch(u)).blob());S.pacs=d.S.pacs;S.cur=d.S.pacs.some(p=>p.id===S.cur)?S.cur:d.S.pacs[0]?.id||null;tab="Resumo";toast("Backup importado")})}
  catch{toast("Arquivo de backup inválido")}e.target.value=""};
/* =============== login (Supabase) e inicialização =============== */
const cred=()=>({email:$("#aEmail").value.trim(),password:$("#aPass").value});
async function enter(user){
  /* sessão que expirou com alterações na tela: volta a gravar sem recarregar (não descarta o que foi digitado) */
  if(sessionLost&&UID===user.id){sessionLost=false;$("#auth").style.display="none";$("#aMsg").textContent="";toast("Sessão retomada");syncNow();return}
  UID=user.id;sessionLost=false;$("#auth").style.display="none";$("#out").style.display="";
  const pf=user.user_metadata&&user.user_metadata.prof;if(pf&&typeof pf==="object")PROF=pf;
  try{await loadRemote()}catch(e){toast("Erro ao carregar: "+(e.message||e))}render()}
$("#aForm").onsubmit=async e=>{e.preventDefault();const {data,error}=await sb.auth.signInWithPassword(cred());if(error)return void($("#aMsg").textContent=error.message);enter(data.user)};
$("#out").onclick=async()=>{
  if(pendente()){await syncNow();if(pendente()&&!window.confirm("Há alterações ainda não salvas no servidor. Sair mesmo assim? Elas serão perdidas."))return}
  saindo=true;try{Object.keys(localStorage).filter(k=>k.startsWith("pep-rascunho:")||k==="pep-cur").forEach(k=>localStorage.removeItem(k))}catch{}
  await sb.auth.signOut();location.reload()};
/* sai sozinho depois de 20 min sem uso (aparelho esquecido aberto); só se tudo estiver salvo */
const INATIV_MIN=20;let ultimaAtiv=Date.now();
["pointerdown","keydown","touchstart","scroll"].forEach(ev=>addEventListener(ev,()=>{ultimaAtiv=Date.now()},{passive:true}));
setInterval(async()=>{if(!SB_ON||!UID||sessionLost||saindo)return;if(Date.now()-ultimaAtiv<INATIV_MIN*60000)return;
  await syncNow();if(pendente())return;saindo=true;try{await sb.auth.signOut()}catch{}location.reload()},30000);
addEventListener("online",()=>{if(SB_ON)syncNow()});
document.addEventListener("visibilitychange",()=>{if(!SB_ON)return;if(document.visibilityState==="visible")refreshRemote();else if(pendente())syncNow()});
addEventListener("pagehide",()=>{if(SB_ON&&pendente())syncNow()});
addEventListener("beforeunload",e=>{if(SB_ON&&!saindo&&(pendente()||svState==="err"||svState==="off")){e.preventDefault();e.returnValue=""}});
/* Com Supabase configurado, o app NUNCA cai para o modo local: sem a biblioteca ou sem conexão, trava com erro. */
function lockApp(msg){const a=$("#auth");a.innerHTML=`<div class="card" style="width:min(440px,100%)"><h3 style="font-size:20px;color:var(--bad)">Não foi possível iniciar o sistema</h3><p>${msg}</p><p style="color:var(--mut)">Verifique sua conexão com a internet e recarregue a página. Nenhum dado é exibido sem login.</p><div class="bar"><button class="btn" id="lk-rl">Recarregar</button></div></div>`;a.style.display="grid";$("#lk-rl").onclick=()=>location.reload()}
(async function boot(){
  if(SUPABASE_URL&&SUPABASE_ANON_KEY&&!window.supabase){lockApp("A biblioteca de autenticação (Supabase) não carregou.");return}
  if(!SB_ON){render();return}
  $("#reset").style.display="none";
  /* nunca chamar o Supabase de dentro deste callback (a biblioteca trava); só mexe na tela */
  sb.auth.onAuthStateChange(ev=>{if(ev==="SIGNED_OUT"&&UID&&!saindo)setTimeout(perdeuSessao,0)});
  try{const {data,error}=await sb.auth.getSession();if(error)throw error;
    if(data.session)enter(data.session.user);else $("#auth").style.display="grid"}
  catch(e){lockApp("Falha ao verificar a sessão: "+esc(e.message||e))}
})();
