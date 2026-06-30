// Cloudflare Worker — proxy Claude (Anthropic) pour l'assistant de mehmettuzcu.fr
// Clé secrète : ANTHROPIC_API_KEY (Settings → Variables and Secrets, type Secret).
// La fiche publique (prompt système) est chargée en LIVE depuis FICHE_URL :
//   → pour enrichir l'assistant, il suffit de modifier assets/fiche-publique.txt
//     dans le dépôt ; AUCUN redéploiement du Worker n'est nécessaire (cache ~5 min).
// CORS limité à mehmettuzcu.fr. Aucune clé en dur.

const FICHE_URL = "https://mehmettuzcu.fr/assets/fiche-publique.txt";
const MODEL = "claude-sonnet-4-6";
const ALLOWED = ["https://mehmettuzcu.fr", "https://www.mehmettuzcu.fr"];

// Repli minimal si la fiche live est injoignable (rare).
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
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...ch, "Content-Type": "application/json" },
  });
}

// Journalisation anonyme d'un échange dans Cloudflare D1 (binding env.DB).
// Sans binding D1, c'est un no-op : le Worker fonctionne exactement comme avant.
function logTurn(env, sessionId, question, answer) {
  if (!env || !env.DB) return Promise.resolve();
  return env.DB
    .prepare("INSERT INTO conversations (session_id, created_at, question, answer) VALUES (?, ?, ?, ?)")
    .bind(sessionId, Date.now(), question, answer)
    .run()
    .catch(() => {}); // la journalisation ne doit JAMAIS casser la réponse
}

