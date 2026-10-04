window.FLASH = new Set();
const $ = (s) => document.querySelector(s),
  brl = (v) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const CATS = [
    "Moradia",
    "Alimentação",
    "Mercado",
    "Transporte",
    "Lazer",
    "Saúde",
    "Educação",
    "Assinaturas",
    "Compras",
    "Outros",
  ],
  RCATS = ["Salário", "Renda extra"],
  PAYS = ["Pix", "Débito", "Crédito", "Dinheiro"],
  TIPOS = ["gasto", "receita", "invest", "transf"];
const today = () => new Date().toLocaleDateString("sv"),
  uid = () => Math.random().toString(36).slice(2, 9),
  mk = (d) => d.slice(0, 7);
let U = JSON.parse(localStorage.u || "null"),
  API =
    "https://script.google.com/macros/s/AKfycbylYZg-xcVL59L4WDyhguYyBHgr_9Vl-w7W25VHq5TJ2kzUxwpjpPIQQaeh1_Ipj78/exec",
  S = {
    tx: [],
    rec: [],
    lim: {},
    gen: {},
    del: [],
    rep: [],
    cv: [],
    metas: [],
    contas: [],
    cartoes: [],
    parc: [],
  },
  ON = 0,
  M = mk(today()),
  C = {},
  T;
if (API.startsWith("COLE")) API = JSON.parse(localStorage.cf || "{}").url || "";
const SK = () => "g_" + U.uid,
  store = () => U && (localStorage[SK()] = JSON.stringify(S));
const css = (v) =>
  getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function theme(t) {
  const d = document.documentElement;
  t = typeof t === "string" ? t : d.dataset.t === "dark" ? "light" : "dark";
  d.dataset.t = t;
  localStorage.th = t;
  $("#th").textContent = t === "dark" ? "☀" : "☾";
  document.querySelector("meta[name=theme-color]").content = css("--bg");
  if (ON) render();
}
const persist = () => {
  if (S.del.length > 800) S.del = S.del.slice(-800);
  store();
  render();
  clearTimeout(T);
  T = setTimeout(sync, 800);
};
const api = (b) => {
  const c = new AbortController(),
    tm = setTimeout(() => c.abort(), b.action === "report" ? 60000 : 30000);
  return fetch(API, {
    method: "POST",
    signal: c.signal,
    body: JSON.stringify({ ...b, uid: U.uid, tok: U.tok }),
  })
    .then((r) => r.json())
    .then((j) => {
      if (j.error === "sessao") {
        localStorage.removeItem("u");
        U = null;
        showAuth("Sessão expirada, entre novamente.");
      }
      if (j.error) throw new Error(j.error);
      return j;
    })
    .catch((e) => {
      throw e.name === "AbortError"
        ? new Error("o servidor demorou demais para responder")
        : e.name === "SyntaxError"
          ? new Error(
              "resposta inválida do servidor (reimplante o Apps Script)",
            )
          : e;
    })
    .finally(() => clearTimeout(tm));
};
let ST = { sheet: "off", ia: "off", model: "", msg: "" },
  busy = 0;
function pills() {
  document.body.classList.toggle("syncing", !!busy);
  const on = navigator.onLine,
    p = (k, t) => `<span class="pill ${k}"><i></i>${t}</span>`;
  $("#pills").innerHTML =
    p(on ? "ok" : "err", on ? "Online" : "Offline") +
    p(
      busy ? "off sy" : ST.sheet,
      busy
        ? "Sincronizando"
        : { ok: "Sincronizado", err: "Não sincronizado", off: "Aguardando" }[
            ST.sheet
          ],
    ) +
    p(ST.ia, "IA") +
    (ST.sheet === "err" || ST.ia === "err"
      ? `<div class="mut" style="flex-basis:100%">${esc(ST.msg || "")} Toque para tentar de novo.</div>`
      : "");
}
function merge(R) {
  const dl = new Set([...(S.del || []), ...(R.del || [])]);
  S.del = [...dl];
  const un = (a, b) => {
    const m = {};
    [...(b || []), ...(a || [])].forEach((x) => (m[x.id] = x));
    return Object.values(m).filter((x) => !dl.has(x.id));
  };
  const unc = (a, b) => {
    const m = {};
    [...(b || []), ...(a || [])].forEach((x) => {
      if (!m[x.id] || (x.ts || 0) >= (m[x.id].ts || 0)) m[x.id] = x;
    });
    return Object.values(m).filter((x) => !dl.has(x.id));
  };
  S.metas = unc(S.metas, R.metas);
  S.contas = unc(S.contas, R.contas);
  S.cartoes = unc(S.cartoes, R.cartoes);
  S.parc = unc(S.parc, R.parc);
  S.rep = un(S.rep, R.rep);
  S.cv = unc(S.cv, R.cv);
  S.tx = unc(S.tx, R.tx);
  S.rec = unc(S.rec, R.rec);
  S.gen = { ...R.gen, ...S.gen };
  S.lim = { ...R.lim, ...S.lim };
  S.onb = S.onb || R.onb;
}
const sigS = () =>
  [
    S.tx.length,
    S.rec.length,
    S.contas.length,
    S.cartoes.length,
    S.metas.length,
    S.parc.length,
    S.cv.length,
    S.rep.length,
    Math.round(sum(S.tx) * 100),
  ].join();
let AGAIN = 0;
async function sync() {
  if (!U || !API) {
    ST.sheet = ST.ia = "off";
    ST.msg = API ? "" : "Servidor não configurado.";
    return pills();
  }
  if (busy) {
    AGAIN = 1;
    return;
  }
  busy = 1;
  document.body.classList.toggle(
    "skel",
    !S.tx.length && !S.contas.length && !S.rec.length && !S.onb,
  );
  ST.msg = "Sincronizando…";
  pills();
  try {
    const [p, r] = await Promise.all([
      api({ action: "ping" }),
      api({ action: "load" }),
    ]);
    ST.ia = p.ia ? "ok" : "err";
    if (p.rel != null && p.rel >= 0) {
      ST.rel = p.rel;
      relInfo();
    }
    if (p.nome && p.nome !== U.nome) {
      U.nome = p.nome;
      localStorage.u = JSON.stringify(U);
      hi();
    }
    ST.model = p.model;
    ST.email = p.email || "";
    ST.emailok = !!p.emailok;
    if ($("#em") && !$("#em").value) $("#em").value = ST.email;
    ST.msg = p.ia ? "" : "IA: " + p.iaerr;

    const g0 = sigS();
    if (r.data) merge(r.data);
    const mudou = g0 !== sigS() && !document.body.classList.contains("skel");
    gen();
    if (mudou) say("Atualizado com a planilha");
    if (!S.onb && !S.tx.length && !S.contas.length && !S.rec.length) obShow();
    store();
    render();
    await api({ action: "save", data: S });
    ST.sheet = "ok";
  } catch (e) {
    ST.sheet = "err";
    ST.ia = "off";
    ST.msg = navigator.onLine
      ? "Planilha: " + e.message
      : "Sem internet, os dados ficam salvos no aparelho e sincronizam depois.";
  }
  document.body.classList.remove("skel");
  busy = 0;
  pills();
  if (AGAIN) {
    AGAIN = 0;
    setTimeout(sync, 300);
  }
}
function gen() {
  const t = today(),
    m = mk(t);
  (S.parc || []).forEach((p) => {
    for (let i = 0; i < p.n; i++) {
      const d = addM(p.inicio, i),
        k = "p" + p.id + i;
      if (d <= t && !S.gen[k]) {
        S.tx.push({
          id: k,
          ts: Date.now(),
          data: d,
          tipo: "gasto",
          valor:
            i === p.n - 1
              ? Math.round((p.total - p.vp * (p.n - 1)) * 100) / 100
              : p.vp,
          cat: p.cat,
          pay: p.pay,
          desc: `${p.desc} (${i + 1}/${p.n})`,
          cartao: p.cartao,
          conta: p.conta,
          parc: { g: p.id, n: i + 1, t: p.n },
        });
        S.gen[k] = 1;
      }
    }
  });
  S.rec.forEach((r) => {
    if (!r.ini) r.ini = m;
    let mm = r.ini < m ? r.ini : m,
      g = 0;
    while (mm <= m && g++ < 36) {
      const k = r.id + mm,
        d = mm + "-" + pad(Math.min(r.dia, 28));
      if (!S.gen[k] && d <= t) {
        S.tx.push({
          id: "r" + r.id + mm,
          ts: Date.now(),
          data: d,
          tipo: r.tipo,
          valor: r.valor,
          cat: r.cat,
          pay: r.pay,
          desc: r.desc,
        });
        S.gen[k] = 1;
      }
      mm = addM(mm + "-01", 1).slice(0, 7);
    }
  });
}
function mv(n) {
  const [y, m] = M.split("-").map(Number),
    k = new Date(y, m - 1 + n, 1).toLocaleDateString("sv").slice(0, 7);
  if (k > mk(today())) return;
  M = k;
  SEL = "";
  render();
}
let CUR = 0,
  SUB = 0,
  CVID = "",
  TYP = 0,
  ERR = "",
  OP = {};
function tab(i) {
  document
    .querySelectorAll(".sec")
    .forEach((e, j) => e.classList.toggle("on", i === j));
  document
    .querySelectorAll(".dock .tabs button")
    .forEach((e, j) => e.classList.toggle("on", i === j));
  CUR = i;
  ["#hi", "#pills", "#setup", "#instb"].forEach(
    (s) => ($(s).style.display = i === 0 ? "" : "none"),
  );
  say("");
  if (i === 4) chRender();
  dockMode();
}
const sum = (a) => a.reduce((s, x) => s + x.valor, 0),
  grp = (a, f) =>
    a.reduce((o, x) => {
      const k = f(x);
      o[k] = (o[k] || 0) + x.valor;
      return o;
    }, {});
const PAL = [
  "#d4f25a",
  "#7aa6ff",
  "#e5604d",
  "#f2b84b",
  "#2f9e6e",
  "#b48cf2",
  "#5cc8c8",
  "#ff9db1",
  "#8a8a85",
  "#a3b18a",
];
function ch(id, type, labels, sets, opt = {}) {
  const cv = $("#" + id),
    emp = !sets.some((d) => d.data.some((v) => v !== 0));
  let e = cv.nextElementSibling;
  if (!e || !e.classList.contains("em")) {
    e = document.createElement("div");
    e.className = "mut em";
    e.textContent = "Sem dados neste mês.";
    cv.after(e);
  }
  e.style.display = emp ? "block" : "none";
  cv.style.display = emp ? "none" : "block";
  if (emp) {
    C[id] && C[id].destroy();
    delete C[id];
    return;
  }
  C[id] && C[id].destroy();
  C[id] = new Chart($("#" + id), {
    type,
    data: { labels, datasets: sets },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: sets.length > 1 || type === "doughnut",
          position: "bottom",
          labels: { boxWidth: 10, color: css("--mut") },
        },
      },
      cutout: type === "doughnut" ? "68%" : undefined,
      scales:
        type === "doughnut"
          ? {}
          : {
              x: {
                grid: { display: false },
                ticks: { color: css("--mut") },
              },
              y: {
                grid: { color: css("--ln") },
                ticks: { color: css("--mut") },
              },
            },
      ...opt,
    },
  });
}
const esc = (t) =>
    String(t).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    ),
  first = (n) => {
    const f = (n || "").trim().split(/\s+/)[0] || "";
    return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase();
  };
function hi() {
  const e = $("#hi");
  if (!U) return;
  const k = U.nome || "";
  if (hi.k !== k || !e.innerHTML) {
    hi.k = k;
    e.innerHTML = k
      ? `<div style="font-size:22px;font-weight:700;margin:4px 0 12px">Olá, ${esc(first(k))}</div>`
      : `<div class="card"><h3>Bem-vindo</h3><div class="row"><input id="nm0" maxlength="60" placeholder="Como podemos te chamar?"><button onclick="saveNome($('#nm0').value)">OK</button></div></div>`;
  }
  const n = $("#nm");
  if (n && document.activeElement !== n) n.value = k;
  $("#av2").textContent = first(k).charAt(0) || "?";
  $("#accn").textContent = k || "Sua conta";
  $("#acce").textContent = ST.email || "";
}
function saveNome(v) {
  v = (v || "").trim().slice(0, 60);
  if (!v) return;
  U.nome = v;
  localStorage.u = JSON.stringify(U);
  hi();
  if (API && navigator.onLine) api({ action: "nome", nome: v }).catch(() => {});
}
const dim = (y, m) => new Date(y, m, 0).getDate(),
  pad = (n) => String(n).padStart(2, "0"),
  r2 = (v) => Math.round(v * 100) / 100;
function addM(d, n) {
  const [y, m, dd] = d.split("-").map(Number),
    t = new Date(y, m - 1 + n, 1),
    Y = t.getFullYear(),
    M2 = t.getMonth() + 1;
  return Y + "-" + pad(M2) + "-" + pad(Math.min(dd, dim(Y, M2)));
}
const byName = (a, n) => {
  n = String(n || "").toLowerCase();
  return (
    n &&
    (a || []).find((x) => {
      const k = x.nome.toLowerCase();
      return k.includes(n) || n.includes(k);
    })
  );
};
const toNum = (v) =>
    typeof v === "number"
      ? v
      : parseFloat(
          String(v == null ? "" : v)
            .replace(/[^\d,.-]/g, "")
            .replace(/\.(?=\d{3}\b)/g, "")
            .replace(",", "."),
        ) || 0,
  normCat = (c, tipo) =>
    [...CATS, ...RCATS, "Investimento"].find(
      (k) => k.toLowerCase() === String(c || "").toLowerCase(),
    ) ||
    (tipo === "receita"
      ? "Renda extra"
      : tipo === "invest"
        ? "Investimento"
        : "Outros");
function mkItem(x, ids, pids) {
  const d =
      /^\d{4}-\d\d-\d\d$/.test(x.data || "") && x.data <= today()
        ? x.data
        : today(),
    tipo = TIPOS.includes(x.tipo) ? x.tipo : "gasto",
    v = toNum(x.valor),
    cart0 = tipo === "gasto" ? byName(S.cartoes, x.cartao) : null,
    pay = cart0 ? "Crédito" : PAYS.includes(x.pay) ? x.pay : "Pix",
    cart =
      cart0 ||
      (pay === "Crédito" && (S.cartoes || []).length === 1
        ? S.cartoes[0]
        : null),
    cont =
      byName(S.contas, x.conta) ||
      ((S.contas || []).length === 1 && pay !== "Crédito" ? S.contas[0] : null),
    b = {
      ts: Date.now(),
      ativo: String(x.ativo || "")
        .toUpperCase()
        .slice(0, 12),
      data: d,
      tipo,
      valor: v,
      cat: normCat(x.cat, tipo),
      pay,
      desc: String(x.desc || x.cat || "").slice(0, 60) || "Lançamento",
      conta: cont ? cont.id : "",
      cartao: cart ? cart.id : "",
    };
  if (tipo === "transf") {
    const o = byName(S.contas, x.conta),
      t = byName(S.contas, x.destino);
    if (!o || !t || o.id === t.id) return null;
    Object.assign(b, {
      conta: o.id,
      destino: t.id,
      cat: "Transferência",
      desc: x.desc || "Transferência",
      pay: "Pix",
      cartao: "",
    });
  }
  const id = uid();
  if (+x.parcelas > 1 && tipo === "gasto") {
    const n = Math.min(36, Math.round(+x.parcelas));
    S.parc = S.parc || [];
    S.parc.push({
      id,
      desc: b.desc,
      total: v,
      n,
      vp: r2(v / n),
      inicio: d,
      cat: b.cat,
      pay: "Crédito",
      cartao: b.cartao,
      conta: b.conta,
      ts: Date.now(),
    });
    pids.push(id);
    gen();
    S.tx
      .filter((t) => t.parc && t.parc.g === id)
      .forEach((t) => ids.push(t.id));
    return null;
  }
  ids.push(id);
  b.id = id;
  return b;
}
function saldoConta(c) {
  let s = c.saldo0 || 0;
  S.tx.forEach((x) => {
    if (x.conta === c.id) {
      if (x.tipo === "receita") s += x.valor;
      else if (x.tipo === "gasto") {
        if (x.pay !== "Crédito") s -= x.valor;
      } else if (
        x.tipo === "invest" ||
        x.tipo === "pagfat" ||
        x.tipo === "transf"
      )
        s -= x.valor;
    }
    if (x.tipo === "transf" && x.destino === c.id) s += x.valor;
  });
  return r2(s);
}
const refOf = (c, d) =>
    +d.slice(8) > c.fecha
      ? addM(d.slice(0, 7) + "-01", 1).slice(0, 7)
      : d.slice(0, 7),
  fechaD = (c, ref) => ref + "-" + pad(Math.min(c.fecha, 28)),
  vencD = (c, ref) =>
    (c.vence > c.fecha ? ref : addM(ref + "-01", 1).slice(0, 7)) +
    "-" +
    pad(Math.min(c.vence, 28)),
  pago = (c, ref) =>
    r2(
      sum(
        S.tx.filter(
          (x) => x.tipo === "pagfat" && x.cartao === c.id && x.ref === ref,
        ),
      ),
    ),
  rest = (c, ref) => Math.max(0, r2(fatTotal(c, ref) - pago(c, ref))),
  paga = (c, ref) => fatTotal(c, ref) > 0 && rest(c, ref) <= 0.005;
