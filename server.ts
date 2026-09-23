import acquisitionAutomationRoutes from "./src/routes/acquisitionAutomationRoutes.js";
import express from "express";
import acquisitionRoutes from "./src/routes/acquisitionRoutes.js";
import cors from "cors";
import authRoutes from "./src/routes/authRoutes.js";
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
app.get(["/login","/app","/dashboard","/admin"], (_req, res) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.status(404).type("html").send("<!doctype html><html><head><meta name=\"robots\" content=\"noindex,nofollow,noarchive\"></head><body>Not found</body></html>");
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