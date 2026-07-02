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
  const sid = (b.session_id || "").toString().slice(0, 64) || null;
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
  const sid = (b.session_id || "").toString().slice(0, 64) || null;
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

// -------- Routeur /admin --------
async function handleAdmin(request, env, url, ctx) {
  const st = checkAuth(request, env);
  if (st === "unset") return new Response("Panneau non configuré : ajoutez la variable secrète ADMIN_PASSWORD au Worker, puis redéployez.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (st !== "ok") return authChallenge();
  if (!env.DB) return json({ error: "d1_unbound" }, 503, null);

  const path = url.pathname;
  const q = Object.fromEntries(url.searchParams.entries());
  let body = {};
  if (request.method === "POST" || request.method === "PATCH") { try { body = await request.json(); } catch (e) { body = {}; } }
  const seg = path.replace(/^\/admin\/api\//, "").replace(/\/$/, "");

  try {
    if (path === "/admin" || path === "/admin/") return new Response(ADMIN_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    if (path === "/admin/api/overview") return json(await apiOverview(env, parseInt(q.range || "7", 10) || 7), 200, null);
    if (path === "/admin/api/conversations" && request.method === "GET") return json(await apiConversations(env, q), 200, null);
    if (path === "/admin/api/prospects" && request.method === "GET") return json(await apiProspects(env, q), 200, null);
    if (path === "/admin/api/system") return json(await apiSystem(env), 200, null);
    if (path === "/admin/api/system/purge" && request.method === "POST") return json(await apiPurge(env, body), 200, null);
    if (path === "/admin/api/export") return apiExport(env, q);
    // /admin/api/conversations/:sid[/action]
    let m;
    if ((m = path.match(/^\/admin\/api\/conversations\/([^/]+)$/)) && request.method === "GET") return json(await apiConversationDetail(env, decodeURIComponent(m[1])), 200, null);
    if ((m = path.match(/^\/admin\/api\/conversations\/([^/]+)\/flag$/)) && request.method === "POST") return json(await apiFlag(env, decodeURIComponent(m[1]), body), 200, null);
    if ((m = path.match(/^\/admin\/api\/conversations\/([^/]+)\/promote$/)) && request.method === "POST") return json(await apiPromote(env, decodeURIComponent(m[1]), ctx), 200, null);
    if ((m = path.match(/^\/admin\/api\/conversations\/([^/]+)\/delete$/)) && request.method === "POST") return json(await apiDelete(env, decodeURIComponent(m[1]), q.hard === "1"), 200, null);
    if ((m = path.match(/^\/admin\/api\/prospects\/(\d+)$/)) && request.method === "PATCH") return json(await apiProspectPatch(env, parseInt(m[1], 10), body), 200, null);
    if ((m = path.match(/^\/admin\/api\/prospects\/(\d+)$/)) && request.method === "DELETE") return json(await apiProspectDelete(env, parseInt(m[1], 10)), 200, null);
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

// ---------- shared ----------
function seg(id,opts,cur,cb){var el=document.getElementById(id);if(!el)return;el.innerHTML=opts.map(function(o){return '<button data-v="'+o[0]+'" class="'+(o[0]===cur?'on':'')+'">'+o[1]+'</button>'}).join('');
 var bs=el.querySelectorAll('button');for(var i=0;i<bs.length;i++)bs[i].addEventListener('click',function(e){cb(e.target.getAttribute('data-v'))})}
function loadTodo(){api('prospects?status=new').then(function(d){var n=(d.data||[]).length;var b=document.getElementById('navTodo');if(b){b.textContent=n;b.style.display=n?'inline-block':'none'}})}

function router(){var h=location.hash.replace(/^#\//,'')||'dashboard';var qs={};var qi=h.indexOf('?');if(qi>=0){h.slice(qi+1).split('&').forEach(function(kv){var p=kv.split('=');qs[p[0]]=decodeURIComponent(p[1]||'')});h=h.slice(0,qi)}
 closeDrawer();
 if(h==='conversations')viewConversations(qs);
 else if(h==='prospects')viewProspects();
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
    const sessionId = (body.session_id || "").toString().slice(0, 64) || "anon";

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