function parcItems(c) {
  const o = [];
  (S.parc || []).forEach((p) => {
    if (p.cartao !== c.id) return;
    for (let i = 0; i < p.n; i++)
      if (!S.gen["p" + p.id + i])
        o.push({
          data: addM(p.inicio, i),
          valor: i === p.n - 1 ? r2(p.total - p.vp * (p.n - 1)) : p.vp,
        });
  });
  return o;
}
function itens(c) {
  return [
    ...S.tx.filter(
      (x) => x.tipo === "gasto" && x.cartao === c.id && x.pay === "Crédito",
    ),
    ...parcItems(c),
  ];
}
function fatTotal(c, ref) {
  return r2(sum(itens(c).filter((x) => refOf(c, x.data) === ref)));
}
function fatStatus(c, ref) {
  const t = today();
  if (paga(c, ref)) return "Paga";
  if (!fatTotal(c, ref)) return "Aberta";
  if (t > vencD(c, ref)) return "Atrasada";
  if (t > fechaD(c, ref)) return "Fechada";
  return "Aberta";
}
function dividas(c) {
  const refs = [...new Set(itens(c).map((x) => refOf(c, x.data)))].filter(
    (r) => rest(c, r) > 0.005,
  );
  return {
    refs,
    total: r2(sum(refs.map((r) => ({ valor: rest(c, r) })))),
  };
}
function addConta() {
  const n = $("#cn").value.trim();
  if (!n) return;
  S.contas.push({
    id: uid(),
    nome: n.slice(0, 30),
    saldo0: +$("#cs").value || 0,
    ts: Date.now(),
  });
  $("#cn").value = $("#cs").value = "";
  persist();
}
function delConta(id) {
  if (
    !confirm(
      "Excluir esta conta? Os lançamentos continuam, mas deixam de aparecer no saldo dela.",
    )
  )
    return;
  S.del.push(id);
  S.contas = S.contas.filter((x) => x.id !== id);
  persist();
}
function transferir() {
  const o = $("#to").value,
    d = $("#td").value,
    v = +$("#tv").value;
  if (!o || !d || o === d || !(v > 0))
    return say("Escolha duas contas diferentes e um valor.");
  S.tx.push({
    id: uid(),
    ts: Date.now(),
    data: today(),
    tipo: "transf",
    valor: v,
    cat: "Transferência",
    pay: "Pix",
    desc: `${(S.contas.find((c) => c.id === o) || {}).nome} → ${(S.contas.find((c) => c.id === d) || {}).nome}`,
    conta: o,
    destino: d,
  });
  $("#tv").value = "";
  persist();
}
function addCartao() {
  const n = $("#kn").value.trim(),
    f = +$("#kf").value,
    v = +$("#kv").value;
  if (!n || !(f >= 1 && f <= 31) || !(v >= 1 && v <= 31))
    return say("Informe nome, dia de fechamento e dia de vencimento (1 a 31).");
  S.cartoes.push({
    id: uid(),
    nome: n.slice(0, 30),
    limite: +$("#kl").value || 0,
    fecha: f,
    vence: v,
    conta: $("#kc").value,
    ts: Date.now(),
  });
  ["kn", "kl", "kf", "kv"].forEach((i) => ($("#" + i).value = ""));
  persist();
}
function delCartao(id) {
  if (!confirm("Excluir este cartão?")) return;
  S.del.push(id);
  S.cartoes = S.cartoes.filter((x) => x.id !== id);
  persist();
}
function pagFat(id) {
  const c = S.cartoes.find((x) => x.id === id);
  if (!c) return;
  const cur = refOf(c, today()),
    d = dividas(c),
    ref = d.refs.filter((r) => r <= cur).sort()[0];
  if (!ref) return say("Nenhuma fatura em aberto neste cartão.");
  const v = rest(c, ref);
  if (
    !confirm(`Registrar o pagamento da fatura ${ref} de ${c.nome}: ${brl(v)}?`)
  )
    return;
  S.tx.push({
    id: uid(),
    ts: Date.now(),
    data: today(),
    tipo: "pagfat",
    valor: v,
    cat: "Fatura",
    pay: "Pix",
    desc: `Fatura ${c.nome} ${ref}`,
    cartao: c.id,
    conta: c.conta || "",
    ref,
  });
  persist();
}
function cancelParc(id) {
  if (!confirm("Cancelar as parcelas futuras? As já lançadas continuam."))
    return;
  const p = S.parc.find((x) => x.id === id);
  if (!p) return;
  let n = 0;
  for (let i = 0; i < p.n; i++) if (S.gen["p" + p.id + i]) n = i + 1;
  if (!n) {
    S.del.push(id);
    S.parc = S.parc.filter((x) => x.id !== id);
  } else {
    p.n = n;
    p.total = r2(p.vp * n);
    p.ts = Date.now();
  }
  persist();
}
function antecipar(id) {
  const p = S.parc.find((x) => x.id === id);
  if (!p || !confirm("Antecipar todas as parcelas restantes agora?")) return;
  for (let i = 0; i < p.n; i++) {
    const k = "p" + p.id + i;
    if (!S.gen[k]) {
      S.tx.push({
        id: k,
        ts: Date.now(),
        data: today(),
        tipo: "gasto",
        valor: i === p.n - 1 ? r2(p.total - p.vp * (p.n - 1)) : p.vp,
        cat: p.cat,
        pay: p.pay,
        desc: `${p.desc} (${i + 1}/${p.n}) antecipada`,
        cartao: p.cartao,
        conta: p.conta,
        parc: { g: p.id, n: i + 1, t: p.n },
      });
      S.gen[k] = 1;
    }
  }
  persist();
}
function prevHtml() {
  const t = today(),
    [y, m] = M.split("-").map(Number);
  if (M !== mk(t))
    return '<span class="mut">Disponível para o mês atual.</span>';
  const dia = +t.slice(8),
    nd = dim(y, m),
    tx = S.tx.filter((x) => mk(x.data) === M),
    g = tx.filter((x) => x.tipo === "gasto"),
    r = sum(tx.filter((x) => x.tipo === "receita")),
    iv = sum(tx.filter((x) => x.tipo === "invest")),
    vt = g.filter((x) => !x.parc && !(x.id[0] === "r" && S.gen[x.id.slice(1)])),
    vv = sum(vt),
    vp = dia >= 7 && vt.length >= 3 ? (vv / dia) * (nd - dia) : 0,
    fut = (S.rec || []).filter(
      (q) => Math.min(q.dia, 28) > dia && !S.gen[q.id + M],
    ),
    rf = sum(fut.filter((q) => q.tipo === "receita")),
    gf = sum(fut.filter((q) => q.tipo === "gasto")),
    pf = (S.parc || []).reduce((a, p) => {
      for (let i = 0; i < p.n; i++)
        if (!S.gen["p" + p.id + i] && mk(addM(p.inicio, i)) === M) a += p.vp;
      return a;
    }, 0),
    atual = r + rf - sum(g) - gf - pf - vp - iv,
    cen = [
      ["Atual", atual],
      ["Economizando (−10% no variável)", atual + 0.1 * (vv + vp)],
      ["Gasto extra (+15% no variável)", atual - 0.15 * (vv + vp)],
    ];
  return (
    `<div class="row"><span>Receitas previstas</span><b class="pos">${brl(r + rf)}</b></div><div class="row" style="margin-top:6px"><span>Gastos previstos</span><b class="neg">${brl(sum(g) + gf + pf + vp)}</b></div><div class="mut" style="margin:4px 0 10px">Inclui fixos a vencer (${brl(gf)}), parcelas do mês (${brl(pf)}) e o ritmo do variável (${brl(vp)}).</div>` +
    cen
      .map(
        (c, i) =>
          `<div class="row" style="margin-top:6px"><span>${c[0]}</span><b class="${c[1] < 0 ? "neg" : ""}">${brl(c[1])}</b></div>`,
      )
      .join("") +
    '<div class="mut" style="margin-top:10px">Estimativa baseada nos seus lançamentos. Não é garantia.</div>'
  );
}
function contasRender() {
  if (!U) return;
  const cs = S.contas || [],
    ks = S.cartoes || [],
    opt = cs
      .map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`)
      .join("");
  const sc = sum(cs.map((c) => ({ valor: saldoConta(c) }))),
    inv = sum(S.tx.filter((x) => x.tipo === "invest")),
    dv = sum(ks.map((c) => ({ valor: dividas(c).total })));
  anim($("#pat"), sc + inv - dv);
  anim($("#pc"), sc);
  anim($("#pi"), inv);
  anim($("#pf"), dv);
  $("#cts").innerHTML =
    cs
      .map(
        (c) =>
          `<div class="item row"><div><b>${esc(c.nome)}</b></div><div class="amt">${brl(saldoConta(c))}<button class="g" onclick="delConta('${c.id}')">✕</button></div></div>`,
      )
      .join("") ||
    '<span class="mut">Cadastre suas contas para acompanhar saldos e o patrimônio.</span>';
  ["to", "td"].forEach((i, k) => {
    const e = $("#" + i),
      v = e.value;
    e.innerHTML = opt;
    if (v) e.value = v;
    else if (k && cs[1]) e.value = cs[1].id;
  });
  $("#kc").innerHTML = '<option value="">Conta de pagamento</option>' + opt;
  $("#cards").innerHTML =
    ks
      .map((c) => {
        const ref = refOf(c, today()),
          tot = fatTotal(c, ref),
          dv = dividas(c).total,
          st = fatStatus(c, ref);
        return `<div class="item row"><div><b>${esc(c.nome)}</b><div class="mut">Limite ${brl(c.limite)} · Disponível ${brl(c.limite - dv)}</div><div class="mut">Fatura atual ${brl(tot)} · <span class="${st === "Atrasada" ? "neg" : ""}" style="font-weight:600">${st}</span> · fecha dia ${c.fecha}, vence dia ${c.vence}</div></div><div class="amt"><button onclick="pagFat('${c.id}')">Pagar</button><button class="g" onclick="delCartao('${c.id}')">✕</button></div></div>`;
      })
      .join("") ||
    '<span class="mut">Cadastre seus cartões para acompanhar faturas e limite.</span>';
  $("#pars").innerHTML =
    (S.parc || [])
      .map((p) => {
        let n = 0;
        for (let i = 0; i < p.n; i++) if (S.gen["p" + p.id + i]) n = i + 1;
        return n >= p.n
          ? ""
          : `<div class="item row"><div><b>${esc(p.desc)}</b><div class="mut">Parcela ${n}/${p.n} · ${brl(p.vp)}/mês · restam ${brl(r2(p.total - p.vp * n))}</div></div><div class="amt"><button class="g" onclick="antecipar('${p.id}')">Antecipar</button><button class="g" onclick="cancelParc('${p.id}')">✕</button></div></div>`;
      })
      .join("") ||
    '<span class="mut">Compras parceladas aparecem aqui. Experimente: "comprei um notebook de 3600 em 12x no cartão".</span>';
  $("#prev").innerHTML = prevHtml();
}
const nk = (d) =>
  String(d || "")
    .toLowerCase()
    .replace(/\d+|[^a-zà-ú ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
function insights() {
  const L = [],
    S2 = [],
    t = today(),
    [y, m] = M.split("-").map(Number),
    cur = M === mk(t),
    dia = cur ? +t.slice(8) : 31,
    pm = [1, 2, 3].map((i) =>
      new Date(y, m - 1 - i, 1).toLocaleDateString("sv").slice(0, 7),
    ),
    sel = (k) =>
      S.tx.filter(
        (x) =>
          x.tipo === "gasto" &&
          mk(x.data) === k &&
          (k === M || +x.data.slice(8) <= dia),
      ),
    A = grp(sel(M), (x) => x.cat),
    P = pm.map((k) => grp(sel(k), (x) => x.cat)),
    act = P.filter((p) => Object.keys(p).length).length;
  if (act >= 2)
    Object.keys(A).forEach((c) => {
      const av = P.reduce((a, p) => a + (p[c] || 0), 0) / act,
        d = A[c] - av;
      if (av > 0 && d >= 50 && d / av >= 0.3)
        L.push({
          n: 2,
          t: `⚠ ${c}: ${brl(A[c])} neste período, ${Math.round((d / av) * 100)}% acima da sua média (${brl(av)}).`,
        });
      else if (av > 0 && -d >= 50 && -d / av >= 0.2)
        L.push({
          n: 0,
          t: `💡 ${c} está ${Math.round((-d / av) * 100)}% abaixo da sua média (${brl(av)}).`,
        });
    });
  const gp = {};
  S.tx
    .filter(
      (x) =>
        x.tipo === "gasto" &&
        !x.parc &&
        x.data.slice(0, 7) >= pm[2] &&
        x.data.slice(0, 7) <= M,
    )
    .forEach((x) => {
      const k = nk(x.desc || x.cat);
      if (k.length > 2) (gp[k] = gp[k] || {})[mk(x.data)] = x;
    });
  Object.entries(gp).forEach(([k, o]) => {
    const ms = Object.keys(o).sort();
    if (ms.length < 3) return;
    const a = o[ms[ms.length - 1]],
      b = o[ms[ms.length - 2]],
      vs = ms.map((q) => o[q].valor);
    if (Math.max(...vs) / Math.min(...vs) > 1.25) return;
    const prox = addM(a.data, 1);
    S2.push({ nome: a.desc || a.cat, valor: a.valor, prox });
    if (a.valor > b.valor * 1.05)
      L.push({
        n: 1,
        t: `📈 ${a.desc || a.cat} aumentou ${brl(a.valor - b.valor)} (de ${brl(b.valor)} para ${brl(a.valor)}).`,
      });
    const dd = (new Date(prox + "T12:00") - new Date(t + "T12:00")) / 864e5;
    if (dd >= 0 && dd <= 3)
      L.push({
        n: 1,
        t: `🔁 ${a.desc || a.cat} deve ser cobrada em ${prox.split("-").reverse().slice(0, 2).join("/")} (${brl(a.valor)}).`,
      });
  });
  const seen = {};
  S.tx
    .filter(
      (x) =>
        (x.tipo === "gasto" || x.tipo === "receita") &&
        !x.ok &&
        !x.parc &&
        x.data.slice(0, 7) >= pm[0],
    )
    .forEach((x) => {
      const k = [x.data, x.valor, x.tipo, nk(x.desc || x.cat)].join("|");
      (seen[k] = seen[k] || []).push(x);
    });
  Object.values(seen)
    .filter((a) => a.length > 1)
    .forEach((a) =>
      L.push({
        n: 2,
        dup: a.map((x) => x.id),
        t: `⚠ Possível cobrança duplicada: ${a[0].desc || a[0].cat} · ${brl(a[0].valor)} em ${a[0].data.split("-").reverse().join("/")} (${a.length} lançamentos iguais).`,
      }),
    );
  return { L: L.sort((a, b) => b.n - a.n), S2 };
}
function manter(ids) {
  S.tx.forEach((x) => {
    if (ids.includes(x.id)) {
      x.ok = 1;
      x.ts = Date.now();
    }
  });
  persist();
}
function remover(ids) {
  ids.slice(1).forEach((i) => S.del.push(i));
  S.tx = S.tx.filter((x) => !ids.slice(1).includes(x.id));
  persist();
}
function insRender() {
  const { L, S2 } = insights();
  $("#ins").innerHTML =
    L.map(
      (a) =>
        `<div class="item"><div>${esc(a.t)}</div>${a.dup ? `<div class="row" style="justify-content:flex-start;margin-top:8px"><button class="g" onclick='manter(${JSON.stringify(a.dup)})'>Manter as duas</button><button class="g" onclick='remover(${JSON.stringify(a.dup)})'>Remover a duplicada</button></div>` : ""}</div>`,
    ).join("") ||
    '<span class="mut">Ainda sem descobertas. Conforme você lança, vou comparar com seu histórico.</span>';
  $("#subs").innerHTML =
    S2.map(
      (a) =>
        `<div class="item row"><div><b>${esc(a.nome)}</b><div class="mut">Mensal · próxima em ${a.prox.split("-").reverse().slice(0, 2).join("/")}</div></div><b>${brl(a.valor)}</b></div>`,
    ).join("") ||
    '<span class="mut">Nenhuma recorrência detectada ainda (preciso de 3 meses de histórico).</span>';
  $("#bd").textContent =
    alerts().length + L.filter((a) => a.n >= 1).length || "";
}
function showRC(c) {
  $("#rcc").textContent = c;
  $("#rcm").style.display = "block";
}
function rcDone() {
  $("#rcm").style.display = "none";
  if (!ON) start();
}
async function novoCodigo() {
  try {
    showRC((await api({ action: "gerarcodigo" })).rc);
  } catch (e) {
    say("⚠ " + e.message);
  }
}
function csv() {
  const e = (v) => {
      v = String(v == null ? "" : v);
      if (/^[=+\-@]/.test(v)) v = "'" + v;
      return '"' + v.replace(/"/g, '""') + '"';
    },
    rows = [
      ["Data", "Tipo", "Valor", "Categoria", "Pagamento", "Descrição", "Ativo"],
      ...[...S.tx]
        .sort((a, b) => a.data.localeCompare(b.data))
        .map((x) => [
          x.data,
          x.tipo,
          String(x.valor).replace(".", ","),
          x.cat,
          x.pay,
          x.desc,
          x.ativo || "",
        ]),
    ];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(["\ufeff" + rows.map((r) => r.map(e).join(";")).join("\r\n")], {
      type: "text/csv;charset=utf-8",
    }),
  );
  a.download = `cifra-${today()}.csv`;
  a.click();
}
let EDID = "";
function edOpen(id) {
  const x = S.tx.find((t) => t.id === id);
  if (!x || x.tipo === "transf" || x.tipo === "pagfat") return;
  EDID = id;
  $("#ed1").value = x.desc || "";
  $("#ed2").value = x.valor;
  $("#ed3").value = x.data;
  $("#ed3").max = today();
  $("#ed4").innerHTML = [...new Set([x.cat, ...CATS, ...RCATS, "Investimento"])]
    .map((c) => `<option${c === x.cat ? " selected" : ""}>${esc(c)}</option>`)
    .join("");
  $("#ed5").innerHTML = PAYS.map(
    (c) => `<option${c === x.pay ? " selected" : ""}>${c}</option>`,
  ).join("");
  $("#ed6").value = x.tipo;
  $("#ed7").innerHTML =
    '<option value="">Sem conta</option>' +
    (S.contas || [])
      .map(
        (c) =>
          `<option value="${c.id}"${c.id === x.conta ? " selected" : ""}>${esc(c.nome)}</option>`,
      )
      .join("");
  $("#ed").style.display = "block";
}
function edSave() {
  const x = S.tx.find((t) => t.id === EDID),
    v = +$("#ed2").value,
    d = $("#ed3").value;
  if (!x || !(v > 0) || !d || d > today()) return;
  Object.assign(x, {
    desc: $("#ed1").value.trim(),
    valor: v,
    data: d,
    cat: $("#ed4").value,
    pay: $("#ed5").value,
    tipo: $("#ed6").value,
    conta: $("#ed7").value,
    ts: Date.now(),
  });
  if (x.pay === "Crédito" && !x.cartao && S.cartoes.length === 1)
    x.cartao = S.cartoes[0].id;
  $("#ed").style.display = "none";
  persist();
}
let UNDO = null;
function sayU(t, f) {
  UNDO = f;
  const e = $("#say");
  e.innerHTML =
    esc(t) +
    ' · <a href="#" onclick="undo();return false" style="color:var(--act);font-weight:600">Desfazer</a>';
  e.classList.remove("f");
  void e.offsetWidth;
  e.classList.add("f");
}
function undo() {
  if (UNDO) {
    UNDO();
    UNDO = null;
    say("Desfeito.");
  }
}
function addMeta() {
  const n = $("#mtn").value.trim(),
    v = +$("#mtv").value;
  if (!n || !(v > 0)) return;
  (S.metas = S.metas || []).push({
    id: uid(),
    nome: n.slice(0, 40),
    alvo: v,
    guardado: 0,
    ts: Date.now(),
  });
  $("#mtn").value = $("#mtv").value = "";
  persist();
}
function aporte(id) {
  const t = S.metas.find((x) => x.id === id),
    v = +String(prompt("Quanto você guardou? (R$)") || "").replace(",", ".");
  if (!t || !(v > 0)) return;
  t.guardado += v;
  t.ts = Date.now();
  persist();
}
function delMeta(id) {
  if (!confirm("Excluir esta meta?")) return;
  S.del.push(id);
  S.metas = S.metas.filter((x) => x.id !== id);
  persist();
}
function extras() {
  const [y, m] = M.split("-").map(Number),
    pk = new Date(y, m - 2, 1).toLocaleDateString("sv").slice(0, 7),
    cur = M === mk(today()),
    dia = cur ? +today().slice(8) : 31,
    gs = (k) =>
      S.tx.filter(
        (x) =>
          x.tipo === "gasto" &&
          mk(x.data) === k &&
          (k === M || +x.data.slice(8) <= dia),
      ),
    a = gs(M),
    b = gs(pk),
    ta = sum(a),
    tb = sum(b);
  $("#cmp").style.display = tb > 0 ? "block" : "none";
  if (tb > 0) {
    const ca = grp(a, (x) => x.cat),
      cb = grp(b, (x) => x.cat),
      d = ta - tb,
      p = Math.round((Math.abs(d) / tb) * 100),
      rows = [...new Set([...Object.keys(ca), ...Object.keys(cb)])]
        .map((k) => ({ k, d: (ca[k] || 0) - (cb[k] || 0) }))
        .filter((r) => Math.abs(r.d) >= 1)
        .sort((u, v) => Math.abs(v.d) - Math.abs(u.d))
        .slice(0, 3);
    $("#cmpb").innerHTML =
      `<div class="row"><b>${brl(ta)}</b><span class="${d > 0 ? "neg" : "pos"}">${d > 0 ? "▲" : "▼"} ${p}% ${d > 0 ? "a mais" : "a menos"}</span></div><div class="mut" style="margin:4px 0 8px">${cur ? "Mesmo período do mês anterior" : "Mês anterior"}: ${brl(tb)}</div>` +
      rows
        .map(
          (r) =>
            `<div class="row" style="margin-top:4px"><span>${esc(r.k)}</span><span class="${r.d > 0 ? "neg" : "pos"}">${r.d > 0 ? "+" : "−"}${brl(Math.abs(r.d))}</span></div>`,
        )
        .join("");
  }
  $("#mts").innerHTML =
    (S.metas || [])
      .map((t) => {
        const p = Math.min(100, (t.guardado / t.alvo) * 100);
        return `<div class="row"><b>${esc(t.nome)}</b><span class="mut">${brl(t.guardado)} / ${brl(t.alvo)}</span></div><div class="bar"><i style="width:${p}%;background:var(--grn)"></i></div><div class="row" style="margin:-4px 0 10px;justify-content:flex-start"><button class="g" onclick="aporte('${t.id}')">+ Guardar</button><button class="g" onclick="delMeta('${t.id}')">✕</button><span class="mut">${Math.round(p)}%</span></div>`;
      })
      .join("") ||
    '<span class="mut">Crie uma meta, como "Reserva de emergência".</span>';
  const iv = S.tx.filter((x) => x.tipo === "invest"),
    by = grp(iv, (x) => x.ativo || "Sem ticker"),
    tot = sum(iv);
  $("#cart").style.display = iv.length ? "block" : "none";
  $("#cartb").innerHTML = Object.entries(by)
    .sort((u, v) => v[1] - u[1])
    .slice(0, 8)
    .map(
      ([k, v]) =>
        `<div class="row"><span>${esc(k)}</span><span class="mut">${brl(v)} · ${Math.round((v / tot) * 100)}%</span></div><div class="bar"><i style="width:${(v / tot) * 100}%;background:#7aa6ff"></i></div>`,
    )
    .join("");
}
function resumo() {
  const [y, m] = M.split("-").map(Number),
    ms = [0, 1, 2].map((i) => {
      const k = new Date(y, m - 1 - i, 1).toLocaleDateString("sv").slice(0, 7),
        t = S.tx.filter((x) => mk(x.data) === k),
        gt = t.filter((x) => x.tipo === "gasto");
      return {
        mes: k,
        receitas: sum(t.filter((x) => x.tipo === "receita")),
        gastos: sum(gt),
        investido: sum(t.filter((x) => x.tipo === "invest")),
        gastos_por_categoria: grp(gt, (x) => x.cat),
        gastos_por_pagamento: grp(gt, (x) => x.pay),
      };
    });
  return JSON.stringify({
    mes_atual: M,
    hoje: today(),
    limites: S.lim,
    meses: ms,
    ultimos_lancamentos: S.tx
      .slice(-10)
      .map((x) => [x.data, x.tipo, x.valor, x.cat, x.desc]),
  });
}
const md = (t) => {
  t = String(t || "");
  if (!t.includes("\n") && (t.match(/\d{1,2}[).]\s/g) || []).length >= 3)
    t = t.replace(/;?\s+(?=\d{1,2}[).]\s)/g, "\n");
  let h = "",
    ul = 0;
  const cl = () => {
    if (ul) {
      h += "</ul>";
      ul = 0;
    }
  };
  esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .split("\n")
    .forEach((l) => {
      const m = l.match(/^\s*(?:([-*•])|(\d{1,2}[.)]))\s+(.*)$/);
      if (m) {
        if (!ul) {
          h += '<ul class="md">';
          ul = 1;
        }
        h += m[2]
          ? `<li style="list-style:none;margin-left:-4px"><b>${m[2]}</b> ${m[3]}</li>`
          : `<li>${m[3]}</li>`;
      } else {
        cl();
        if (l.trim()) h += `<p>${l.replace(/^#+\s*(.*)$/, "<b>$1</b>")}</p>`;
      }
    });
  cl();
  return h;
};
function dockMode() {
  const c = CUR === 4;
  $("#in").placeholder = c ? "Pergunte à IA…" : "Gastei 35 no iFood";
  $(".chat").style.display = c && SUB === 1 ? "none" : "flex";
}
function sub(n) {
  SUB = n;
  $("#sc").style.display = n ? "none" : "block";
  $("#sr").style.display = n ? "block" : "none";
  $("#s1").classList.toggle("on", !n);
  $("#s2").classList.toggle("on", !!n);
  dockMode();
}
const fmt = (t) =>
    t
      ? new Date(t).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "",
  safe = (t) => String(t || "").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");
