// Cloudflare Worker — proxy Claude (Anthropic) pour l'assistant de mehmettuzcu.fr
// + journalisation D1 + BACK-OFFICE /admin (tableau de bord, conversations, prospects, système).
// La fiche publique (prompt système) est chargée en LIVE depuis FICHE_URL (cache ~5 min).
// CORS du chat limité à mehmettuzcu.fr. /admin protégé par Basic Auth (env.ADMIN_PASSWORD).

const FICHE_URL = "https://mehmettuzcu.fr/assets/fiche-publique.txt";
const MODEL = "claude-sonnet-4-6";
const ALLOWED = ["https://mehmettuzcu.fr", "https://www.mehmettuzcu.fr"];

const FALLBACK_SYSTEM =
  "Tu es l'assistant public de Mehmet TUZCU (mehmettuzcu.fr) : architecte opérationnel France-Turquie " +
  "réunissant direction d'entreprise/BTP, conformité institutionnelle (Qualiopi, RGE/Qualibat, RGPD/KVKK) " +
  "et développement full-stack IA, fondateur-développeur de la plateforme EdTech Reflektif. " +
  "Réponds brièvement, en français, à la troisième personne, sans rien inventer. " +
  "Si tu n'as pas l'information en accès public, oriente vers conseil@mehmettuzcu.fr.";

async function getSystem() {
  try {
    const r = await fetch(FICHE_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (r.ok) {
      const t = await r.text();
      if (t && t.trim().length > 300) return t;
    }
  } catch (e) { /* repli */ }
  return FALLBACK_SYSTEM;
}

function corsHeaders(origin) {
  const allow = ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
function json(obj, status, ch) {
  return new Response(JSON.stringify(obj), { status, headers: { ...(ch || {}), "Content-Type": "application/json; charset=utf-8" } });
}
// session_id = jeton opaque : on le réduit à [A-Za-z0-9_-] à l'INGESTION.
// C'est la défense principale contre le XSS stocké — le back-office rend le
// session_id dans des attributs onclick, où un échappement HTML ne suffit pas
// (le parseur décode les entités avant la compilation JS). Aucun caractère
// dangereux (quote, antislash, chevron) ne peut donc atteindre ces sinks.
function safeSid(v) {
  return (v == null ? "" : v.toString()).slice(0, 64).replace(/[^A-Za-z0-9_-]/g, "");
}

// ===================== INSTRUMENTATION AU WRITE-TIME =====================
// Bucket métier déterministe (regex FR), calculé à l'écriture de chaque échange.
function detectTopic(text) {
  const t = (text || "").toLowerCase();
  if (/mission|conseil|devis|tarif|prix|honoraire|disponib|recrut|collabor|prestation|embauch|freelance|budget|contrat/.test(t)) return "missions";
  if (/reflektif|smartmatch|riasec|big ?five|orientation|edtech|psychom|m[ée]tier|career/.test(t)) return "reflektif";
  if (/conformit|qualiopi|rgpd|kvkk|\brge\b|qualibat|r[ée]glementaire|audit|cpf|opco/.test(t)) return "conformité";
  if (/projet|bilan-?easy|local essence|netz|essence ecosystem|saas|plateforme|application|logiciel/.test(t)) return "projets";
  if (/parcours|b[âa]timent|\bbtp\b|carri[èe]re|qui est|pr[ée]sente|exp[ée]rience|directeur|biographie|fil rouge/.test(t)) return "parcours";
  return "autre";
}
// Réponse "faible" : vide, très courte, ou marqueur de redirection/ignorance.
function isFallback(answer) {
  const a = (answer || "").trim();
  if (a.length < 25) return 1;
  if (/je n'?ai pas (cette|d'|l'|cette )?info|pas l'information en acc[èe]s public|je ne (sais|peux) pas|n'?est pas communiqu/i.test(a)) return 1;
  return 0;
}

// Journalisation anonyme d'un échange dans D1 (binding env.DB). No-op sans binding.
function logTurn(env, sessionId, question, answer) {
  if (!env || !env.DB) return Promise.resolve();
  const topic = detectTopic(question + " " + answer);
  const fb = isFallback(answer);
  return env.DB
    .prepare("INSERT INTO conversations (session_id, created_at, question, answer, topic, is_fallback) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(sessionId, Date.now(), question, answer, topic, fb)
    .run()
    .catch(() => {});
}

// ============================= BACK-OFFICE =============================
function htmlEscape(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function checkAuth(request, env) {
  if (!env.ADMIN_PASSWORD) return "unset";
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(auth.slice(6)), c => c.charCodeAt(0)));
      const pass = decoded.slice(decoded.indexOf(":") + 1);
      if (pass === env.ADMIN_PASSWORD) return "ok";
    } catch (e) { /* */ }
  }
  return "no";
}
function authChallenge() {
  return new Response("Authentification requise.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin mehmettuzcu.fr", charset="UTF-8"', "Content-Type": "text/plain; charset=utf-8" },
  });
}
function detectEmail(text) { const m = (text || "").match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i); return m ? m[0] : null; }
function detectPhone(text) { const m = (text || "").match(/(?:\+33|\+90|0[1-9])[\d .\-]{6,}\d/); return m ? m[0].trim() : null; }

const DAY = 86400000;
const COST_PER_MSG = 0.0018; // estimation $ par échange (Sonnet 4.6 + cache), ajustable

// -------- API : tableau de bord --------
async function apiOverview(env, range) {
  const now = Date.now(), start = now - range * DAY, prev = now - 2 * range * DAY;
  const one = async (sql, ...b) => { const r = await env.DB.prepare(sql).bind(...b).first(); return r ? Object.values(r)[0] : 0; };
  const sessions = await one("SELECT COUNT(DISTINCT session_id) FROM conversations WHERE deleted_at IS NULL AND created_at>=?", start);
  const sessionsPrev = await one("SELECT COUNT(DISTINCT session_id) FROM conversations WHERE deleted_at IS NULL AND created_at>=? AND created_at<?", prev, start);
  const messages = await one("SELECT COUNT(*) FROM conversations WHERE deleted_at IS NULL AND created_at>=?", start);
  const messagesPrev = await one("SELECT COUNT(*) FROM conversations WHERE deleted_at IS NULL AND created_at>=? AND created_at<?", prev, start);
  const fb = await one("SELECT COUNT(*) FROM conversations WHERE deleted_at IS NULL AND created_at>=? AND is_fallback=1", start);
  const todo = await one("SELECT COUNT(*) FROM prospects WHERE status='new'");
  const depth = sessions ? Math.round((messages / sessions) * 10) / 10 : 0;
  const depthPrev = sessionsPrev ? Math.round((messagesPrev / sessionsPrev) * 10) / 10 : 0;
  const fbRate = messages ? Math.round((fb / messages) * 100) : 0;
  const fbRatePrev = messagesPrev ? Math.round((await one("SELECT COUNT(*) FROM conversations WHERE deleted_at IS NULL AND created_at>=? AND created_at<? AND is_fallback=1", prev, start) / messagesPrev) * 100) : 0;
  const seriesRes = await env.DB.prepare(
    "SELECT date(created_at/1000,'unixepoch') d, COUNT(DISTINCT session_id) sessions, COUNT(*) messages " +
    "FROM conversations WHERE deleted_at IS NULL AND created_at>=? GROUP BY d ORDER BY d"
  ).bind(now - 30 * DAY).all();
  const topicsRes = await env.DB.prepare(
    "SELECT COALESCE(topic,'autre') topic, COUNT(*) c FROM conversations WHERE deleted_at IS NULL AND created_at>=? GROUP BY topic ORDER BY c DESC LIMIT 8"
  ).bind(start).all();
  const weakRes = await env.DB.prepare(
    "SELECT id, session_id, question, substr(answer,1,160) answer FROM conversations WHERE deleted_at IS NULL AND is_fallback=1 AND created_at>=? ORDER BY created_at DESC LIMIT 15"
  ).bind(start).all();
  return {
    kpis: {
      sessions, sessions_prev: sessionsPrev,
      messages, messages_prev: messagesPrev,
      depth, depth_prev: depthPrev,
      fallback_rate: fbRate, fallback_rate_prev: fbRatePrev,
      prospects_todo: todo,
    },
    series: seriesRes.results || [],
    top_topics: topicsRes.results || [],
    weak_answers: weakRes.results || [],
  };
}

