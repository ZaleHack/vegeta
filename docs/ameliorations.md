# Pistes d'amélioration pour SORA

## 1. Structurer le front-end par domaines fonctionnels
- **Problème actuel :** `App.tsx` centralise l'ensemble des flux (recherche, cartographie CDR, gestion des profils, statistiques, notifications…) dans un seul composant de près de 10 000 lignes, rendu directement par `main.tsx` sans découpage par routes ou par contextes dédiés.
  - Cela complique la lisibilité, les tests unitaires et l'onboarding des nouveaux développeurs.
  - La taille du fichier ralentit également certaines fonctionnalités de l'éditeur (intellisense, refactoring).
- **Proposition :** introduire un routeur (`react-router-dom`) et déplacer chaque module dans une page/feature propre (ex. `features/search`, `features/cases`, `features/profiles`). Extraire les hooks métiers (gestion de l'historique, polling des notifications…) dans des hooks personnalisés réutilisables et testables.
- **Bénéfices attendus :** meilleure maintenabilité, tests ciblés, déploiement de micro-features sans effet de bord.

## 2. Industrialiser l'ingestion de fichiers volumineux
- **Problème actuel :** l'API de chargement CSV lit l'intégralité du fichier en mémoire (`rows.push(row)`) avant de déclencher les insertions et le traitement se fait de manière synchrone pendant la requête HTTP. La suppression du fichier temporaire se fait en mode bloquant (`fs.unlinkSync`).
- **Proposition :**
  - Introduire un pipeline de traitement en flux (streaming) avec insertions batchées et gestion transactionnelle.
  - Déporter le travail lourd dans une file asynchrone (bullmq, RabbitMQ…) et renvoyer immédiatement un identifiant de job à l'utilisateur.
  - Remplacer les opérations bloquantes par leurs équivalents asynchrones et ajouter des garde-fous (limitation du nombre de colonnes, schéma attendu, contrôle antivirus).
- **Bénéfices attendus :** réduction de la consommation mémoire, meilleure résilience face aux gros fichiers, retours utilisateurs plus rapides.

## 3. Rendre dynamique le catalogue des bases importables
- **Problème actuel :** la route `/api/upload/databases` renvoie un tableau statique codé en dur. Toute évolution du périmètre nécessite un déploiement complet.
- **Proposition :** stocker le catalogue dans la base ou dans un fichier de configuration versionné (JSON/YAML) chargé au démarrage. Exposer un panneau d'administration pour activer/désactiver des sources et décrire leurs règles de confidentialité.
- **Bénéfices attendus :** gouvernance facilitée, meilleure traçabilité des changements, alignement avec les droits d'accès réels.

## 4. Enrichir la gestion des rôles et des permissions
- **Problème actuel :** l'authentification ne distingue que deux statuts (`ADMIN` ou `USER`) basés sur un simple flag. Les vérifications d'accès reposent sur `requireAdmin`.
- **Proposition :** introduire une matrice de permissions fine (RBAC) couvrant la recherche sensible, la gestion des dossiers, l'export de données et l'administration système. Les rôles pourraient être stockés dans une table dédiée avec possibilité de délégation temporaire.
- **Bénéfices attendus :** conformité accrue (principe du moindre privilège), audit plus clair des actions autorisées et gestion plus souple des équipes.

## 5. Couvrir les flux critiques par des tests automatisés
- **Problème actuel :** le dépôt ne contient aucune suite de tests automatisés documentée. Les équipes s'appuient sur du lint et des tests manuels.
- **Proposition :** démarrer par des tests unitaires ciblant les services critiques (authentification, recherche, UploadService) puis ajouter des tests d'API via Vitest/Supertest. Compléter par des tests end-to-end sur les parcours principaux avec Playwright.
- **Bénéfices attendus :** régression détectée plus tôt, confiance accrue lors des refontes et possibilité d'intégration continue.

## 6. Finaliser le service de synchronisation transverse
- **Problème actuel :** `SyncService` mentionne explicitement un TODO sur l'implémentation métier et sert essentiellement de squelette.
- **Proposition :** définir les workflows de synchronisation (batch MySQL → Elasticsearch, archivage…) et exposer des commandes/scripts observables (logs structurés, métriques Prometheus) pour suivre l'état des synchronisations.
- **Bénéfices attendus :** cohérence des index de recherche, capacité de reprise après incident et visibilité pour les équipes d'exploitation.
