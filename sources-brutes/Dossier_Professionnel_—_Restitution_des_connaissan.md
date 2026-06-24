# Dossier Professionnel — Restitution des connaissances accumulées

> Document généré à partir de l'ensemble des échanges et projets réalisés ensemble. Seules les informations effectivement observées ou déduites de nos interactions sont incluses. Les lacunes sont explicitement signalées.

---

## SECTION 1 — PARCOURS ET HISTOIRE

### 1. Parcours professionnel connu

Ce que je sais avec certitude :

- Fondateur et développeur principal de **Reflektif**, une plateforme EdTech d'orientation professionnelle basée sur la psychométrie et l'intelligence artificielle.
- Opère sur le marché **France** (principal) et **Turquie** (expansion), avec une présence multilingue (FR, TR, EN).
- Expertise croisée entre **développement logiciel**, **psychométrie appliquée** et **stratégie business** — un profil extrêmement rare sur le marché.
- Travaille en mode fondateur solo/lean avec une maîtrise complète de la chaîne de valeur : de la recherche scientifique au code, du design au go-to-market.

### 2. Obstacles et défis surmontés

- **Complexité technique massive** : construction en solo d'un système combinant 3 tests psychométriques validés, un moteur de matching algorithmique (cosinus centré + euclidien), un système d'IA conversationnelle adaptatif (Système Caméléon), un catalogue de 928+ métiers avec 4 référentiels internationaux (O*NET, ROME, ESCO, ISCO), et un portail B2B — le tout en quelques mois.
- **Itération rapide face aux erreurs** : philosophie claire — contourner les blocages et avancer plutôt que rester paralysé. Revenir sur les problèmes une fois le reste stabilisé.
- **Positionnement marché** : différenciation face à des acteurs établis (İŞKUR en Turquie, conseillers privés en France) en misant sur le rapport qualité/prix et la rigueur scientifique.

### 3. Moments de bascule

- La décision de **passer d'un simple outil de test à une plateforme complète** intégrant IA conversationnelle, matching algorithmique et portail institutionnel — un pivot stratégique majeur.
- Le choix d'intégrer **Stripe pour la monétisation** et de structurer une offre B2B avec tarification par volume (jusqu'à 40% de réduction) — passage d'un projet à un vrai business.
- L'expansion vers la **Turquie** avec adaptation culturelle complète (pas juste une traduction — refonte des données marché, adaptation des prix en TL, email localisé iletisim@reflektif.net).

---

## SECTION 2 — RÉALISATIONS CONCRÈTES

### 4. Projets concrets

#### Reflektif — Plateforme d'orientation professionnelle IA

| Dimension | Détail |
|-----------|--------|
| **Contexte** | 80% des étudiants en France manquent d'accompagnement. En Turquie : ratio 1:486 conseiller/élève, 22.9% de NEET, 15.3% de chômage jeune |
| **Tests psychométriques** | RIASEC (30 questions, Holland 1997), Big Five (50 questions, Costa & McCrae 1992), Valeurs (30 questions, Schwartz/Super 1970) = 110 questions totales |
| **Moteur SmartMatch** | Blend cosinus centré (Pearson) 55% + euclidien 45%, pondération RIASEC 45% + Big Five 30% + Valeurs 25%, top 45 → re-ranking LLM → top 30 |
| **Système Caméléon** | IA conversationnelle avec 4 profils adaptatifs (collège, lycée, supérieur, adulte), technique OARS (Miller & Rollnick), Guided Discovery (Padesky 1993), approche narrative (Savickas), 5-7 questions par débriefing |
| **Catalogue** | 928+ métiers, 4 référentiels (O*NET, ROME, ESCO, ISCO), données salaires, formations, perspectives |
| **Portail B2B** | Gestion multi-établissements, tableau de bord conseiller, rapports PDF |
| **Monétisation** | Intégration Stripe, paiements, abonnements, codes promo |
| **Résultat** | Plateforme opérationnelle, multilingue (FR/TR/EN), avec offre B2C et B2B structurée |

#### Projet de bilan de compétences (antérieur)