function anim(el, to) {
  const from = el._v == null ? to : el._v;
  el._v = to;
  if (from === to || matchMedia("(prefers-reduced-motion:reduce)").matches) {
    el.textContent = brl(to);
    return;
  }
  const t0 = performance.now();
  (function f(t) {
    const p = Math.min(1, (t - t0) / 450);
    el.textContent = brl(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(f);
  })(t0);
}
function curCv() {
  let c = S.cv.find((x) => x.id === CVID);
  if (!c) {
    c = { id: uid(), ts: Date.now(), tt: "", m: [] };
    S.cv.unshift(c);
    CVID = c.id;
    while (S.cv.length > 10) {
      S.cv.sort((a, b) => b.ts - a.ts);
      S.del.push(S.cv.pop().id);
    }
  }
  return c;
}
function chRender(sc) {
  const e = $("#msgs"),
    c = (S.cv || []).find((x) => x.id === CVID),
    m = c ? c.m : [],
    pv = chRender.k === CVID ? chRender.n : m.length,
    sel = $("#cvs");
  sel.innerHTML =
    '<option value="">Nova conversa</option>' +
    [...(S.cv || [])]
      .sort((a, b) => b.ts - a.ts)
      .map(
        (x) =>
          `<option value="${x.id}">${esc(x.tt || "Conversa")} · ${new Date(x.ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</option>`,
      )
      .join("");
  sel.value = CVID;
  e.innerHTML =
    (m.length || TYP || ERR
      ? ""
      : '<div class="card mut" style="text-align:center">Pergunte sobre seus gastos, economia, dívidas ou investimentos.<br>Respondo só sobre finanças.</div>') +
    m
      .map(
        (x, i) =>
          `<div class="bub ${x.r}${i >= pv ? " pop" : ""}">${md(x.t)}<span class="tm">${fmt(x.ts)}</span></div>`,
      )
      .join("") +
    (TYP
      ? '<div class="bub b pop"><span class="dots"><i></i><i></i><i></i></span></div>'
      : "") +
    (ERR ? `<div class="bub b err">${esc(ERR)}</div>` : "");
  chRender.k = CVID;
  chRender.n = m.length;
  if (sc) scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}
async function chatSend(t) {
  const c = curCv();
  if (!c.tt) c.tt = t.slice(0, 32);
  c.m.push({
    r: "u",
    t: (PEND ? "📎 " + PEND.name + (t ? " · " : "") : "") + t,
    ts: Date.now(),
  });
  c.ts = Date.now();
  TYP = 1;
  ERR = "";
  chRender(1);
  try {
    if (!U || !API || !navigator.onLine)
      throw new Error(
        "O chat precisa de internet e de conexão com o servidor.",
      );
    const a = await chatCall(c);
    c.m.push({ r: "b", t: a.text, ts: Date.now() });
  } catch (e) {
    ERR = "⚠ " + e.message;
  }
  TYP = 0;
  c.m = c.m.slice(-60);
  persist();
  chRender(1);
}
function delCv() {
  if (!CVID || !confirm("Excluir esta conversa?")) return;
  S.del.push(CVID);
  S.cv = S.cv.filter((x) => x.id !== CVID);
  CVID = "";
  persist();
}
function delRep(id) {
  if (!confirm("Excluir este relatório?")) return;
  S.del.push(id);
  S.rep = S.rep.filter((x) => x.id !== id);
  persist();
}
function relInfo(em) {
  const n = ST.rel;
  $("#relq").textContent =
    em ||
    (n == null
      ? "Até 3 relatórios por dia."
      : `Restam ${n} de 3 relatórios hoje.`);
  $("#relb").disabled = n === 0;
}
function relRender() {
  if (!U) return;
  $("#relo").innerHTML = [...(S.rep || [])]
    .sort((a, b) => b.ts - a.ts)
    .map(
      (r, i) =>
        `<details class="card rp" ${(OP[r.id] ?? i === 0) ? "open" : ""} ontoggle="OP['${r.id}']=this.open"><summary>Relatório · ${r.mes} <span class="mut">${new Date(r.ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></summary><div style="line-height:1.5;margin:12px 0">${md(r.t)}</div><div class="row" style="justify-content:flex-start"><button onclick="pdf('${r.id}')">Baixar PDF</button><button class="g" onclick="delRep('${r.id}')">Excluir</button></div></details>`,
    )
    .join("");
  relInfo();
}
async function gerar() {
  if (!U || !API || !navigator.onLine)
    return relInfo("⚠ Precisa de internet e conexão com o servidor.");
  const b = $("#relb");
  b.disabled = true;
  b.textContent = "Gerando…";
  $("#relo").insertAdjacentHTML(
    "afterbegin",
    '<div class="card" id="relsk"><div class="shl" style="width:55%"></div><div class="shl"></div><div class="shl"></div><div class="shl" style="width:80%"></div></div>',
  );
  let em = "";
  try {
    const a = await api({ action: "report", resumo: resumo() });
    ST.rel = a.restantes;
    S.rep.unshift({ id: uid(), mes: M, ts: Date.now(), t: a.text });
    while (S.rep.length > 15) S.del.push(S.rep.pop().id);
    persist();
  } catch (e) {
    em = "⚠ " + e.message;
  }
  const sk = $("#relsk");
  sk && sk.remove();
  b.textContent = "Gerar relatório do mês";
  b.disabled = false;
  relInfo(em);
}
function pdf(id) {
  const r = S.rep.find((x) => x.id === id);
  if (!r) return;
  if (!window.jspdf)
    return relInfo(
      "⚠ O gerador de PDF não carregou. Conecte-se à internet e recarregue.",
    );
  const d = new window.jspdf.jsPDF({ unit: "pt", format: "a4" }),
    W = d.internal.pageSize.getWidth() - 100;
  let y = 60;
  d.setFont("helvetica", "bold");
  d.setFontSize(18);
  d.text("Cifra - Relatorio financeiro", 50, y);
  y += 22;
  d.setFont("helvetica", "normal");
  d.setFontSize(10);
  d.setTextColor(120);
  d.text(
    safe(
      `Referente a ${r.mes} - gerado em ${new Date(r.ts).toLocaleString("pt-BR")}${U.nome ? " - " + U.nome : ""}`,
    ),
    50,
    y,
  );
  y += 28;
  d.setTextColor(20);
  r.t.split("\n").forEach((l) => {
    const b = /^\s*\*\*.+\*\*\s*:?\s*$/.test(l);
    l = safe(l.replace(/\*\*/g, "").replace(/^\s*[-*]\s+/, "- "));
    d.setFont("helvetica", b ? "bold" : "normal");
    d.setFontSize(b ? 13 : 11);
    if (b) y += 4;
    d.splitTextToSize(l || " ", W).forEach((t) => {
      if (y > 790) {
        d.addPage();
        y = 60;
      }
      d.text(t, 50, y);
      y += b ? 18 : 15;
    });
  });
  d.save(`relatorio-${r.mes}.pdf`);
}
function alerts() {
  const [y, m] = M.split("-").map(Number),
    g = S.tx.filter((x) => x.tipo === "gasto" && mk(x.data) === M),
    bc = grp(g, (x) => x.cat),
    cur = M === mk(today()),
    nd = new Date(y, m, 0).getDate(),
    dia = cur ? +today().slice(8) : nd,
    L = [];
  const fx = (x) =>
      x.parc || (x.id[0] === "r" && S.gen && S.gen[x.id.slice(1)]),
    hoje = +today().slice(8),
    proj = (k, v) => {
      const gk = g.filter((x) => x.cat === k),
        vt = gk.filter((x) => !fx(x)),
        vv = sum(vt),
        fut = cur
          ? sum(
              S.rec.filter(
                (r) =>
                  r.tipo === "gasto" &&
                  r.cat === k &&
                  Math.min(r.dia, 28) > hoje,
              ),
            )
          : 0;
      return v - vv + fut + (dia >= 7 && vt.length >= 3 ? (vv / dia) * nd : vv);
    };
  Object.keys(S.lim)
    .filter((k) => S.lim[k] > 0)
    .forEach((k) => {
      const v = bc[k] || 0,
        lm = S.lim[k],
        p = (v / lm) * 100,
        pr = proj(k, v);
      if (p >= 100)
        L.push({
          n: 2,
          p,
          t: `Limite estourado em ${k}: ${brl(v)} de ${brl(lm)} (${brl(v - lm)} acima).`,
        });
      else if (p >= 80)
        L.push({
          n: 1,
          p,
          t: `${k} está em ${Math.round(p)}% do limite. Restam ${brl(lm - v)}.`,
        });
      else if (cur && v > 0 && pr > lm)
        L.push({
          n: 1,
          p,
          t: `No ritmo atual, ${k} deve fechar o mês em ${brl(pr)}, acima do limite de ${brl(lm)}.`,
        });
    });
  const r = sum(S.tx.filter((x) => x.tipo === "receita" && mk(x.data) === M));
  const pend = cur
    ? sum(
        S.rec.filter(
          (q) =>
            q.tipo === "receita" &&
            Math.min(q.dia, 28) > hoje &&
            !S.gen[q.id + M],
        ),
      )
    : 0;
  if (sum(g) > 0 && sum(g) > r + pend)
    L.push({
      n: 1,
      p: 0,
      t: `Seus gastos (${brl(sum(g))}) superam suas receitas (${brl(r)}) neste mês.`,
    });
  return L.sort((a, b) => b.n - a.n || b.p - a.p);
}
function alrRender() {
  const L = alerts(),
    has = Object.values(S.lim).some((v) => v > 0);
  $("#alr").innerHTML =
    L.map(
      (a) =>
        `<div class="item row" style="align-items:center"><span style="color:${a.n === 2 ? "var(--red)" : "#f2b84b"};font-size:18px">●</span><div style="flex:1;min-width:0">${a.t}</div></div>`,
    ).join("") ||
    (has
      ? '<span class="mut">Tudo dentro do planejado neste mês. ✓</span>'
      : '<span class="mut">Defina limites por categoria em Ajustes para receber alertas.</span>');
  $("#bd").textContent = L.length || "";
}
let SEL = "";
function cal(tx, y, m) {
  const nd = new Date(y, m, 0).getDate(),
    off = new Date(y, m - 1, 1).getDay(),
    by = {};
  tx.forEach((x) => {
    if (x.tipo === "transf" || x.tipo === "pagfat") return;
    const b = (by[x.data] = by[x.data] || { g: 0, r: 0, i: 0 });
    b[x.tipo === "gasto" ? "g" : x.tipo === "receita" ? "r" : "i"] += x.valor;
  });
  const mx = Math.max(1, ...Object.values(by).map((b) => b.g)),
    k = (v) =>
      v >= 1000 ? (v / 1000).toFixed(1).replace(".", ",") + "k" : Math.round(v);
  let h =
    ["D", "S", "T", "Q", "Q", "S", "S"]
      .map((d) => `<div class="ch">${d}</div>`)
      .join("") + "<div></div>".repeat(off);
  for (let d = 1; d <= nd; d++) {
    const ds = M + "-" + String(d).padStart(2, "0"),
      b = by[ds] || { g: 0, r: 0, i: 0 };
    h += `<div class="cd${ds === SEL ? " sel" : ""}${ds > today() ? " fut" : ""}" style="${b.g ? `background:rgba(229,96,77,${0.1 + (0.4 * b.g) / mx})` : ""}" onclick="selDay('${ds}')"><span>${d}</span>${b.g ? `<em class="neg">−${k(b.g)}</em>` : ""}${b.r ? `<em class="pos">+${k(b.r)}</em>` : ""}${b.i ? `<em class="mut">↗${k(b.i)}</em>` : ""}</div>`;
  }
  $("#cal").innerHTML = h;
  const l = tx.filter((x) => x.data === SEL);
  $("#cald").innerHTML = SEL
    ? `<b>${SEL.split("-").reverse().join("/")}</b>` +
      (l
        .map(
          (x) =>
            `<div class="row" style="margin-top:6px"><span>${esc(x.desc || x.cat)}</span><span class="${x.tipo === "receita" ? "pos" : ""}">${x.tipo === "receita" ? "+" : x.tipo === "gasto" ? "−" : "↗ "}${brl(x.valor)}</span></div>`,
        )
        .join("") || '<div class="mut">Sem lançamentos neste dia.</div>')
    : '<span class="mut">Toque num dia para ver os lançamentos. Quanto mais vermelho, maior o gasto.</span>';
}
function selDay(d) {
  SEL = SEL === d ? "" : d;
  render();
}
function render() {
  hi();
  setupCard();
  alrRender();
  contasRender();
  insRender();
  extras();
  relRender();
  chRender();
  const ink = css("--ink"),
    [y, m] = M.split("-"),
    tx = S.tx.filter((x) => mk(x.data) === M),
    g = tx.filter((x) => x.tipo === "gasto"),
    r = tx.filter((x) => x.tipo === "receita"),
    iv = tx.filter((x) => x.tipo === "invest");
  $("#mes").textContent =
    new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" }) +
    " " +
    y;
  $("#nx").disabled = M >= mk(today());
  const sd = sum(r) - sum(g) - sum(iv);
  anim($("#saldo"), sd);
  $("#saldo").className = "big " + (sd < 0 ? "neg" : "");
  anim($("#rec"), sum(r));
  anim($("#gas"), sum(g));
  anim($("#inv"), sum(iv));
  const bc = grp(g, (x) => x.cat);
  $("#lims").innerHTML =
    Object.keys(S.lim)
      .filter((k) => S.lim[k] > 0)
      .map((k) => {
        const p = ((bc[k] || 0) / S.lim[k]) * 100;
        return `<div class="row"><span>${k}</span><span class="mut">${brl(bc[k] || 0)} / ${brl(S.lim[k])}</span></div><div class="bar"><i style="width:${Math.min(p, 100)}%;background:${p >= 100 ? "var(--red)" : p >= 80 ? "#f2b84b" : "var(--grn)"}"></i></div>`;
      })
      .join("") || '<span class="mut">Defina limites em Ajustes.</span>';
  ch("c1", "doughnut", Object.keys(bc), [
    { data: Object.values(bc), backgroundColor: PAL, borderWidth: 0 },
  ]);
  const ms = [...Array(6)].map((_, i) =>
    new Date(y, m - 1 - 5 + i, 1).toLocaleDateString("sv").slice(0, 7),
  );
  const mt = (t) =>
    ms.map((k) => sum(S.tx.filter((x) => mk(x.data) === k && x.tipo === t)));
  ch(
    "c2",
    "bar",
    ms.map((k) => k.slice(5) + "/" + k.slice(2, 4)),
    [
      {
        label: "Receitas",
        data: mt("receita"),
        backgroundColor: PAL[0],
        borderRadius: 8,
      },
      {
        label: "Gastos",
        data: mt("gasto"),
        backgroundColor: ink,
        borderRadius: 8,
      },
      {
        label: "Investido",
        data: mt("invest"),
        backgroundColor: "#7aa6ff",
        borderRadius: 8,
      },
    ],
  );
  cal(tx, y, m);
  const bp = grp(g, (x) => x.pay);
  ch("c4", "doughnut", Object.keys(bp), [
    { data: Object.values(bp), backgroundColor: PAL, borderWidth: 0 },
  ]);
  const dw = [0, 0, 0, 0, 0, 0, 0];
  g.forEach((x) => (dw[new Date(x.data + "T12:00").getDay()] += x.valor));
  ch(
    "c5",
    "bar",
    ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
    [{ data: dw, backgroundColor: ink, borderRadius: 8 }],
  );
  $("#list").innerHTML = listHtml(tx);
  $("#recs").innerHTML =
    S.rec
      .map(
        (x) =>
          `<div class="item row"><div><b>${esc(x.desc)}</b><div class="mut">dia ${x.dia} · ${x.tipo === "receita" ? "+" : ""}${brl(x.valor)}</div></div><button class="g" onclick="delRec('${x.id}')">✕</button></div>`,
      )
      .join("") ||
    '<div class="mut" style="padding:4px 0 8px">Nenhum gasto fixo ainda. Adicione aluguel, internet, salário…</div>';
  $("#limf").innerHTML = CATS.map(
    (c, i) =>
      `<label class="lrow"><i style="background:${PAL[i % PAL.length]}"></i><span>${c}</span><div class="pre"><em>R$</em><input type="number" inputmode="decimal" placeholder="sem limite" value="${S.lim[c] || ""}" onchange="S.lim['${c}']=+this.value;persist()"></div></label>`,
  ).join("");
}
const del = (id) => {
    const b = document.querySelector(`#list [onclick="del('${id}')"]`),
      it = b && b.closest(".item"),
      go = () => {
        S.del = [...(S.del || []), id];
        S.tx = S.tx.filter((x) => x.id !== id);
        persist();
      };
    if (it && !matchMedia("(prefers-reduced-motion:reduce)").matches) {
      it.classList.add("out");
      setTimeout(go, 200);
    } else go();
  },
  delRec = (id) => {
    S.del = [...(S.del || []), id];
    S.rec = S.rec.filter((x) => x.id !== id);
    persist();
  };
function addRec() {
  const v = +$("#rv").value;
  if (!$("#rd").value || !v) return;
  S.rec.push({
    id: uid(),
    desc: $("#rd").value,
    valor: v,
    dia: +$("#rdia").value || 1,
    cat: $("#rc").value,
    pay: $("#rp").value,
    tipo: $("#rt").value,
  });
  gen();
  persist();
  ["rd", "rv", "rdia"].forEach((i) => ($("#" + i).value = ""));
}
async function logout() {
  if (U && API && navigator.onLine) await sync().catch(() => {});
  const KEY = U ? SK() : "";
  if (
    ST.sheet !== "ok" &&
    !confirm(
      "A última sincronização falhou; o que não foi sincronizado será perdido. Sair mesmo?",
    )
  )
    return;
  if (U && API && navigator.onLine)
    await api({ action: "logout" }).catch(() => {});
  if (KEY) localStorage.removeItem(KEY);
  localStorage.removeItem("u");
  location.reload();
}
const mask = (v) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const cpfOk = (c) => {
  c = c.replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return 0;
  for (let t = 9; t < 11; t++) {
    let q = 0;
    for (let i = 0; i < t; i++) q += c[i] * (t + 1 - i);
    if (((q * 10) % 11) % 10 != c[t]) return 0;
  }
  return 1;
};
let mode = "login";
const netErr = (e) =>
  e.name === "SyntaxError"
    ? "O servidor respondeu algo inesperado. Reimplante o Apps Script (nova versão)."
    : e.message === "Failed to fetch"
      ? "Não consegui falar com o servidor. Tente de novo em instantes."
      : e.message;
const aerr = (t, ok) => {
  $("#aerr").style.color = ok ? "var(--grn)" : "";
  $("#aerr").textContent = t || "";
};
function authMode(m) {
  mode = m;
  const su = m === "signup",
    rs = m === "reset";
  $("#a0").style.display = su ? "block" : "none";
  $("#a2").style.display = su || rs ? "block" : "none";
  $("#ainv").parentNode.style.display = su ? "block" : "none";
  $("#a3").style.display = rs ? "block" : "none";
  $("#m1").classList.toggle("on", m === "login");
  $("#m2").classList.toggle("on", su);
  $("#abtn").textContent = {
    login: "Entrar",
    signup: "Criar conta",
    reset: "Redefinir senha",
  }[m];
  $("#apw").placeholder = rs
    ? "Nova senha (mín. 8 caracteres)"
    : "Senha (mín. 8 caracteres)";
  aerr();
}
function showAuth(t) {
  $("#auth").style.display = "block";
  aerr(t);
}
async function auth() {
  const cpf = $("#acpf").value,
    senha = $("#apw").value;
  aerr();
  if (!cpfOk(cpf)) return aerr("CPF inválido.");
  if (senha.length < 8) return aerr("A senha precisa de 8 caracteres ou mais.");
  if (mode === "signup" && !$("#anome").value.trim())
    return aerr("Informe seu nome.");
  if (mode === "signup" && !EMR.test($("#aemail").value.trim()))
    return aerr("Informe um e-mail válido.");
  if (mode === "reset" && !$("#arc").value.trim())
    return aerr("Informe o código de recuperação.");
  if (mode !== "login" && senha !== $("#apw2").value)
    return aerr("As senhas não coincidem.");
  if (!API) return aerr("Servidor não configurado.");
  $("#abtn").disabled = 1;
  try {
    const r = await fetch(API, {
      method: "POST",
      body: JSON.stringify({
        action: mode,
        cpf: cpf.replace(/\D/g, ""),
        senha,
        convite: $("#ainv").value,
        nome: $("#anome").value,
        email: $("#aemail").value.trim(),
        codigo: $("#arc").value,
      }),
    }).then((r) => r.json());
    if (r.nao_cadastrado) {
      authMode("signup");
      aerr("Você ainda não tem conta. Vamos criar a sua!", true);
      $("#anome").focus();
      $("#abtn").disabled = 0;
      return;
    }
    if (r.error) throw new Error(r.error);
    U = { uid: r.uid, tok: r.tok, nome: r.nome || "" };
    localStorage.u = JSON.stringify(U);
    $("#apw").value = $("#apw2").value = "";
    if (window.cifraFx) await cifraFx.exit(!r.rc);
    if (r.rc) showRC(r.rc);
    else start();
  } catch (e) {
    aerr(netErr(e));
  }
  $("#abtn").disabled = 0;
}
function start() {
  let l = localStorage[SK()];
  if (!l && localStorage.g) {
    l = localStorage.g;
    localStorage.removeItem("g");
  }
  S = JSON.parse(l || "null") || {
    tx: [],
    rec: [],
    lim: {},
    gen: {},
    del: [],
  };
  S.del = S.del || [];
  S.rep = S.rep || [];
  S.cv = S.cv || [];
  S.metas = S.metas || [];
  S.contas = S.contas || [];
  S.cartoes = S.cartoes || [];
  S.parc = S.parc || [];
  CVID = "";
  M = mk(today());
  ON = 1;
  $("#auth").style.display = "none";
  gen();
  store();
  render();
  relRender();
  chRender();
  pills();
  sync();
}
const say = (t) => {
    const e = $("#say");
    e.textContent = t;
    e.classList.toggle("think", /…$/.test(t));
    e.classList.remove("f");
    void e.offsetWidth;
    e.classList.add("f");
  },
  num = (x) => +x.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
function local(t) {
  const inv = /invest/i.test(t),
    rec = /recebi|sal[aá]rio|ganhei/i.test(t),
    pay = PAYS.find((p) => t.toLowerCase().includes(p.toLowerCase())) || "Pix";
  return t
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const n = [
        ...s.matchAll(
          /(?<![A-Za-z\d])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)(?![A-Za-z\d])/g,
        ),
      ];
      return (
        n.length && {
          tipo: inv ? "invest" : rec ? "receita" : "gasto",
          valor: num(n[n.length - 1][1]),
          cat: inv ? "Investimento" : rec ? "Renda extra" : "Outros",
          pay,
          desc: s.slice(0, 60),
          data: today(),
          ativo: inv
            ? (s.match(/\b[A-Za-z]{4}\d{1,2}[Ff]?\b/) || [""])[0].toUpperCase()
            : "",
        }
      );
    })
    .filter(Boolean);
}
async function send() {
  const t = $("#in").value.trim();
  if (!t && !PEND) return;
  $("#in").value = "";
  grow();
  if (CUR === 4) return chatSend(t);
  say("Pensando…");
  let r,
    fb = "";
  try {
    if (!U || !API) throw new Error("sem conexão com o servidor");
    const g = grp(
        S.tx.filter((x) => x.tipo === "gasto" && mk(x.data) === M),
        (x) => x.cat,
      ),
      rec = [...S.tx]
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, 25)
        .map((x) => [x.id, x.data, x.tipo, x.valor, x.cat, x.desc]);
    const sys = `Você é o assistente financeiro do app Cifra. Hoje é ${today()}. Categorias de gasto: ${CATS}. Receitas: ${RCATS}. Pagamentos: ${PAYS}. Responda SOMENTE JSON. Se o usuário registra movimentos (pode ser vários numa mensagem): {"acao":"lancar","itens":[{"tipo":"gasto"|"receita"|"invest","valor":número,"cat":"...","pay":"...","desc":"curta","data":"YYYY-MM-DD"}]}. Compra de ativos/aplicações (ações, FIIs, tesouro, cripto) é tipo "invest" com cat "Investimento"; números em tickers como ITSA4 ou KNSC11 NÃO são valores; o valor é o que vem depois de "->" ou ":" . Nunca use datas futuras. pay padrão Pix. Contas: ${(S.contas || []).map((c) => c.nome).join(", ") || "nenhuma"}. Cartões: ${(S.cartoes || []).map((c) => c.nome).join(", ") || "nenhum"}. Se citar conta ou cartão, use os campos \"conta\"/\"cartao\" com o nome exato. Compra parcelada (ex.: \"em 3x\"): inclua \"parcelas\":N, coloque em valor o TOTAL da compra e pay \"Crédito\". Transferência entre contas: tipo \"transf\" com \"conta\" (origem) e \"destino\". Em investimentos inclua \"ativo\" (ticker, se houver). Corrigir/atualizar/alterar/trocar/apagar/remover um lançamento JÁ EXISTENTE NUNCA cria lançamento novo: responda {\"acao\":\"editar\",\"id\":\"ID\",\"campos\":{apenas os campos que mudam: valor,cat,pay,desc,data,tipo}} ou {\"acao\":\"apagar\",\"id\":\"ID\"}, escolhendo o id mais provável entre os lançamentos recentes (o que combina com o que o usuário citou; \"o último\" = o primeiro da lista). Se não der para saber qual, responda como pergunta pedindo que especifique. Se for pergunta ou pedido de dica: {"acao":"pergunta","resposta":"resposta curta em pt-BR"}. Dados de ${M}: receitas ${sum(S.tx.filter((x) => x.tipo === "receita" && mk(x.data) === M))}, gastos por categoria ${JSON.stringify(g)}, limites ${JSON.stringify(S.lim)}, lançamentos recentes [id,data,tipo,valor,cat,desc]: ${JSON.stringify(rec)}.`;
    const a = await aiCall(sys, t);
    if (a.model) {
      ST.model = a.model;
      ST.ia = "ok";
      pills();
    }
    r = JSON.parse(a.text);
  } catch (e) {
    fb = e.message;
    ST.ia = "err";
    ST.msg = "IA: " + e.message;
    pills();
    r = /atualiz|corrig|alter|troqu|\bmude|\bmuda|apag|exclu|remov|errei/i.test(
      t,
    )
      ? {
          acao: "pergunta",
          resposta:
            "Para corrigir ou apagar um lançamento preciso da IA, que está indisponível agora. Use o botão ✎ no Extrato.",
        }
      : { acao: "lancar", itens: local(t) };
  }
  if (r.acao === "pergunta") return say(r.resposta);
  if (r.acao === "editar" || r.acao === "apagar") {
    const x = S.tx.find((t) => t.id === r.id);
    if (!x)
      return say(
        "Não achei esse lançamento. Diga qual é (descrição ou valor) ou use ✎ no Extrato.",
      );
    const old = JSON.parse(JSON.stringify(x));
    if (r.acao === "apagar") {
      S.del.push(x.id);
      S.tx = S.tx.filter((t) => t !== x);
      persist();
      return sayU(`Apaguei: ${x.desc || x.cat} · ${brl(x.valor)}`, () => {
        S.tx.push({ ...old, id: uid(), ts: Date.now() });
        persist();
      });
    }
    const c = r.campos || {},
      n = {};
    if (+c.valor > 0) n.valor = +c.valor;
    if (c.cat) n.cat = String(c.cat).slice(0, 30);
    if (PAYS.includes(c.pay)) n.pay = c.pay;
    if (c.desc) n.desc = String(c.desc).slice(0, 60);
    if (/^\d{4}-\d\d-\d\d$/.test(c.data || "") && c.data <= today())
      n.data = c.data;
    if (TIPOS.includes(c.tipo)) n.tipo = c.tipo;
    if (!Object.keys(n).length) return say("Não entendi o que alterar.");
    Object.assign(x, n, { ts: Date.now() });
    persist();
    return sayU(
      `Atualizei: ${x.desc || x.cat} · ${old.valor !== x.valor ? brl(old.valor) + " → " : ""}${brl(x.valor)}`,
      () => {
        Object.assign(x, old, { ts: Date.now() });
        persist();
      },
    );
  }
  const it = (r.itens || []).filter((x) => x && toNum(x.valor) > 0);
  if (!it.length)
    return say(
      "Não entendi os valores. " + (fb ? "IA indisponível: " + fb : ""),
    );
  const ids = [],
    pids = [];
  it.forEach((x) => {
    const o = mkItem(x, ids, pids);
    if (o) S.tx.push(o);
  });
  if (!ids.length)
    return say(
      "Não consegui registrar. Confira os nomes das contas e cartões.",
    );
  ids.forEach((i) => FLASH.add(i));
  setTimeout(() => FLASH.clear(), 2500);
  persist();
  (fb
    ? say
    : (t) =>
        sayU(t, () => {
          ids.forEach((i) => S.del.push(i));
          S.tx = S.tx.filter((x) => !ids.includes(x.id));
          S.parc = (S.parc || []).filter((p) => !pids.includes(p.id));
          pids.forEach((g) => {
            for (let k = 0; k < 60; k++) delete S.gen["p" + g + k];
          });
          persist();
        }))(
    `${it.length} lançamento(s) anotado(s) · ${brl(sum(it.map((x) => ({ valor: toNum(x.valor) }))))}` +
      (fb ? ` · ⚠ modo sem IA (${fb})` : ""),
  );
}
/* ===== Cifra: e-mail, onboarding, voz e anexos ===== */
const EMR = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
let PEND = null,
  REC = null,
  OBI = 0,
  OBD = {};
