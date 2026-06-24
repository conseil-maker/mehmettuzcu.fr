# Profil Professionnel — Mehmet TUZCU
**Fondateur & Président — REFLEKTIF FRANCE**
**Consultant en accompagnement des centres de formation | Expert Qualiopi**

---

> Document établi sur la base des échanges de travail accumulés. Chaque information est issue de données communiquées directement. Les lacunes sont explicitement signalées en fin de document.

---

## SECTION 1 — PARCOURS ET HISTOIRE

### 1. Parcours professionnel

Mehmet TUZCU est entrepreneur individuel (micro-entreprise) basé à **1B Rue de la Rochette, 67590 Schweighouse-sur-Moder (Alsace)**. Son SIRET est le **951 224 450 00019**, créé le **4 avril 2023**, activité NAF **6201Z** (Programmation informatique). Il est également **Fondateur & Président de REFLEKTIF FRANCE**, dont la création en SASU (capital 10 000 €) est en cours au moment de la rédaction de ce document.

En parallèle, il exerce en tant que **consultant en accompagnement des centres de formation**, avec une expertise directe sur les **exigences Qualiopi**. C'est cette double casquette — technique et terrain — qui structure son positionnement unique sur le marché de l'orientation professionnelle.

Il travaille avec **Netz Informatique** (Haguenau, Alsace), dont il est le dirigeant ou un associé clé. Les entités associées à son activité sont :

- **Reflektif France** (SASU en cours de création, siège Schweighouse-sur-Moder, NAF 6201Z)
- **Reflektif Bilişim A.Ş.** (entité turque, Zaim Teknopark, Istanbul)
- **Netz Informatique** (entité opérationnelle France, responsable de traitement RGPD)

**Coordonnées professionnelles :** mehmet@reflektif.net — 06 82 89 34 82

### 2. Obstacles et défis surmontés

Plusieurs défis ont été observés et abordés avec méthode :

La **création de SASU** constitue un chantier structurant : Mehmet a engagé le cabinet comptable "Ça Compte pour Moi" (contact : Quentin) pour structurer la société, avec une urgence liée à l'incubateur SEMIA dont la candidature a été déposée le 20 mai 2026.

La **cohérence documentaire** est un défi permanent : Mehmet contrôle et corrige systématiquement les incohérences entre documents (chiffres, formulations, données techniques vs marketing), révélant une rigueur peu commune chez un fondateur qui opère seul sur plusieurs fronts simultanément.

La **gestion de prestataires commerciaux** a nécessité des recadrages clairs : notamment sur une facture incorrecte de Jamel El Hamri (répercussion de charges URSSAF), traitée avec fermeté et sans conflit.

La **double conformité RGPD/KVKK** (France et Turquie) a été traitée en profondeur avec une DPIA réalisée le 7 mai 2026, bien avant toute démarche commerciale institutionnelle.

### 3. Moments de bascule