- Application web de bilan de compétences avec intégration Wedof et Google Workspace.
- Intégration prévue avec Pennylane (facturation/comptabilité).
- Déploiement sur Cloudflare Workers.

#### Plugin IntelliJ IDEA pour AIGo

- Détection d'erreurs en temps réel, formatage de code, support débogage.

### 5. Chiffres et indicateurs

| Indicateur | Valeur |
|-----------|--------|
| Cibles adressables (Turquie) | **11,7 millions** (6,2M lycéens + 3,5M candidats YKS + 2M universitaires) |
| Métiers dans le catalogue | **928+** |
| Questions psychométriques | **110** validées scientifiquement |
| Référentiels internationaux | **4** (O*NET, ROME, ESCO, ISCO) |
| Croissance EdTech Turquie | **+25% annuel** |
| Prix B2B | ₺10.000/étudiant, dégressif jusqu'à ₺6.000 (-40%) |
| Validation scientifique RIASEC | **60+ ans** de recherche |

### 6. Réalisations dont tu sembles le plus fier

- La **rigueur scientifique** du système — insistance systématique sur les références (Holland, Costa & McCrae, Savickas, Padesky, Miller & Rollnick). Ce n'est pas un gadget IA, c'est de la science appliquée.
- Le **Système Caméléon** — l'adaptation de l'IA à 4 profils différents avec des techniques thérapeutiques réelles.
- Le **moteur SmartMatch** — l'algorithme de matching multi-dimensionnel, innovation technique phare.

---

## SECTION 3 — COMPÉTENCES ET MÉTHODE DE TRAVAIL

### 7. Compétences techniques observées

| Domaine | Technologies / Méthodes |
|---------|------------------------|
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, Shadcn/UI |
| **Backend** | Node.js, Express, tRPC 11, Drizzle ORM |
| **IA/LLM** | Gemini 2.5 Flash, prompt engineering avancé, structured outputs, system prompts complexes |
| **Psychométrie** | Modèles RIASEC, Big Five (OCEAN), théorie des valeurs de Schwartz |
| **Algorithmique** | Cosinus centré (Pearson), distance euclidienne, pondération multi-facteurs, re-ranking LLM |
| **Infrastructure** | Supabase, Stripe, S3, Cloudflare Workers, Google Workspace API, Vercel |
| **Design** | UI/UX, présentations B2B, vidéo marketing (Google Flow/Veo) |
| **Multilingue** | Français, turc, anglais — adaptation culturelle complète (pas simple traduction) |
| **Outils** | Google Apps Script, Wedof API, Pennylane |

### 8. Prise de décision et approche des problèmes

- **Approche modulaire et itérative** : découpage des problèmes en modules indépendants, avancement morceau par morceau, assemblage final.
- **Pragmatisme radical** : face à un blocage, contournement immédiat et retour ultérieur. Jamais de paralysie.
- **Data-driven** : décisions de pricing, positionnement et contenu toujours appuyées par des données (statistiques CEREQ, MEB, ÖSYM, YÖK).
- **Proactivité** : corrections immédiates sans demande de confirmation.
- **Vision d'ensemble** : pensée simultanée produit, science, business et marketing.

### 9. Valeurs et principes directeurs

- **Rigueur scientifique** : jamais de données inventées, toujours des sources vérifiables.
- **Accessibilité** : rendre la science de l'orientation accessible à tous, pas seulement aux privilégiés.
- **Efficacité** : faire plus avec moins, automatiser ce qui peut l'être, garder une structure lean.
- **Excellence technique** : code propre, algorithmes sophistiqués, UX soignée.
- **Impact social** : réduire le chômage jeune, améliorer l'orientation, démocratiser l'accès.

---

## SECTION 4 — RELATIONS ET IMPACT

### 10. Collaborations et partenaires

| Type | Entités |
|------|---------|
| **Cibles institutionnelles** | Lycées, universités, entreprises (offre B2B structurée avec tarification volume) |
| **Intégrations logicielles** | Wedof Assistance (bilan de compétences), Google Workspace, Pennylane |
| **Sources de données** | İŞKUR (Turquie), CEREQ (France), MEB, ÖSYM, YÖK |
| **Infrastructure** | Supabase, Stripe, Manus |