const _am = authMode;
authMode = function (m) {
  _am(m);
  if (m === "reset")
    $("#arc").placeholder = "Código do e-mail ou de recuperação";
};
async function pedirReset() {
  const cpf = $("#acpf").value;
  if (!cpfOk(cpf)) return aerr("Digite seu CPF primeiro.");
  try {
    const r = await fetch(API, {
      method: "POST",
      body: JSON.stringify({
        action: "pedirreset",
        cpf: cpf.replace(/\D/g, ""),
      }),
    }).then((r) => r.json());
    if (r.error) throw new Error(r.error);
    aerr(
      "Se este CPF tiver e-mail cadastrado, enviamos um código válido por 15 minutos. Confira o spam.",
      true,
    );
    $("#arc").value = "";
  } catch (e) {
    aerr(netErr(e));
  }
}
function saveConta() {
  const n = $("#nm").value,
    e = $("#em").value.trim();
  if (n.trim()) saveNome(n);
  if (e) saveEmail(e);
  else say("Alterações salvas.");
}
function saveEmail(v) {
  v = (v || "").trim().toLowerCase();
  if (!EMR.test(v)) return say("E-mail inválido.");
  api({ action: "email", email: v })
    .then(() => {
      ST.email = v;
      setupCard();
      hi();
      say("E-mail salvo.");
    })
    .catch((e) => say("⚠ " + e.message));
}
const OB = [
  {
    q: "Como você quer ser chamado?",
    f: [["nome", "text", "Seu nome"]],
    skip: () => !!U.nome,
  },
  {
    q: "Qual seu e-mail?",
    h: "Serve para recuperar a conta.",
    f: [["email", "email", "voce@email.com"]],
    skip: () => !!ST.email,
  },
  {
    q: "Quanto você recebe por mês?",
    h: "E em que dia cai na conta.",
    f: [
      ["renda", "number", "Renda (R$)"],
      ["dia", "number", "Dia do mês"],
    ],
  },
  {
    q: "Qual conta você mais usa?",
    h: "Informe o saldo de hoje.",
    f: [
      ["conta", "text", "Nome da conta (ex: Nubank)"],
      ["saldo", "number", "Saldo atual (R$)"],
    ],
  },
  {
    q: "Você usa cartão de crédito?",
    h: "Assim eu acompanho fatura e limite.",
    f: [
      ["cartao", "text", "Nome do cartão"],
      ["climite", "number", "Limite (R$)"],
      ["cfecha", "number", "Dia do fechamento"],
      ["cvence", "number", "Dia do vencimento"],
    ],
  },
  {
    q: "Quanto custa sua moradia por mês?",
    h: "Aluguel ou financiamento.",
    f: [
      ["mor", "number", "Valor (R$)"],
      ["mordia", "number", "Dia do vencimento"],
    ],
  },
  {
    q: "Tem outro gasto fixo importante?",
    h: "Escola, plano de saúde, internet…",
    f: [
      ["fx", "text", "Descrição"],
      ["fxv", "number", "Valor (R$)"],
      ["fxd", "number", "Dia do vencimento"],
    ],
  },
  {
    q: "Quanto quer investir por mês?",
    h: "Eu lanço como investimento todo mês.",
    f: [
      ["invm", "number", "Valor (R$)"],
      ["invd", "number", "Dia do mês"],
    ],
  },
  {
    q: "Quanto quer gastar por mês, no máximo?",
    h: "Divido esse teto entre as categorias.",
    f: [["teto", "number", "Teto mensal (R$)"]],
  },
  {
    q: "Tem uma meta em mente?",
    h: "Reserva de emergência, viagem, carro…",
    f: [
      ["meta", "text", "Nome da meta"],
      ["alvo", "number", "Valor alvo (R$)"],
      ["guard", "number", "Já guardado (R$)"],
    ],
  },
];
let OBL = [],
  OBR = 0;