Le **dépôt de candidature à SEMIA** le 20 mai 2026 (projet #4795, filière Numérique B2B) est le premier acte officiel de structuration institutionnelle de Reflektif. Il a été préparé avec soin — corrections de dernière minute, contrôle qualité complet — et conditionne l'accès aux aides Grand Est (Start-Up Volet 1 : 30 000 €, Volet 2 : 150 000 € bonus IA).

Le **passage de 920 à 928 métiers** dans la base de données, corrigé avant soumission du dossier SEMIA, illustre le niveau d'exigence documentaire : aucun chiffre approximatif n'est accepté dans un document officiel.

---

## SECTION 2 — RÉALISATIONS CONCRÈTES

### 4. Projets concrets

#### REFLEKTIF — Plateforme d'orientation professionnelle par l'IA

**Contexte :** En France, un conseiller d'orientation accompagne en moyenne 1 200 personnes. Les bilans de compétences classiques coûtent entre 1 500 et 3 000 € et durent 12 semaines. L'orientation professionnelle n'a pas évolué structurellement depuis des décennies.

**Problème résolu :** Rendre accessible un accompagnement d'orientation de qualité, scientifiquement fondé, en 45 minutes et pour 135 €, via une plateforme utilisable par les institutions publiques en marque blanche.

**Description technique :**

- **Tests psychométriques :** RIASEC (30 questions) + Big Five (50 questions) + Valeurs professionnelles (30 questions) = **110 questions au total**
- **Base de métiers :** **928 métiers** bilingues FR/TR avec données salariales, codes ROME, perspectives d'évolution
- **Algorithme de matching :** cosinus centré + distance euclidienne (pondération 55%/45%)
- **Agents IA :** RAG (Retrieval-Augmented Generation) via Google Gemini 2.0 Flash
- **Rapport généré :** 15 à 25 pages, automatiquement, sans intervention humaine
- **"Système Caméléon" :** adaptation automatique du niveau de langage selon le profil (lycéen / supérieur / adulte en reconversion)
- **"Living Tests" :** débriefings conversationnels IA post-test
- **Portail conseiller :** pipeline de suivi des bénéficiaires, accès aux données brutes jusqu'à génération du rapport, puis suppression des données de test (conformité RGPD/KVKK), rapport conservé accessible au conseiller

**Architecture technique :**

| Composant | Technologie |
|---|---|
| Backend | Railway |
| Base de données | Supabase (PostgreSQL, Francfort eu-central-1) |
| IA générative | Google Gemini 2.0 Flash |
| CDN / Sécurité | Cloudflare |
| Chiffrement | TLS 1.3, AES-256 |
| Authentification | OAuth 2.0 |
| Tests E2E | Playwright (68 tests, 55 passés) |
| Codebase | 21 153 lignes TypeScript, 198 fichiers |

**URLs :** etudiant.reflektif.net (France) / ogrenci.reflektif.net (Turquie)

**État d'avancement :** MVP à ~89% au moment du dépôt SEMIA (mai 2026). Opérationnel depuis **février 2026**.

#### KIT COMMERCIAL FRANCE — Dossier institutionnel

Cinq documents professionnels produits pour la prospection B2B/B2G en France : Sommaire, Dossier de présentation, Fiche conformité & sécurité RGPD, Fiche résultats & impact, Fiche proposition pilote. Tous conformes RGPD, anonymisés (marque blanche), avec section mineurs, rétention 3 ans, et offre pilote 3 accès gratuits.

#### KIT COMMERCIAL TURQUIE — Dossier institutionnel

Cinq documents équivalents en turc, adaptés au contexte local : entité Reflektif Bilişim A.Ş., conformité KVKK (Kanun 6698), sans mention hébergement Europe, sans Qualiopi (inconnu en Turquie).

#### DOSSIER SEMIA — Candidature incubateur

Dossier complet déposé le 20 mai 2026 auprès de SEMIA (incubateur Alsace), filière Numérique B2B, projet #4795. Corrections appliquées avant soumission : 920→928 métiers, CA 100K→150K€, niveau BAC+3, adresse, attentes révisées.

### 5. Chiffres et indicateurs retenus

| Indicateur | Valeur |
|---|---|
| Bénéficiaires accompagnés | +1 000 depuis février 2026 |
| Dont en reconversion professionnelle | 48% |
| Dont étudiants | 52% |
| Métiers dans la base | 928 |
| Questions psychométriques | 110 |
| Durée du parcours complet | ~45 minutes |
| Pages du rapport généré | 15 à 25 pages |
| Objectif CA 2026 | 150 000 € |
| Prix unitaire jeton | 135 € |
| Offre pilote | 3 accès gratuits (ajustables) |
| Prospect Mission Locale Mantois | 500 jetons = 67 500 € |
| Capital SASU | 10 000 € |
| Financement visé (Grand Est) | 30 000 € (Volet 1) + 150 000 € (Volet 2) |
| Financement visé (Bourse French Tech) | 50 000 € |

### 6. Réalisations auxquelles Mehmet accorde le plus d'importance

Deux éléments ressortent nettement dans tous les échanges : le **portail conseiller** — Mehmet insiste systématiquement sur le fait que l'IA n'est pas autonome et que le conseiller reste décisionnaire — et la **conformité RGPD/KVKK** — il a fait réaliser une DPIA complète et corrige immédiatement les inexactitudes documentaires. Ce sont les deux preuves de maturité qu'il met en avant face aux institutions publiques.

---

## SECTION 3 — COMPÉTENCES ET FAÇON DE TRAVAILLER

### 7. Compétences techniques observées

**Développement :**
- Full-stack TypeScript (React, Node.js, tRPC, Drizzle ORM)
- Bases de données : MySQL/TiDB, PostgreSQL (Supabase)
- Stockage objet : S3
- Tests E2E : Playwright

**Architecture cloud :**
- Railway (backend), Supabase (BDD), Cloudflare (CDN), Google Cloud (IA)
- Sécurité : TLS 1.3, AES-256, OAuth 2.0, isolation multi-tenant

**Intelligence artificielle :**
- Intégration Google Gemini 2.0 Flash
- Architecture RAG (Retrieval-Augmented Generation)
- Psychométrie appliquée (RIASEC, Big Five, modèles de valeurs)

**Conformité et réglementation :**
- RGPD (France) — DPIA, Privacy by Design, gestion des rétentions
- KVKK Kanun 6698 (Turquie)
- Qualiopi (consultant actif en centres de formation)

**Gestion de projet :**
- Sprints numérotés, documentation technique structurée
- GitHub (repo privé conseil-maker/reflektif)
- Google Workspace (Gmail, Drive, Chat, Meet, Gemini, NotebookLM, Voice)

### 8. Prise de décision et méthode de travail

Mehmet travaille par **itérations rapides mais exige la rigueur sur les fondamentaux**. Quand un document contient une inexactitude, il la corrige immédiatement — même si c'est un détail (920 vs 928 métiers, 24 mois vs 3 ans de rétention). Il ne laisse pas passer les approximations dans les documents officiels.

Il **délègue la prospection commerciale** (Jamel, Halil, Tülay) mais garde la main sur le fond et la qualité. Il produit lui-même les documents de référence, contrôle les livrables, et valide avant envoi.

Sa méthode face à un problème complexe : identifier la source de vérité (code source, DPIA, données réelles), corriger à la racine, puis propager la correction dans tous les documents dérivés.

### 9. Valeurs et principes directeurs

**Rigueur documentaire :** contrôle systématique des sources (GitHub, code source, DPIA), correction immédiate des inexactitudes.

**Transparence technique :** refus des affirmations non vérifiables dans les documents commerciaux (ex. : "100% Qualiopi" remplacé par "facilite la démonstration des exigences Qualiopi").

**Respect des personnes :** dans les échanges avec Jamel, Halil, Tülay, ton chaleureux, respectueux des croyances et des cultures. Fraternité sincère dans les communications (Assalaamou 'alaykoum, incha Allâh, qu'Allâh facilite).

**Kul hakkı :** ne jamais faire travailler quelqu'un sans garantie de paiement. Principe appliqué concrètement dans la gestion des prestataires.

**Absence de riba :** tous les financements recherchés sont des subventions ou crédits d'impôt — aucun crédit bancaire.

**Urgence maîtrisée :** avancer vite mais préparer bien (dossier SEMIA corrigé avant soumission, documents audités avant envoi).

---

## SECTION 4 — RELATIONS ET IMPACT

### 10. Collaborateurs, partenaires et institutions mentionnés

| Personne / Structure | Rôle |
|---|---|
| Jamel EL HAMRI | Chargé de développement commercial France (jamel@reflektif.net, 03 56 89 46 93 / 06 51 92 22 13) |
| Halil KILIÇ | Développement commercial Turquie (halil@reflektif.net, +90 533 498 18 66) |
| Tülay (prénom) | Collaboratrice / ambassadrice — RDV avec responsable France Travail Grand Est |
| Mikail LEKESIZ | Collaborateur (mikail@netzinformatique.fr) |
| Quentin | Cabinet "Ça Compte pour Moi" — création SASU |
| SEMIA | Incubateur Alsace — candidature déposée le 20 mai 2026 |
| France Travail Grand Est | Prospect institutionnel majeur (via Tülay) |
| Mission Locale du Mantois | Prospect commercial (500 jetons, 67 500 €) |
| Mairie de Limay | Prospect (RDV maire via Jamel) |
| Association nationale des réussites éducatives | 250 villes — président engagé à promouvoir Reflektif |
| Mission Locale Savigny-le-Temple | Prospect (RDV Mme le maire juin-juillet 2026) |
| Mission Locale Mantes-la-Jolie | Prospect (RDV directrice en cours) |

### 11. Impact humain et organisationnel

Plus de **1 000 bénéficiaires** ont utilisé la plateforme depuis février 2026, dont 48% en reconversion professionnelle et 52% étudiants. Le produit s'adresse à des publics en situation de vulnérabilité (demandeurs d'emploi, jeunes sans orientation, personnes en reconversion) et leur offre un outil à **135 €** là où un bilan classique coûte entre 1 500 et 3 000 €.

