# Plateforme SORA – Chiffrement applicatif

Ce projet chiffre désormais les données sensibles stockées dans MySQL à l'aide d'AES-256-GCM. Les colonnes à protéger sont définies centralement et sont chiffrées avant tout `INSERT/UPDATE`, puis déchiffrées automatiquement après chaque `SELECT`.

## Variables d'environnement

Les variables suivantes doivent être définies dans l'environnement (voir `.env.example`).

| Variable | Description |
| --- | --- |
| `APP_DATA_KEY` | Clé principale hexadécimale (64 caractères) utilisée pour chiffrer les données. |
| `APP_PREVIOUS_DATA_KEY` | (Optionnel) Liste de clés précédentes séparées par des virgules. Elles sont utilisées pour déchiffrer d'anciennes données pendant une rotation de clé. |

> ⚠️ Les clés doivent être générées aléatoirement (32 octets) et conservées de manière sécurisée. Toute fuite compromet l'intégrité des données chiffrées.

## Colonnes chiffrées

Le fichier [`server/config/encrypted-columns.js`](server/config/encrypted-columns.js) répertorie les tables et colonnes chiffrées. Les modèles (`Profiles`, `Users`, `Cases`, `Notifications`, etc.) consomment cette configuration et n'écrivent plus de texte en clair dans les champs listés.

## Script de migration

Un script dédié applique le chiffrement aux données existantes :

```bash
# Mode simulation (aucune modification, mais génération du fichier de sauvegarde)
node server/scripts/migrate-encryption.js --dry-run

# Chiffrement réel
APP_DATA_KEY=... node server/scripts/migrate-encryption.js
```

Le script génère un fichier `server/backups/encryption-migration-*.json` contenant, pour chaque ligne modifiée, les valeurs précédentes. Ce fichier permet de restaurer manuellement l'état antérieur en cas de problème.

### Rotation de clé

1. **Préparation** : ajoutez la clé actuelle dans `APP_PREVIOUS_DATA_KEY` et définissez la nouvelle clé dans `APP_DATA_KEY`. Les deux clés doivent être présentes dans l'environnement pendant la rotation.
2. **Simulation** : exécutez `node server/scripts/migrate-encryption.js --dry-run --rotate` pour vérifier l'impact et générer un fichier de sauvegarde.
3. **Rotation effective** : lancez `node server/scripts/migrate-encryption.js --rotate` pour réécrire chaque valeur chiffrée avec la nouvelle clé.
4. **Nettoyage** : après validation, retirez la clé obsolète de `APP_PREVIOUS_DATA_KEY`.

> Tant que `APP_PREVIOUS_DATA_KEY` contient une ancienne clé, l'application est capable de lire les données chiffrées avec celle-ci. Retirez-la dès que la rotation est confirmée pour réduire la surface d'exposition.

### Restauration / rollback

- Les fichiers de sauvegarde contiennent les valeurs avant chiffrement (ou l'ancien texte chiffré en cas de rotation). Utilisez-les pour générer des requêtes SQL de restauration en cas de besoin.
- Conservez ces fichiers dans un espace sécurisé et supprimez-les lorsqu'ils ne sont plus utiles.

## Impacts opérationnels

- **Sauvegardes** : continuez à réaliser des sauvegardes régulières de la base de données *et* des fichiers de sauvegarde générés par le script de migration. Ces sauvegardes permettent de restaurer les données en clair si la clé est perdue.
- **Supervision** : surveillez l'exécution du script de migration et la présence de warnings dans les logs (`⚠️`). Toute erreur de déchiffrement doit être traitée immédiatement.
- **Gestion des clés** : le changement de clé implique une intervention coordonnée (mise à jour des variables d'environnement, redémarrage du service et exécution du script de rotation).

## Recherche et ElasticSearch

- Les requêtes SQL (`LIKE`, recherche plein texte) ne fonctionnent plus sur les colonnes chiffrées. Le service de recherche détecte ces colonnes et les ignore pour éviter des résultats incohérents.
- Pour retrouver les capacités de recherche plein texte sur les données sensibles, utilisez la synchronisation ElasticSearch (`ElasticSearchService`). Les documents indexés sont construits à partir des valeurs déchiffrées et stockent des jetons de recherche dérivés.
- Assurez-vous que le cluster ElasticSearch est protégé au même niveau que la base de données, car il contient des informations exploitables pour les recherches opérationnelles.

## Tests et lint

Après modification, exécutez les vérifications habituelles :

```bash
npm run lint
```