function obShow() {
  let e = $("#ob");
  if (!e) {
    e = document.createElement("div");
    e.id = "ob";
    e.className = "auth";
    e.style.zIndex = 35;
    document.body.append(e);
  }
  OBL = OB.filter((s) => !(s.skip && s.skip()));
  e.style.display = "block";
  OBI = 0;
  OBR = 0;
  OBD = {};
  obStep();
}
function obSave() {
  const s = OBL[OBI];
  s &&
    s.f.forEach((f) => {
      const e = $("#ob_" + f[0]);
      if (e) OBD[f[0]] = e.value.trim();
    });
}
const obSeg = () =>
  `<div class="obp">${OBL.map((_, k) => `<button aria-label="Ir para a pergunta ${k + 1}" onclick="obJump(${k})" class="${k < OBI || OBI >= OBL.length ? "d" : k === OBI ? "d c" : ""}"><i></i></button>`).join("")}</div>`;
function obStep() {
  if (OBI >= OBL.length) return obReview();
  const s = OBL[OBI];
  $("#ob").innerHTML =
    `<div class="obw"><div class="obt"><button class="obfb" onclick="obBack()" ${OBI ? "" : "disabled"}>‹ Voltar</button><button class="obfb" onclick="obClose()">Fechar</button></div>${obSeg()}<div class="obn">Pergunta ${OBI + 1} de ${OBL.length}</div><h2 class="obq">${s.q}</h2><p class="obh">${s.h || "&nbsp;"}</p>${s.f.map((f, k) => `<div class="f ni fld" style="--d:${0.08 + k * 0.06}s"><label class="obl">${f[2]}</label><input id="ob_${f[0]}" type="${f[1]}" ${f[1] === "number" ? 'inputmode="decimal"' : ""} value="${esc(OBD[f[0]] || "")}" onkeydown="if(event.key==='Enter')obNext()"></div>`).join("")}<div class="obf"><button class="obfb" onclick="obSkip()">Pular</button><button class="go" onclick="obNext()"><span>${OBR ? "Salvar" : OBI === OBL.length - 1 ? "Revisar" : "Continuar"}</span></button></div></div>`;
  const i = $("#ob_" + s.f[0][0]);
  i && i.focus();
}
function obReview() {
  const rows = OBL.map((s, k) => {
    const v = s.f
      .map((f) =>
        OBD[f[0]] ? `${f[2].replace(/\s*\(.*\)/, "")}: ${esc(OBD[f[0]])}` : "",
      )
      .filter(Boolean)
      .join(" · ");
    return `<div class="item row"><div class="it"><b>${s.q}</b><div class="mut">${v || "Pulado"}</div></div><button class="g" onclick="OBR=1;OBI=${k};obStep()">Editar</button></div>`;
  }).join("");
  $("#ob").innerHTML =
    `<div class="obw"><div class="obt"><button class="obfb" onclick="OBR=0;OBI=OBL.length-1;obStep()">‹ Voltar</button><button class="obfb" onclick="obClose()">Fechar</button></div>${obSeg()}<h2 class="obq">Confira suas respostas</h2><p class="obh">Toque em Editar para mudar qualquer uma.</p>${rows}<div class="obf"><button class="go" onclick="obEnd()"><span>Concluir</span></button></div></div>`;
}
function obJump(k) {
  obSave();
  OBR = 0;
  OBI = k;
  obStep();
}
function obBack() {
  obSave();
  if (OBI > 0) {
    OBR = 0;
    OBI--;
    obStep();
  }
}
function obSkip() {
  OBR ? ((OBR = 0), (OBI = OBL.length)) : OBI++;
  obStep();
}
function obNext() {
  obSave();
  OBR ? ((OBR = 0), (OBI = OBL.length)) : OBI++;
  obStep();
}
function obClose() {
  obSave();
  if (
    Object.values(OBD).some(Boolean) &&
    !confirm("Sair sem concluir? As respostas serão descartadas.")
  )
    return;
  S.onb = 1;
  persist();
  $("#ob").style.display = "none";
}
function obEnd() {
  const d = OBD,
    n = (k) => +String(d[k] || "").replace(",", ".") || 0,
    dd = (k, v) => Math.min(28, Math.max(1, n(k) || v));
  if (d.nome) saveNome(d.nome);
  if (d.email && EMR.test(d.email)) saveEmail(d.email);
  if (n("renda") > 0)
    S.rec.push({
      id: uid(),
      desc: "Salário",
      valor: n("renda"),
      dia: dd("dia", 5),
      cat: "Salário",
      pay: "Pix",
      tipo: "receita",
    });
  let cid = "";
  if (d.conta) {
    cid = uid();
    S.contas.push({
      id: cid,
      nome: d.conta.slice(0, 30),
      saldo0: n("saldo"),
      ts: Date.now(),
    });
  }
  if (
    d.cartao &&
    n("cfecha") >= 1 &&
    n("cfecha") <= 31 &&
    n("cvence") >= 1 &&
    n("cvence") <= 31
  )
    S.cartoes.push({
      id: uid(),
      nome: d.cartao.slice(0, 30),
      limite: n("climite"),
      fecha: n("cfecha"),
      vence: n("cvence"),
      conta: cid,
      ts: Date.now(),
    });
  if (n("mor") > 0)
    S.rec.push({
      id: uid(),
      desc: "Moradia",
      valor: n("mor"),
      dia: dd("mordia", 5),
      cat: "Moradia",
      pay: "Pix",
      tipo: "gasto",
    });
  if (d.fx && n("fxv") > 0)
    S.rec.push({
      id: uid(),
      desc: d.fx.slice(0, 40),
      valor: n("fxv"),
      dia: dd("fxd", 5),
      cat: "Outros",
      pay: "Pix",
      tipo: "gasto",
    });
  if (n("invm") > 0)
    S.rec.push({
      id: uid(),
      desc: "Investimento mensal",
      valor: n("invm"),
      dia: dd("invd", 5),
      cat: "Investimento",
      pay: "Pix",
      tipo: "invest",
    });
  if (n("teto") > 0) {
    const P = {
      Moradia: 0.3,
      Alimentação: 0.15,
      Mercado: 0.15,
      Transporte: 0.1,
      Lazer: 0.1,
      Saúde: 0.05,
      Compras: 0.05,
      Outros: 0.1,
    };
    Object.keys(P).forEach((k) => (S.lim[k] = Math.round(n("teto") * P[k])));
  }
  if (d.meta && n("alvo") > 0)
    S.metas.push({
      id: uid(),
      nome: d.meta.slice(0, 40),
      alvo: n("alvo"),
      guardado: n("guard"),
      ts: Date.now(),
    });
  S.onb = 1;
  gen();
  persist();
  $("#ob").innerHTML =
    `<div class="obw" style="justify-content:center;align-items:center;text-align:center"><svg class="obck" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><h2 class="obq">Tudo pronto${U.nome ? ", " + esc(first(U.nome)) : ""}.</h2><p class="obh">Montei suas contas, limites e metas. Ajuste tudo em Ajustes quando quiser.</p></div>`;
  setTimeout(() => ($("#ob").style.display = "none"), 2000);
}
function attShow() {
  $("#att").innerHTML = PEND
    ? `<span class="pill"><i></i>${esc(PEND.name)} <a href="#" class="mut" onclick="clearPend();return false">✕</a></span>`
    : "";
}
function clearPend() {
  PEND = null;
  attShow();
}
function img2(f) {
  return new Promise((ok, no) => {
    const u = URL.createObjectURL(f),
      i = new Image();
    i.onload = () => {
      const k = Math.min(1, 1280 / Math.max(i.width, i.height)),
        c = document.createElement("canvas");
      c.width = i.width * k;
      c.height = i.height * k;
      c.getContext("2d").drawImage(i, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      ok(c.toDataURL("image/jpeg", 0.8));
    };
    i.onerror = () => no(new Error("Imagem inválida."));
    i.src = u;
  });
}
async function pdfTxt(f) {
  if (!window.pdfjsLib) {
    await new Promise((o, n) => {
      const s = document.createElement("script");
      s.src =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = o;
      s.onerror = () =>
        n(new Error("Leitor de PDF indisponível (precisa de internet)."));
      document.head.append(s);
    });
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  const d = await pdfjsLib.getDocument({ data: await f.arrayBuffer() }).promise;
  let t = "";
  for (let i = 1; i <= Math.min(d.numPages, 8) && t.length < 6000; i++)
    t +=
      (await (await d.getPage(i)).getTextContent()).items
        .map((x) => x.str)
        .join(" ") + "\n";
  return t.slice(0, 6000);
}
async function pick(f) {
  if (!f) return;
  try {
    say("Lendo arquivo…");
    if (f.type.startsWith("image/"))
      PEND = { name: f.name || "foto", img: await img2(f) };
    else if (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name))
      PEND = { name: f.name, txt: await pdfTxt(f) };
    else {
      if (f.size > 2e6) throw new Error("Arquivo grande demais (máx. 2 MB).");
      PEND = { name: f.name, txt: (await f.text()).slice(0, 6000) };
    }
    if (PEND.txt != null && !PEND.txt.trim()) {
      PEND = null;
      throw new Error("Não encontrei texto neste arquivo.");
    }
    attShow();
    say("");
  } catch (e) {
    say("⚠ " + e.message);
  }
  $("#fi").value = "";
}
function aiCall(sys, t) {
  const p = PEND;
  clearPend();
  if (p && p.img)
    return api({
      action: "vision",
      system: sys,
      user: t || "Registre os lançamentos desta imagem.",
      image: p.img,
    });
  return api({
    action: "ai",
    system: sys,
    user: p
      ? (t || "Registre os lançamentos deste arquivo.") +
        "\n\nARQUIVO " +
        p.name +
        ":\n" +
        p.txt
      : t,
  });
}
function chatCall(c) {
  const p = PEND;
  clearPend();
  const b = {
    action: p && p.img ? "vision" : "chat",
    modo: "chat",
    msgs: c.m.slice(-7).map((x) => ({ r: x.r, t: x.t })),
    resumo: resumo(),
  };
  if (p && p.img) b.image = p.img;
  if (p && p.txt) b.anexo = p.name + ":\n" + p.txt;
  return api(b);
}
async function mic() {
  if (REC) return REC.stop();
  if (!navigator.mediaDevices || !window.MediaRecorder)
    return say("Seu navegador não suporta gravação de voz.");
  try {
    const st = await navigator.mediaDevices.getUserMedia({ audio: true }),
      ch = [],
      r = new MediaRecorder(st),
      b = $(CUR === 4 ? "#mic2" : "#mic");
    const tm = setTimeout(() => r.state === "recording" && r.stop(), 60000);
    r.ondataavailable = (e) => ch.push(e.data);
    r.onstop = async () => {
      clearTimeout(tm);
      st.getTracks().forEach((t) => t.stop());
      REC = null;
      b.classList.remove("rec");
      const bl = new Blob(ch, { type: r.mimeType });
      if (bl.size < 1500) return say("Não ouvi nada, tente de novo.");
      say("Transcrevendo…");
      try {
        const d = await new Promise((o, n) => {
          const f = new FileReader();
          f.onload = () => o(f.result.split(",")[1]);
          f.onerror = n;
          f.readAsDataURL(bl);
        });
        const a = await api({
          action: "transcribe",
          audio: d,
          mime: r.mimeType,
        });
        const T = $(CUR === 4 ? "#cin" : "#in");
        T.value = (T.value + " " + a.text).trim();
        if (CUR === 4) aiGrow();
        grow();
        $("#in").focus();
        say("");
      } catch (e) {
        say("⚠ " + e.message);
      }
    };
    r.start();
    REC = r;
    b.classList.add("rec");
    say("Gravando… toque no microfone para parar.");
  } catch (e) {
    say("⚠ Permita o uso do microfone para falar.");
  }
}

function grow() {
  const e = $("#in");
  e.style.height = "auto";
  e.style.height = Math.max(46, Math.min(e.scrollHeight + 2, 140)) + "px";
}
/* ===== login animado ===== */
const AT = {
  login: ["Entre na sua conta", "Use seu CPF e sua senha.", "Entrar"],
  signup: ["Crie sua conta", "Leva menos de um minuto.", "Criar conta"],
  reset: [
    "Recupere o acesso",
    "Use o código enviado por e-mail ou o de recuperação.",
    "Redefinir senha",
  ],
};
function posInd() {
  const s = $("#seg"),
    b = s.dataset.m === "signup" ? $("#m2") : $("#m1"),
    i = s.querySelector(".ind");
  i.style.width = b.offsetWidth + "px";
  i.style.transform = "translateX(" + b.offsetLeft + "px)";
}
addEventListener("resize", posInd);
document.fonts && document.fonts.ready.then(posInd);
const _sa = showAuth;
showAuth = function (t) {
  _sa(t);
  posInd();
};
$("#apw").addEventListener("input", (e) => {
  const v = e.target.value;
  let s = 0;
  if (v.length >= 8) s++;
  if (v.length >= 12 || (v.length >= 8 && /\d/.test(v) && /[a-z]/i.test(v)))
    s++;
  if (v.length >= 10 && /\d/.test(v) && /[^A-Za-z0-9]/.test(v)) s++;
  $("#str").dataset.s = v ? s || 1 : 0;
});
$("#aemail").insertAdjacentHTML(
  "afterend",
  '<svg class="ck" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
);
$("#aemail").addEventListener("input", (e) =>
  e.target.parentNode.classList.toggle("ok", EMR.test(e.target.value.trim())),
);
function listHtml(tx) {
  if (!tx.length)
    return '<div class="em mut">Nada neste mês. Escreva um gasto na barra de baixo, por texto, voz ou foto.</div>';
  const t = today(),
    y = new Date(Date.now() - 864e5).toLocaleDateString("sv"),
    by = {};
  [...tx]
    .sort((a, b) => b.data.localeCompare(a.data) || (b.ts || 0) - (a.ts || 0))
    .forEach((x) => (by[x.data] = by[x.data] || []).push(x));
  return Object.keys(by)
    .sort()
    .reverse()
    .map((d) => {
      const rows = by[d],
        tot = sum(rows.filter((x) => x.tipo === "gasto")),
        lb =
          d === t
            ? "Hoje"
            : d === y
              ? "Ontem"
              : new Date(d + "T12:00").toLocaleDateString("pt-BR", {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                });
      return (
        `<div class="dh"><span>${lb}</span>${tot ? `<span class="mut">−${brl(tot)}</span>` : ""}</div>` +
        rows
          .map((x) => {
            const col = PAL[Math.max(0, CATS.indexOf(x.cat)) % PAL.length],
              sg = x.tipo === "receita" ? "+" : x.tipo === "gasto" ? "−" : "↗ ";
            return `<div class="item row${FLASH.has(x.id) ? " fl" : ""}"><div class="av" style="background:${col}26;color:${col}">${esc((x.cat || "?").charAt(0))}</div><div class="it"><b>${esc(x.desc || x.cat)}</b><div class="mut">${esc(x.cat)} · ${esc(x.pay)}</div></div><div class="amt ${x.tipo === "receita" ? "pos" : x.tipo === "gasto" ? "" : "mut"}">${sg}${brl(x.valor)}<span class="ac"><button class="g" aria-label="Editar" onclick="edOpen('${x.id}')">✎</button><button class="g" aria-label="Apagar" onclick="del('${x.id}')">✕</button></span></div></div>`;
          })
          .join("")
      );
    })
    .join("");
}
function setupCard() {
  const cfg =
      !S.contas.length && !S.rec.length && !S.cartoes.length
        ? '<div class="card sup"><div><b>Configure a Cifra</b><div class="mut">Responda algumas perguntas e eu monto contas, limites e metas.</div></div><button onclick="obShow()">Começar</button></div>'
        : "",
    em =
      ST.email === ""
        ? '<div class="card sup"><div><b>Cadastre um e-mail</b><div class="mut">Sem ele não dá para recuperar a senha por e-mail.</div></div><button onclick="tab(5);$(\'#em\').focus()">Cadastrar</button></div>'
        : "";
  $("#setup").innerHTML = em + cfg;
}
const _am2 = authMode;
authMode = function (m) {
  _am2(m);
  $("#seg").dataset.m = m;
  posInd();
  $("#atitle").textContent = AT[m][0];
  $("#apw").autocomplete = m === "login" ? "current-password" : "new-password";
  const lk = $("#acard .lk.c"),
    la = lk.querySelector("a");
  lk.style.display = m === "signup" ? "none" : "";
  la.textContent = m === "reset" ? "Voltar para entrar" : "Esqueci minha senha";
  la.onclick = () => {
    authMode(m === "reset" ? "login" : "reset");
    return false;
  };
  $("#asub").textContent = AT[m][1];
  $("#abtn").innerHTML = "<span>" + AT[m][2] + "</span>";
  const c = $("#acard");
  c.classList.remove("sw", "shk");
  void c.offsetWidth;
  c.classList.add("sw");
};
function eye(b) {
  const i = b.parentNode.querySelector("input");
  i.type = i.type === "password" ? "text" : "password";
  b.classList.toggle("on");
}
$("#acpf").addEventListener("input", (e) =>
  e.target.parentNode.classList.toggle("ok", !!cpfOk(e.target.value)),
);
new MutationObserver(() => {
  if ($("#aerr").textContent && !$("#aerr").style.color) {
    const c = $("#acard");
    c.classList.remove("sw", "shk");
    void c.offsetWidth;
    c.classList.add("shk");
  }
}).observe($("#aerr"), {
  childList: true,
  characterData: true,
  subtree: true,
});
$("#acard").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.tagName === "INPUT") auth();
});
$("#rc").innerHTML = [...CATS, ...RCATS]
  .map((c) => `<option>${c}</option>`)
  .join("");