// -------- API : conversations (groupées par session, en JS — volume faible) --------
async function apiConversations(env, p) {
  const range = parseInt(p.range || "90", 10) || 90;
  const start = Date.now() - range * DAY;
  const cond = ["deleted_at IS NULL", "created_at>=?"]; const args = [start];
  if (p.topic) { cond.push("COALESCE(topic,'autre')=?"); args.push(p.topic); }
  if (p.flag === "improve") cond.push("flag='improve'");
  if (p.q) { cond.push("(question LIKE ? OR answer LIKE ?)"); args.push("%" + p.q + "%", "%" + p.q + "%"); }
  const res = await env.DB.prepare(
    "SELECT id, session_id, created_at, question, answer, topic, is_fallback, flag FROM conversations WHERE " +
    cond.join(" AND ") + " ORDER BY created_at DESC LIMIT 3000"
  ).bind(...args).all();
  const rows = res.results || [];
  const map = new Map();
  for (const r of rows) { if (!map.has(r.session_id)) map.set(r.session_id, []); map.get(r.session_id).push(r); }
  const promoted = new Set();
  const pr = await env.DB.prepare("SELECT DISTINCT session_id FROM prospects WHERE session_id IS NOT NULL").all();
  for (const x of (pr.results || [])) promoted.add(x.session_id);
  let sessions = [...map.entries()].map(([sid, turns]) => {
    turns.sort((a, b) => a.created_at - b.created_at);
    const topics = [...new Set(turns.map(t => t.topic || "autre"))];
    const badges = [];
    if (turns.some(t => t.flag === "improve")) badges.push("improve");
    if (turns.some(t => t.is_fallback)) badges.push("fallback");
    if (promoted.has(sid)) badges.push("prospect");
    return { session_id: sid, first_question: turns[0].question, started_at: turns[0].created_at, last_at: turns[turns.length - 1].created_at, msg_count: turns.length, topics, badges };
  }).sort((a, b) => b.last_at - a.last_at);
  const total = sessions.length;
  const page = Math.max(1, parseInt(p.page || "1", 10) || 1), size = 25;
  sessions = sessions.slice((page - 1) * size, page * size);
  return { data: sessions, page, total, pages: Math.ceil(total / size) };
}
async function apiConversationDetail(env, sid) {
  const res = await env.DB.prepare(
    "SELECT id, created_at, question, answer, topic, is_fallback, flag FROM conversations WHERE session_id=? AND deleted_at IS NULL ORDER BY created_at"
  ).bind(sid).all();
  const rows = res.results || [];
  const all = rows.map(r => r.question + " " + r.answer).join(" ");
  const pr = await env.DB.prepare("SELECT status FROM prospects WHERE session_id=? ORDER BY id DESC LIMIT 1").bind(sid).first();
  return { session_id: sid, messages: rows, detected_email: detectEmail(all), detected_phone: detectPhone(all), prospect_status: pr ? pr.status : null };
}
async function apiFlag(env, sid, body) {
  const flag = body && body.flag === "improve" ? "improve" : null;
  await env.DB.prepare("UPDATE conversations SET flag=? WHERE session_id=? AND deleted_at IS NULL").bind(flag, sid).run();
  return { ok: true, flag };
}
async function apiPromote(env, sid, ctx) {
  const det = await apiConversationDetail(env, sid);
  const first = det.messages.length ? det.messages[0].question : "";
  // Anti-doublon sur la SESSION entière (quelle que soit la source : form OU manual).
  const exists = sid ? await env.DB.prepare("SELECT id FROM prospects WHERE session_id=? ORDER BY id LIMIT 1").bind(sid).first() : null;
  const now = Date.now();
  if (exists) return { ok: true, id: exists.id, already: true };
  const subject = ("Conversation : " + first).slice(0, 120);
  const ins = await env.DB.prepare(
    "INSERT INTO prospects (session_id, email, subject, message, source, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)"
  ).bind(sid, det.detected_email || null, subject, first.slice(0, 500), "manual", "new", now, now).run();
  notifyProspect(env, ctx, { email: det.detected_email, subject: subject, message: first });
  return { ok: true, id: ins.meta ? ins.meta.last_row_id : null };
}
async function apiDelete(env, sid, hard) {
  if (hard) await env.DB.prepare("DELETE FROM conversations WHERE session_id=?").bind(sid).run();
  else await env.DB.prepare("UPDATE conversations SET deleted_at=? WHERE session_id=?").bind(Date.now(), sid).run();
  return { ok: true, hard: !!hard };
}

// -------- API : prospects --------
async function apiProspects(env, p) {
  const cond = ["1=1"]; const args = [];
  if (p.status && p.status !== "all") { cond.push("status=?"); args.push(p.status); }
  if (p.q) { cond.push("(email LIKE ? OR subject LIKE ? OR message LIKE ? OR note LIKE ?)"); const like = "%" + p.q + "%"; args.push(like, like, like, like); }
  const res = await env.DB.prepare(
    "SELECT id, session_id, email, subject, message, source, status, note, created_at, updated_at FROM prospects WHERE " +
    cond.join(" AND ") + " ORDER BY (status='new') DESC, created_at DESC LIMIT 500"
  ).bind(...args).all();
  const counts = {};
  const cr = await env.DB.prepare("SELECT status, COUNT(*) c FROM prospects GROUP BY status").all();
  for (const x of (cr.results || [])) counts[x.status] = x.c;
  return { data: res.results || [], counts_by_status: counts };
}
async function apiProspectPatch(env, id, body) {
  const sets = [], args = [];
  if (body.status && ["new", "called", "won", "ignored"].includes(body.status)) { sets.push("status=?"); args.push(body.status); }
  if (typeof body.note === "string") { sets.push("note=?"); args.push(body.note); }
  if (!sets.length) return { ok: false };
  sets.push("updated_at=?"); args.push(Date.now()); args.push(id);
  await env.DB.prepare("UPDATE prospects SET " + sets.join(", ") + " WHERE id=?").bind(...args).run();
  const row = await env.DB.prepare("SELECT * FROM prospects WHERE id=?").bind(id).first();
  return { ok: true, row };
}
async function apiProspectDelete(env, id) {
  await env.DB.prepare("DELETE FROM prospects WHERE id=?").bind(id).run();
  return { ok: true, deleted: true };
}

// ===================== E-MAILS DE MARQUE (HTML) =====================
// Rendu "bulletproof" (tables + styles inline, compatible Gmail/Outlook), palette du site (#1f5673).
// Chaque e-mail part en multipart : text (plein, ** retirés) + html (marque, ** rendus en gras).
const MAIL_FONT = "font-family:Arial,Helvetica,sans-serif;";
function escHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function mdBold(s) { return escHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"); }
function stripMd(s) { return String(s == null ? "" : s).replace(/\*\*/g, ""); }

// Gabarit commun : bandeau accent, titre, intro, corps, CTA optionnel, pied.
function brandEmail(o) {
  const cta = o.ctaUrl
    ? '<tr><td style="padding:8px 28px 24px;" align="left">' +
      '<a href="' + o.ctaUrl + '" style="' + MAIL_FONT + 'display:inline-block;background:#1f5673;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 22px;border-radius:9px;">' +
      escHtml(o.ctaLabel || "Ouvrir") + "</a></td></tr>"
    : "";
  return '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#edf1f4;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf1f4;"><tr><td align="center" style="padding:26px 12px;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #d8dee3;border-radius:14px;overflow:hidden;">' +
    '<tr><td style="background:#1f5673;padding:20px 28px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' +
    '<td style="' + MAIL_FONT + 'color:#ffffff;font-size:17px;font-weight:bold;letter-spacing:.2px;">Mehmet TUZCU</td>' +
    '<td align="right" style="' + MAIL_FONT + 'font-size:12px;"><a href="https://mehmettuzcu.fr" style="color:#bcd2de;text-decoration:none;">mehmettuzcu.fr</a></td>' +
    "</tr></table>" +
    '<div style="' + MAIL_FONT + 'color:#bcd2de;font-size:12.5px;padding-top:3px;">' + escHtml(o.tagline || "Architecte opérationnel — un dirigeant qui code") + "</div>" +
    "</td></tr>" +
    '<tr><td style="padding:26px 28px 4px;' + MAIL_FONT + 'color:#1c2126;font-size:17px;font-weight:bold;">' + escHtml(o.title || "") + "</td></tr>" +
    (o.intro ? '<tr><td style="padding:6px 28px 12px;' + MAIL_FONT + 'color:#3d4753;font-size:14px;line-height:1.6;">' + o.intro + "</td></tr>" : "") +
    '<tr><td style="padding:4px 28px 10px;">' + (o.bodyHtml || "") + "</td></tr>" +
    cta +
    '<tr><td style="padding:16px 28px 22px;border-top:1px solid #e6ebee;' + MAIL_FONT + 'color:#6b7680;font-size:12px;line-height:1.6;">' + (o.footHtml || "") + "</td></tr>" +
    "</table>" +
    '<div style="' + MAIL_FONT + 'color:#9aa6b0;font-size:11px;padding-top:12px;">© Mehmet TUZCU — <a href="https://mehmettuzcu.fr" style="color:#9aa6b0;">mehmettuzcu.fr</a></div>' +
    "</td></tr></table></body></html>";
}

// Conversation "Visiteur : … / Assistant : …" -> blocs façon chat (bulle accent pour l'assistant).
function transcriptBlocksHtml(transcript) {
  const blocks = String(transcript || "").split(/\r?\n\r?\n/);
  let html = "";
  for (const b of blocks) {
    if (!b.trim()) continue;
    const m = b.match(/^(Visiteur|Assistant)\s*:\s*([\s\S]*)$/);
    const who = m ? m[1] : "";
    const txt = m ? m[2] : b;
    const isA = who === "Assistant";
    html +=
      '<div style="margin:0 0 14px;">' +
      (who ? '<div style="' + MAIL_FONT + 'font-size:10.5px;font-weight:bold;letter-spacing:.6px;text-transform:uppercase;color:' + (isA ? "#1f5673" : "#8a95a0") + ';padding:0 0 4px 2px;">' + who + "</div>" : "") +
      '<div style="' + MAIL_FONT + 'font-size:14px;line-height:1.6;color:#1c2126;background:' + (isA ? "#eef3f6" : "#f7f9fa") + ";border-left:3px solid " + (isA ? "#1f5673" : "#d8dee3") + ';border-radius:0 10px 10px 0;padding:12px 15px;">' +
      mdBold(txt).replace(/\r?\n/g, "<br>") +
      "</div></div>";
  }
  return html;
}

// Notification e-mail d'un nouveau prospect (via Resend). No-op si RESEND_API_KEY n'est pas configuré.
function notifyProspect(env, ctx, p) {
  if (!env || !env.RESEND_API_KEY) return;
  const to = env.NOTIFY_EMAIL || "conseil@mehmettuzcu.fr";
  const from = env.NOTIFY_FROM || "Assistant mehmettuzcu.fr <onboarding@resend.dev>";
  const adminUrl = "https://assistant-mehmet.conseil-40b.workers.dev/admin#/prospects";
  const payload = {
    from, to: [to],
    subject: "Nouveau prospect : " + (p.email || p.subject || "sans e-mail"),
    text: (p.email ? "Email : " + p.email + "\n" : "") + (p.subject ? p.subject + "\n\n" : "") + stripMd(p.message || "") +
      "\n\n→ Panneau : " + adminUrl,
    html: brandEmail({
      tagline: "Back-office — nouveau prospect",
      title: p.subject || "Nouveau prospect",
      intro: p.email
        ? 'De : <a href="mailto:' + escHtml(p.email) + '" style="color:#1f5673;font-weight:bold;">' + escHtml(p.email) + "</a>"
        : "Sans e-mail communiqué.",
      bodyHtml: transcriptBlocksHtml(p.message || ""),
      ctaLabel: "Ouvrir le panneau prospects →",
      ctaUrl: adminUrl,
      footHtml: "Notification automatique de l'assistant mehmettuzcu.fr.",
    }),
  };
  const job = fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job);
}

