/* Tributax docs — roteador hash-based + simulador + downloads de payload */
(function () {
  "use strict";

  var API = location.origin;
  var PAGES = [
    { group: "Primeiros passos", items: [
      { id: "inicio", label: "Visão geral" },
      { id: "comeco-rapido", label: "Início rápido" },
      { id: "autenticacao", label: "Autenticação & chaves" },
    ]},
    { group: "Ferramentas", items: [
      { id: "simulador", label: "Simulador" },
      { id: "payloads", label: "Payloads por cenário" },
    ]},
    { group: "Referência", items: [
      { id: "api", label: "Endpoints" },
      { id: "resposta", label: "Entendendo a resposta" },
      { id: "erros", label: "Erros & status" },
      { id: "tributos", label: "Tributos & cobertura" },
    ]},
    { group: "Integração", items: [
      { id: "sdk", label: "SDK TypeScript" },
      { id: "mcp", label: "Agentes & MCP" },
      { id: "webhooks", label: "Webhooks & idempotência" },
    ]},
    { group: "Mais", items: [
      { id: "deploy", label: "Deploy & operação" },
      { id: "para-llms", label: "Documentação para LLMs" },
      { id: "adrs", label: "Decisões de arquitetura" },
    ]},
  ];

  // ---------- nav ----------
  function buildNav() {
    var nav = document.getElementById("nav");
    var html = "";
    PAGES.forEach(function (g) {
      html += '<div class="nav-group"><div class="nav-group-title">' + g.group + "</div>";
      g.items.forEach(function (it) {
        html += '<a class="nav-item" data-page="' + it.id + '" href="#/' + it.id + '">' + it.label + "</a>";
      });
      html += "</div>";
    });
    nav.innerHTML = html;
  }

  // ---------- busca simples: filtra itens da nav ----------
  function bindSearch() {
    var input = document.getElementById("search");
    input.addEventListener("input", function () {
      var q = input.value.toLowerCase();
      document.querySelectorAll(".nav-item").forEach(function (el) {
        el.style.display = el.textContent.toLowerCase().indexOf(q) >= 0 ? "" : "none";
      });
      document.querySelectorAll(".nav-group-title").forEach(function (el) {
        var group = el.parentElement;
        var any = group.querySelectorAll('.nav-item:not([style*="none"])').length > 0;
        group.style.display = any ? "" : "none";
      });
    });
  }

  // ---------- roteador ----------
  function currentPage() {
    var h = location.hash.replace(/^#\/?/, "");
    return h || "inicio";
  }

  function setActive(page) {
    document.querySelectorAll(".nav-item").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-page") === page);
    });
  }

  function fetchPage(id) {
    return fetch("/docs/site/pages/" + id + ".md").then(function (r) {
      if (!r.ok) throw new Error("página não encontrada: " + id);
      return r.text();
    });
  }

  function render(page) {
    setActive(page);
    var content = document.getElementById("content");
    content.innerHTML = '<div class="loading">Carregando…</div>';
    fetchPage(page)
      .then(function (md) {
        content.innerHTML = marked.parse(md, { breaks: false, gfm: true });
        enhancePage(page);
        content.scrollIntoView();
        window.scrollTo(0, 0);
      })
      .catch(function () {
        content.innerHTML = "<h1>404</h1><p>Página não encontrada. <a href='#/inicio'>Voltar ao início.</a></p>";
      });
  }

  // ---------- melhorias pós-render ----------
  function enhancePage(page) {
    enhancePayloads();
    if (page === "simulador") mountSimulator();
    // links relativos .md da doc oficial → servidos pela própria API
    contentFixLinks();
  }

  function contentFixLinks() {
    document.querySelectorAll("#content a").forEach(function (a) {
      var href = a.getAttribute("href") || "";
      if (/^https?:/.test(href)) { a.target = "_blank"; a.rel = "noopener"; }
    });
  }

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("show"); }, 10);
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 1800);
  }

  // payload cards: <div class="payload-card" data-file="x.json"><div class="payload-head">…</div><pre><code>JSON</code></pre></div>
  function enhancePayloads() {
    document.querySelectorAll(".payload-card").forEach(function (card) {
      if (card.dataset.enhanced) return;
      card.dataset.enhanced = "1";
      var file = card.getAttribute("data-file") || "payload.json";
      var pre = card.querySelector("pre");
      if (!pre) return;
      var head = card.querySelector(".payload-head") || (function () {
        var h = document.createElement("div");
        h.className = "payload-head";
        h.innerHTML = "<h3>" + file + "</h3>";
        card.insertBefore(h, card.firstChild);
        return h;
      })();
      var actions = document.createElement("div");
      actions.className = "payload-actions";
      var dl = document.createElement("button");
      dl.className = "dl-link";
      dl.textContent = "Baixar .json";
      dl.addEventListener("click", function () {
        var blob = new Blob([pre.textContent], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file;
        a.click();
        URL.revokeObjectURL(a.href);
      });
      var cp = document.createElement("button");
      cp.className = "dl-link";
      cp.textContent = "Copiar";
      cp.addEventListener("click", function () {
        navigator.clipboard.writeText(pre.textContent).then(function () { toast("Payload copiado!"); });
      });
      actions.appendChild(dl);
      actions.appendChild(cp);
      head.appendChild(actions);
    });
  }

  // ---------- simulador ----------
  var UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

  function mountSimulator() {
    var mount = document.getElementById("simulator");
    if (!mount) return;
    mount.innerHTML =
      '<div class="sim-grid">' +
      '<div class="sim-panel"><h3>Operação</h3>' +
        '<div class="field"><label>API key (x-api-key)</label><input id="sim-key" type="password" placeholder="cole sua API key"/></div>' +
        '<div class="field"><label>Descrição do item</label><input id="sim-desc" type="text" value="Notebook"/></div>' +
        '<div class="field-row"><div class="field"><label>Valor (R$)</label><input id="sim-price" type="number" min="0.01" step="0.01" value="3500.00"/></div>' +
        '<div class="field"><label>NCM (opcional)</label><input id="sim-ncm" type="text" value="84713012"/></div></div>' +
        '<div class="field-row"><div class="field"><label>UF destinatário</label><select id="sim-uf">' + UFS.map(function (u) { return '<option' + (u === "SP" ? " selected" : "") + ">" + u + "</option>"; }).join("") + "</select></div>" +
        '<div class="field"><label>RBT12 (R$, p/ Simples)</label><input id="sim-rbt12" type="number" min="0" step="0.01" value=""/></div></div>' +
        '<div class="field-row"><div class="field"><label>Tipo de operação</label><select id="sim-kind"><option value="AUTO">Automático</option><option value="SALE_GOODS">Venda de mercadoria</option><option value="SERVICE_PROVISION">Prestação de serviço</option><option value="EXPORT">Exportação</option></select></div>' +
        '<div class="field"><label>Código de serviço (LC 116)</label><input id="sim-svc" type="text" placeholder="ex.: 1.05"/></div></div>' +
        '<button class="sim-run" id="sim-run">Calcular tributos</button>' +
        '<div class="sim-key-note">Sem uma API key? A documentação de início rápido explica como criar sua conta e chave.</div>' +
      "</div>" +
      '<div class="sim-panel"><h3>Resultado</h3><div class="sim-result" id="sim-result"><div style="color:var(--ink-mute);font-size:14px">Preencha a operação e clique em <b>Calcular tributos</b>.</div></div></div>' +
      "</div>";

    var keyInput = document.getElementById("sim-key");
    keyInput.value = localStorage.getItem("tributax_docs_api_key") || "";
    keyInput.addEventListener("change", function () { localStorage.setItem("tributax_docs_api_key", keyInput.value.trim()); });

    document.getElementById("sim-run").addEventListener("click", runSimulation);
  }

  function runSimulation() {
    var result = document.getElementById("sim-result");
    var key = (document.getElementById("sim-key").value || "").trim();
    if (!key) {
      result.innerHTML = '<div class="sim-err">Informe uma API key válida (fica salva só no seu navegador).</div>';
      return;
    }
    var price = Math.round(parseFloat(document.getElementById("sim-price").value || "0") * 100);
    if (!(price > 0)) { result.innerHTML = '<div class="sim-err">Informe um valor maior que zero.</div>'; return; }

    var item = {
      description: document.getElementById("sim-desc").value || "Item",
      unitPrice: { amount: price },
    };
    var ncm = document.getElementById("sim-ncm").value.trim();
    var svc = document.getElementById("sim-svc").value.trim();
    if (ncm) item.classification = { ncm: ncm };
    if (svc) item.classification = Object.assign({}, item.classification || {}, { serviceCode: svc });

    var body = {
      correlationId: "docs-sim-" + Date.now(),
      context: { recipient: { address: { state: document.getElementById("sim-uf").value } } },
      operation: { kind: document.getElementById("sim-kind").value },
      items: [item],
    };
    var rbt12 = document.getElementById("sim-rbt12").value;
    if (rbt12 !== "" && !isNaN(parseFloat(rbt12))) body.context.rbt12Cents = Math.round(parseFloat(rbt12) * 100);

    result.innerHTML = '<div class="loading">Calculando…</div>';
    fetch(API + "/v1/tax-simulations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) {
          var msg = res.j && (res.j.message || res.j.error) || JSON.stringify(res.j);
          result.innerHTML = '<div class="sim-err">' + msg + "</div>";
          return;
        }
        renderSimulation(res.j, result);
      })
      .catch(function (e) {
        result.innerHTML = '<div class="sim-err">Falha de rede: ' + e.message + "</div>";
      });
  }

  function brl(cents) {
    if (cents === undefined || cents === null) return "—";
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function renderSimulation(j, el) {
    var rows = "";
    var taxes = (j.items && j.items[0] && j.items[0].taxes) || [];
    taxes.forEach(function (t) {
      rows += "<tr><td><b>" + t.tax + "</b></td>" +
        '<td class="outcome-' + (t.outcome || "") + '">' + t.outcome + "</td>" +
        '<td class="num">' + (t.rateBp !== undefined && t.rateBp !== null ? (t.rateBp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%" : "—") + "</td>" +
        '<td class="num">' + brl(t.basisCents) + "</td>" +
        '<td class="num">' + brl(t.amountCents) + "</td>" +
        "<td>" + ((t.fiscalCode && t.fiscalCode.code) || (t.hints && t.hints[0]) || "—") + "</td></tr>";
    });
    var total = (j.totals || []).reduce(function (s, t) { return s + (t.amountCents || 0); }, 0);
    el.innerHTML =
      "<table class='sim-table'><thead><tr><th>Tributo</th><th>Resultado</th><th>Alíq.</th><th>Base</th><th>Valor</th><th>CST/Obs.</th></tr></thead><tbody>" +
      rows + "</tbody></table>" +
      "<div class='sim-total'><span>Carga total</span><span>" + brl(total) + "</span></div>" +
      "<details class='raw'><summary>Ver resposta completa (JSON)</summary><pre><code>" +
      JSON.stringify(j, null, 2).replace(/</g, "&lt;") + "</code></pre></details>";
  }

  // ---------- boot ----------
  var apiUrl = document.getElementById("api-url");
  if (apiUrl) apiUrl.textContent = API;
  if (window.marked && marked.setOptions) marked.setOptions({ gfm: true });
  buildNav();
  bindSearch();
  window.addEventListener("hashchange", function () { render(currentPage()); });
  render(currentPage());
})();
