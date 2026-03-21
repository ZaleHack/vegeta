# Corrections de performance mises en place

## 1) Carte CDR : rendu plus fluide sur gros volumes

- **Cache d'icônes Leaflet (`L.divIcon`)** pour éviter les reconstructions répétées d'icônes identiques.
- **Clustering effectif + chunked loading** (`maxClusterRadius=45`, `chunkedLoading`) pour lisser le rendu des marqueurs.
- **Offload du grouping des points en Web Worker** au-delà d'un seuil de volume afin de libérer le thread UI.

## 2) Recherche : limitation du coût de rendu DOM

- **Pagination côté composant** pour la vue des résultats profils (`SearchResultProfiles`) avec taille de page configurable.
- Effet attendu : moins de nœuds montés simultanément et scroll/rendu plus stables sur gros ensembles.

## 3) Écritures localStorage : réduction des blocages synchrones

- **Debounce (300ms)** de la persistance de l'historique de recherche.
- Effet attendu : moins de micro-freezes pendant la saisie/interaction.

## 4) Centralisation auth token

- Ajout d'un utilitaire partagé (`src/utils/apiClient.ts`) pour récupérer le token de façon standardisée.
- App utilise désormais cette récupération centralisée sur le flux d'auth principal (bootstrap, logout, headers auth internes).

## Prochain incrément recommandé

- Extraire progressivement les sections métier de `App.tsx` vers des sous-modules/hook dédiés (auth, dashboard, cdr, fraude, admin).