La protection des mineurs est intégrée nativement : consentement parental obligatoire côté serveur pour tout utilisateur de moins de 18 ans.

### 12. Positionnement sectoriel

Mehmet ne se positionne pas comme un concurrent des cabinets d'orientation — il se positionne comme une **infrastructure** que les institutions (France Travail, Missions Locales, centres de formation) peuvent adopter en **marque blanche**. Il insiste sur le fait que l'IA augmente le conseiller sans le remplacer. C'est un positionnement **B2G / B2B institutionnel**, pas grand public.

---

## SECTION 5 — VISION ET AMBITIONS

### 13. Vision à long terme

Construire la **plateforme d'orientation professionnelle de référence en France et en Turquie**, déployable en marque blanche par les institutions publiques, avec un module Bilan de Compétences Qualiopi en développement. L'objectif est de démocratiser l'accès à un outil de qualité pour des publics qui n'ont pas les moyens d'un bilan classique.

La double implantation France / Turquie n'est pas un hasard : Mehmet est né le **28 octobre 1992 à Fatsa (Turquie)**, arrivé en France à 10 ans, français natif et turc natif. Il incarne personnellement le pont entre les deux pays et les deux marchés.

### 14. Types de projets et missions qui l'attirent

Les **grands projets institutionnels** (État, collectivités, organismes publics), les **partenariats à fort impact social**, et les **dispositifs de financement public** (JEI, CIR/CII, Bpifrance, Grand Est Start-Up, Bourse French Tech, Édu-Up). Il n'est pas dans une logique de croissance rapide par le grand public — il construit des partenariats solides avec des décideurs.

