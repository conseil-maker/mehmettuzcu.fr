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

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const ch = corsHeaders(origin);

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
