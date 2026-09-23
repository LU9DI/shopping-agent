import acquisitionAutomationRoutes from "./src/routes/acquisitionAutomationRoutes.js";
import express from "express";
import acquisitionRoutes from "./src/routes/acquisitionRoutes.js";
import cors from "cors";
import authRoutes from "./src/routes/authRoutes.js";
import platformRoutes from "./src/routes/platformRoutes.js";
import shoppingRoutes from "./src/routes/shoppingRoutes.js";
import watchlistRoutes from "./src/routes/watchlistRoutes.js";
import priceCheckRoutes from "./src/routes/priceCheckRoutes.js";
import { initDb } from "./src/core/db.js";
import { metricsMiddleware, metricsSnapshot } from "./src/core/metrics.js";
import { requestId } from "./src/middleware/requestId.js";
import { rateLimit } from "./src/middleware/rateLimit.js";
import { errorHandler } from "./src/middleware/errorHandler.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const origins = process.env.CORS_ORIGIN?.split(",").map((v) => v.trim()).filter(Boolean);
const PUBLIC_PAGES: Array<[string,string,string]> = [
  ["/produto","Shopping Agent — compras inteligentes","Encontre oportunidades, acompanhe preços e planeje compras com inteligência."],
  ["/recursos","Recursos do Shopping Agent","Watchlists, histórico de preços, alertas e comparação para decisões de compra."],
  ["/guias","Guias de compras inteligentes","Conteúdo prático para pesquisar, comparar e acompanhar produtos."],
  ["/comparacoes","Comparações de produtos","Compare produtos e acompanhe mudanças de preço em um só lugar."],
  ["/faq","FAQ — Shopping Agent","Perguntas frequentes sobre compras inteligentes, preços e oportunidades."],
];
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch] || ch));
const publicBase = (req: express.Request) => (process.env.PUBLIC_SITE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");

const renderSite = (req: express.Request, path: string, title: string, description: string) => {
  const base = publicBase(req);
  const canonical = base + (path === "/" ? "" : path);
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle} | Shopping Agent</title>
<meta name="description" content="${safeDescription}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:title" content="${safeTitle}"><meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:type" content="website">
<style>
:root{--ink:#172033;--muted:#687386;--paper:#fff;--soft:#f6f8fb;--line:#e8ebf2;--violet:#6c4cff;--pink:#ff4f9a;--orange:#ff9f43;--shadow:0 20px 60px rgba(35,28,85,.10)}
*{box-sizing:border-box}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--paper);line-height:1.6}
a{color:inherit;text-decoration:none}.nav{height:72px;display:flex;align-items:center;justify-content:space-between;max-width:1180px;margin:auto;padding:0 24px}.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:19px}.mark{width:34px;height:34px;border-radius:11px;background:linear-gradient(135deg,var(--violet),var(--pink),var(--orange));box-shadow:0 8px 24px rgba(108,76,255,.25)}
.links{display:flex;gap:24px;color:#566174;font-size:14px}.cta{background:var(--ink);color:#fff;padding:11px 17px;border-radius:12px;font-weight:700}.hero{background:radial-gradient(circle at 15% 10%,#efeaff 0,transparent 32%),radial-gradient(circle at 88% 18%,#ffe4f0 0,transparent 30%),linear-gradient(180deg,#fff 0,#fbfaff 100%);padding:80px 24px 92px}.wrap{max-width:1180px;margin:auto}.heroGrid{display:grid;grid-template-columns:1.15fr .85fr;gap:54px;align-items:center}.eyebrow{display:inline-flex;padding:7px 11px;border-radius:999px;background:#f0edff;color:#6044dc;font-size:12px;font-weight:800}.hero h1{font-size:clamp(42px,6vw,72px);line-height:1.02;letter-spacing:-3px;margin:18px 0}.gradient{background:linear-gradient(90deg,var(--violet),var(--pink),#ff8b38);-webkit-background-clip:text;background-clip:text;color:transparent}.hero p{font-size:19px;color:var(--muted);max-width:650px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.primary{background:linear-gradient(135deg,var(--violet),var(--pink));color:#fff;padding:14px 20px;border-radius:14px;font-weight:800;box-shadow:0 12px 30px rgba(108,76,255,.22)}.secondary{border:1px solid var(--line);padding:14px 20px;border-radius:14px;font-weight:750;background:#fff}.mock{background:#fff;border:1px solid var(--line);border-radius:26px;padding:20px;box-shadow:var(--shadow);transform:rotate(1deg)}.mockTop{display:flex;justify-content:space-between;color:var(--muted);font-size:12px}.deal{margin-top:18px;padding:18px;border-radius:18px;background:linear-gradient(135deg,#f7f4ff,#fff3f8);border:1px solid #eee9ff}.price{font-size:34px;font-weight:850}.badge{display:inline-block;padding:5px 8px;border-radius:8px;background:#e9fff3;color:#16844c;font-size:11px;font-weight:800}.section{padding:80px 24px}.section.soft{background:var(--soft)}.section h2{font-size:38px;letter-spacing:-1.5px;margin:0 0 12px}.lead{color:var(--muted);max-width:680px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:34px}.card{padding:25px;background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:0 8px 30px rgba(30,35,60,.04)}.icon{font-size:25px}.card h3{margin:10px 0 5px}.card p{margin:0;color:var(--muted);font-size:14px}.footer{border-top:1px solid var(--line);padding:34px 24px;background:#fff}.footerGrid{max-width:1180px;margin:auto;display:flex;justify-content:space-between;gap:30px}.footer small,.footer a{color:var(--muted);font-size:13px}.footerLinks{display:flex;gap:18px;flex-wrap:wrap}@media(max-width:800px){.links{display:none}.hero{padding-top:52px}.heroGrid{grid-template-columns:1fr}.hero h1{letter-spacing:-2px}.cards{grid-template-columns:1fr}.footerGrid{flex-direction:column}.mock{transform:none}}
</style></head>
<body>
<header class="nav"><a class="brand" href="/"><span class="mark"></span>Shopping Agent</a><nav class="links"><a href="/produto">Produto</a><a href="/recursos">Recursos</a><a href="/guias">Guias</a><a href="/faq">FAQ</a></nav><a class="cta" href="/produto">Começar</a></header>
<main>
<section class="hero"><div class="wrap heroGrid"><div>
<span class="eyebrow">COMPRAR MELHOR, SEM COMPLICAÇÃO</span>
<h1>Caça promoções com <span class="gradient">inteligência.</span></h1>
<p>${safeDescription} Descubra oportunidades, acompanhe produtos e tenha mais clareza antes de comprar.</p>
<div class="actions"><a class="primary" href="/produto">Conhecer o produto</a><a class="secondary" href="/recursos">Ver recursos</a></div>
</div><div class="mock"><div class="mockTop"><span>Oportunidade encontrada</span><span>Agora</span></div><div class="deal"><span class="badge">↓ preço acompanhado</span><h3>Produto em observação</h3><div class="price">R$ 749,90</div><p style="color:#687386">Histórico, comparação e acompanhamento em um só lugar.</p></div></div></div></section>
<section class="section"><div class="wrap"><h2>Menos procura. Mais oportunidade.</h2><p class="lead">Uma experiência simples para transformar pesquisa de preço em uma decisão de compra mais informada.</p><div class="cards">
<div class="card"><div class="icon">⚡</div><h3>Watchlists</h3><p>Acompanhe produtos que realmente interessam a você.</p></div>
<div class="card"><div class="icon">📉</div><h3>Histórico de preços</h3><p>Entenda a evolução do preço antes de decidir.</p></div>
<div class="card"><div class="icon">✨</div><h3>Oportunidades</h3><p>Organize sinais de compra e compare alternativas.</p></div>
</div></div></section>
<section class="section soft"><div class="wrap"><h2>${safeTitle}</h2><p class="lead">${safeDescription}</p></div></section>
</main>
<footer class="footer"><div class="footerGrid"><div><strong>Shopping Agent</strong><br><small>Compras mais inteligentes, de forma simples.</small></div><div class="footerLinks"><a href="/produto">Produto</a><a href="/recursos">Recursos</a><a href="/guias">Guias</a><a href="/faq">FAQ</a><a href="/politica-de-privacidade">Política de Privacidade</a></div></div></footer>
</body></html>`;
};
const renderPrivacy = (req: express.Request) => {
  const base = publicBase(req);
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Política de Privacidade | Shopping Agent</title><meta name="description" content="Política de Privacidade do Shopping Agent."></head><body style="margin:0;font-family:system-ui,sans-serif;color:#172033"><main style="max-width:860px;margin:60px auto;padding:0 24px"><a href="/">← Shopping Agent</a><h1>Política de Privacidade</h1><p>Esta página descreve como informações são tratadas quando você utiliza o Shopping Agent.</p><h2>Dados tratados</h2><p>Podemos tratar dados de conta, preferências, produtos acompanhados e informações necessárias para fornecer os recursos do serviço.</p><h2>Uso das informações</h2><p>As informações são utilizadas para autenticação, funcionamento do produto, personalização das funcionalidades, segurança e melhoria do serviço.</p><h2>Compartilhamento</h2><p>Dados não são vendidos. Serviços terceiros podem processar informações quando necessários para operar funcionalidades contratadas, observando suas respectivas políticas e obrigações aplicáveis.</p><h2>Segurança e direitos</h2><p>Adotamos medidas técnicas e organizacionais para proteger os dados. Solicitações relacionadas aos seus dados poderão ser feitas pelos canais oficiais disponibilizados pelo serviço.</p><h2>Atualizações</h2><p>Esta política poderá ser atualizada para refletir mudanças no produto ou nas obrigações aplicáveis.</p><p><a href="/">Voltar ao Shopping Agent</a></p></main></body></html>`;
};

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(requestId);
app.use(rateLimit);
app.use(cors(origins?.length ? { origin: origins, credentials: true } : { origin: false }));
app.use(express.json({ limit: "1mb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (process.env.NODE_ENV === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
app.use(metricsMiddleware);

app.use("/api/shopping", shoppingRoutes);
app.use("/api/watchlists", watchlistRoutes);
app.use("/api/price-checks", priceCheckRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/platform", platformRoutes);


app.get("/robots.txt", (req, res) => {
  const base = publicBase(req);
  res.type("text/plain").send(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /login
Disallow: /app
Disallow: /dashboard
Disallow: /admin
Sitemap: ${base}/sitemap.xml
`);
});
app.get("/sitemap.xml", (req, res) => {
  const base = publicBase(req);
  const urls = ["/", ...PUBLIC_PAGES.map(([path]) => path), "/politica-de-privacidade"];
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((path) => `<url><loc>${escapeHtml(base + (path === "/" ? "" : path))}</loc></url>`).join("")}</urlset>`);
});

const renderPrivateApp = (req: express.Request, path: string) => {
  const brand="Shopping Agent", subtitle="Seu centro pessoal para acompanhar preços e oportunidades.", a="#6c4cff", b="#ff4f9a", api="/api/watchlists", dataLabel="watchlists", createLabel="Nova lista", action="watchlist";
  const mode = path === "/login" || path === "/cadastro" ? "auth" : "app";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${mode==="auth"?"Acesso":"Painel"} | ${brand}</title><meta name="robots" content="noindex,nofollow,noarchive">
<style>:root{--a:${a};--b:${b};--ink:#152033;--muted:#667085;--line:#e6eaf0;--soft:#f7f9fc}*{box-sizing:border-box}body{margin:0;background:var(--soft);color:var(--ink);font-family:Inter,system-ui,sans-serif}a{text-decoration:none;color:inherit}.top{height:68px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 24px}.brand{display:flex;gap:10px;align-items:center;font-weight:850}.mark{width:30px;height:30px;border-radius:10px;background:linear-gradient(135deg,var(--a),var(--b))}.topnav{display:flex;gap:18px;color:var(--muted);font-size:14px}.shell{max-width:1180px;margin:auto;padding:32px 22px}.auth{min-height:calc(100vh - 68px);display:grid;place-items:center}.box{width:min(430px,100%);background:#fff;border:1px solid var(--line);border-radius:24px;padding:30px;box-shadow:0 20px 55px #15203312}.box h1{font-size:30px;margin:0 0 8px}.muted{color:var(--muted)}label{display:block;font-size:13px;font-weight:700;margin:16px 0 7px}input,select,button,textarea{font:inherit}input,select,textarea{width:100%;padding:12px 13px;border:1px solid var(--line);border-radius:12px;background:#fff}button,.btn{border:0;border-radius:12px;padding:12px 16px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,var(--a),var(--b));color:#fff}.ghost{background:#fff!important;color:var(--ink)!important;border:1px solid var(--line)!important}.full{width:100%;margin-top:18px}.error{margin-top:14px;color:#b42318;font-size:13px}.hero{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:24px}.hero h1{margin:0;font-size:36px;letter-spacing:-1.5px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:20px}.card strong{font-size:25px}.list{margin-top:18px;display:grid;gap:12px}.row{background:#fff;border:1px solid var(--line);border-radius:16px;padding:17px;display:flex;justify-content:space-between;gap:16px}.pill{display:inline-block;border-radius:999px;padding:5px 9px;background:#f0f3f8;font-size:12px}.modal{display:none;position:fixed;inset:0;background:#15203366;align-items:center;justify-content:center;padding:20px}.modal.on{display:flex}.modal .box{max-width:500px}@media(max-width:800px){.cards{grid-template-columns:1fr}.topnav{display:none}.hero{align-items:start;flex-direction:column}}.platformBar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 18px}.search{flex:1;min-width:220px}.search input{height:44px}.iconBtn{position:relative;min-width:44px;height:44px;padding:0}.notifDot{position:absolute;top:8px;right:8px;width:8px;height:8px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 3px #fff}.drawer{position:fixed;inset:0;background:#0f172a66;display:none;justify-content:flex-end;z-index:50}.drawer.on{display:flex}.drawerPanel{width:min(480px,100%);height:100%;background:#fff;padding:28px;overflow:auto;box-shadow:-20px 0 60px #0f172a22}.drawerHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.drawerPanel h2{margin:0}.settingGrid{display:grid;gap:14px}.settingGrid label{margin:0}.activityItem,.notificationItem{padding:14px;border:1px solid var(--line);border-radius:14px;margin-top:10px}.notificationItem.unread{background:#f8fbff;border-color:#bfdbfe}.small{font-size:12px}.statusLine{display:flex;justify-content:space-between;gap:10px;align-items:center}.success{color:#067647}.danger{color:#b42318}.sectionTitle{font-size:12px;letter-spacing:.08em;font-weight:850;color:var(--muted);margin-top:24px}</style></head><body><header class="top"><a class="brand" href="/"><span class="mark"></span>${brand}</a><nav class="topnav"><a href="/dashboard">Painel</a><a href="#list">Listas</a><a href="/politica-de-privacidade">Privacidade</a><button class="ghost iconBtn" id="openAccount" type="button" aria-label="Abrir configurações">⚙</button><button id="logout" class="ghost">Sair</button></nav></header>
${mode==="auth"?`<main class="auth"><section class="box"><div class="muted" style="font-size:12px;font-weight:800">ÁREA DO PRODUTO</div><h1>${path==="/cadastro"?"Criar sua conta":"Entrar"}</h1><p class="muted">${subtitle}</p><form id="authForm"><label>E-mail</label><input id="email" type="email" autocomplete="email" required><label>Senha</label><input id="password" type="password" minlength="8" required>${path==="/cadastro"?'<label>Confirmar senha</label><input id="password2" type="password" minlength="8" required>':""}<button class="full" type="submit">${path==="/cadastro"?"Criar conta":"Entrar"}</button><div id="msg" class="error"></div></form><p style="margin-top:20px;font-size:14px" class="muted">${path==="/cadastro"?"Já tenho conta":"Ainda não tenho conta"} · <a style="color:var(--a);font-weight:800" href="${path==="/cadastro"?"/login":"/cadastro"}">${path==="/cadastro"?"Entrar":"Criar cadastro"}</a></p></section></main>`:`<main class="shell"><section class="hero"><div><div class="muted" style="font-size:12px;font-weight:850;letter-spacing:.08em">PAINEL</div><h1>${brand}</h1><p class="muted">${subtitle}</p></div><button id="newBtn">${createLabel}</button></section><section class="cards"><div class="card"><span class="muted">Itens</span><br><strong id="count">—</strong></div><div class="card"><span class="muted">Conta</span><br><strong>Ativa</strong></div><div class="card"><span class="muted">Estado</span><br><strong>Operacional</strong></div></section><section class="card" style="margin-top:18px"><strong>Primeiros passos</strong><div class="muted" style="margin-top:8px;font-size:14px">① Crie uma lista · ② Defina um preço-alvo · ③ Ative o acompanhamento</div></section><div class="platformBar"><div class="search"><input id="globalSearch" placeholder="Buscar neste painel…" aria-label="Buscar"></div><button class="ghost" type="button" onclick="location.hash='list'">Visão geral</button></div><section class="list" id="list"><div class="card muted">Carregando ${dataLabel}…</div></section></main><div class="drawer" id="accountDrawer"><aside class="drawerPanel"><div class="drawerHead"><div><div class="muted small">CONTA E SEGURANÇA</div><h2>Configurações</h2></div><button class="ghost" type="button" id="closeAccount">Fechar</button></div><div id="accountState" class="muted">Carregando…</div><form id="accountForm" class="settingGrid" style="margin-top:18px"><label>Nome de exibição<input id="displayName" maxlength="120"></label><label>E-mail<input id="accountEmail" type="email" required></label><label>Fuso horário<input id="timezone" value="America/Sao_Paulo"></label><label>Idioma<input id="locale" value="pt-BR"></label><button>Salvar preferências</button></form><div class="sectionTitle">PLANO</div><div class="card"><div class="statusLine"><strong id="planName">Free</strong><span class="pill" id="planStatus">Ativo</span></div><div class="muted small" style="margin-top:7px">Estrutura preparada para planos, limites e cobrança sem misturar dados de produtos.</div></div><div class="sectionTitle">ALTERAR SENHA</div><form id="passwordForm" class="settingGrid"><label>Senha atual<input id="currentPassword" type="password" autocomplete="current-password"></label><label>Nova senha<input id="newPassword" type="password" minlength="10" autocomplete="new-password"></label><button>Atualizar senha</button></form><div class="sectionTitle">NOTIFICAÇÕES</div><div id="notifications"><div class="muted">Carregando…</div></div><button type="button" class="ghost full" id="readAll">Marcar tudo como lido</button><div class="sectionTitle">ATIVIDADE RECENTE</div><div id="activity"><div class="muted">Carregando…</div></div></aside></div><div class="modal" id="modal"><form class="box" id="createForm"><h2>${createLabel}</h2><p class="muted">Cadastre um novo item diretamente no produto.</p><div id="fields"></div><button class="full">Salvar</button><button type="button" class="full ghost" id="close">Cancelar</button><div id="createMsg" class="error"></div></form></div>`}
<script>
const token=localStorage.getItem("token"), path=${JSON.stringify(path)}, api="/api/watchlists", action="watchlist", dataLabel="watchlists";
const authForm=document.getElementById("authForm");
if(authForm){authForm.addEventListener("submit",async e=>{e.preventDefault();const msg=document.getElementById("msg");if(path==="/cadastro"&&document.getElementById("password").value!==document.getElementById("password2").value){msg.textContent="As senhas não conferem.";return;}const endpoint=path==="/cadastro"?"/api/auth/register":"/api/auth/login";try{const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:document.getElementById("email").value,password:document.getElementById("password").value})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Não foi possível concluir.");localStorage.setItem("token",d.token);location.href="/dashboard";}catch(err){msg.textContent=err.message;}});}
else{if(!token){location.href="/login";}const logout=document.getElementById("logout");if(logout)logout.onclick=()=>{localStorage.removeItem("token");location.href="/login";};const esc=s=>String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));async function load(){try{let r=await fetch(api,{headers:{Authorization:"Bearer "+token}});if(r.status===401){localStorage.removeItem("token");location.href="/login";return;}let d=await r.json(),items=d[dataLabel]||[];document.getElementById("count").textContent=items.length;document.getElementById("list").innerHTML=items.length?items.map(x=>'<div class="row"><div><strong>'+esc(x.name||"Lista")+'</strong><div class="muted">'+esc(x.query||"")+(x.target_price!=null?" · alvo R$ "+Number(x.target_price).toLocaleString("pt-BR",{minimumFractionDigits:2}):"")+'</div></div><div style="display:flex;gap:8px;align-items:center"><span class="pill">'+(x.active?"Ativa":"Pausada")+'</span><button class="ghost" type="button" onclick="toggleWatch(\''+esc(x.id)+'\','+(x.active?"false":"true")+')">'+(x.active?"Pausar":"Ativar")+'</button></div></div>').join(""):'<div class="card muted">Nenhuma lista cadastrada ainda.</div>';if(action==="company"&&items[0]){const t=await fetch("/api/dashboard/"+encodeURIComponent(items[0].id),{headers:{Authorization:"Bearer "+token}});if(t.ok){const td=await t.json();document.getElementById("list").insertAdjacentHTML("afterbegin",'<div class="cards"><div class="card"><span class="muted">Faturamento no ano</span><br><strong>R$ '+Number(td.revenueYearToDate||0).toLocaleString("pt-BR",{minimumFractionDigits:2})+'</strong></div><div class="card"><span class="muted">Impostos pagos</span><br><strong>R$ '+Number(td.taxesPaidYearToDate||0).toLocaleString("pt-BR",{minimumFractionDigits:2})+'</strong></div><div class="card"><span class="muted">Obrigações</span><br><strong>'+Number((td.obligations||[]).length)+'</strong></div></div>');}}}catch{document.getElementById("list").innerHTML='<div class="card">Não foi possível carregar os dados agora.</div>';}}const modal=document.getElementById("modal"),form=document.getElementById("createForm"),fields=document.getElementById("fields");document.getElementById("newBtn").onclick=()=>{modal.classList.add("on");fields.innerHTML=action==="watchlist"?'<label>Nome</label><input name="name" required><label>O que acompanhar</label><input name="query" required><label>Preço-alvo</label><input name="targetPrice" type="number" min="0" step="0.01"><label>Orçamento máximo</label><input name="budget" type="number" min="0" step="0.01"><label>Moeda</label><select name="currency"><option>BRL</option><option>USD</option><option>EUR</option></select>':action==="workflow"?'<label>Nome</label><input name="name" required><p class="muted" style="font-size:13px">Você poderá adicionar os conectores e etapas no editor do produto.</p>':action==="agent"?'<label>Nome</label><input name="name" required><label>Descrição</label><textarea name="description" required></textarea><label>Versão</label><input name="version" value="1.0.0" required>':'<label>Razão social</label><input name="legalName" required><label>CNPJ</label><input name="cnpj"><label>Regime</label><select name="regime"><option value="mei">MEI</option><option value="simples">Simples Nacional</option><option value="other">Outro</option></select>';};document.getElementById("close").onclick=()=>modal.classList.remove("on");form.onsubmit=async e=>{e.preventDefault();const msg=document.getElementById("createMsg"),body=Object.fromEntries(new FormData(form));if(action==="watchlist"){body.targetPrice=body.targetPrice?Number(body.targetPrice):null;body.budget=body.budget?Number(body.budget):null;body.currency=String(body.currency||"BRL").toUpperCase();}if(action==="agent"){body.priceCents=null;body.capabilities=[];}try{const endpoint=action==="agent"?"/api/agents":action==="company"?"/api/companies":api;const payload=action==="workflow"?{name:body.name,enabled:true,steps:[]}:body;const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error||"Falha ao salvar.");modal.classList.remove("on");form.reset();load();}catch(err){msg.textContent=err.message;}};load();}

const platformFetch=async(url,options={})=>{const r=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:"Bearer "+token,"Content-Type":"application/json"}});if(r.status===401){localStorage.removeItem("token");location.href="/login";return null;}const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Não foi possível concluir.");return d;};
const drawer=document.getElementById("accountDrawer"),openAccount=document.getElementById("openAccount");
if(openAccount){openAccount.onclick=()=>{drawer.classList.add("on");loadAccount();};document.getElementById("closeAccount").onclick=()=>drawer.classList.remove("on");}
const accountText=(v)=>String(v??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
async function loadAccount(){try{const [me,ns,ac]=await Promise.all([platformFetch("/api/platform/me"),platformFetch("/api/platform/notifications?limit=12"),platformFetch("/api/platform/activity?limit=12")]);if(!me)return;const u=me.user;document.getElementById("accountState").innerHTML='<div class="statusLine"><span>'+accountText(u.email)+'</span><span class="pill">'+accountText(u.locale||"pt-BR")+'</span></div>';document.getElementById("displayName").value=u.display_name||"";document.getElementById("accountEmail").value=u.email||"";document.getElementById("timezone").value=u.timezone||"America/Sao_Paulo";document.getElementById("locale").value=u.locale||"pt-BR";document.getElementById("planName").textContent=(u.plan||"free").toUpperCase();document.getElementById("planStatus").textContent=u.trial_ends_at?"Trial":"Ativo";document.getElementById("notifications").innerHTML=(ns.notifications||[]).length?ns.notifications.map(n=>'<div class="notificationItem '+(n.read_at?"":"unread")+'"><strong>'+accountText(n.title)+'</strong><div class="muted small">'+accountText(n.body)+'</div><div class="small muted" style="margin-top:5px">'+new Date(n.created_at).toLocaleString("pt-BR")+(n.read_at?"":" · nova")+'</div></div>').join(""):'<div class="muted">Nenhuma notificação.</div>';document.getElementById("activity").innerHTML=(ac.activity||[]).length?ac.activity.map(a=>'<div class="activityItem"><strong>'+accountText(a.event_type)+'</strong><div class="muted small">'+accountText(a.entity_type||"sistema")+' · '+new Date(a.created_at).toLocaleString("pt-BR")+'</div></div>').join(""):'<div class="muted">Nenhuma atividade registrada.</div>';}catch(e){document.getElementById("accountState").textContent=e.message;}}
document.getElementById("accountForm").onsubmit=async e=>{e.preventDefault();try{await platformFetch("/api/platform/me",{method:"PATCH",body:JSON.stringify({displayName:document.getElementById("displayName").value,email:document.getElementById("accountEmail").value,timezone:document.getElementById("timezone").value,locale:document.getElementById("locale").value})});loadAccount();showToast("Preferências salvas");}catch(e){showToast(e.message,true);}};
document.getElementById("passwordForm").onsubmit=async e=>{e.preventDefault();try{await platformFetch("/api/platform/password",{method:"POST",body:JSON.stringify({currentPassword:document.getElementById("currentPassword").value,newPassword:document.getElementById("newPassword").value})});e.target.reset();showToast("Senha atualizada");loadAccount();}catch(e){showToast(e.message,true);}};
document.getElementById("readAll").onclick=async()=>{try{await platformFetch("/api/platform/notifications/read-all",{method:"POST",body:"{}"});loadAccount();}catch(e){showToast(e.message,true);}};
const search=document.getElementById("globalSearch");if(search)search.addEventListener("input",()=>{const q=search.value.toLowerCase().trim();document.querySelectorAll("#list .row").forEach(row=>row.style.display=row.textContent.toLowerCase().includes(q)?"":"none");});
function showToast(message,error=false){let t=document.getElementById("toast");if(!t){t=document.createElement("div");t.id="toast";t.style="position:fixed;right:20px;bottom:20px;z-index:100;padding:13px 16px;border-radius:12px;background:#152033;color:#fff;box-shadow:0 15px 40px #0002;font-size:13px";document.body.appendChild(t);}t.textContent=message;t.style.background=error?"#b42318":"#152033";clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.remove(),3200);}
</script></body></html>`;
};

app.get(["/login","/cadastro","/app","/dashboard","/admin"], (req, res) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.type("html").send(renderPrivateApp(req, req.path));
});
app.get("/politica-de-privacidade", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.type("html").send(renderPrivacy(req));
});
app.get("/", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.type("html").send(renderSite(req, "/", "Shopping Agent", "Planejamento de compras, watchlists e acompanhamento de preços com inteligência."));
});
for (const [path, title, description] of PUBLIC_PAGES) {
  app.get(path, (req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.type("html").send(renderSite(req, path, title, description));
  });
}

app.use("/api/acquisition/automation", acquisitionAutomationRoutes);
app.use("/api/acquisition", acquisitionRoutes);

app.get("/api/health", async (_req, res) => {
  try { await initDb().query("SELECT 1"); res.json({ ok: true, service: "shopping-agent", database: "ok" }); }
  catch { res.status(503).json({ ok: false, database: "error" }); }
});
app.get("/api/metrics", (req, res) => {
  if (process.env.NODE_ENV === "production" && req.header("x-metrics-token") !== process.env.METRICS_TOKEN) return res.status(401).json({ error: "unauthorized" });
  res.json(metricsSnapshot());
});

app.use(errorHandler);
const server = app.listen(port, () => console.log("Shopping Agent API listening on " + port));
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);