$("#rp").innerHTML = PAYS.map((c) => `<option>${c}</option>`).join("");
theme(localStorage.th || "dark");
addEventListener("online", () => {
  pills();
  sync();
});
addEventListener("offline", pills);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) sync();
});
if (U) start();
else showAuth();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

/* ===== Cifra: animações (Three.js + GSAP) e instalação do app ===== */
(function () {
  "use strict";
  const GS = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js",
    TH = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
    reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let libs,
    S3 = null,
    built = false;
  const load = (u) =>
      new Promise((ok) => {
        const s = document.createElement("script");
        s.src = u;
        s.onload = () => ok(1);
        s.onerror = () => ok(0);
        document.head.append(s);
      }),
    loadLibs = () =>
      libs ||
      (libs = Promise.all([
        window.gsap ? 1 : load(GS),
        window.THREE ? 1 : load(TH),
      ])),
    visible = () => $("#auth").style.display === "block";

  function build() {
    const hero = document.querySelector(".hero"),
      box = document.querySelector(".chz");
    let renderer, cv;
    try {
      cv = document.createElement("canvas");
      cv.className = "fx3d";
      renderer = new THREE.WebGLRenderer({
        canvas: cv,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      box.appendChild(cv);
    } catch (e) {
      return null;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene(),
      cam = new THREE.PerspectiveCamera(30, 1, 0.1, 100),
      group = new THREE.Group();
    cam.position.set(0, 0, 14);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(-3, 6, 8);
    scene.add(key);
    const rim = new THREE.PointLight(new THREE.Color(PAL[0]), 2.2, 40);
    rim.position.set(5, 1, 6);
    scene.add(rim);
    scene.add(group);

    /* três pilares finos e altos, mais claros à direita */
    const W = 0.62,
      GAP = 0.34,
      HS = [2.2, 3.6, 5.2],
      CL = [0x0f100b, 0x171a0f, 0x20260f],
      bars = [];
    HS.forEach((h, i) => {
      const r = 0.3,
        sh = new THREE.Shape();
      sh.moveTo(-W / 2, 0);
      sh.lineTo(W / 2, 0);
      sh.lineTo(W / 2, h - r);
      sh.quadraticCurveTo(W / 2, h, W / 2 - r, h);
      sh.lineTo(-W / 2 + r, h);
      sh.quadraticCurveTo(-W / 2, h, -W / 2, h - r);
      sh.lineTo(-W / 2, 0);
      const g = new THREE.ExtrudeGeometry(sh, {
        depth: 0.5,
        bevelEnabled: true,
        bevelThickness: 0.035,
        bevelSize: 0.035,
        bevelSegments: 4,
        curveSegments: 14,
      });
      g.translate(0, 0, -0.25);
      const m = new THREE.Mesh(
        g,
        new THREE.MeshStandardMaterial({
          color: CL[i],
          roughness: 0.32,
          metalness: 0.3,
        }),
      );
      m.position.x = (i - 1) * (W + GAP);
      m.userData = { k: 1, p: 0 };
      group.add(m);
      bars.push(m);
    });

    /* linha de tendência subindo + ponto luminoso */
    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-1.9, 1.2, 0.5),
        new THREE.Vector3(-0.96, 2.9, 0.5),
        new THREE.Vector3(0, 4.2, 0.5),
        new THREE.Vector3(0.96, 5.9, 0.5),
      ]),
      tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 90, 0.045, 8, false),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      ),
      orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      ),
      total = tube.geometry.index.count,
      L = { t: 1 };
    group.add(tube, orb);
    hero.classList.add("three");

    let raf = 0,
      tx = 0,
      ty = 0,
      cx = 0,
      cy = 0;
    function size() {
      const w = cv.clientWidth,
        h = cv.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      const vh = 2 * Math.tan((cam.fov * Math.PI) / 360) * cam.position.z,
        vw = vh * cam.aspect,
        s = Math.min(vw * 0.28, vh / 6.4);
      group.scale.setScalar(s);
      group.position.set(vw / 2 - vw * 0.05 - 1.4 * s, -vh / 2 - vh * 0.03, 0);
      if (reduce) start();
    }
    function frame(now) {
      raf = 0;
      if (!visible() || document.hidden) return;
      const t = now / 1000;
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      group.rotation.y = -0.35 + cx * 0.25;
      group.rotation.x = 0.06 + cy * 0.08;
      bars.forEach((m, i) => {
        const u = m.userData;
        m.scale.y = Math.max(
          0.0001,
          u.k * (1 + u.p + Math.sin(t * 1.3 + i * 1.1) * 0.01),
        );
      });
      tube.geometry.setDrawRange(
        0,
        L.t >= 1 ? total : Math.max(3, Math.floor((total * L.t) / 3) * 3),
      );
      orb.visible = L.t > 0.02;
      orb.position.copy(curve.getPoint(Math.min(1, L.t)));
      orb.scale.setScalar(1 + Math.sin(t * 3) * 0.18);
      renderer.render(scene, cam);
      if (!reduce) raf = requestAnimationFrame(frame);
    }
    function start() {
      if (!raf) raf = requestAnimationFrame(frame);
    }
    $("#auth").addEventListener(
      "pointermove",
      (e) => {
        tx = (e.clientX / innerWidth - 0.5) * 2;
        ty = (e.clientY / innerHeight - 0.5) * 2;
      },
      { passive: true },
    );
    size();
    new ResizeObserver(size).observe(cv);

    const ks = bars.map((b) => b.userData);
    if (window.gsap && !reduce) {
      ks.forEach((u) => (u.k = 0));
      L.t = 0;
      gsap.to(ks, {
        k: 1,
        duration: 1.2,
        ease: "elastic.out(1,.6)",
        stagger: 0.12,
        delay: 0.4,
      });
      gsap.to(L, {
        t: 1,
        duration: 1.5,
        ease: "power2.inOut",
        delay: 0.9,
      });
    }
    let exited = false;
    return {
      start,
      pulse() {
        if (!window.gsap || reduce) return;
        ks.forEach((u, i) =>
          gsap.fromTo(
            u,
            { p: 0 },
            {
              p: 0.1,
              duration: 0.18,
              yoyo: true,
              repeat: 1,
              ease: "power2.out",
              delay: i * 0.04,
              overwrite: "auto",
            },
          ),
        );
      },
      exit(fade) {
        return new Promise((res) => {
          if (!window.gsap || reduce) return res();
          exited = true;
          const sheet = document.querySelector(".sheet");
          sheet.style.animation = "none";
          const tl = gsap.timeline({ onComplete: res });
          tl.to(
            ks,
            { k: 1.5, duration: 0.5, ease: "power3.in", stagger: 0.05 },
            0,
          )
            .to(
              sheet,
              { y: 70, opacity: 0, duration: 0.45, ease: "power2.in" },
              0,
            )
            .to(
              [".hl", ".htop"],
              { y: -24, opacity: 0, duration: 0.4, ease: "power2.in" },
              0,
            );
          if (fade) tl.to("#auth", { opacity: 0, duration: 0.25 }, 0.4);
          setTimeout(res, 1100);
        });
      },
      reset() {
        if (!exited || !window.gsap) return;
        exited = false;
        gsap.set(["#auth", ".sheet", ".hl", ".htop"], {
          clearProps: "all",
        });
        document.querySelector(".sheet").style.animation = "";
        ks.forEach((u) => (u.k = 1));
      },
    };
  }

  function extras() {
    if (!window.gsap) return;
    document.documentElement.classList.add("gsap-on");
    if (reduce) return;
    gsap.to(".ring", {
      scale: 1.08,
      duration: 4,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
    const hx = gsap.quickTo(".hl", "x", {
        duration: 0.7,
        ease: "power3",
      }),
      hy = gsap.quickTo(".hl", "y", { duration: 0.7, ease: "power3" }),
      rx = gsap.quickTo(".ring", "x", { duration: 1, ease: "power3" }),
      ry = gsap.quickTo(".ring", "y", { duration: 1, ease: "power3" });
    $("#auth").addEventListener(
      "pointermove",
      (e) => {
        const a = e.clientX / innerWidth - 0.5,
          b = e.clientY / innerHeight - 0.5;
        hx(a * 12);
        hy(b * 8);
        rx(a * -30);
        ry(b * -20);
      },
      { passive: true },
    );
    const go = $("#abtn"),
      qx = gsap.quickTo(go, "x", { duration: 0.4, ease: "power3" }),
      qy = gsap.quickTo(go, "y", { duration: 0.4, ease: "power3" });
    go.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const r = go.getBoundingClientRect();
      qx((e.clientX - r.left - r.width / 2) * 0.12);
      qy((e.clientY - r.top - r.height / 2) * 0.25);
    });
    go.addEventListener("pointerleave", () => {
      qx(0);
      qy(0);
    });
    let okc = false,
      ls = "0";
    $("#acpf").addEventListener("input", () => {
      const v = !!cpfOk($("#acpf").value);
      if (v && !okc) fx.pulse();
      okc = v;
    });
    $("#apw").addEventListener("input", () =>
      setTimeout(() => {
        const s = $("#str").dataset.s;
        if (s !== ls) {
          ls = s;
          fx.pulse();
        }
      }, 0),
    );
  }

  const fx = (window.cifraFx = {
    start() {
      loadLibs().then(() => {
        if (!built) {
          built = true;
          if (window.THREE) S3 = build();
          extras();
        }
        if (S3) {
          S3.reset();
          S3.start();
        }
      });
    },
    pulse() {
      S3 && S3.pulse();
    },
    exit(f) {
      return S3 ? S3.exit(f) : Promise.resolve();
    },
    mode() {
      if (!window.gsap || reduce || !built) return;
      const els = [
        "#atitle",
        "#asub",
        ...[
          ...document.querySelectorAll(
            "#acard .f,#acard .str,#acard .lk,#abtn",
          ),
        ].filter((e) => e.offsetParent),
      ];
      gsap.fromTo(
        els,
        { y: 16, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.5,
          ease: "power3.out",
          stagger: 0.045,
          overwrite: true,
          clearProps: "opacity,transform",
        },
      );
      fx.pulse();
    },
  });
  const _am = authMode;
  authMode = function (m) {
    _am(m);
    fx.mode();
  };
  const _sa = showAuth;
  showAuth = function (t) {
    _sa(t);
    fx.start();
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && visible()) fx.start();
  });
  if (visible()) fx.start();

  /* ===== instalar o app ===== */
  let DIP = null;
  const standalone = () =>
      matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true,
    instUI = () => {
      const show = !standalone(),
        dis = +localStorage.instx > Date.now();
      $("#inst0").hidden = !show;
      $("#instc").hidden = !show;
      $("#instb").hidden = !show || dis;
    };
  window.instDismiss = () => {
    localStorage.instx = Date.now() + 7 * 864e5;
    instUI();
  };
  window.instalar = async () => {
    if (DIP) {
      DIP.prompt();
      await DIP.userChoice.catch(() => {});
      DIP = null;
      instUI();
      return;
    }
    const ua = navigator.userAgent,
      ios =
        /iphone|ipad|ipod/i.test(ua) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
      and = /android/i.test(ua);
    $("#inmt").innerHTML = ios
      ? '<p>No <b>Safari</b>:</p><ol class="stp"><li>Toque em <b>Compartilhar</b> (o quadrado com a seta para cima).</li><li>Role e toque em <b>Adicionar à Tela de Início</b>.</li><li>Toque em <b>Adicionar</b>.</li></ol>'
      : and
        ? '<ol class="stp"><li>Toque no menu <b>⋮</b> do navegador.</li><li>Escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li><li>Confirme.</li></ol>'
        : '<ol class="stp"><li>Procure o ícone de instalação na barra de endereço, ou abra o menu <b>⋮</b>.</li><li>Escolha <b>Instalar Cifra</b>.</li><li>Confirme.</li></ol>';
    $("#inm").style.display = "block";
  };
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    DIP = e;
    instUI();
  });
  addEventListener("appinstalled", () => {
    DIP = null;
    instUI();
    say("Cifra instalada. Procure o ícone na tela inicial.");
  });
  matchMedia("(display-mode: standalone)").addEventListener &&
    matchMedia("(display-mode: standalone)").addEventListener("change", instUI);
  instUI();
})();

