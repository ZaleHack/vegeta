const tablesCatalog = {
  // Base esolde
  'esolde.mytable': {
    display: 'mytable',
    database: 'esolde',
    searchable: ['matricule', 'nomprenom', 'cni', 'telephone'],
    preview: ['matricule', 'nomprenom', 'cni', 'telephone'],
    filters: {
      matricule: 'string',
      cni: 'string',
      telephone: 'string'
    },
    theme: 'identite'
  },

  // Base rhpolice
  'rhpolice.personne_concours': {
    display: 'personne_concours',
    database: 'rhpolice',
    searchable: ['prenom', 'nom', 'date_naiss', 'lieu_naiss', 'sexe', 'adresse', 'email', 'telephone', 'cni', 'prenom_pere', 'nom_pere', 'nom_mere'],
    preview: ['prenom', 'nom', 'cni', 'telephone', 'email'],
    filters: {
      sexe: 'enum',
      lieu_naiss: 'string',
      date_naiss: 'date',
      telephone: 'string',
      cni: 'string'
    },
    theme: 'identite'
  },

  // Base renseignement
  'renseignement.agentfinance': {
    display: 'agentfinance',
    database: 'renseignement',
    searchable: ['MATRICULE', 'PRENOM', 'NOM', 'CORPS', 'EMPLOI', 'COD_SECTION', 'SECTION', 'COD_CHAPITRE', 'CHAPITRE', 'POSTE', 'DIRECTION'],
    preview: ['MATRICULE', 'PRENOM', 'NOM', 'CORPS', 'EMPLOI'],
    filters: {
      CORPS: 'string',
      EMPLOI: 'string',
      SECTION: 'string',
      DIRECTION: 'string'
    },
    theme: 'pro'
  },

  // Base rhgendarmerie
  'rhgendarmerie.personne': {
    display: 'personne',
    database: 'rhgendarmerie',
    searchable: ['matricule', 'prenom', 'nom', 'carteidentite', 'tel', 'email', 'adresse'],
    preview: ['matricule', 'prenom', 'nom', 'carteidentite', 'tel'],
    filters: {
      codesex: 'enum',
      naissville: 'string',
      carteidentite: 'string',
      tel: 'string'
    },
    theme: 'identite'
  },

  // Base permis
  'permis.tables': {
    display: 'tables',
    database: 'permis',
    searchable: ['NumeroPermis', 'Prenoms', 'Nom', 'Numeropiece', 'Categorie'],
    preview: ['NumeroPermis', 'Prenoms', 'Nom', 'Categorie', 'DateObtention'],
    filters: {
      Categorie: 'enum',
      Sexe: 'enum',
      DateObtention: 'date',
      DateNaissance: 'date'
    },
    theme: 'transport'
  },

  // Base expresso
  'expresso.expresso': {
    display: 'expresso',
    database: 'expresso',
    searchable: ['numero', 'prenom', 'nom', 'cni'],
    preview: ['numero', 'prenom', 'nom', 'cni'],
    filters: {
      cni: 'string',
      date_creation: 'date',
      datefermeture: 'date'
    },
    theme: 'telecom'
  },

  // Base elections - toutes les régions
  'elections.dakar': {
    display: 'dakar',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'CNI', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'CNI'],
    filters: {
      CNI: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.bambey': {
    display: 'bambey',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'CNI', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'CNI'],
    filters: { CNI: 'string', datenaiss: 'date', lieunaiss: 'string' },
    theme: 'civique'
  },

  'elections.thies': {
    display: 'thies',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'CNI', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'CNI'],
    filters: { CNI: 'string', datenaiss: 'date', lieunaiss: 'string' },
    theme: 'civique'
  },

  // Base autres - principales tables
  'autres.Vehicules': {
    display: 'Vehicules',
    database: 'autres',
    searchable: ['Numero_Immatriculation', 'Code_Type', 'Numero_Serie', 'Prenoms', 'Nom', 'Tel_Fixe', 'Tel_Portable', 'Marque'],
    preview: ['Numero_Immatriculation', 'Marque', 'Categorie', 'Prenoms', 'Nom'],
    filters: {
      Categorie: 'string',
      Marque: 'string',
      Energie: 'string',
      Date_Mise_Circulation: 'date',
      Genre: 'string'
    },
    theme: 'transport'
  },

  'autres.entreprises': {
    display: 'entreprises',
    database: 'autres',
    searchable: ['ninea_ninet', 'cuci', 'raison_social', 'ensemble_sigle', 'numrc', 'telephone', 'email'],
    preview: ['ninea_ninet', 'raison_social', 'telephone', 'region', 'forme_juridique'],
    filters: {
      forme_juridique: 'string',
      region: 'string',
      ville: 'string',
      regime_fiscal: 'string',
      premiere_annee_exercice: 'number'
    },
    theme: 'entreprise'
  },

  'autres.affaire_etrangere': {
    display: 'affaire_etrangere',
    database: 'autres',
    searchable: ['prenom', 'nom', 'cni', 'corps', 'emploi', 'lib_service', 'lib_org_niv1'],
    preview: ['prenom', 'nom', 'cni', 'corps', 'emploi'],
    filters: {
      corps: 'string',
      emploi: 'string',
      lib_service: 'string'
    },
    theme: 'pro'
  },

  'autres.fpublique': {
    display: 'fpublique',
    database: 'autres',
    searchable: ['cni', 'login', 'prenom', 'nom', 'email'],
    preview: ['login', 'prenom', 'nom', 'cni', 'email'],
    filters: {
      cni: 'string',
      login: 'string'
    },
    theme: 'identite'
  },

  'autres.demdikk': {
    display: 'demdikk',
    database: 'autres',
    searchable: ['Prenom', 'Nom', 'Numero', 'PassePort'],
    preview: ['Prenom', 'Nom', 'Numero', 'PassePort'],
    filters: {
      Numero: 'string',
      PassePort: 'string'
    },
    theme: 'identite'
  },

  'autres.fichemilitaire': {
    display: 'fichemilitaire',
    database: 'autres',
    searchable: ['Nom', 'Prenom', 'MatriculeSolde', 'MatriculeMilitaire', 'CNI', 'Grade'],
    preview: ['Nom', 'Prenom', 'CNI', 'Grade', 'Bataillon'],
    filters: {
      Grade: 'string',
      Bataillon: 'string',
      CNI: 'string'
    },
    theme: 'militaire'
  }
};

module.exports = tablesCatalog;