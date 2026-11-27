// Formulário da pré-consulta, usado por consulta.html e portal.html.
// PreConsulta.abrir(container, { enviar(resp) -> Promise<{ok, erro?}>, voltar() })
(function () {
  var st = document.createElement("style");
  st.textContent = ".fpc{display:block}\n" + "  .fpc label{display:block;font-weight:700;font-size:14px;margin:14px 0 5px}\n  .fpc label small{font-weight:500;color:var(--mut)}\n  .fpc textarea,.fpc input[type=text]{width:100%;font:inherit;font-size:16px;padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--ink)}\n  .fpc textarea{min-height:70px;resize:vertical}\n  .fpc .q{margin-top:12px;font-size:14px}\n  .fpc .ops{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}\n  .fpc .ops label{margin:0;font-weight:500;font-size:13.5px;border:1px solid var(--line);border-radius:10px;padding:9px 10px;background:#fff;display:flex;gap:6px;align-items:center}\n  .fpc .ops input:checked+span{font-weight:800;color:var(--brand)}\n  .fpc .grupo{margin-top:18px;padding-top:12px;border-top:1px dashed var(--line)}\n  .fpc .aceite{display:flex;gap:8px;align-items:flex-start;font-weight:500;font-size:13.5px}\n  .fpc .msg{color:#c62828;font-size:14px;margin-top:10px;text-align:center}\n";
  document.head.appendChild(st);
  var OPS = ["Nenhuma vez", "Vários dias", "Mais da metade dos dias", "Quase todos os dias"];
  var ESCALAS = [["phq2", ["Pouco interesse ou pouco prazer em fazer as coisas", "Se sentir para baixo, deprimido(a) ou sem perspectiva"]],
    ["gad2", ["Se sentir nervoso(a), ansioso(a) ou muito tenso(a)", "Não conseguir impedir ou controlar as preocupações"]]];
  function el(t, txt, cls) { var e = document.createElement(t); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; }
  function abrir(box, o) {
    var f = el("form", null, "fpc"); f.noValidate = true;
    box.appendChild(el("p", "Suas respostas vão direto para o prontuário e só o consultório tem acesso. Responda o que souber; só o primeiro campo é obrigatório.", "nota"));
    function campo(id, rot, dica, tipo, max) { var l = el("label", rot + " "); if (dica) l.appendChild(el("small", dica)); l.htmlFor = id; f.appendChild(l);
      var i = document.createElement(tipo === "linha" ? "input" : "textarea"); if (tipo === "linha") i.type = "text"; i.id = id; i.maxLength = max; f.appendChild(i); }
    campo("pc-motivo", "Qual o motivo da consulta?", "(obrigatório)", "texto", 500);
    campo("pc-desde", "Desde quando?", "(ex.: há 2 semanas)", "linha", 120);
    campo("pc-remedios", "Quais remédios você usa hoje?", "(nome e dose, se souber; inclua vitaminas e chás)", "texto", 600);
    campo("pc-alergias", "Tem alergia a algum remédio ou alimento?", "", "linha", 300);
    campo("pc-doencas", "Doenças que você tem ou cirurgias que já fez", "", "texto", 400);
    var g = el("div", null, "grupo"); g.appendChild(el("label", "Nas últimas 2 semanas, com que frequência você se sentiu assim? ")); g.lastChild.appendChild(el("small", "(opcional)"));
    ESCALAS.forEach(function (e) { e[1].forEach(function (pergunta, qi) {
      g.appendChild(el("div", pergunta, "q")); var ops = el("div", null, "ops");
      OPS.forEach(function (op, v) { var l = document.createElement("label"); var r = document.createElement("input"); r.type = "radio"; r.name = e[0] + "_" + qi; r.value = v; l.appendChild(r); l.appendChild(el("span", op)); ops.appendChild(l); });
      g.appendChild(ops); }); });
    f.appendChild(g);
    campo("pc-outros", "Quer contar mais alguma coisa?", "(opcional)", "texto", 600);
    var ac = el("label", null, "aceite"); var cb = document.createElement("input"); cb.type = "checkbox"; cb.id = "pc-aceite"; ac.appendChild(cb);
    ac.appendChild(el("span", "Autorizo o envio destas informações ao consultório para uso no meu atendimento.")); f.appendChild(ac);
    var msg = el("div", "", "msg"); f.appendChild(msg);
    var env = el("button", "Enviar respostas", "verde"); env.type = "submit"; f.appendChild(env);
    var volta = el("button", "Voltar", "sec"); volta.type = "button"; volta.onclick = function () { o.voltar(); }; f.appendChild(volta);
    box.appendChild(f);
    f.onsubmit = function (ev) {
      ev.preventDefault(); msg.textContent = "";
      var v = function (id) { return document.getElementById(id).value.trim(); };
      if (!v("pc-motivo")) { msg.textContent = "Conte o motivo da consulta."; document.getElementById("pc-motivo").focus(); return; }
      if (!cb.checked) { msg.textContent = "Marque a autorização para enviar."; return; }
      var resp = { motivo: v("pc-motivo"), desde: v("pc-desde"), remedios: v("pc-remedios"), alergias: v("pc-alergias"), doencas: v("pc-doencas"), outros: v("pc-outros") };
      ESCALAS.forEach(function (e) { var a = [0, 1].map(function (qi) { var x = f.querySelector('input[name="' + e[0] + "_" + qi + '"]:checked'); return x ? +x.value : null; });
        if (a[0] != null && a[1] != null) resp[e[0]] = a; });
      env.disabled = true;
      o.enviar(resp).then(function (r) {
        if (r && r.ok) { window.scrollTo(0, 0); return; }
        env.disabled = false; msg.textContent = r && r.erro === "consulta_encerrada" ? "Esta consulta já foi encerrada ou cancelada." : "Não foi possível enviar agora. Tente de novo.";
      }).catch(function () { env.disabled = false; msg.textContent = "Sem conexão. Suas respostas continuam aqui; tente de novo."; });
    };
    window.scrollTo(0, 0);
  }
  window.PreConsulta = { abrir: abrir };
})();