/* ===== animações: indicador do dock, transições de aba e mês ===== */
(function () {
  const reduce = () => matchMedia("(prefers-reduced-motion:reduce)").matches,
    re = (e, c, ms) => {
      e.classList.remove(c);
      void e.offsetWidth;
      e.classList.add(c);
      ms && setTimeout(() => e.classList.remove(c), ms);
    };
  window.posDock = () => {
    const t = document.querySelector(".dock .tabs"),
      b = t && t.querySelector("button.on");
    if (b) {
      t.style.setProperty("--px", b.offsetLeft + "px");
      t.style.setProperty("--pw", b.offsetWidth + "px");
    }
  };
  const _tab = tab;
  tab = function (i) {
    _tab(i);
    const s = document.querySelectorAll(".sec")[i];
    if (s && !reduce()) {
      [...s.querySelectorAll(".item")]
        .slice(0, 14)
        .forEach((e, k) => e.style.setProperty("--i", k));
      re(s, "enter", 900);
    }
    if (i === 0 && ON && !reduce()) {
      ["#saldo", "#rec", "#gas", "#inv"].forEach((q) => ($(q)._v = 0));
      render();
    }
    posDock();
    navigator.vibrate && navigator.vibrate(6);
  };
  const _mv = mv;
  mv = function (n) {
    const m0 = M;
    _mv(n);
    if (M === m0 || reduce()) return;
    const s = document.querySelector(".sec.on");
    s.dataset.d = n > 0 ? "n" : "p";
    re(s, "mvx", 450);
    re($("#mes"), "flip", 450);
  };
  if (window.Chart && Chart.defaults)
    Chart.defaults.animation = { duration: 900, easing: "easeOutQuart" };
  addEventListener("resize", posDock);
  addEventListener("load", posDock);
  document.fonts && document.fonts.ready.then(posDock);
  posDock();
})();

/* ===== v22: redesign ===== */
let DIRTY = 0,
  XF = "",
  XQ = "";
const CATI = {
  Moradia: "🏠",
  Alimentação: "🍽️",
  Mercado: "🛒",
  Transporte: "🚗",
  Lazer: "🎉",
  Saúde: "💊",
  Educação: "📚",
  Assinaturas: "🔁",
  Compras: "🛍️",
  Outros: "📦",
  Salário: "💼",
  "Renda extra": "✨",
  Investimento: "📈",
  Transferência: "⇄",
  Fatura: "💳",
};
const monthTx = () => S.tx.filter((x) => mk(x.data) === M);
ch = function (id, type, labels, sets, opt = {}) {
  const cv = $("#" + id),
    w = cv.parentNode,
    emp = !sets.some((d) => d.data.some((v) => v !== 0));
  let e = w.querySelector(".em");
  if (!e) {
    e = document.createElement("div");
    e.className = "mut em";
    e.textContent = "Sem dados neste período.";
    w.append(e);
  }
  w.classList.toggle("emp", emp);
  e.style.display = emp ? "block" : "none";
  cv.style.display = emp ? "none" : "block";
  if (C[id]) {
    C[id].destroy();
    delete C[id];
  }
  if (emp) return;
  if (!w.offsetParent) {
    DIRTY = 1;
    return;
  }
  C[id] = new Chart(cv, {
    type,
    data: { labels, datasets: sets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: sets.length > 1 || type === "doughnut",
          position: "bottom",
          labels: { boxWidth: 10, color: css("--mut") },
        },
      },
      cutout: type === "doughnut" ? "68%" : undefined,
      scales:
        type === "doughnut"
          ? {}
          : {
              x: { grid: { display: false }, ticks: { color: css("--mut") } },
              y: {
                grid: { color: css("--ln") },
                ticks: { color: css("--mut") },
              },
            },
      ...opt,
    },
  });
};
const _tab2 = tab;
tab = function (i) {
  _tab2(i);
  if (
    i === 0 &&
    ON &&
    (DIRTY || matchMedia("(prefers-reduced-motion:reduce)").matches)
  ) {
    DIRTY = 0;
    render();
  }
};
/* extrato */
listHtml = function (tx) {
  const sm = (t) => sum(tx.filter((x) => x.tipo === t));
  $("#xr").textContent = brl(sm("receita"));
  $("#xg").textContent = brl(sm("gasto"));
  $("#xi").textContent = brl(sm("invest"));
  if (!tx.length)
    return '<div class="em mut">Nada neste mês. Escreva um gasto na barra de baixo, por texto, voz ou foto.</div>';
  let f = tx;
  if (XF) f = f.filter((x) => x.tipo === XF);
  if (XQ) {
    const q = XQ.toLowerCase();
    f = f.filter((x) =>
      ((x.desc || "") + " " + (x.cat || "")).toLowerCase().includes(q),
    );
  }
  if (!f.length)
    return '<div class="em mut">Nenhum lançamento encontrado.</div>';
  const t = today(),
    y = new Date(Date.now() - 864e5).toLocaleDateString("sv"),
    by = {};
  [...f]
    .sort((a, b) => b.data.localeCompare(a.data) || (b.ts || 0) - (a.ts || 0))
    .forEach((x) => (by[x.data] = by[x.data] || []).push(x));
  let n = 0;
  return Object.keys(by)
    .sort()
    .reverse()
    .map((d) => {
      const rows = by[d],
        tot = sum(rows.filter((x) => x.tipo === "gasto")),
        lb =
          d === t
            ? "Hoje"
            : d === y
              ? "Ontem"
              : new Date(d + "T12:00").toLocaleDateString("pt-BR", {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                });
      return (
        `<div class="dh"><span>${lb}</span>${tot ? `<span class="mut">−${brl(tot)}</span>` : ""}</div>` +
        rows
          .map((x) => {
            const col = PAL[Math.max(0, CATS.indexOf(x.cat)) % PAL.length],
              sg = x.tipo === "receita" ? "+" : x.tipo === "gasto" ? "−" : "↗ ";
            return `<div class="item row${FLASH.has(x.id) ? " fl" : ""}" style="--i:${Math.min(n++, 14)}"><div class="av" style="background:${col}26;color:${col}">${CATI[x.cat] || esc((x.cat || "?").charAt(0))}</div><div class="it"><b>${esc(x.desc || x.cat)}</b><div class="mut">${esc(x.cat)} · ${esc(x.pay)}</div></div><div class="amt ${x.tipo === "receita" ? "pos" : x.tipo === "gasto" ? "" : "mut"}">${sg}${brl(x.valor)}<span class="ac"><button class="g" aria-label="Editar" onclick="edOpen('${x.id}')">✎</button><button class="g" aria-label="Apagar" onclick="del('${x.id}')">✕</button></span></div></div>`;
          })
          .join("")
      );
    })
    .join("");
};
window.xf = (v, b) => {
  XF = v;
  document
    .querySelectorAll("#xc button")
    .forEach((e) => e.classList.toggle("on", e === b));
  $("#list").innerHTML = listHtml(monthTx());
};
window.xq = (v) => {
  XQ = v.trim();
  $("#list").innerHTML = listHtml(monthTx());
};
/* contas */
const _cr = contasRender;
contasRender = function () {
  _cr();
  if (!U) return;
  const cs = S.contas || [],
    ks = S.cartoes || [];
  if (cs.length)
    $("#cts").innerHTML = cs
      .map((c) => {
        const s = saldoConta(c);
        return `<div class="acct"><div class="av">${esc(c.nome.charAt(0).toUpperCase())}</div><div class="it"><b>${esc(c.nome)}</b><div class="mut">Saldo atual</div></div><div class="amt ${s < 0 ? "neg" : ""}">${brl(s)}<button class="g" aria-label="Excluir conta" onclick="delConta('${c.id}')">✕</button></div></div>`;
      })
      .join("");
  if (ks.length)
    $("#cards").innerHTML = ks
      .map((c) => {
        const ref = refOf(c, today()),
          tot = fatTotal(c, ref),
          dv = dividas(c).total,
          st = fatStatus(c, ref),
          lim = c.limite || 0,
          p = lim ? Math.min(100, (dv / lim) * 100) : 0;
        return `<div class="cc"><div class="row"><b style="font-size:16px">${esc(c.nome)}</b><span class="tag">${st}</span></div><div class="mut" style="margin-top:14px">Fatura atual</div><div style="font-family:var(--serif);font-size:34px;letter-spacing:-1px;line-height:1.1">${brl(tot)}</div><div class="bar"><i style="width:${p}%;background:${p >= 90 ? "#ff7a66" : "#d4f25a"}"></i></div><div class="row mut"><span>Usado ${brl(dv)}</span><span>Disponível ${brl(lim - dv)}</span></div><div class="mut" style="margin-top:6px">Fecha dia ${c.fecha} · vence dia ${c.vence}</div><div class="row" style="justify-content:flex-start;margin-top:12px"><button class="pay" onclick="pagFat('${c.id}')">Pagar fatura</button><button onclick="delCartao('${c.id}')">Excluir</button></div></div>`;
      })
      .join("");
  const ps = (S.parc || [])
    .map((p) => {
      let n = 0;
      for (let i = 0; i < p.n; i++) if (S.gen["p" + p.id + i]) n = i + 1;
      if (n >= p.n) return "";
      return `<div class="acct" style="display:block"><div class="row"><b>${esc(p.desc)}</b><span class="mut">${n}/${p.n}</span></div><div class="bar"><i style="width:${(n / p.n) * 100}%;background:var(--ac)"></i></div><div class="row"><span class="mut">${brl(p.vp)}/mês · restam ${brl(r2(p.total - p.vp * n))}</span><span class="amt"><button class="g" onclick="antecipar('${p.id}')">Antecipar</button><button class="g" onclick="cancelParc('${p.id}')">✕</button></span></div></div>`;
    })
    .join("");
  if (ps) $("#pars").innerHTML = ps;
};
/* alertas */
alrRender = function () {
  const L = alerts(),
    has = Object.values(S.lim).some((v) => v > 0);
  $("#alr").innerHTML =
    L.map(
      (a, i) =>
        `<div class="al ${a.n === 2 ? "hi" : ""}" style="--i:${i}"><span class="ai">${a.n === 2 ? "!" : "i"}</span><div style="flex:1;min-width:0"><div>${a.t}</div>${a.p > 0 ? `<div class="bar"><i style="width:${Math.min(100, a.p)}%;background:${a.p >= 100 ? "var(--red)" : "var(--warn)"}"></i></div>` : ""}</div></div>`,
    ).join("") ||
    `<div class="ok-st"><svg class="obck" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><b>${has ? "Tudo dentro do planejado" : "Sem alertas por enquanto"}</b><div class="mut" style="margin-top:4px">${has ? "Seus gastos estão sob controle neste mês." : "Defina limites por categoria em Ajustes para receber alertas."}</div></div>`;
  $("#bd").textContent = L.length || "";
};
/* IA: campo próprio */
dockMode = function () {
  const ai = CUR === 4;
  $(".chat").style.display = ai ? "none" : "flex";
  $("#aic").style.display = ai && SUB !== 1 ? "block" : "none";
};
window.aiGrow = () => {
  const e = $("#cin");
  e.style.height = "auto";
  e.style.height = Math.max(44, Math.min(e.scrollHeight, 120)) + "px";
};
window.aiSend = (t) => {
  const i = $("#cin");
  t = (typeof t === "string" ? t : i.value).trim();
  if (!t && !PEND) return;
  i.value = "";
  aiGrow();
  chatSend(t);
};
/* confirmações bonitas */
window.askModal = (t, m, ok, dng) =>
  new Promise((res) => {
    const e = $("#cfm"),
      y = $("#cfy"),
      n = $("#cfn");
    $("#cft").textContent = t;
    $("#cfx").textContent = m;
    y.textContent = ok || "Confirmar";
    y.style.background = dng ? "var(--red)" : "";
    y.style.color = dng ? "#fff" : "";
    e.style.display = "block";
    const f = (v) => {
      e.style.display = "none";
      y.onclick = n.onclick = e.onclick = null;
      res(v);
    };
    y.onclick = () => f(true);
    n.onclick = () => f(false);
    e.onclick = (ev) => {
      if (ev.target === e || ev.target.parentNode === e) f(false);
    };
  });
