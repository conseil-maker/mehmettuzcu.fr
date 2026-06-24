# Domaine de Compétence : Projet Reflektif — EdTech et IA

## Vue d'Ensemble
**Reflektif** est le projet phare de Mehmet TUZCU. C'est une plateforme EdTech d'orientation professionnelle basée sur la psychométrie et l'intelligence artificielle. Développée de A à Z en tant que fondateur solo, elle illustre parfaitement sa capacité à croiser développement logiciel complexe, psychométrie appliquée, et stratégie business institutionnelle.

## Le Problème Résolu
L'orientation professionnelle est aujourd'hui confrontée à un problème d'échelle et de coût :
- En France, un conseiller d'orientation accompagne en moyenne 1 200 personnes. Un bilan de compétences classique coûte entre 1 500 € et 3 000 € pour une durée de 12 semaines.
- En Turquie, le ratio est de 1 conseiller pour 486 élèves, laissant des millions de jeunes (sur une cible de 11,7 millions) sans accompagnement.

**La solution Reflektif :** Démocratiser l'orientation professionnelle de qualité grâce à l'IA. La plateforme offre un accompagnement scientifiquement fondé en 45 minutes pour environ 135 € (prix B2C), et est conçue pour être déployée par les institutions publiques en marque blanche (B2B/B2G).

## Architecture Scientifique et Psychométrique
Reflektif n'est pas un simple "wrapper" autour de ChatGPT. C'est un système scientifique complexe :

- **Tests psychométriques validés :** Intégration de 110 questions basées sur le modèle RIASEC (Holland, 30 questions), le Big Five / OCEAN (Costa & McCrae, 50 questions), et la théorie des valeurs (Schwartz/Super, 30 questions).
- **Moteur SmartMatch (Algorithme propriétaire) :** L'algorithme utilise le cosinus centré (Pearson) à 55% et la distance euclidienne à 45% pour faire correspondre le profil de l'utilisateur avec une base de données de **928 métiers** (référentiels O*NET, ROME, ESCO, ISCO).
- **Système Caméléon :** Une IA conversationnelle (basée sur Gemini 2.0 Flash) qui s'adapte automatiquement à 4 profils différents (collégien, lycéen, étudiant, adulte en reconversion) en utilisant des techniques d'entretien motivationnel (OARS) et de découverte guidée.

## Architecture Technologique
La plateforme a été entièrement codée par Mehmet TUZCU (plus de 21 153 lignes de code TypeScript, 198 fichiers).

| Composant | Technologie |
|---|---|
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, Shadcn/UI |
| **Backend** | Node.js, Express, tRPC 11, Drizzle ORM |
| **Base de données** | Supabase (PostgreSQL), hébergé en Europe (Francfort) |
| **IA Générative** | Google Gemini 2.0 Flash (Architecture RAG) |
| **Sécurité & Conformité** | TLS 1.3, AES-256, Cloudflare, conformité stricte RGPD (France) et KVKK (Turquie) |

## Résultats et Modèle Économique
- **Traction initiale :** Plus de 1 000 bénéficiaires ont utilisé la plateforme depuis son lancement en février 2026 (48% en reconversion, 52% étudiants).
- **Valorisation :** La plateforme est estimée entre 400 000 € et 600 000 € pre-money.
- **Dossiers institutionnels :** Dépôt de candidature à l'incubateur SEMIA (Grand Est) le 20 mai 2026 pour débloquer des subventions Bpifrance et régionales (jusqu'à 180 000 €).
- **Expansion internationale :** Reflektif est nativement multilingue (FR, TR, EN) et dispose d'une entité juridique en France (SASU en cours) et en Turquie (Reflektif Bilişim A.Ş. au Zaim Teknopark, Istanbul).

## Ce que ce projet démontre
Reflektif est la preuve tangible que Mehmet TUZCU n'est pas un consultant théorique. Il est un **architecte de systèmes scientifiques**. Il a pensé le modèle économique, intégré les contraintes légales (RGPD/KVKK, protection des mineurs), codé la plateforme entière, implémenté les modèles mathématiques, et géré le développement commercial institutionnel (Missions Locales, France Travail, MEB en Turquie). C'est cette polyvalence absolue qui fait sa force sur les grands projets d'État.
