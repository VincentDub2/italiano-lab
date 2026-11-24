# Rapport de validation — Italiano Lab

## Livré
Next.js App Router, TypeScript, Tailwind et composants Button/Card shadcn/ui. Interface française responsive, 18 expressions démo, révisions, difficultés, recherche/filtres, import Markdown manuel et persistance locale. Aucun vault connecté ou modifié. Pas de compte, synchronisation, IA de correction ou déploiement.

## Vérifications réellement exécutées par Hermes après Codex
- `npm install` : réussi, dépendances installées et package-lock actualisé. Le sandbox Codex bloquait la résolution npm ; l'installation depuis l'environnement parent a réussi.
- `npm run lint` : réussi.
- `npx tsc --noEmit` : réussi, y compris après ajout des tests navigateur.
- `npm test` : 4/4 réussis sous Node 22.12.0 après ajout de `--experimental-strip-types`. Intervalles, cartes dues/recherche, import/doublons, stockage corrompu.
- `npm run build` : compilation de production et génération statique réussies.
- `npx playwright test tests/browser.spec.ts --workers=1 --reporter=list` : 2/2 réussis sous Playwright 1.58.2 / Chromium. Révélation, évaluation, difficultés, persistance après reload, recherche, filtre, import, déduplication et absence de débordement sur cinq écrans à 390px. Aucun événement pageerror dans le parcours principal.
- Captures desktop et mobile générées dans artifacts et inspectées visuellement : présentation lisible, pas de chevauchement visible. Capture desktop par défaut Playwright (1280px), mobile 390px ; le viewport 1440px du brief n'a pas été explicitement capturé.
- `npm audit --omit=dev --json` : zéro vulnérabilité de production. Audit complet : huit vulnérabilités modérées dans l'outillage de développement, non corrigées automatiquement pour éviter les mises à jour majeures.

## Lancement
Serveur de production lancé localement sur http://127.0.0.1:3210 via `npm run start -- --hostname 127.0.0.1 --port 3210`.
Pour relancer : `npm run build` puis cette commande. Pour développer : `npm run dev`.

## Limites explicites
Intervalles fixes 10 minutes/1 jour/3 jours/7 jours, pas FSRS. La prononciation requiert une voix italienne disponible sur l'appareil ; l'écoute réelle n'a pas été vérifiée. Pas de synchronisation entre appareils ni de sauvegarde cloud. Données locales effaçables par le navigateur. Import manuel selon format README, pas de lecture directe Obsidian. Node 22.12 signale une incompatibilité engine d'une dépendance de développement ESLint ; les vérifications ont néanmoins réussi. Préférer Node 24 pour les prochaines installations.