### 11. Impact humain et organisationnel

- **Cible directe** : 11,7 millions d'étudiants en Turquie qui n'ont pas accès à un accompagnement de qualité.
- **Problème systémique résolu** : le ratio 1:486 conseiller/élève signifie que la majorité des jeunes n'ont AUCUN accompagnement. Reflektif comble ce vide à grande échelle.
- **Démocratisation économique** : un conseiller privé coûte ₺5.000–30.000. Reflektif offre un accompagnement plus complet (3 tests + IA + 928 métiers + rapport) pour ₺10.000, et jusqu'à ₺6.000 en volume institutionnel.

### 12. Positionnement vis-à-vis du secteur

Le positionnement est celui du **pont entre la science et la technologie** dans un secteur dominé soit par des outils simplistes (tests en ligne basiques, mono-dimensionnels) soit par des services humains coûteux et non scalables. Ce n'est pas un "développeur qui fait de l'EdTech" — c'est un **ingénieur-chercheur qui construit un système scientifique** avec une couche technologique de pointe.

---

## SECTION 5 — VISION ET AMBITIONS

### 13. Vision à long terme

- Devenir **la référence en orientation professionnelle scientifique** sur les marchés francophones et turcophones.
- Passer du B2C au **B2B institutionnel à grande échelle** — travailler avec l'État, les ministères de l'Éducation, les grandes universités.
- Construire un **écosystème complet** : tests → IA → matching → rapport → suivi → insertion professionnelle.

### 14. Types de projets et missions qui attirent

- Les projets à **fort impact social** avec une base scientifique solide.
- Les projets combinant **IA + données + psychologie** pour résoudre des problèmes systémiques.
- Les **grands contrats institutionnels** (État, éducation nationale, universités).
- Les projets démontrant que **la technologie peut remplacer ou augmenter des services humains coûteux** tout en maintenant la qualité scientifique.

### 15. Différenciation fondamentale

Ce qui différencie fondamentalement ce profil d'un consultant ou d'un développeur classique :

1. **Architecte de systèmes scientifiques** — pas du code de features, mais l'implémentation de théories validées (Holland, Costa & McCrae, Savickas, Padesky, Miller & Rollnick).
2. **Intégrateur full-stack au sens large** — du papier scientifique au code, du code au business model, du business model au pitch commercial.
3. **Entrepreneur qui pense en systèmes** — chaque composant (test, IA, matching, rapport) est conçu pour fonctionner seul ET en synergie.
4. **Pont culturel** — opération naturelle entre la France et la Turquie, en adaptant (pas en traduisant) les approches.
5. **IA native** — ce n'est pas un ajout marketing, c'est structurellement intégré dans le produit (Caméléon, re-ranking, débriefing).

---

## CE QUE JE N'AI PAS PU RENSEIGNER

| Point | Lacune identifiée |
|-------|-------------------|
| Dates précises de parcours | Pas de chronologie (année de création de Reflektif, postes précédents, formation) |
| Formation académique | Diplômes, universités, spécialisations — inconnus |
| Postes antérieurs | Avant Reflektif, aucune information sur employeurs ou rôles |
| Équipe | Associés, employés, ou structure totalement solo — non confirmé |
| Levées de fonds / financement | Aucune information sur le modèle de financement |
| Clients actuels | Pas de noms d'établissements ou d'entreprises clientes |
| Chiffre d'affaires / métriques business | Pas de données financières réelles |
| Références personnelles | Pas de témoignages ou recommandations de tiers |
| Publications / interventions | Pas d'articles, conférences, ou publications académiques mentionnés |
| Parcours personnel | Lieu de résidence, nationalité(s), langues maternelles — déduits mais non confirmés |
| Projets avec l'État déjà réalisés | Pas d'historique de marchés publics |
| Certifications / agréments | Pas d'information sur des certifications professionnelles |

> Ces lacunes constituent les points prioritaires à renseigner pour compléter le dossier institutionnel.

---

*Document généré le 24 juin 2026*