// Envoie au VISITEUR une copie de sa conversation avec l'assistant (via Resend).
// Nécessite un domaine vérifié dans Resend pour atteindre une adresse externe.
// No-op si RESEND_API_KEY absent ; échec silencieux (le lead est déjà enregistré).
function sendTranscriptToVisitor(env, ctx, email, transcript) {
  if (!env || !env.RESEND_API_KEY || !email) return;
  const from = env.NOTIFY_FROM || "Assistant mehmettuzcu.fr <onboarding@resend.dev>";
  const payload = {
    from,
    to: [email],
    reply_to: env.NOTIFY_EMAIL || "conseil@mehmettuzcu.fr",
    subject: "Votre conversation avec l'assistant de Mehmet TUZCU",
    text:
      "Bonjour,\n\nVoici la copie de votre échange avec l'assistant de mehmettuzcu.fr, comme demandé.\n\n" +
      "— — — — — — — — — —\n\n" + stripMd(transcript) + "\n\n— — — — — — — — — —\n\n" +
      "Pour poursuivre l'échange directement avec Mehmet : conseil@mehmettuzcu.fr\n" +
      "https://mehmettuzcu.fr\n\n— Mehmet TUZCU, architecte opérationnel",
    html: brandEmail({
      title: "Votre conversation avec l'assistant",
      intro: 'Bonjour,<br>Voici la copie de votre échange avec l\'assistant de <a href="https://mehmettuzcu.fr" style="color:#1f5673;">mehmettuzcu.fr</a>, comme demandé.',
      bodyHtml: transcriptBlocksHtml(transcript),
      ctaLabel: "Poursuivre avec Mehmet →",
      ctaUrl: "https://mehmettuzcu.fr/#contact",
      footHtml: 'Pour échanger directement : <a href="mailto:conseil@mehmettuzcu.fr" style="color:#1f5673;">conseil@mehmettuzcu.fr</a><br>— Mehmet TUZCU, architecte opérationnel France-Turquie',
    }),
  };
  const job = fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job);
}

// En quittant l'assistant, le visiteur demande à recevoir sa conversation par e-mail.
// On lui en envoie une copie ET on enregistre un lead (il a laissé son adresse) + notification.
async function handleTranscript(request, env, ch, ctx) {
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400, ch); }
  if (b && b.hp) return json({ ok: true }, 200, ch); // honeypot rempli => bot, on ignore
  const email = (b.email || "").toString().slice(0, 200).trim();
  const transcript = (b.transcript || "").toString().slice(0, 12000).trim();
  const sid = safeSid(b.session_id) || null;
  if (!email || email.indexOf("@") < 1 || !transcript) return json({ ok: false }, 400, ch);
  const subject = ("Conversation demandée par e-mail — " + email).slice(0, 160);
  if (env.DB) {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO prospects (session_id, email, subject, message, source, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(sid, email, subject, transcript, "transcript", "new", now, now).run().catch(() => {});
  }
  sendTranscriptToVisitor(env, ctx, email, transcript);
  notifyProspect(env, ctx, { email, subject, message: "Le visiteur a demandé une copie de sa conversation.\n\n" + transcript });
  return json({ ok: true }, 200, ch);
}

// -------- API : système --------
async function apiSystem(env) {
  const one = async (sql, ...b) => { const r = await env.DB.prepare(sql).bind(...b).first(); return r ? Object.values(r)[0] : 0; };
  const last = await one("SELECT MAX(created_at) FROM conversations WHERE deleted_at IS NULL");
  const total = await one("SELECT COUNT(*) FROM conversations WHERE deleted_at IS NULL");
  const oldest = await one("SELECT MIN(created_at) FROM conversations WHERE deleted_at IS NULL");
  const expiring = await one("SELECT COUNT(*) FROM conversations WHERE deleted_at IS NULL AND created_at < ?", Date.now() - 83 * DAY);
  const fbRes = await env.DB.prepare(
    "SELECT date(created_at/1000,'unixepoch') d, COUNT(*) n, SUM(is_fallback) f FROM conversations WHERE deleted_at IS NULL AND created_at>=? GROUP BY d ORDER BY d"
  ).bind(Date.now() - 7 * DAY).all();
  const prospects = await one("SELECT COUNT(*) FROM prospects");
  const msgs30 = await one("SELECT COUNT(*) FROM conversations WHERE deleted_at IS NULL AND created_at>=?", Date.now() - 30 * DAY);
  const est_cost_30d = Math.round(msgs30 * COST_PER_MSG * 100) / 100;
  return { last_conversation_at: last, total_rows: total, oldest_at: oldest, expiring_count: expiring, fallback_7d: fbRes.results || [], prospects_total: prospects, messages_30d: msgs30, est_cost_30d };
}

