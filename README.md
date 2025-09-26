# Plateforme SORA

Ce dépôt contient l'application SORA (interface web et serveur Node.js) utilisée pour la gestion des profils, des demandes d'identification, des recherches transverses et des notifications internes.

## Prérequis

- Node.js 18+
- Une instance MySQL accessible
- (Optionnel) Un cluster ElasticSearch si la recherche temps réel est activée (`USE_ELASTICSEARCH=true`)

## Installation

```bash
npm install
```

Copiez ensuite vos paramètres sensibles (connexion MySQL, clés JWT, etc.) dans un fichier `.env` basé sur `.env.example`.

### Variables d'environnement de sécurité

- `JWT_SECRET` : clé secrète **obligatoire** pour signer les jetons JWT. Utilisez une valeur aléatoire robuste (32 caractères ou plus).
- `CORS_ALLOWED_ORIGINS` : liste séparée par des virgules des URL autorisées à appeler l'API via CORS. Ajoutez ici les domaines de vos front-ends autorisés.

## Lancement

- **API** : `npm run server`
- **Interface web** : `npm run dev`

Les deux commandes peuvent être exécutées en parallèle pendant le développement.

## Scripts utiles

- `npm run build` : génère la version de production du front-end.
- `npm run lint` : exécute les vérifications lint/formatting.
- `node server/scripts/init-database.js` : crée les tables nécessaires si elles n'existent pas.
- `node server/scripts/sync-all.js` : synchronise les données pour la recherche.

## Tests

Une suite de tests automatisés n'est pas fournie. Utilisez le lint et les tests manuels fonctionnels avant toute mise en production.
