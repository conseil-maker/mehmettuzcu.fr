# Déployer l'assistant IA (Cloudflare Worker) — guide pas-à-pas

Le site **mehmettuzcu.fr** est statique (GitHub Pages). Pour activer l'assistant en
**mode LLM live**, on déploie un petit serveur autonome — un **Cloudflare Worker** —
qui reçoit la question du visiteur, interroge Gemini avec la fiche publique de Mehmet,
et renvoie la réponse. Le site l'appelle « à distance » (cross-origin).

> Rien à installer côté site. Le Worker est indépendant. Si Gemini est indisponible,
> l'assistant bascule automatiquement sur son **repli local** : il ne tombe jamais.

Vous avez besoin de :
- un compte **Cloudflare** (gratuit) ;
- une **clé API Gemini** (Google AI Studio → *Get API key*).

Le fichier à déployer est : **`worker.js`** (dans ce même dossier).

---

## Option A — Tableau de bord Cloudflare (recommandé, sans ligne de commande)

1. Connectez-vous sur **https://dash.cloudflare.com**.
2. Menu de gauche → **Workers & Pages**.
3. Cliquez **Create** (Créer) → onglet **Workers** → **Create Worker**.
4. Donnez-lui un nom, par exemple **`mehmet-assistant`** → **Deploy** (un Worker de
   démonstration est créé).
5. Cliquez **Edit code** (Modifier le code). Dans l'éditeur, **effacez tout** le contenu
   par défaut et **collez l'intégralité du fichier `worker.js`** de ce dossier.
6. Cliquez **Deploy** (Déployer) en haut à droite.
7. Ajoutez la clé Gemini en **Secret** (jamais en clair dans le code) :
   - Revenez à la page du Worker → onglet **Settings** (Paramètres).
   - Section **Variables and Secrets** (Variables et secrets) → **Add** (Ajouter).
   - Type : **Secret** (pas « Text »).
   - **Name / Nom** : `GEMINI_API_KEY`
   - **Value / Valeur** : votre clé Gemini.
   - **Save** (Enregistrer) puis **Deploy** si demandé.
8. Récupérez **l'URL du Worker**. Elle est de la forme :
   ```
   https://mehmet-assistant.<votre-sous-domaine>.workers.dev
   ```
   (visible en haut de la page du Worker, ou dans **Settings → Domains & Routes**).

➡️ **Notez cette URL : il faut la communiquer pour brancher l'assistant** (voir plus bas).

---

## Option B — En ligne de commande (wrangler)

Depuis ce dossier (`cloudflare-worker/`), dans un terminal :

```bash
# 1. Déployer le Worker (vous serez invité à vous connecter la 1re fois)
npx wrangler deploy worker.js

# 2. Enregistrer la clé Gemini en secret (on vous demandera de la coller)
npx wrangler secret put GEMINI_API_KEY
```

`wrangler` affiche l'URL publique du Worker à la fin du déploiement
(`https://mehmet-assistant.<votre-sous-domaine>.workers.dev`).

> Si `wrangler` demande un fichier `wrangler.toml`, vous pouvez en créer un minimal :
> ```toml
> name = "mehmet-assistant"
> main = "worker.js"
> compatibility_date = "2024-11-01"
> ```

---

## Tester le Worker

Une fois déployé, testez-le directement (remplacez `<URL>` par l'URL de votre Worker) :

```bash
curl -X POST <URL> \
  -H "Content-Type: application/json" \
  -d '{"message":"Qui es-tu ?"}'
```

Réponse attendue : un JSON `{"answer":"..."}` où Mehmet est présenté.

> Astuce : si vous obtenez `{"error":"missing_api_key"}`, le secret `GEMINI_API_KEY`
> n'est pas (ou mal) enregistré — refaites l'étape 7 (ou `wrangler secret put`).

---

## Brancher l'assistant sur le site

1. Ouvrez **`assistant.html`** (à la racine du site).
2. Tout en haut du `<script>`, repérez la ligne :
   ```js
   const CHAT_ENDPOINT = "";  // ← coller l'URL du Worker Cloudflare ici pour activer le LLM live
   ```
3. Collez **l'URL de votre Worker** entre les guillemets, par exemple :
   ```js
   const CHAT_ENDPOINT = "https://mehmet-assistant.votre-sous-domaine.workers.dev";
   ```
4. Enregistrez, commitez et redéployez le site (GitHub Pages).

> Tant que `CHAT_ENDPOINT` reste vide (`""`), le comportement est **inchangé** : le site
> tente `/api/chat` (qui n'existe pas sur GitHub Pages) et bascule sur le **repli local**.
> Dès que vous y mettez l'URL du Worker, l'assistant passe en **LLM live**.

---

## Bon à savoir

- **Free tier Cloudflare Workers** : jusqu'à **100 000 requêtes par jour** — largement
  suffisant pour une vitrine.
- **Free tier Gemini** : peut renvoyer ponctuellement des erreurs **429** (quota) ou
  **503** (surcharge). Ce n'est pas grave : l'assistant **bascule automatiquement sur son
  repli local** et continue de répondre à partir de la fiche publique. Il ne tombe jamais.
- **Sécurité** : la clé Gemini n'est **jamais** dans le code ni exposée au navigateur ;
  elle vit uniquement côté Worker, en *Secret*. L'accès est restreint à
  `https://mehmettuzcu.fr` (et `https://www.mehmettuzcu.fr`).
