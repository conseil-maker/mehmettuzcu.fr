# Assistant mehmettuzcu.fr — proxy Claude via Cloudflare Worker

Le site est statique (GitHub Pages) : la clé Anthropic ne peut pas vivre dans le
navigateur. Ce Worker Cloudflare la garde côté serveur (en **Secret**), appelle
Claude (Anthropic) et renvoie `{ "answer": "..." }`. CORS limité à mehmettuzcu.fr.

## Déploiement — Dashboard Cloudflare (recommandé)

1. **Récupérer le code** : copier tout le contenu de `worker.js` (bouton « Copy raw file » sur GitHub).
2. **Créer le Worker** : [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**
   → **Create** → **Create Worker** → nommer ex. `assistant-mehmet` → **Deploy**.
3. **Coller le code** : **Edit code** → tout sélectionner / supprimer → coller `worker.js` → **Deploy**.
4. **Ajouter la clé en Secret** : Worker → **Settings** → **Variables and Secrets** → **Add** →
   type **Secret**, nom **`ANTHROPIC_API_KEY`**, valeur = la clé `sk-ant-…` → **Save** (re-Deploy si demandé).
5. **URL du Worker** : de la forme `https://assistant-mehmet.<sous-domaine>.workers.dev`.
   → **Communiquer cette URL** pour la brancher dans `assistant.html` (`CHAT_ENDPOINT`).

## Test (après déploiement)

```bash
curl -X POST <URL_DU_WORKER> \
  -H "Content-Type: application/json" \
  -H "Origin: https://mehmettuzcu.fr" \
  -d '{"message":"Qui es-tu ?"}'
```

Doit renvoyer `{"answer":"..."}`.

## Alternative — CLI wrangler

```bash
npx wrangler deploy worker.js
npx wrangler secret put ANTHROPIC_API_KEY   # coller la clé sk-ant-…
```

## Notes

- Modèle : `claude-opus-4-8` (qualité maximale). Pour des réponses plus rapides/moins chères,
  remplacer `const MODEL = "claude-opus-4-8"` par `"claude-sonnet-4-6"` dans `worker.js`.
- Free tier Cloudflare Workers : 100 000 requêtes/jour. Coût Anthropic : quelques centimes/mois
  à ce volume (le prompt système est mis en cache via `cache_control`).
- Aucune clé n'est jamais en dur dans le code : elle vit uniquement dans le Secret `ANTHROPIC_API_KEY`.
- Repli : si le Worker renvoie une erreur (429/5xx) ou est injoignable, l'assistant bascule
  automatiquement sur son moteur local embarqué — il ne tombe jamais.