### 15. Ce qui le différencie fondamentalement

Mehmet est simultanément :

- Le **développeur** : il a construit la plateforme lui-même, il connaît le code ligne par ligne (21 153 lignes TypeScript, 198 fichiers, architecture complète).
- L'**expert métier** : consultant Qualiopi actif, il connaît les exigences des centres de formation de l'intérieur.
- L'**entrepreneur commercial** : il structure les dossiers institutionnels, gère les partenaires commerciaux, prospecte les décideurs publics.

Cette **triple compétence** est extrêmement rare. La plupart des startups EdTech ont soit un profil tech, soit un profil expert métier — rarement les deux dans la même personne, et encore plus rarement combinés avec la capacité à construire un dossier institutionnel de haut niveau.

---

## CE QUE JE N'AI PAS PU RENSEIGNER

Les points suivants n'ont pas été communiqués dans nos échanges et constituent des lacunes à combler pour un dossier institutionnel complet :

- **Parcours avant 2023 :** aucun détail sur les postes antérieurs, formations, diplômes (une Licence BAC+3 est mentionnée dans le dossier SEMIA mais sans préciser le domaine ni l'établissement).
- **Activité de consultant :** nom de la structure, clients ou références associés à l'activité de conseil en centres de formation.
- **Détails financiers de Netz Informatique :** CA, effectifs, date de création.
- **Références clients passées :** liste de clients ou de missions réalisées avant Reflektif.
- **Formation académique détaillée :** domaine de la Licence, établissement, année d'obtention.
- **Résultats des RDV en cours :** maire de Limay (prévu le 13 juin 2026), directrice Mission Locale Mantes-la-Jolie, responsable France Travail Grand Est.
- **État d'avancement de la création de SASU** avec Quentin (cabinet Ça Compte pour Moi).
- **Résultat de la candidature SEMIA** (en attente — commission Quest for Change, résultat attendu ~juillet 2026).

---

*Document généré le 24 juin 2026 — à compléter avec les informations manquantes avant soumission institutionnelle.*