// ============================== PANNEAU ADMIN ==============================
function htmlEscape(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function fmtTime(ms) {
  try { return new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC"; }
  catch (e) { return ""; }
}
function adminUnauthorized() {
  return new Response("Authentification requise.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Admin mehmettuzcu.fr", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

async function handleAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return new Response("Panneau non configuré : ajoutez la variable secrète ADMIN_PASSWORD au Worker (Settings → Variables and Secrets), puis redéployez.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  // Auth HTTP Basic : le navigateur affiche une fenêtre de connexion.
  const auth = request.headers.get("Authorization") || "";
  let ok = false;
  if (auth.startsWith("Basic ")) {
    try {
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(auth.slice(6)), c => c.charCodeAt(0)));
      const pass = decoded.slice(decoded.indexOf(":") + 1);
      ok = pass === env.ADMIN_PASSWORD;
    } catch (e) { ok = false; }
  }
  if (!ok) return adminUnauthorized();

  if (!env.DB) return new Response("Base D1 non liée.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  let rows = [];
  try {
    const res = await env.DB
      .prepare("SELECT session_id, created_at, question, answer FROM conversations ORDER BY created_at DESC LIMIT 800")
      .all();
    rows = (res && res.results) ? res.results : [];
  } catch (e) {
    return new Response("Erreur base de données : " + e.message, { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  // Regroupement par session ; tours en ordre chronologique ; sessions les plus récentes d'abord.
  const map = new Map();
  for (const r of rows) {
    const sid = r.session_id || "anon";
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid).push(r);
  }
  const sessions = [...map.entries()].map(([sid, turns]) => {
    turns.sort((a, b) => a.created_at - b.created_at);
    return { sid, turns, first: turns[0].created_at, last: turns[turns.length - 1].created_at };
  }).sort((a, b) => b.last - a.last);

  const totalTurns = rows.length;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const turns24 = rows.filter(r => r.created_at >= dayAgo).length;

  let blocks = "";
  for (const s of sessions) {
    let turnsHtml = "";
    for (const t of s.turns) {
      turnsHtml +=
        '<div class="turn">' +
          '<div class="bub q"><span class="lbl">Visiteur</span>' + htmlEscape(t.question) + '</div>' +
          '<div class="bub a"><span class="lbl">Assistant</span>' + htmlEscape(t.answer) + '</div>' +
          '<div class="ts">' + fmtTime(t.created_at) + '</div>' +
        '</div>';
    }
    blocks +=
      '<section class="sess">' +
        '<div class="sh"><code>' + htmlEscape(s.sid) + '</code>' +
        '<span class="meta">' + s.turns.length + ' échange(s) · ' + fmtTime(s.first) + ' → ' + fmtTime(s.last) + '</span></div>' +
        turnsHtml +
      '</section>';
  }
  if (!sessions.length) blocks = '<p class="empty">Aucune conversation pour l\'instant.</p>';

  const html =
'<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<meta name="robots" content="noindex,nofollow"><title>Conversations — assistant</title><style>' +
':root{--ink:#16242c;--muted:#6b7680;--accent:#1f5673;--line:#e2e7ea;--bg:#f4f6f7}' +
'*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.5}' +
'header{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--line);padding:16px 20px;display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap}' +
'header h1{font-size:1.15rem;margin:0}.stats{color:var(--muted);font-size:.9rem}.stats b{color:var(--accent)}' +
'main{max-width:880px;margin:0 auto;padding:20px 16px 60px}' +
'.sess{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0 0 18px}' +
'.sh{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;border-bottom:1px dashed var(--line);padding-bottom:10px;margin-bottom:12px}' +
'.sh code{font-size:.78rem;color:var(--accent);background:#eef3f6;padding:2px 8px;border-radius:6px}' +
'.sh .meta{color:var(--muted);font-size:.8rem}' +
'.turn{margin:0 0 14px}.bub{border-radius:12px;padding:9px 13px;margin:0 0 6px;white-space:pre-wrap;word-break:break-word}' +
'.bub .lbl{display:block;font-size:.68rem;font-weight:700;letter-spacing:.4px;text-transform:uppercase;opacity:.65;margin-bottom:3px}' +
'.bub.q{background:#eef1f3}.bub.a{background:#e8f0f4;border:1px solid #d7e4ec}' +
'.ts{font-size:.72rem;color:var(--muted);text-align:right}' +
'.empty{color:var(--muted);text-align:center;padding:50px 0}' +
'</style></head><body>' +
'<header><h1>Conversations de l\'assistant</h1>' +
'<div class="stats"><b>' + sessions.length + '</b> session(s) · <b>' + totalTurns + '</b> échange(s) · <b>' + turns24 + '</b> sur 24 h</div>' +
'</header><main>' + blocks + '</main></body></html>';

  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
// ==========================================================================

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const ch = corsHeaders(origin);

    // Panneau d'administration (lecture des conversations) — protégé par mot de passe.
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/admin" || url.pathname === "/admin/")) {
      return handleAdmin(request, env);
    }

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: ch });
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

    const payload = {
      model: MODEL,
      max_tokens: 700,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages,
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    let r;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      return json({ error: "upstream_timeout" }, 504, ch);
    }
    clearTimeout(timer);

    if (!r.ok) {
      const status = r.status === 429 ? 429 : 502;
      return json({ error: "upstream_error", status: r.status }, status, ch);
    }

    let data;
    try { data = await r.json(); } catch (e) { return json({ error: "upstream_parse" }, 502, ch); }

    let answer = "";
    if (Array.isArray(data.content)) {
      answer = data.content.filter(b => b && b.type === "text").map(b => b.text).filter(Boolean).join("\n").trim();
    }
    if (!answer) return json({ error: "empty_answer" }, 502, ch);

    // Journalisation anonyme (asynchrone : n'ajoute pas de latence à la réponse).
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(logTurn(env, sessionId, msg, answer));

    return json({ answer }, 200, ch);
  },

  // Purge automatique : conservation limitée à 90 jours.
  // Déclenchée par un Cron Trigger quotidien (Worker → Settings → Triggers → Cron).
  async scheduled(event, env, ctx) {
    if (!env || !env.DB) return;
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const job = env.DB.prepare("DELETE FROM conversations WHERE created_at < ?").bind(cutoff).run().catch(() => {});
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job); else await job;
  },
};