// Enregistrement d'un lead issu du formulaire de contact du site (public, anti-spam honeypot).
async function handleLead(request, env, ch, ctx) {
  let b; try { b = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400, ch); }
  if (b && b.hp) return json({ ok: true }, 200, ch); // honeypot rempli => bot, on ignore silencieusement
  const email = (b.email || "").toString().slice(0, 200).trim();
  const nom = (b.nom || "").toString().slice(0, 120).trim();
  const org = (b.org || "").toString().slice(0, 120).trim();
  const tel = (b.tel || "").toString().slice(0, 60).trim();
  const message = (b.message || "").toString().slice(0, 4000).trim();
  const sid = safeSid(b.session_id) || null;
  if (!email && !message) return json({ ok: false }, 400, ch);
  const subject = ("Formulaire" + (nom ? " — " + nom : "") + (org ? " (" + org + ")" : "")).slice(0, 160);
  const body = (tel ? "Tél : " + tel + "\n" : "") + message;
  if (env.DB) {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO prospects (session_id, email, subject, message, source, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(sid, email || null, subject, body, "form", "new", now, now).run().catch(() => {});
  }
  notifyProspect(env, ctx, { email, subject, message: body });
  return json({ ok: true }, 200, ch);
}
async function apiPurge(env, body) {
  const before = (body && body.before_ts) ? body.before_ts : Date.now() - 90 * DAY;
  const res = await env.DB.prepare("DELETE FROM conversations WHERE created_at < ?").bind(before).run();
  return { ok: true, deleted: res.meta ? res.meta.changes : null };
}
async function apiExport(env, p) {
  const type = p.type === "prospects" ? "prospects" : "conversations";
  const range = parseInt(p.range || "90", 10) || 90;
  let rows;
  if (type === "prospects") {
    rows = (await env.DB.prepare("SELECT id, session_id, email, subject, status, note, source, created_at FROM prospects ORDER BY created_at DESC").all()).results || [];
  } else {
    rows = (await env.DB.prepare("SELECT id, session_id, created_at, topic, is_fallback, question, answer FROM conversations WHERE deleted_at IS NULL AND created_at>=? ORDER BY created_at DESC").bind(Date.now() - range * DAY).all()).results || [];
  }
  if (p.format === "json") {
    return new Response(JSON.stringify(rows, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="' + type + '.json"' } });
  }
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const esc = v => { const s = String(v == null ? "" : v).replace(/"/g, '""'); return '"' + s + '"'; };
  let csv = cols.join(",") + "\n";
  for (const r of rows) csv += cols.map(c => esc(r[c])).join(",") + "\n";
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="' + type + '.csv"' } });
}

// ===================== ASSISTANT PRIVÉ (back-office) =====================
// Chat personnel de Mehmet, derrière le Basic Auth du /admin. À l'inverse de
// l'assistant public : corpus = dossier PRIVÉ complet (table D1 corpus_docs),
// aucun filtre, aucune limite applicative, aucune journalisation des échanges.
// Le corpus ne doit JAMAIS être référencé par le chemin public.
const PRIVATE_PREAMBLE =
  "Tu es l'assistant PRIVÉ de Mehmet TUZCU — accessible uniquement à lui, derrière authentification, dans son back-office personnel.\n" +
  "L'utilisateur EST Mehmet. Ce n'est PAS l'assistant public du site : ici, aucun filtre commercial ou de confidentialité ne s'applique.\n" +
  "- Utilise TOUTES les informations du dossier ci-dessous, y compris les données privées et sensibles : chiffres financiers, clients, négociations, données personnelles, stratégie.\n" +
  "- Réponds dans la langue de sa question (turc ou français — il utilise les deux).\n" +
  "- Sois direct, dense et structuré ; pas de langue de bois. Appuie-toi sur les faits du dossier et cite les chiffres exacts.\n" +
  "- Si une information manque dans les documents ACTIFS ci-dessous, dis-le explicitement et indique quel document du corpus activer ou ajouter — n'invente jamais.\n" +
  "- Tu peux le challenger, jouer l'avocat du diable, préparer des négociations, rédiger en son nom (e-mails, notes, pitchs).";

// Migration paresseuse : la table se crée toute seule au premier appel (idempotent),
// aucun passage par la console D1 n'est nécessaire.
let corpusReady = false;
async function ensureCorpus(env) {
  if (corpusReady) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS corpus_docs (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, content TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL)").run();
  corpusReady = true;
}
async function apiCorpusList(env) {
  await ensureCorpus(env);
  const rows = (await env.DB.prepare("SELECT id, name, enabled, length(content) AS size, updated_at FROM corpus_docs ORDER BY name").all()).results || [];
  return { data: rows };
}
async function apiCorpusGet(env, id) {
  await ensureCorpus(env);
  const row = await env.DB.prepare("SELECT * FROM corpus_docs WHERE id=?").bind(id).first();
  return row ? { row } : { error: "not_found" };
}
async function apiCorpusCreate(env, body) {
  await ensureCorpus(env);
  const name = (body.name || "").toString().slice(0, 120).trim();
  const content = (body.content || "").toString().slice(0, 400000);
  if (!name || !content.trim()) return { error: "missing_fields" };
  const enabled = (body.enabled === 0 || body.enabled === false) ? 0 : 1;
  await env.DB.prepare("INSERT INTO corpus_docs (name, content, enabled, updated_at) VALUES (?,?,?,?)")
    .bind(name, content, enabled, Date.now()).run();
  return { ok: true };
}
async function apiCorpusPatch(env, id, body) {
  await ensureCorpus(env);
  const sets = []; const args = [];
  if (typeof body.name === "string" && body.name.trim()) { sets.push("name=?"); args.push(body.name.slice(0, 120).trim()); }
  if (typeof body.content === "string") { sets.push("content=?"); args.push(body.content.slice(0, 400000)); }
  if (body.enabled === 0 || body.enabled === 1 || body.enabled === true || body.enabled === false) { sets.push("enabled=?"); args.push(body.enabled ? 1 : 0); }
  if (!sets.length) return { error: "no_fields" };
  sets.push("updated_at=?"); args.push(Date.now()); args.push(id);
  await env.DB.prepare("UPDATE corpus_docs SET " + sets.join(", ") + " WHERE id=?").bind(...args).run();
  return { ok: true };
}
async function apiCorpusDelete(env, id) {
  await ensureCorpus(env);
  await env.DB.prepare("DELETE FROM corpus_docs WHERE id=?").bind(id).run();
  return { ok: true };
}

// Chat privé : system = préambule + concat des documents ACTIFS (avec cache).
// Réponse JSON { answer, usage } ; les erreurs amont sont remontées avec détail
// (un 429 signale un corpus actif trop grand pour la limite de débit du palier API).
async function apiPrivateChat(env, body) {
  if (!env.ANTHROPIC_API_KEY) return { error: "missing_key" };
  const msg = (body.message || "").toString().slice(0, 6000);
  if (!msg.trim()) return { error: "empty_message" };
  await ensureCorpus(env);
  const docs = (await env.DB.prepare("SELECT name, content FROM corpus_docs WHERE enabled=1 ORDER BY name").all()).results || [];
  let corpus = "";
  for (const d of docs) corpus += "\n\n===== DOCUMENT : " + d.name + " =====\n" + d.content;
  const system = PRIVATE_PREAMBLE + (corpus
    ? "\n\n===== DOSSIER PRIVÉ — DOCUMENTS ACTIFS =====" + corpus
    : "\n\n(Le corpus privé est vide ou entièrement désactivé — signale-le à Mehmet.)");
  const hist = Array.isArray(body.history) ? body.history.slice(-16) : [];
  const messages = [];
  for (const t of hist) {
    if (t && typeof t.content === "string" && t.content.trim()) {
      messages.push({ role: t.role === "assistant" ? "assistant" : "user", content: t.content.slice(0, 8000) });
    }
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  messages.push({ role: "user", content: msg });
  const payload = { model: MODEL, max_tokens: 2000, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (e) { clearTimeout(timer); return { error: "upstream_timeout" }; }
  clearTimeout(timer);
  let data;
  try { data = await r.json(); } catch (e) { return { error: "upstream_parse", status: r.status }; }
  if (!r.ok) return { error: "upstream_error", status: r.status, detail: ((data && data.error && data.error.message) || "").slice(0, 300) };
  let answer = "";
  if (Array.isArray(data.content)) answer = data.content.filter(b => b && b.type === "text").map(b => b.text).filter(Boolean).join("\n").trim();
  const u = data.usage || {};
  return { answer, usage: { input: u.input_tokens || 0, output: u.output_tokens || 0, cache_read: u.cache_read_input_tokens || 0, cache_write: u.cache_creation_input_tokens || 0 } };
}

// -------- Routeur /admin --------
async function handleAdmin(request, env, url, ctx) {
  const st = checkAuth(request, env);
  if (st === "unset") return new Response("Panneau non configuré : ajoutez la variable secrète ADMIN_PASSWORD au Worker, puis redéployez.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (st !== "ok") return authChallenge();
  if (!env.DB) return json({ error: "d1_unbound" }, 503, null);

  // Anti-CSRF : le Basic Auth est renvoyé automatiquement par le navigateur, donc
  // une requête d'écriture cross-site l'emporterait. On exige que l'Origin (envoyé
  // sur toute requête mutante) corresponde au Worker ; les GET restent libres.
  if (request.method === "POST" || request.method === "PATCH" || request.method === "DELETE") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) return json({ error: "bad_origin" }, 403, null);
  }

  const path = url.pathname;
  const q = Object.fromEntries(url.searchParams.entries());
  let body = {};
  if (request.method === "POST" || request.method === "PATCH") { try { body = await request.json(); } catch (e) { body = {}; } }
  const seg = path.replace(/^\/admin\/api\//, "").replace(/\/$/, "");

  try {
    if (path === "/admin" || path === "/admin/") return new Response(ADMIN_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
      // Défense en profondeur : bloque toute exfiltration vers un tiers (fetch/img/script
      // externes) même si une injection franchissait l'assainissement. 'unsafe-inline' reste
      // requis (handlers onclick de la SPA), mais connect/img/script-src 'self' ferme le canal de fuite.
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
    if (path === "/admin/api/overview") return json(await apiOverview(env, parseInt(q.range || "7", 10) || 7), 200, null);
    if (path === "/admin/api/conversations" && request.method === "GET") return json(await apiConversations(env, q), 200, null);
    if (path === "/admin/api/prospects" && request.method === "GET") return json(await apiProspects(env, q), 200, null);
    if (path === "/admin/api/system") return json(await apiSystem(env), 200, null);
    if (path === "/admin/api/system/purge" && request.method === "POST") return json(await apiPurge(env, body), 200, null);
    if (path === "/admin/api/export") return apiExport(env, q);
    // Assistant privé + corpus
    if (path === "/admin/api/pchat" && request.method === "POST") return json(await apiPrivateChat(env, body), 200, null);
    if (path === "/admin/api/corpus" && request.method === "GET") return json(await apiCorpusList(env), 200, null);
    if (path === "/admin/api/corpus" && request.method === "POST") return json(await apiCorpusCreate(env, body), 200, null);
    // /admin/api/conversations/:sid[/action]
    let m;
    if ((m = path.match(/^\/admin\/api\/conversations\/([^/]+)$/)) && request.method === "GET") return json(await apiConversationDetail(env, decodeURIComponent(m[1])), 200, null);
    if ((m = path.match(/^\/admin\/api\/conversations\/([^/]+)\/flag$/)) && request.method === "POST") return json(await apiFlag(env, decodeURIComponent(m[1]), body), 200, null);
    if ((m = path.match(/^\/admin\/api\/conversations\/([^/]+)\/promote$/)) && request.method === "POST") return json(await apiPromote(env, decodeURIComponent(m[1]), ctx), 200, null);
    if ((m = path.match(/^\/admin\/api\/conversations\/([^/]+)\/delete$/)) && request.method === "POST") return json(await apiDelete(env, decodeURIComponent(m[1]), q.hard === "1"), 200, null);
    if ((m = path.match(/^\/admin\/api\/prospects\/(\d+)$/)) && request.method === "PATCH") return json(await apiProspectPatch(env, parseInt(m[1], 10), body), 200, null);
    if ((m = path.match(/^\/admin\/api\/prospects\/(\d+)$/)) && request.method === "DELETE") return json(await apiProspectDelete(env, parseInt(m[1], 10)), 200, null);
    if ((m = path.match(/^\/admin\/api\/corpus\/(\d+)$/)) && request.method === "GET") return json(await apiCorpusGet(env, parseInt(m[1], 10)), 200, null);
    if ((m = path.match(/^\/admin\/api\/corpus\/(\d+)$/)) && request.method === "PATCH") return json(await apiCorpusPatch(env, parseInt(m[1], 10), body), 200, null);
    if ((m = path.match(/^\/admin\/api\/corpus\/(\d+)$/)) && request.method === "DELETE") return json(await apiCorpusDelete(env, parseInt(m[1], 10)), 200, null);
    return json({ error: "not_found", path }, 404, null);
  } catch (e) {
    return json({ error: "server" }, 500, null);
  }
}

const ADMIN_HTML = String.raw`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Back-office — assistant mehmettuzcu.fr</title>
<style>
:root{--ink:#16242c;--mut:#6b7680;--acc:#1f5673;--acc2:#163f54;--line:#e4e9ec;--bg:#f4f6f7;--ok:#2f8f5b;--warn:#c2772a;--bad:#c0463f;--soft:#eef3f6}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg);font-size:14px;line-height:1.5}
a{color:var(--acc)}.layout{display:flex;min-height:100vh}
nav.side{width:210px;background:#fff;border-right:1px solid var(--line);padding:18px 12px;position:sticky;top:0;height:100vh;flex-shrink:0}
nav.side h1{font-size:.95rem;margin:0 0 2px;padding:0 8px}nav.side .sub{font-size:.7rem;color:var(--mut);padding:0 8px;margin-bottom:18px}
nav.side a{display:flex;align-items:center;gap:9px;padding:9px 11px;border-radius:9px;color:var(--ink);text-decoration:none;font-weight:600;margin-bottom:3px;font-size:.9rem}
nav.side a:hover{background:var(--soft)}nav.side a.on{background:var(--acc);color:#fff}
nav.side a .b{margin-left:auto;background:var(--bad);color:#fff;border-radius:999px;font-size:.7rem;padding:1px 7px;font-weight:700}
nav.side a.on .b{background:#fff;color:var(--bad)}
main{flex:1;padding:22px 26px;max-width:1000px}
.hd{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:18px}
.hd h2{margin:0;font-size:1.25rem}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:#fff}
.seg button{border:0;background:#fff;padding:6px 12px;cursor:pointer;font:inherit;color:var(--mut)}
.seg button.on{background:var(--acc);color:#fff}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}
.card{background:#fff;border:1px solid var(--line);border-radius:13px;padding:14px 16px}
.kpi .lab{font-size:.74rem;color:var(--mut);text-transform:uppercase;letter-spacing:.4px;font-weight:600}
.kpi .val{font-size:1.7rem;font-weight:700;margin:4px 0 1px}.kpi .d{font-size:.78rem;font-weight:600}
.up{color:var(--ok)}.down{color:var(--bad)}.flat{color:var(--mut)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:760px){.grid2{grid-template-columns:1fr}nav.side{width:64px}nav.side h1,nav.side .sub,nav.side .lbl{display:none}}
h3.sec{font-size:.95rem;margin:0 0 10px}
.bar{display:flex;align-items:center;gap:8px;margin:5px 0;font-size:.85rem}.bar .n{width:92px;flex-shrink:0;color:var(--mut)}.bar .t{flex:1;background:var(--soft);border-radius:6px;height:16px;overflow:hidden}.bar .f{height:100%;background:var(--acc);border-radius:6px}.bar .c{width:34px;text-align:right;font-weight:600}
.list .it{padding:9px 0;border-bottom:1px solid var(--line);cursor:pointer}.list .it:last-child{border:0}.list .it:hover{background:var(--soft)}
.q{font-weight:600}.meta{font-size:.78rem;color:var(--mut)}
.badge{display:inline-block;font-size:.68rem;font-weight:700;padding:1px 7px;border-radius:999px;margin-left:5px;vertical-align:middle}
.badge.improve{background:#fbecd9;color:var(--warn)}.badge.fallback{background:#f6ddda;color:var(--bad)}.badge.prospect{background:#dcefe3;color:var(--ok)}.badge.topic{background:var(--soft);color:var(--acc)}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
input,select,textarea{font:inherit;border:1px solid var(--line);border-radius:8px;padding:7px 10px;color:var(--ink);background:#fff}
input:focus,select:focus,textarea:focus{outline:0;border-color:var(--acc)}
.btn{border:1px solid var(--acc);background:var(--acc);color:#fff;border-radius:8px;padding:7px 13px;cursor:pointer;font:inherit;font-weight:600}
.btn.ghost{background:#fff;color:var(--acc)}.btn.sm{padding:4px 10px;font-size:.82rem}.btn.danger{border-color:var(--bad);background:#fff;color:var(--bad)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.drawer-bk{position:fixed;inset:0;background:rgba(10,20,28,.4);display:none;z-index:40}
.drawer{position:fixed;top:0;right:0;width:min(560px,94vw);height:100vh;background:#fff;box-shadow:-8px 0 30px rgba(0,0,0,.18);transform:translateX(100%);transition:transform .22s;z-index:41;display:flex;flex-direction:column}
.drawer.open{transform:none}.drawer-bk.open{display:block}
.dh{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:10px}
.db{padding:16px 18px;overflow:auto;flex:1}
.bub{border-radius:11px;padding:8px 12px;margin:0 0 6px;white-space:pre-wrap;word-break:break-word;font-size:.9rem}
.bub .lb{display:block;font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;opacity:.6;margin-bottom:2px}
.bub.bq{background:#eef1f3}.bub.ba{background:#e8f0f4;border:1px solid #d7e4ec}
.pager{display:flex;gap:8px;align-items:center;justify-content:center;margin:16px 0}
.empty{color:var(--mut);text-align:center;padding:40px 0}
.pill{font-size:.72rem;font-weight:700;padding:2px 9px;border-radius:999px}
.pill.new{background:#dcefe3;color:var(--ok)}.pill.called{background:#fbecd9;color:var(--warn)}.pill.won{background:#d9e8f5;color:var(--acc)}.pill.ignored{background:#eceff1;color:var(--mut)}
.toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:9px 16px;border-radius:9px;font-size:.85rem;z-index:60;opacity:0;transition:.2s;pointer-events:none}
.toast.show{opacity:1}
.spark{width:100%;height:46px}
.loading{color:var(--mut);padding:30px 0;text-align:center}
small.warn{color:var(--warn)}
</style></head><body>
<div class="layout">
<nav class="side">
  <h1>Back-office</h1><div class="sub">assistant · mehmettuzcu.fr</div>
  <a href="#/dashboard" data-r="dashboard"><span class="lbl">Tableau de bord</span></a>
  <a href="#/prive" data-r="prive"><span class="lbl">Assistant privé</span></a>
  <a href="#/corpus" data-r="corpus"><span class="lbl">Corpus privé</span></a>
  <a href="#/conversations" data-r="conversations"><span class="lbl">Conversations</span></a>
  <a href="#/prospects" data-r="prospects"><span class="lbl">Prospects</span><span class="b" id="navTodo" style="display:none"></span></a>
  <a href="#/system" data-r="system"><span class="lbl">Données &amp; système</span></a>
</nav>
<main id="view"><div class="loading">Chargement…</div></main>
</div>
<div class="drawer-bk" id="dbk"></div>
<aside class="drawer" id="drawer"><div class="dh"><strong id="dTitle">Session</strong><button class="btn ghost sm" onclick="closeDrawer()">Fermer</button></div><div class="db" id="dBody"></div></aside>
<div class="toast" id="toast"></div>
<script>
var V=document.getElementById('view');
function api(p,o){return fetch('/admin/api/'+p,o).then(function(r){if(r.status===401){location.reload();throw 0}if(!r.ok)throw new Error('http '+r.status);return r.json()}).catch(function(e){var l=document.querySelectorAll('.loading');for(var i=0;i<l.length;i++)l[i].innerHTML='Erreur réseau — <a href="javascript:location.reload()">recharger</a>';toast('Erreur réseau');throw e})}
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},1900)}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function fmt(ms){if(!ms)return '—';var d=new Date(ms);return d.toISOString().slice(0,16).replace('T',' ')+' UTC'}
function ago(ms){if(!ms)return '';var s=(Date.now()-ms)/1000;if(s<3600)return Math.round(s/60)+' min';if(s<86400)return Math.round(s/3600)+' h';return Math.round(s/86400)+' j'}
function md(s){return esc(s).replace(/\[\[[^\]]*\]\]\s*$/,'').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').trim()}
function setNav(r){var as=document.querySelectorAll('nav.side a');for(var i=0;i<as.length;i++)as[i].classList.toggle('on',as[i].getAttribute('data-r')===r)}
function delta(cur,prev,inv){var d=cur-prev;var cls=d>0?(inv?'down':'up'):(d<0?(inv?'up':'down'):'flat');var ar=d>0?'▲':(d<0?'▼':'•');var pct=prev?Math.round(Math.abs(d)/prev*100):(cur?100:0);return '<span class="d '+cls+'">'+ar+' '+pct+'%</span>'}

// ---------- DASHBOARD ----------
var dashRange=7;
function viewDashboard(){setNav('dashboard');V.innerHTML='<div class="loading">Chargement…</div>';
 api('overview?range='+dashRange).then(function(d){
  if(d.error){V.innerHTML='<div class="empty">Erreur : '+esc(d.error)+'</div>';return}
  var k=d.kpis;
  function card(lab,val,dh){return '<div class="card kpi"><div class="lab">'+lab+'</div><div class="val">'+val+'</div>'+(dh||'')+'</div>'}
  var kp='<div class="kpis">'+
   card('Sessions',k.sessions,delta(k.sessions,k.sessions_prev))+
   card('Messages',k.messages,delta(k.messages,k.messages_prev))+
   card('Profondeur',k.depth,delta(k.depth,k.depth_prev))+
   card('Réponses faibles',k.fallback_rate+'%',delta(k.fallback_rate,k.fallback_rate_prev,true))+
   card('À rappeler',k.prospects_todo,k.prospects_todo?'<div class="d"><a href="#/prospects">voir les prospects →</a></div>':'<div class="d flat">aucun</div>')+
   '</div>';
  var maxT=Math.max.apply(null,d.top_topics.map(function(x){return x.c}).concat([1]));
  var topics=d.top_topics.map(function(x){return '<div class="bar" onclick="location.hash=\'#/conversations?topic='+encodeURIComponent(x.topic)+'\'" style="cursor:pointer"><span class="n">'+esc(x.topic)+'</span><span class="t"><span class="f" style="width:'+(x.c/maxT*100)+'%"></span></span><span class="c">'+x.c+'</span></div>'}).join('')||'<div class="meta">—</div>';
  var weak=d.weak_answers.map(function(w){return '<div class="it" onclick="openSession(\''+esc(w.session_id)+'\')"><div class="q">'+esc(w.question)+'</div><div class="meta">'+esc((w.answer||'').slice(0,90))+'…</div></div>'}).join('')||'<div class="meta">Aucune réponse faible 🎉</div>';
  V.innerHTML='<div class="hd"><h2>Tableau de bord</h2><div class="seg" id="dseg"></div></div>'+kp+
   '<div class="card" style="margin-bottom:16px"><h3 class="sec">Activité (30 j)</h3>'+spark(d.series)+'</div>'+
   '<div class="grid2"><div class="card"><h3 class="sec">Thèmes ('+dashRange+' j)</h3>'+topics+'</div>'+
   '<div class="card"><h3 class="sec">Réponses à améliorer</h3><div class="list">'+weak+'</div></div></div>';
  seg('dseg',[['7','7 j'],['30','30 j'],['90','90 j']],String(dashRange),function(v){dashRange=parseInt(v,10);viewDashboard()});
  loadTodo();
 })}
function spark(series){if(!series.length)return '<div class="meta">Pas encore de données.</div>';
 var days=30,now=Date.now(),arr=[];for(var i=days-1;i>=0;i--){var dd=new Date(now-i*86400000).toISOString().slice(0,10);var f=series.filter(function(s){return s.d===dd})[0];arr.push(f?f.messages:0)}
 var max=Math.max.apply(null,arr.concat([1])),w=600,h=46,step=w/(days-1);
 var pts=arr.map(function(v,i){return (i*step).toFixed(1)+','+(h-v/max*(h-6)-2).toFixed(1)}).join(' ');
 var ssum=series.reduce(function(a,s){return a+s.sessions},0),msum=series.reduce(function(a,s){return a+s.messages},0);
 return '<svg class="spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><polyline fill="none" stroke="#1f5673" stroke-width="2" points="'+pts+'"/></svg><div class="meta">'+msum+' messages · '+ssum+' sessions sur 30 j</div>'}

// ---------- CONVERSATIONS ----------
var cState={range:'90',topic:'',flag:'',q:'',page:1};
function viewConversations(params){setNav('conversations');
 if(params){if(params.topic)cState.topic=params.topic}
 V.innerHTML='<div class="hd"><h2>Conversations</h2></div>'+
  '<div class="toolbar"><input id="cq" placeholder="Rechercher…" value="'+esc(cState.q)+'" style="flex:1;min-width:160px">'+
  '<select id="crange"><option value="7">7 j</option><option value="30">30 j</option><option value="90" selected>90 j</option></select>'+
  '<select id="ctopic"><option value="">Tous thèmes</option></select>'+
  '<select id="cflag"><option value="">Tous</option><option value="improve">À améliorer</option></select></div>'+
  '<div id="clist"><div class="loading">Chargement…</div></div>';
 var topics=['missions','reflektif','parcours','projets','conformité','autre'];
 var ts=document.getElementById('ctopic');topics.forEach(function(t){var o=document.createElement('option');o.value=t;o.textContent=t;if(t===cState.topic)o.selected=true;ts.appendChild(o)});
 document.getElementById('crange').value=cState.range;document.getElementById('cflag').value=cState.flag;
 var deb;document.getElementById('cq').addEventListener('input',function(e){clearTimeout(deb);deb=setTimeout(function(){cState.q=e.target.value;cState.page=1;loadConv()},350)});
 document.getElementById('crange').addEventListener('change',function(e){cState.range=e.target.value;cState.page=1;loadConv()});
 document.getElementById('ctopic').addEventListener('change',function(e){cState.topic=e.target.value;cState.page=1;loadConv()});
 document.getElementById('cflag').addEventListener('change',function(e){cState.flag=e.target.value;cState.page=1;loadConv()});
 loadConv()}
function loadConv(){var el=document.getElementById('clist');if(!el)return;el.innerHTML='<div class="loading">Chargement…</div>';
 var qs='range='+cState.range+'&page='+cState.page+(cState.topic?'&topic='+encodeURIComponent(cState.topic):'')+(cState.flag?'&flag='+cState.flag:'')+(cState.q?'&q='+encodeURIComponent(cState.q):'');
 api('conversations?'+qs).then(function(d){
  if(!d.data||!d.data.length){el.innerHTML='<div class="empty">Aucune conversation.</div>';return}
  var h='<div class="card list">'+d.data.map(function(s){
   var bd=s.badges.map(function(b){return '<span class="badge '+b+'">'+(b==='improve'?'à améliorer':b==='fallback'?'réponse faible':'prospect')+'</span>'}).join('');
   var tp=s.topics.map(function(t){return '<span class="badge topic">'+esc(t)+'</span>'}).join('');
   return '<div class="it" onclick="openSession(\''+esc(s.session_id)+'\')"><div class="q">'+esc(s.first_question)+bd+'</div><div class="meta">'+s.msg_count+' échange(s) · il y a '+ago(s.last_at)+' '+tp+'</div></div>'
  }).join('')+'</div>';
  h+='<div class="pager"><button class="btn ghost sm" '+(cState.page<=1?'disabled':'')+' onclick="cState.page--;loadConv()">←</button><span class="meta">page '+d.page+' / '+(d.pages||1)+' · '+d.total+' sessions</span><button class="btn ghost sm" '+(cState.page>=d.pages?'disabled':'')+' onclick="cState.page++;loadConv()">→</button></div>';
  el.innerHTML=h})}

// ---------- DRAWER session ----------
function openSession(sid){openDrawer();document.getElementById('dBody').innerHTML='<div class="loading">Chargement…</div>';document.getElementById('dTitle').textContent='Session';
 api('conversations/'+encodeURIComponent(sid)).then(function(d){
  var contact='';
  if(d.detected_email||d.detected_phone)contact='<div class="card" style="margin-bottom:12px"><strong>Contact détecté</strong><div class="meta">'+(d.detected_email?'✉ '+esc(d.detected_email)+' ':'')+(d.detected_phone?'☎ '+esc(d.detected_phone):'')+'</div></div>';
  var msgs=d.messages.map(function(m){return '<div class="bub bq"><span class="lb">Visiteur</span>'+esc(m.question)+'</div><div class="bub ba"><span class="lb">Assistant</span>'+md(m.answer)+'</div>'}).join('');
  var first=d.messages.length?d.messages[0].question:'';
  var mailto='mailto:conseil@mehmettuzcu.fr?subject='+encodeURIComponent('Suite à votre échange avec l\'assistant')+'&body='+encodeURIComponent('Bonjour,\n\nSuite à votre question « '+first+' »…\n\n');
  var act='<div class="row" style="margin-bottom:12px">'+
   '<button class="btn sm" onclick="promote(\''+esc(sid)+'\')">'+(d.prospect_status?'✓ prospect':'+ Promouvoir en prospect')+'</button>'+
   '<button class="btn ghost sm" onclick="flagSess(\''+esc(sid)+'\')">⚑ À améliorer</button>'+
   '<a class="btn ghost sm" href="'+mailto+'">✉ Répondre</a>'+
   '<button class="btn ghost sm" onclick="copyConv()">Copier</button>'+
   '<button class="btn danger sm" onclick="delSess(\''+esc(sid)+'\')">Supprimer</button></div>';
  document.getElementById('dTitle').textContent=sid;
  document.getElementById('dBody').innerHTML=act+contact+'<div id="convText">'+msgs+'</div>'})}
function promote(sid){api('conversations/'+encodeURIComponent(sid)+'/promote',{method:'POST'}).then(function(r){toast(r.already?'Déjà un prospect':'Promu en prospect ✓');loadTodo();openSession(sid)})}
function flagSess(sid){api('conversations/'+encodeURIComponent(sid)+'/flag',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({flag:'improve'})}).then(function(){toast('Marqué « à améliorer »')})}
function delSess(sid){if(!confirm('Supprimer cette session ? (réversible — masquée du back-office)'))return;api('conversations/'+encodeURIComponent(sid)+'/delete',{method:'POST'}).then(function(){toast('Supprimée');closeDrawer();if(location.hash.indexOf('conversations')>=0)loadConv()})}
function copyConv(){var t=document.getElementById('convText');if(t&&navigator.clipboard){navigator.clipboard.writeText(t.innerText).then(function(){toast('Copié')})}}
function openDrawer(){document.getElementById('drawer').classList.add('open');document.getElementById('dbk').classList.add('open')}
function closeDrawer(){document.getElementById('drawer').classList.remove('open');document.getElementById('dbk').classList.remove('open')}
document.getElementById('dbk').addEventListener('click',closeDrawer);

// ---------- PROSPECTS ----------
var pStatus='all',pQ='';
function viewProspects(){setNav('prospects');V.innerHTML='<div class="hd"><h2>Prospects</h2><div class="seg" id="pseg"></div></div><div class="toolbar"><input id="pq" placeholder="Rechercher (email, sujet, note…)" value="'+esc(pQ)+'" style="flex:1;min-width:200px"></div><div id="plist"><div class="loading">Chargement…</div></div>';
 seg('pseg',[['all','Tous'],['new','Nouveaux'],['called','Appelés'],['won','Gagnés'],['ignored','Ignorés']],pStatus,function(v){pStatus=v;loadProspects()});
 var deb;document.getElementById('pq').addEventListener('input',function(e){clearTimeout(deb);deb=setTimeout(function(){pQ=e.target.value;loadProspects()},350)});
 loadProspects()}
function loadProspects(){var el=document.getElementById('plist');if(!el)return;
 api('prospects?status='+pStatus+(pQ?'&q='+encodeURIComponent(pQ):'')).then(function(d){
  if(!d.data||!d.data.length){el.innerHTML='<div class="empty">Aucun prospect.</div>';return}
  el.innerHTML=d.data.map(function(p){
   var opts=['new','called','won','ignored'].map(function(s){return '<option value="'+s+'"'+(p.status===s?' selected':'')+'>'+s+'</option>'}).join('');
   return '<div class="card" style="margin-bottom:12px"><div class="row" style="justify-content:space-between"><div><strong>'+esc(p.email||p.subject||'Prospect #'+p.id)+'</strong> <span class="pill '+p.status+'">'+p.status+'</span> <span class="meta">· '+esc(p.source)+' · il y a '+ago(p.created_at)+'</span></div>'+
    '<div class="row"><select onchange="patchP('+p.id+',{status:this.value})">'+opts+'</select>'+(p.session_id?'<button class="btn ghost sm" onclick="openSession(\''+esc(p.session_id)+'\')">Conversation</button>':'')+'<button class="btn danger sm" onclick="deleteP('+p.id+')">Suppr.</button></div></div>'+
    '<div class="meta" style="margin:6px 0">'+esc(p.subject||'')+(p.message?' — '+esc((p.message||'').slice(0,160)):'')+'</div>'+
    '<textarea placeholder="Note…" style="width:100%;min-height:42px" onblur="patchP('+p.id+',{note:this.value})">'+esc(p.note||'')+'</textarea></div>'
  }).join('')})}
function patchP(id,b){api('prospects/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(function(){toast('Enregistré');loadTodo();if(b.status)loadProspects()})}
function deleteP(id){if(!confirm('Supprimer définitivement ce prospect ?'))return;api('prospects/'+id,{method:'DELETE'}).then(function(){toast('Supprimé');loadTodo();loadProspects()})}

// ---------- SYSTÈME ----------
function viewSystem(){setNav('system');V.innerHTML='<div class="hd"><h2>Données &amp; système</h2></div><div id="sys"><div class="loading">Chargement…</div></div>';
 api('system').then(function(d){
  var fbToday=d.fallback_7d.length?d.fallback_7d[d.fallback_7d.length-1]:null;
  var rate=fbToday&&fbToday.n?Math.round(fbToday.f/fbToday.n*100):0;
  document.getElementById('sys').innerHTML=
  '<div class="kpis">'+
   '<div class="card kpi"><div class="lab">Dernière conversation</div><div class="val" style="font-size:1.1rem">'+(d.last_conversation_at?'il y a '+ago(d.last_conversation_at):'—')+'</div><div class="d flat">'+fmt(d.last_conversation_at)+'</div></div>'+
   '<div class="card kpi"><div class="lab">Lignes (total)</div><div class="val">'+d.total_rows+'</div><div class="d flat">prospects : '+d.prospects_total+'</div></div>'+
   '<div class="card kpi"><div class="lab">Réponses faibles (auj.)</div><div class="val">'+rate+'%</div><div class="d '+(rate>40?'down':'flat')+'">'+(fbToday?fbToday.n+' msg':'—')+'</div></div>'+
   '<div class="card kpi"><div class="lab">Expirent &lt; 7 j</div><div class="val">'+d.expiring_count+'</div><div class="d flat">rétention 90 j</div></div>'+
   '<div class="card kpi"><div class="lab">Coût estimé (30j)</div><div class="val">$'+(d.est_cost_30d||0)+'</div><div class="d flat">'+(d.messages_30d||0)+' messages · estimation</div></div>'+
  '</div>'+
  '<div class="card" style="margin-bottom:14px"><h3 class="sec">Export</h3><div class="row">'+
   '<a class="btn ghost sm" href="/admin/api/export?type=conversations&format=csv&range=90">Conversations CSV</a>'+
   '<a class="btn ghost sm" href="/admin/api/export?type=conversations&format=json&range=90">Conversations JSON</a>'+
   '<a class="btn ghost sm" href="/admin/api/export?type=prospects&format=csv">Prospects CSV</a></div></div>'+
  '<div class="card"><h3 class="sec">Rétention &amp; purge</h3><div class="meta">Plus ancienne : '+fmt(d.oldest_at)+'. La purge automatique (90 j) tourne chaque nuit. Tu peux aussi purger manuellement maintenant.</div>'+
   '<div class="row" style="margin-top:10px"><button class="btn danger sm" onclick="purge()">Purger &gt; 90 jours maintenant</button></div></div>'})}
function purge(){if(!confirm('Supprimer définitivement les conversations de plus de 90 jours ?'))return;api('system/purge',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(function(r){toast((r.deleted||0)+' ligne(s) purgée(s)');viewSystem()})}

// ---------- ASSISTANT PRIVÉ ----------
var PKEY='mt_pchat_v1';
function pload(){try{var a=JSON.parse(localStorage.getItem(PKEY)||'[]');return Array.isArray(a)?a:[]}catch(e){return[]}}
function psave(a){try{localStorage.setItem(PKEY,JSON.stringify(a.slice(-60)))}catch(e){}}
function md2(s){return esc(s).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')}
function viewPrive(){setNav('prive');
 V.innerHTML='<div class="hd"><h2>Assistant privé</h2><div class="row"><span class="meta" id="pcorp">…</span> <button class="btn ghost sm" onclick="pclear()">Effacer l&#39;historique</button></div></div>'+
  '<div class="card" style="padding:0;display:flex;flex-direction:column;height:calc(100vh - 150px);min-height:420px">'+
  '<div id="pmsgs" style="flex:1;overflow-y:auto;padding:18px"></div>'+
  '<form id="pform" style="display:flex;gap:8px;padding:12px;border-top:1px solid var(--line);align-items:flex-end">'+
  '<textarea id="pin" rows="2" placeholder="Pose ta question — accès complet au dossier privé (aucun filtre, rien n&#39;est journalisé)…" style="flex:1;font:inherit;padding:9px 11px;border:1px solid var(--line);border-radius:9px;resize:vertical"></textarea>'+
  '<button class="btn" id="psend" type="submit">Envoyer</button></form></div>';
 api('corpus').then(function(d){var rows=d.data||[];var on=rows.filter(function(r){return r.enabled});var kb=Math.round(on.reduce(function(s,r){return s+r.size},0)/1024);
  var el=document.getElementById('pcorp');if(el)el.innerHTML=on.length+' document(s) actif(s) · ~'+kb+' Ko — <a href="#/corpus">gérer le corpus</a>'});
 prender();
 document.getElementById('pform').addEventListener('submit',function(ev){ev.preventDefault();psendMsg()});
 document.getElementById('pin').addEventListener('keydown',function(ev){if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();psendMsg()}});
}
function prender(){var el=document.getElementById('pmsgs');if(!el)return;var h=pload();
 el.innerHTML=h.length?h.map(function(m){var isU=m.role==='user';
  return '<div style="margin:0 0 12px;'+(isU?'text-align:right':'')+'">'+
   '<div style="display:inline-block;max-width:86%;text-align:left;padding:10px 13px;border-radius:'+(isU?'12px 12px 3px 12px':'12px 12px 12px 3px')+';background:'+(isU?'var(--acc)':'var(--soft)')+';color:'+(isU?'#fff':'var(--ink)')+';white-space:pre-wrap;font-size:.92rem;line-height:1.55">'+md2(m.content)+'</div></div>'
 }).join(''):'<div class="empty">Assistant privé — il connaît tout ton dossier (documents actifs du corpus). Sans filtre, sans limite, et rien n&#39;est journalisé.</div>';
 el.scrollTop=el.scrollHeight}
function pclear(){if(!confirm('Effacer l\'historique local de ce navigateur ?'))return;psave([]);prender()}
var pBusy=false;
function psendMsg(){if(pBusy)return;var inp=document.getElementById('pin');var t=(inp.value||'').trim();if(!t)return;
 pBusy=true;
 var h=pload();h.push({role:'user',content:t});psave(h);inp.value='';prender();
 var btn=document.getElementById('psend');if(btn){btn.disabled=true;btn.textContent='…'}
 var done=function(){pBusy=false;var b=document.getElementById('psend');if(b){b.disabled=false;b.textContent='Envoyer'}};
 var hist=pload().slice(-16);
 var clean=hist.slice(0,-1).filter(function(m){return !(m.role==='assistant'&&m.content.indexOf('⚠️')===0)});
 api('pchat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t,history:clean})})
 .then(function(d){done();
  var hh=pload();
  if(d.error){var msg='⚠️ Erreur : '+d.error+(d.status?' ('+d.status+')':'')+(d.detail?' — '+d.detail:'');
   if(d.status===429)msg+='\n(Corpus actif trop volumineux pour la limite API : désactive des documents dans « Corpus privé ».)';
   hh.push({role:'assistant',content:msg});psave(hh);prender();return}
  hh.push({role:'assistant',content:d.answer||'(réponse vide)'});psave(hh);prender()})
 .catch(function(){done();var hh=pload();hh.push({role:'assistant',content:'⚠️ Erreur réseau — réessaie.'});psave(hh);prender()})}

// ---------- CORPUS PRIVÉ ----------
function viewCorpus(){setNav('corpus');V.innerHTML='<div class="loading">Chargement…</div>';
 api('corpus').then(function(d){if(location.hash.replace(/^#\//,'').indexOf('corpus')!==0)return;var rows=d.data||[];
  var on=rows.filter(function(r){return r.enabled});var kb=Math.round(on.reduce(function(s,r){return s+r.size},0)/1024);
  var warn=kb>130?' <span style="color:var(--bad);font-weight:700">⚠ volumineux : risque de limite API (429) — désactive des documents</span>':'';
  V.innerHTML='<div class="hd"><h2>Corpus privé</h2><div class="meta">'+on.length+'/'+rows.length+' actifs · ~'+kb+' Ko actifs'+warn+'</div></div>'+
  '<div class="card"><strong>Importer des fichiers (.md, .txt)</strong>'+
  '<div class="row" style="margin-top:8px;align-items:center;gap:10px"><input type="file" id="cfiles" multiple accept=".md,.txt,text/plain,text/markdown"> '+
  '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="cactive" checked> activer après import</label> '+
  '<button class="btn sm" onclick="cimport()">Importer</button> <span class="meta" id="cimpst"></span></div>'+
  '<div style="margin-top:14px"><strong>Ou coller un document</strong>'+
  '<div class="row" style="margin-top:6px"><input id="cname" placeholder="Nom du document" style="padding:8px 10px;border:1px solid var(--line);border-radius:8px;width:280px;font:inherit"></div>'+
  '<textarea id="ccontent" rows="4" placeholder="Contenu (Markdown)…" style="width:100%;margin-top:6px;font:inherit;padding:9px 11px;border:1px solid var(--line);border-radius:9px"></textarea>'+
  '<div class="row" style="margin-top:6px"><button class="btn sm" onclick="cadd()">Ajouter</button></div></div></div>'+
  '<div class="card" style="margin-top:14px">'+(rows.length?rows.map(function(r){
   return '<div class="row" style="justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);gap:10px;flex-wrap:wrap">'+
    '<label style="display:flex;align-items:center;gap:9px;cursor:pointer;min-width:0"><input type="checkbox" '+(r.enabled?'checked':'')+' onchange="ctoggle('+r.id+',this.checked)"><strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px">'+esc(r.name)+'</strong></label>'+
    '<span class="meta" style="white-space:nowrap">'+Math.round(r.size/1024)+' Ko · '+fmt(r.updated_at)+' <button class="btn ghost sm" onclick="cview('+r.id+')">Voir</button> <button class="btn danger sm" onclick="cdel('+r.id+')">Suppr.</button></span></div>'
  }).join(''):'<div class="empty">Aucun document — importe ton dossier privé.</div>')+'</div>'})}
function ctoggle(id,en){api('corpus/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:en?1:0})}).then(function(){viewCorpus()})}
function cdel(id){if(!confirm('Supprimer ce document du corpus ?'))return;api('corpus/'+id,{method:'DELETE'}).then(function(){toast('Supprimé');viewCorpus()})}
function cview(id){api('corpus/'+id).then(function(d){if(!d.row){toast('Introuvable');return}
 document.getElementById('dTitle').textContent=d.row.name;
 document.getElementById('dBody').innerHTML='<pre style="white-space:pre-wrap;font-size:.85rem;line-height:1.5;margin:0">'+esc(d.row.content)+'</pre>';
 openDrawer()})}
function cadd(){var n=document.getElementById('cname').value.trim();var c=document.getElementById('ccontent').value;
 if(!n||!c.trim()){toast('Nom et contenu requis');return}
 api('corpus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,content:c})}).then(function(d){if(d&&d.error){toast('Refusé : '+d.error);return}toast('Ajouté');viewCorpus()})}
function cimport(){var f=document.getElementById('cfiles');var files=Array.prototype.slice.call((f&&f.files)||[]);
 if(!files.length){toast('Choisis des fichiers');return}
 var act=document.getElementById('cactive').checked?1:0;
 var st=document.getElementById('cimpst');var i=0;
 var ok=0,ko=0;
 (function next(){if(i>=files.length){toast(ok+' importé(s)'+(ko?' · '+ko+' échec(s)':''));viewCorpus();return}
  var file=files[i];if(st)st.textContent='Import '+(i+1)+'/'+files.length+' — '+file.name;
  var rd=new FileReader();
  rd.onerror=function(){ko++;i++;next()};
  rd.onload=function(){api('corpus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,content:String(rd.result||''),enabled:act})})
   .then(function(d){if(d&&d.error){ko++}else{ok++}i++;next()})
   .catch(function(){ko++;i++;next()})};
  rd.readAsText(file)})()}

// ---------- shared ----------
function seg(id,opts,cur,cb){var el=document.getElementById(id);if(!el)return;el.innerHTML=opts.map(function(o){return '<button data-v="'+o[0]+'" class="'+(o[0]===cur?'on':'')+'">'+o[1]+'</button>'}).join('');
 var bs=el.querySelectorAll('button');for(var i=0;i<bs.length;i++)bs[i].addEventListener('click',function(e){cb(e.target.getAttribute('data-v'))})}
function loadTodo(){api('prospects?status=new').then(function(d){var n=(d.data||[]).length;var b=document.getElementById('navTodo');if(b){b.textContent=n;b.style.display=n?'inline-block':'none'}})}

function router(){var h=location.hash.replace(/^#\//,'')||'dashboard';var qs={};var qi=h.indexOf('?');if(qi>=0){h.slice(qi+1).split('&').forEach(function(kv){var p=kv.split('=');qs[p[0]]=decodeURIComponent(p[1]||'')});h=h.slice(0,qi)}
 closeDrawer();
 if(h==='conversations')viewConversations(qs);
 else if(h==='prospects')viewProspects();
 else if(h==='prive')viewPrive();
 else if(h==='corpus')viewCorpus();
 else if(h==='system')viewSystem();
 else viewDashboard()}
window.addEventListener('hashchange',router);router();loadTodo();
</script></body></html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return handleAdmin(request, env, url, ctx);

    const origin = request.headers.get("Origin") || "";
    const ch = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: ch });
    if (url.pathname === "/lead" || url.pathname === "/lead/") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, ch);
      return handleLead(request, env, ch, ctx);
    }
    if (url.pathname === "/transcript" || url.pathname === "/transcript/") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, ch);
      return handleTranscript(request, env, ch, ctx);
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, ch);
    if (!env.ANTHROPIC_API_KEY) return json({ error: "missing_key" }, 500, ch);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400, ch); }
    const msg = (body.message || "").toString().slice(0, 1000);
    if (!msg.trim()) return json({ error: "empty_message" }, 400, ch);
    const sessionId = safeSid(body.session_id) || "anon";

    const hist = Array.isArray(body.history) ? body.history.slice(-12) : [];
    const messages = [];
    for (const t of hist) {
      if (t && typeof t.content === "string" && t.content.trim()) {
        messages.push({ role: t.role === "assistant" ? "assistant" : "user", content: t.content.slice(0, 4000) });
      }
    }
    while (messages.length && messages[0].role !== "user") messages.shift();
    messages.push({ role: "user", content: msg });

    const SYSTEM = await getSystem();
    const payload = { model: MODEL, max_tokens: 700, system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }], messages };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    let r;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } catch (e) { clearTimeout(timer); return json({ error: "upstream_timeout" }, 504, ch); }
    clearTimeout(timer);

    if (!r.ok) { const status = r.status === 429 ? 429 : 502; return json({ error: "upstream_error", status: r.status }, status, ch); }
    let data;
    try { data = await r.json(); } catch (e) { return json({ error: "upstream_parse" }, 502, ch); }
    let answer = "";
    if (Array.isArray(data.content)) answer = data.content.filter(b => b && b.type === "text").map(b => b.text).filter(Boolean).join("\n").trim();
    if (!answer) return json({ error: "empty_answer" }, 502, ch);

    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(logTurn(env, sessionId, msg, answer));
    return json({ answer }, 200, ch);
  },

  async scheduled(event, env, ctx) {
    if (!env || !env.DB) return;
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const job = env.DB.prepare("DELETE FROM conversations WHERE created_at < ?").bind(cutoff).run().catch(() => {});
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job); else await job;
  },
};
