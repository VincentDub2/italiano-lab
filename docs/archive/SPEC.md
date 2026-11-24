# Italiano Lab — prototype fonctionnel

## Objectif
Application personnelle de révision d'italien pour un francophone vivant à Milan. Next.js App Router + TypeScript + Tailwind + vrais composants shadcn/ui. UI française, contenu italien. Livrer une app exécutable et testée, pas une maquette statique.

## Limites et sécurité
Tout travail dans italiano-lab. Ne lire/modifier aucun vault Obsidian réel, profil Hermes, secret ou config globale. Pas de cloud, API payante, auth, déploiement, publication ou commit. Les cours de démonstration sont explicitement étiquetés. Ne pas prétendre qu'une synchronisation Obsidian ou une correction IA existe. Import manuel uniquement. Aucune commande destructive hors projet.

## Stack
Next.js App Router, React, TypeScript strict, Tailwind. Installer les dépendances et utiliser réellement shadcn/ui (Button, Card, Badge, Input, Tabs ou composants adaptés). Lucide pour icônes. Pas de dépendance à Google Fonts à la compilation : polices système. Logique de révision isolée et testable. Aucun backend nécessaire au prototype.

## Direction visuelle
Nom Italiano Lab. Interface lumineuse, fond ivoire, texte charbon, accent vert forêt, touches terracotta, bordures fines. Beaucoup d'espace, titres soignés, cartes éditoriales, pas de gradient violet ni de dashboard surchargé. Navigation latérale sur desktop, adaptée mobile. Une petite illustration CSS/SVG évocatrice de Milan peut donner une identité. Conserver lisibilité, contrastes, états focus et reduced-motion. Viewports de référence 1440px et 390px, aucune barre horizontale.

## Parcours
### Aujourd'hui
Accueil avec salutation, invitation à une courte séance, nombre réel de cartes dues calculé depuis les données, avancement issu des résultats locaux et dernier cours démo. Bouton principal fonctionnel vers Réviser. Pas de statistiques d'activité inventées : afficher état vide ou données explicitement démo.
### Réviser
Cartes français → italien : consigne visible, réponse cachée jusqu'à révélation. Révélation affiche italien, exemple et traduction. Boutons À revoir / Difficile / Bien / Facile uniquement après révélation. Évaluation enregistre reviewCount, lapses, lastReviewed et dueAt, actualise la progression et passe à la carte suivante. Un seul résultat par carte par session, empêcher double validation. Fin de séance utile et état zéro carte due. Mode entraînement de toutes les cartes distinct du mode dues. Navigation au clavier accessible (espace pour révéler hors champs texte, 1–4 pour évaluer après révélation). Réinitialiser l'état de révélation au changement de carte. Reprise après rechargement sans hydration mismatch. Expliciter que l'algorithme est simple et non FSRS : À revoir 10 minutes, Difficile 1 jour, Bien 3 jours et Facile 7 jours (intervalles fixes prototype).
### Vocabulaire
Recherche insensible à la casse et aux accents sur italien/français, filtre par thème, liste responsive. Au moins 16 expressions réalistes et linguistiquement correctes, réparties quotidien/travail/rendez-vous. Pour chacune id stable, italien, français, exemple italien, traduction exemple, thème, source. Audio optionnel par Web Speech API it-IT : détecter support, indiquer absence de voix italienne/indisponibilité sans faux succès. Ne pas promettre reconnaissance vocale.
### Mes difficultés
Afficher cartes évaluées À revoir ou Difficile, pas un faux diagnostic de grammaire. État vide au départ, action d'entraînement ciblée réellement reliée à ces cartes.
### Sources / Obsidian
Expliquer clairement « Démonstration — aucun vault connecté ». Fournir exemple Markdown téléchargeable et import .md via sélecteur de fichier, pas accès arbitraire au disque. Format documenté et facile : YAML frontmatter optionnel de cours puis sections '## expression' et champs '- Français: ...', '- Exemple: ...', '- Traduction: ...', '- Thème: ...'. Parser non-exécutable et tolérant aux espaces; erreurs explicites si champs requis absents. Valider avant mutation, ne pas importer partiellement silencieusement. Dédoublonner par italien normalisé, id stable, ne pas écraser progression des cartes existantes. Conserver nom de fichier comme source, rendu texte React (pas HTML non sûr). Ajouter au vocabulaire et persister après rechargement. Fichier exemple dans public/examples. Ne pas effacer les données pour importer. Un bouton de reset, s'il existe, doit demander confirmation.

## Persistance
localStorage avec clé versionnée, validation des données lues et fallback sûr si JSON malformé. Stocker vocabulaire importé et révisions, aucune donnée sensible. Gestion SSR/hydratation correcte. Si stockage indisponible, app utilisable avec avertissement de non-persistance. Valeurs chiffrées dérivées des données réelles.

## Tests / critères d'acceptation
- npm install termine et produit lockfile.
- npm run lint, npx tsc --noEmit et npm run build passent.
- Tests automatisés logique : intervalles pour les 4 notes, due filtering, normalisation recherche, parser Markdown valide/invalide, déduplication et préservation progression, récupération stockage corrompu.
- Tests navigateur Playwright si possible : dashboard → révision → révélation → note → statistiques après reload; recherche et filtre; import exemple et visibilité après reload; difficultés; viewport mobile sans overflow.
- Chaque contrôle visible fonctionne ou est explicitement désactivé avec explication. Aucun bouton décoratif inactif.
- Fournir README en français avec démarrage, commandes de tests, limites, format Markdown et distinction démo/import/synchronisation.
- Fournir IMPLEMENTATION_REPORT.md listant commandes réellement exécutées et résultats, limites restantes. Ne jamais fabriquer des sorties de tests.

## Exécution demandée à Codex
Examiner le squelette existant incomplet, réparer si nécessaire les versions/dépendances à partir du registre réel, implémenter toutes les fonctionnalités ci-dessus, installer, tester et corriger jusqu'à réussite. Utiliser les sources officielles shadcn si besoin. Ne pas s'arrêter après un plan. Ne pas lancer de serveur persistant : le parent s'en chargera. Ne pas modifier SPEC.md pour réduire les critères. Pas de commit/push.
