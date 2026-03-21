# Corrections recommandées pour une application plus fluide et rapide

## Déjà corrigé dans cette branche

1. **Réutiliser les icônes Leaflet au lieu de les recréer à chaque rendu**
   - Mise en place d'un cache (`Map`) pour les `L.divIcon` créés par `renderToStaticMarkup`.
   - Impact attendu : moins d'allocations mémoire et moins de coût CPU lors des rerenders de la carte.

2. **Réactiver un clustering réellement utile sur la carte**
   - Passage de `maxClusterRadius` de `0` (désactive de fait l'agrégation) à `45`.
   - Activation de `chunkedLoading` et options associées pour étaler le rendu des gros volumes de marqueurs.
   - Impact attendu : interaction carte plus fluide (zoom/pan), moins de freeze sur gros jeux de données.

## Corrections prioritaires à faire ensuite

1. **Découper `src/App.tsx` (très volumineux) en modules par domaine**
   - Extraire les sections (auth, dashboard, fraude, CDR, administration, etc.) vers des composants/containers dédiés.
   - Centraliser les hooks de chargement (`useXxxData`) pour réduire les rerenders globaux.

2. **Centraliser les appels API et la récupération du token**
   - Créer un client HTTP unique (ex: `apiClient`) avec en-tête `Authorization` injecté automatiquement.
   - Éviter les dizaines de `localStorage.getItem('token')` dispersés dans `App.tsx`.

3. **Déporter les calculs lourds côté carte dans un Web Worker**
   - Les regroupements/calculs géographiques (meeting points, segments similaires, triangulation) peuvent sortir du thread UI.
   - Le thread principal restera réactif pendant les traitements volumineux.

4. **Limiter les écritures synchrones `localStorage`**
   - Les écritures sont bloquantes. Ajouter un debounce (200–500ms) sur les sauvegardes fréquentes.
   - Exemple : historique de recherche, préférences UI, états de dashboard.

5. **Virtualiser les listes longues**
   - Pour les tableaux/lists volumineux, utiliser une virtualisation (react-window / react-virtualized).
   - Réduit drastiquement le nombre de nœuds DOM simultanés.

6. **Instrumenter la perf avant/après**
   - Mesurer : temps de rendu initial, interaction map (FPS), temps de recherche, taille payload API.
   - Ajouter un protocole de benchmark reproductible pour valider chaque optimisation.

## Plan d'exécution conseillé (ordre)

1. Modularisation de `App.tsx` + client API unique.
2. Virtualisation des listes critiques.
3. Worker pour calculs géographiques.
4. Debounce des écritures `localStorage`.
5. Benchmark systématique et ajustements.