logout = async function () {
  if (
    !(await askModal(
      "Sair da Cifra?",
      "Você precisará entrar de novo com seu CPF e senha.",
      "Sair",
      true,
    ))
  )
    return;
  if (U && API && navigator.onLine) await sync().catch(() => {});
  if (
    ST.sheet !== "ok" &&
    !(await askModal(
      "Sincronização pendente",
      "A última sincronização falhou; o que não foi sincronizado será perdido. Sair mesmo?",
      "Sair mesmo",
      true,
    ))
  )
    return;
  const KEY = U ? SK() : "";
  if (U && API && navigator.onLine)
    await api({ action: "logout" }).catch(() => {});
  if (KEY) localStorage.removeItem(KEY);
  localStorage.removeItem("u");
  location.reload();
};
const _cf = window.confirm.bind(window);
let YES = false;
window.confirm = function (msg) {
  if (YES) {
    YES = false;
    return true;
  }
  let f, a;
  try {
    f = arguments.callee.caller;
    a = Array.from(f.arguments || []);
  } catch (e) {
    return _cf(msg);
  }
  if (typeof f !== "function") return _cf(msg);
  const dng = /excluir|cancelar|descart|apagar/i.test(msg);
  askModal(
    dng ? "Tem certeza?" : "Confirmar",
    msg,
    dng ? "Sim, continuar" : "Confirmar",
    dng,
  ).then((ok) => {
    if (ok) {
      YES = true;
      try {
        f.apply(null, a);
      } finally {
        YES = false;
      }
    }
  });
  return false;
};
dockMode();
if (ON) render();

/* ===== v23: transições ===== */
(function () {
  const red = () => matchMedia("(prefers-reduced-motion:reduce)").matches;
  const _t = tab;
  tab = function (i) {
    const p = CUR;
    _t(i);
    if (p === i || red()) return;
    const s = document.querySelectorAll(".sec")[i];
    if (!s) return;
    s.dataset.d = i > p ? "n" : "p";
    s.classList.remove("mvx");
    void s.offsetWidth;
    s.classList.add("mvx");
    clearTimeout(s._t);
    s._t = setTimeout(() => s.classList.remove("mvx"), 450);
  };
  const _s = sub;
  sub = function (n) {
    _s(n);
    if (red()) return;
    (n ? $("#sr") : $("#sc")).animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 260, easing: "ease-out" },
    );
  };
  const _st = start;
  start = function () {
    const a = $("#auth"),
      was = a.style.display === "block",
      o = +getComputedStyle(a).opacity;
    _st();
    if (red()) return;
    document
      .querySelectorAll("#t0>.card")
      .forEach((c, k) => c.style.setProperty("--k", Math.min(k, 6)));
    document.body.classList.add("appin");
    setTimeout(() => document.body.classList.remove("appin"), 1300);
    if (was) {
      a.style.display = "block";
      a.style.pointerEvents = "none";
      a.animate([{ opacity: o }, { opacity: 0 }], {
        duration: 380,
        easing: "ease",
      }).onfinish = () => {
        a.style.display = "none";
        a.style.pointerEvents = "";
      };
    }
  };
})();

(function () {
  const _c = chRender;
  chRender = function (sc) {
    _c(sc);
    const c = (S.cv || []).find((x) => x.id === CVID),
      e = $("#aicc");
    if (e) e.style.display = c && c.m.length ? "none" : "flex";
  };
  chRender();
})();

/* ===== v25: transição de páginas, e-mail verificado, alertas ===== */
(function () {
  const red = () => matchMedia("(prefers-reduced-motion:reduce)").matches;
  let TT = 0;
  tab = function (i) {
    const secs = [...document.querySelectorAll(".sec")];
    const go = () => {
      secs.forEach((e, j) => e.classList.toggle("on", i === j));
      CUR = i;
      ["#hi", "#pills", "#setup", "#instb"].forEach(
        (s) => ($(s).style.display = i === 0 ? "" : "none"),
      );
      say("");
      if (i === 4) chRender();
      dockMode();
      window.scrollTo(0, 0);
      if (i === 0 && ON && DIRTY) {
        DIRTY = 0;
        render();
      }
      posDock();
    };
    const p = CUR;
    document
      .querySelectorAll(".dock .tabs button")
      .forEach((e, j) => e.classList.toggle("on", i === j));
    posDock();
    navigator.vibrate && navigator.vibrate(6);
    if (p === i || red() || !ON) return go();
    const d = i > p ? 1 : -1,
      id = ++TT,
      ex = ["#hi", "#pills", "#setup", "#instb"].map((s) => $(s));
    const outs = [secs[p], ...(p === 0 ? ex : [])].filter(
      (e) => e && e.offsetParent !== null,
    );
    let n = 0;
    const AN = [];
    const enter = () => {
      if (id !== TT) {
        AN.forEach((x) => x.cancel());
        return;
      }
      go();
      AN.forEach((x) => x.cancel());
      const ins = [secs[i], ...(i === 0 ? ex : [])].filter(
        (e) => e && e.offsetParent !== null,
      );
      ins.forEach((e) =>
        e.animate(
          [
            { opacity: 0, transform: `translateX(${d * 18}px)` },
            { opacity: 1, transform: "none" },
          ],
          { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" },
        ),
      );
    };
    if (!outs.length) return enter();
    outs.forEach((e) => {
      const x = e.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: `translateX(${-d * 14}px)` },
        ],
        { duration: 110, easing: "ease-in", fill: "forwards" },
      );
      AN.push(x);
      x.onfinish = () => {
        if (++n === outs.length) enter();
      };
    });
  };
})();
/* e-mail */
window.emailUI = function () {
  const e = $("#emst");
  if (!e) return;
  e.innerHTML = !ST.email
    ? ""
    : ST.emailok
      ? '<span class="vok">✓ E-mail verificado</span>'
      : '<span class="vno">Não verificado</span> · <a href="#" onclick="vsend();return false">Enviar código</a> · <a href="#" onclick="tab(0);return false">Digitar código</a>';
};
window.goEmail = () => {
  tab(5);
  setTimeout(() => $("#em").focus(), 450);
};
window.vfy = async (b) => {
  const c = b.parentNode.querySelector("input").value.trim();
  if (!/^\d{6}$/.test(c)) return say("Digite os 6 dígitos do código.");
  b.disabled = true;
  try {
    await api({ action: "verificar", codigo: c });
    ST.emailok = true;
    setupCard();
    say("E-mail verificado ✓");
  } catch (e) {
    say("⚠ " + e.message);
  }
  b.disabled = false;
};
window.vsend = async () => {
  try {
    say("Enviando código…");
    await api({ action: "enviarverif" });
    say("Código enviado. Confira o e-mail e o spam.");
  } catch (e) {
    say("⚠ " + e.message);
  }
};
saveEmail = function (v) {
  v = (v || "").trim().toLowerCase();
  if (!EMR.test(v)) return say("E-mail inválido.");
  api({ action: "email", email: v })
    .then(() => {
      ST.email = v;
      ST.emailok = false;
      setupCard();
      hi();
      say("E-mail salvo. Enviamos um código para confirmar.");
    })
    .catch((e) => say("⚠ " + e.message));
};
setupCard = function () {
  const cfg =
    !S.contas.length && !S.rec.length && !S.cartoes.length
      ? '<div class="card sup"><div><b>Configure a Cifra</b><div class="mut">Responda algumas perguntas e eu monto contas, limites e metas.</div></div><button onclick="obShow()">Começar</button></div>'
      : "";
  const em =
    ST.email === ""
      ? '<div class="card sup"><div><b>Cadastre um e-mail</b><div class="mut">Sem ele não dá para recuperar a senha por e-mail.</div></div><button onclick="goEmail()">Cadastrar</button></div>'
      : "";
  const vf =
    ST.email && ST.emailok === false
      ? `<div class="card sup" style="display:block"><b>Confirme seu e-mail</b><div class="mut">Enviamos um código de 6 dígitos para ${esc(ST.email)}. Confira o spam.</div><div class="vrow"><input class="vcode" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code"><button onclick="vfy(this)">Confirmar</button></div><a class="mut" href="#" onclick="vsend();return false">Reenviar código</a></div>`
      : "";
  const html = vf + em + cfg;
  emailUI();
  if (setupCard.h === html) return;
  const a = document.activeElement;
  if (a && a.tagName === "INPUT" && $("#setup").contains(a)) return;
  setupCard.h = html;
  $("#setup").innerHTML = html;
};
/* alertas: ler, corrigir */
const _al = alerts,
  _in = insights;
const akey = (a) => {
  let m;
  if ((m = a.t.match(/^Limite estourado em ([^:]+):/))) return "est:" + m[1];
  if ((m = a.t.match(/^(.+) está em \d+% do limite/))) return "80:" + m[1];
  if ((m = a.t.match(/^No ritmo atual, (.+?) deve fechar/)))
    return "proj:" + m[1];
  if (/^Seus gastos/.test(a.t)) return "def";
  return a.t.slice(0, 40);
};
const ik = (a) => "i:" + a.t.replace(/[\d.,]+|R\$|%|\s+/g, "").slice(0, 48);
const rk = (k) => "al|" + M + "|" + k,
  rd = (k) => !!S.gen[rk(k)];
const allAl = () => _al().map((a) => ({ ...a, k: akey(a) }));
const allIn = () => _in().L.map((a) => ({ ...a, k: ik(a) }));
alerts = function () {
  return allAl().filter((a) => !rd(a.k));
};
insights = function () {
  const r = _in();
  return { L: r.L.filter((a) => !rd(ik(a))), S2: r.S2 };
};
const B = (act, v, t) =>
  `<button class="g" data-act="${act}" data-v="${esc(v)}">${t}</button>`;
const fixes = (a) => {
  let m;
  const k = a.k;
  if ((m = k.match(/^(?:est|80|proj):(.+)$/)))
    return B("lim", m[1], "Ajustar limite") + B("ext", m[1], "Ver gastos");
  if (k === "def") return B("ext", "", "Ver extrato");
  if (a.dup) return "";
  if ((m = a.t.match(/^(?:⚠|💡) ([^:]+):/)))
    return B("ext", m[1], "Ver gastos");
  if ((m = a.t.match(/^(?:📈|🔁) (.+?) (?:aumentou|deve)/)))
    return B("ext", m[1], "Ver lançamentos");
  return "";
};
alrRender = function () {
  const A = alerts(),
    I = insights().L,
    has = Object.values(S.lim).some((v) => v > 0),
    RA = allAl().filter((a) => rd(a.k)),
    RI = allIn().filter((a) => rd(a.k)),
    R = [...RA, ...RI];
  let h = "";
  if (A.length + I.length)
    h += `<div class="ahd"><button class="g" data-act="readall">Marcar tudo como lido</button></div>`;
  h += A.map(
    (a, i) =>
      `<div class="al ${a.n === 2 ? "hi" : ""}" style="--i:${i}"><span class="ai">${a.n === 2 ? "!" : "i"}</span><div style="flex:1;min-width:0"><div>${a.t}</div>${a.p > 0 ? `<div class="bar"><i style="width:${Math.min(100, a.p)}%;background:${a.p >= 100 ? "var(--red)" : "var(--warn)"}"></i></div>` : ""}<div class="ax">${fixes(a)}${B("read", a.k, "Marcar como lido")}</div></div></div>`,
  ).join("");
  if (!A.length)
    h += `<div class="ok-st"><svg class="obck" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><b>${R.length ? "Nenhum alerta novo" : has ? "Tudo dentro do planejado" : "Sem alertas por enquanto"}</b><div class="mut" style="margin-top:4px">${has ? "Seus gastos estão sob controle neste mês." : "Defina limites por categoria em Ajustes para receber alertas."}</div></div>`;
  if (R.length)
    h += `<details class="fold"><summary>Já lidos (${R.length})</summary>${R.map((a) => `<div class="rdl"><div>${esc(a.t.replace(/<[^>]+>/g, ""))}</div>${B("unread", a.k, "Reabrir")}</div>`).join("")}</details>`;
  $("#alr").innerHTML = h;
  $("#bd").textContent = A.length + I.filter((a) => a.n >= 1).length || "";
};
insRender = function () {
  const { L, S2 } = insights();
  $("#ins").innerHTML =
    L.map((a) => {
      a.k = ik(a);
      return `<div class="item"><div>${esc(a.t)}</div><div class="ax">${a.dup ? `<button class="g" onclick='manter(${JSON.stringify(a.dup)})'>Manter as duas</button><button class="g" onclick='remover(${JSON.stringify(a.dup)})'>Remover a duplicada</button>` : ""}${fixes(a)}${B("read", a.k, "Marcar como lido")}</div></div>`;
    }).join("") ||
    '<span class="mut">Nenhuma descoberta nova. Conforme você lança, vou comparar com seu histórico.</span>';
  $("#subs").innerHTML =
    S2.map(
      (a) =>
        `<div class="item row"><div><b>${esc(a.nome)}</b><div class="mut">Mensal · próxima em ${a.prox.split("-").reverse().slice(0, 2).join("/")}</div></div><b>${brl(a.valor)}</b></div>`,
    ).join("") ||
    '<span class="mut">Nenhuma recorrência detectada ainda (preciso de 3 meses de histórico).</span>';
  $("#bd").textContent =
    alerts().length + L.filter((a) => a.n >= 1).length || "";
};
$("#ta").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const a = b.dataset.act,
    v = b.dataset.v || "";
  if (a === "read" || a === "unread") {
    const c = b.closest(".al,.item,.rdl");
    c && c.classList.add("out");
    setTimeout(
      () => {
        S.gen[rk(v)] = a === "read" ? 1 : 0;
        S.ts = Date.now();
        persist();
      },
      c ? 190 : 0,
    );
  } else if (a === "readall") {
    [...allAl(), ...allIn()].forEach((x) => {
      S.gen[rk(x.k)] = 1;
    });
    persist();
  } else if (a === "lim") {
    tab(5);
    setTimeout(() => {
      const l = [...document.querySelectorAll("#limf .lrow")].find(
        (x) => x.querySelector("span").textContent === v,
      );
      if (l) {
        l.classList.add("fl");
        l.scrollIntoView({ block: "center", behavior: "smooth" });
        setTimeout(
          () => l.querySelector("input").focus({ preventScroll: true }),
          400,
        );
      }
    }, 450);
  } else if (a === "ext") {
    tab(1);
    xf("", $("#xc button"));
    $("#xq").value = v;
    xq(v);
  }
});
tab(CUR);
if (ON) render();

/* ===== v27: personalização (cor de destaque e tema) ===== */
(function () {
  const COR = [
      ["lima", "Lima", "#cdf24b"],
      ["violeta", "Violeta", "#b9a2ff"],
      ["coral", "Coral", "#ff9b73"],
      ["rosa", "Rosa", "#ff8fbf"],
      ["turquesa", "Turquesa", "#4fd9c4"],
    ],
    R = document.documentElement,
    hex = (k) => (COR.find((c) => c[0] === k) || COR[0])[2],
    ok = (k) => COR.some((c) => c[0] === k);
  let tm = 0;
  window.corAtual = () => (ok(R.dataset.c) ? R.dataset.c : "lima");
  function ui() {
    const k = corAtual();
    document.querySelectorAll("#sws .swi").forEach((e) => {
      const on = e.dataset.k === k;
      e.classList.toggle("on", on);
      e.querySelector("button").setAttribute("aria-checked", on);
    });
  }
  function apply(k) {
    if (!ok(k)) k = "lima";
    R.dataset.c = k;
    try {
      localStorage.cor = k;
    } catch (e) {}
    PAL[0] = hex(k);
    ui();
    clearTimeout(tm);
    tm = setTimeout(() => {
      PAL[0] = hex(corAtual());
      if (ON) render();
    }, 500);
  }
  window.setCor = (k) => {
    if (k === corAtual()) return;
    apply(k);
    navigator.vibrate && navigator.vibrate(8);
    S.cor = k;
    S.corTs = Date.now();
    store();
    clearTimeout(T);
    T = setTimeout(sync, 800);
  };
  $("#sws").innerHTML = COR.map(
    (c) =>
      `<div class="swi" data-k="${c[0]}"><button type="button" style="--sc:${c[2]}" role="radio" aria-checked="false" aria-label="${c[1]}" onclick="setCor('${c[0]}')"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button><span>${c[1]}</span></div>`,
  ).join("");
  /* sincroniza a cor entre aparelhos (vale a escolha mais recente) */
  const _mg = merge;
  merge = function (Rm) {
    const lc = S.cor,
      lt = S.corTs || 0;
    _mg(Rm);
    if ((Rm.corTs || 0) > lt) {
      S.cor = Rm.cor;
      S.corTs = Rm.corTs;
    } else {
      S.cor = lc;
      S.corTs = lt;
    }
    if (S.cor && ok(S.cor) && S.cor !== corAtual()) apply(S.cor);
  };
  const _st = start;
  start = function () {
    _st();
    apply(S.cor && ok(S.cor) ? S.cor : "lima");
  };
  /* tema: claro, escuro ou automático */
  const sys = matchMedia("(prefers-color-scheme:dark)"),
    _th = theme;
  function thmUI() {
    const p = localStorage.thp || R.dataset.t;
    document
      .querySelectorAll("#thm button")
      .forEach((b) => b.classList.toggle("on", b.dataset.t === p));
  }
  theme = function (t) {
    if (typeof t !== "string") t = R.dataset.t === "dark" ? "light" : "dark";
    _th(t === "auto" ? (sys.matches ? "dark" : "light") : t);
    localStorage.thp = t;
    thmUI();
  };
  sys.addEventListener &&
    sys.addEventListener("change", () => {
      if (localStorage.thp === "auto") theme("auto");
    });
  $("#thm").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    b && theme(b.dataset.t);
  });
  apply(localStorage.cor);
  theme(localStorage.thp || localStorage.th || "dark");
})();
