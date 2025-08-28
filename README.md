# VEGETA - Plateforme de recherche professionnelle multi-bases

## Description

VEGETA est une plateforme Web professionnelle permettant des recherches ultra-rapides sur de grands volumes de données multi-tables avec des fonctionnalités avancées de filtrage, statistiques et gestion des utilisateurs.

## Fonctionnalités principales

- 🔍 **Recherche unifiée** : Recherche simultanée sur toutes les tables configurées
- 🎯 **Filtres avancés** : Filtres dynamiques par thématique (identité, contact, pro, transport, etc.)
- 📊 **Dashboard interactif** : Graphiques et tableaux de bord avec Chart.js
- 👥 **Gestion RBAC** : Système de rôles (ADMIN, ANALYSTE, LECTEUR)
- 📤 **Upload de données** : Interface d'import CSV/Excel avec validation
- 📝 **Journalisation** : Audit complet des recherches et actions

## Architecture technique

- **Backend** : Node.js + Express
- **Base de données** : MySQL 8.0+
- **Frontend** : Bootstrap 5 + Chart.js + DataTables
- **Authentification** : JWT avec bcrypt
- **Sécurité** : Rate limiting, CSRF, validation des entrées

## Installation

### Prérequis

- Node.js 18+
- MySQL 8.0+
- phpMyAdmin (optionnel, pour la gestion de la base)

### Configuration de la base de données

1. **Créer la base de données MySQL** :
```sql
CREATE DATABASE vegeta CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. **Configuration MySQL recommandée** :
```sql
-- Dans phpMyAdmin ou ligne de commande MySQL
-- Utilisateur : root
-- Mot de passe : (vide)
-- Host : localhost
```

### Installation du projet

1. **Cloner et installer les dépendances** :
```bash
npm install
```

2. **Configuration de l'environnement** :
Le fichier `.env` est déjà configuré avec :
```env
DB_HOST=localhost
DB_USERNAME=root
DB_PASSWORD=
DB_DATABASE=vegeta
DB_CHARSET=utf8mb4
DB_COLLATION=utf8mb4_unicode_ci

JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

PORT=3000
NODE_ENV=development
```

3. **Démarrer l'application** :
```bash
npm run dev
```

L'application sera accessible sur `http://localhost:3000`

## Structure des données

### Tables principales

La plateforme supporte les bases de données suivantes :

#### Base `esolde`
- **mytable** : matricule, nomprenom, cni, telephone

#### Base `rhpolice`
- **personne_concours** : prenom, nom, date_naiss, lieu_naiss, sexe, adresse, email, telephone, cni, prenom_pere, nom_pere, nom_mere

#### Base `renseignement`
- **agentfinance** : MATRICULE, PRENOM, NOM, CORPS, EMPLOI, SECTION, CHAPITRE, POSTE, DIRECTION

#### Base `rhgendarmerie`
- **personne** : matricule, prenom, nom, codesex, naissville, adresse, tel, email, carteidentite, etc.

#### Base `permis`
- **tables** : NumeroPermis, DateObtention, Categorie, Prenoms, Nom, Sexe, DateNaissance, etc.

#### Base `expresso`
- **expresso** : numero, prenom, nom, cni, date_creation, datefermeture

#### Base `elections`
- **dakar** (et autres régions) : numero_electeur, prenoms, nom, datenaiss, lieunaiss, CNI

#### Base `autres`
- **Vehicules** : Numero_Immatriculation, Marque, Categorie, Prenoms, Nom, etc.
- **entreprises** : ninea_ninet, raison_social, region, forme_juridique, etc.
- **ong** : OrganizationName, Type, Name, EmailAddress, Telephone, etc.
- **affaire_etrangere**, **agent_non_fonctionnaire**, **fpublique**, **demdikk**
- **annuaire_gendarmerie** : id, Libelle, Telephone, SousCategorie, Secteur, created_at
- **uvs** : id, date, matricule, cniPasseport, prenom, genre, nom, email, mail_perso, telephone, adresse, eno, pole, filiere, login
- **collections** : id, Nom, Prenom, DateNaissance, CNI, Telephone, Localite, created_at

## Utilisation

### Comptes par défaut

Après l'installation, vous devrez créer un compte administrateur via l'interface ou directement en base.

### Rôles et permissions

- **ADMIN** : Accès complet (recherche, stats, upload, gestion utilisateurs)
- **ANALYSTE** : Recherche, filtres, exports, statistiques
- **LECTEUR** : Recherche et filtres uniquement

### Recherche avancée

La plateforme supporte plusieurs opérateurs :
- `terme1 terme2` : Recherche AND
- `"terme exact"` : Recherche exacte
- `-terme` : Exclusion
- `champ:valeur` : Recherche par champ spécifique

### Exemples de recherche
- `CNI: 123456789` : Recherche par CNI
- `"Jean Pierre Dupont"` : Nom exact
- `77 123 45 67` : Numéro de téléphone
- `DK 1234 AB` : Immatriculation véhicule
- `NINEA: 123456` : Entreprise par NINEA

## API Endpoints

### Authentification
- `POST /api/auth/login` : Connexion
- `POST /api/auth/logout` : Déconnexion
- `GET /api/auth/verify` : Vérification token

### Recherche
- `POST /api/search` : Recherche principale
- `GET /api/search/details/:table/:id` : Détails d'un enregistrement

### Dashboard
- `GET /api/stats/overview` : Vue d'ensemble
- `GET /api/stats/tables-distribution` : Répartition par table
- `GET /api/stats/time-series` : Évolution temporelle

### Utilisateurs (ADMIN)
- `GET /api/users` : Liste des utilisateurs
- `POST /api/users` : Créer un utilisateur
- `PATCH /api/users/:id` : Modifier un utilisateur

## Sécurité

- **Rate limiting** : 100 requêtes/15min pour la recherche
- **Authentification JWT** : Tokens sécurisés avec expiration
- **Validation des entrées** : Tous les paramètres sont validés
- **Logs d'audit** : Toutes les actions sont journalisées
- **Requêtes préparées** : Protection contre l'injection SQL

## Performance

- **Index optimisés** : Sur les colonnes de recherche fréquentes
- **Pagination serveur** : Limite de 100 résultats par table
- **Cache de requêtes** : Optimisation des recherches répétées
- **Timeout** : 5 secondes maximum par recherche

## Développement

### Structure du projet
```
├── server/
│   ├── config/          # Configuration DB et catalogues
│   ├── models/          # Modèles de données
│   ├── services/        # Services métier
│   ├── routes/          # Routes API
│   ├── middleware/      # Middlewares (auth, rate limit)
│   └── app.js          # Application principale
├── public/             # Interface utilisateur
├── src/               # Sources React (si applicable)
└── README.md
```

### Ajout de nouvelles tables

1. Modifier `server/config/database.js` pour créer la table
2. Ajouter la configuration dans `server/config/tables-catalog.json`
3. Redémarrer l'application

### Tests

```bash
# Tests unitaires (à implémenter)
npm test

# Tests d'intégration
npm run test:integration
```

## Déploiement

### Production

1. Configurer les variables d'environnement :
```env
NODE_ENV=production
JWT_SECRET=your-production-secret-key
DB_PASSWORD=your-secure-password
```

2. Optimiser MySQL :
```sql
-- Configuration recommandée pour la production
SET GLOBAL innodb_buffer_pool_size = 1G;
SET GLOBAL query_cache_size = 256M;
```

3. Démarrer en mode production :
```bash
npm start
```

## Support et maintenance

### Logs

Les logs sont disponibles dans :
- Console serveur pour les erreurs
- Table `search_logs` pour l'audit des recherches
- Table `upload_history` pour les imports

### Monitoring

- Endpoint de santé : `GET /api/health`
- Dashboard temps réel via l'interface admin
- Métriques de performance dans les logs

### Sauvegarde

Sauvegarder régulièrement :
- Base de données MySQL complète
- Fichiers de configuration
- Logs d'audit

## Licence

Propriétaire - Tous droits réservés

## Contact

Pour le support technique, contacter l'équipe de développement.