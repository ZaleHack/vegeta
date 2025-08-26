export default {
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
    searchable: ['matricule', 'prenom', 'nom', 'carteidentite', 'tel', 'email', 'adresse', 'pere', 'mere'],
    preview: ['matricule', 'prenom', 'nom', 'carteidentite', 'tel'],
    filters: {
      codesex: 'enum',
      naissville: 'string',
      carteidentite: 'string',
      tel: 'string',
      gradeservice: 'string'
    },
    theme: 'identite'
  },

  // Base permis
  'permis.tables': {
    display: 'permis',
    database: 'permis',
    searchable: ['NumeroPermis', 'Prenoms', 'Nom', 'Numeropiece', 'Categorie', 'LieuNaissance'],
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
  'elections.bambey': {
    display: 'bambey',
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

  'elections.dagana': {
    display: 'dagana',
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

  'elections.diourbel': {
    display: 'diourbel',
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

  'elections.fatick': {
    display: 'fatick',
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

  'elections.guediawaye': {
    display: 'guediawaye',
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

  'elections.guinguineo': {
    display: 'guinguineo',
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

  'elections.kaffrine': {
    display: 'kaffrine',
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

  'elections.kaolack': {
    display: 'kaolack',
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

  'elections.kedougou': {
    display: 'kedougou',
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

  'elections.kolda': {
    display: 'kolda',
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

  'elections.louga': {
    display: 'louga',
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

  'elections.matam': {
    display: 'matam',
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

  'elections.mbacke': {
    display: 'mbacke',
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

  'elections.nioro': {
    display: 'nioro',
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

  'elections.pikine': {
    display: 'pikine',
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

  'elections.podor': {
    display: 'podor',
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

  'elections.rufisque': {
    display: 'rufisque',
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

  'elections.saintlouis': {
    display: 'saintlouis',
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

  'elections.sedhiou': {
    display: 'sedhiou',
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

  'elections.thies': {
    display: 'thies',
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

  'elections.ziguinchor': {
    display: 'ziguinchor',
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

  // Base autres - toutes les tables
  'autres.affaire_etrangere': {
    display: 'affaire_etrangere',
    database: 'autres',
    searchable: ['prenom', 'nom', 'cni', 'corps', 'emploi', 'lib_service', 'lib_org_nv1'],
    preview: ['prenom', 'nom', 'cni', 'corps', 'emploi'],
    filters: {
      corps: 'string',
      emploi: 'string',
      lib_service: 'string'
    },
    theme: 'pro'
  },

  'autres.agent_non_fonctionnaire': {
    display: 'agent_non_fonctionnaire',
    database: 'autres',
    searchable: ['prenom', 'nom', 'datenaiss', 'cni', 'sexe', 'corps', 'emploi', 'lib_service', 'lib_org_niv1'],
    preview: ['prenom', 'nom', 'cni', 'corps', 'emploi'],
    filters: {
      sexe: 'enum',
      corps: 'string',
      emploi: 'string',
      datenaiss: 'date'
    },
    theme: 'pro'
  },

  'autres.alignement_janvier2024': {
    display: 'alignement_janvier2024',
    database: 'autres',
    searchable: ['prenom', 'nom', 'sexe', 'cni', 'appellation', 'cadre', 'corps', 'section', 'telephone'],
    preview: ['prenom', 'nom', 'cni', 'corps', 'telephone'],
    filters: {
      sexe: 'enum',
      corps: 'string',
      section: 'string',
      telephone: 'string'
    },
    theme: 'pro'
  },

  'autres.annuaire_gendarmerie': {
    display: 'annuaire_gendarmerie',
    database: 'autres',
    searchable: ['Libelle', 'Telephone', 'Sous-Categorie', 'Secteur'],
    preview: ['Libelle', 'Telephone', 'Sous-Categorie', 'Secteur'],
    filters: {
      Libelle: 'string',
      Telephone: 'string',
      'Sous-Categorie': 'string',
      Secteur: 'string'
    },
    theme: 'pro'
  },

  'autres.collectes1': {
    display: 'collectes1',
    database: 'autres',
    searchable: ['nom', 'prenom', 'datenaiss', 'lieunaiss', 'sexe', 'telephone', 'profession'],
    preview: ['nom', 'prenom', 'telephone', 'profession'],
    filters: {
      sexe: 'enum',
      datenaiss: 'date',
      lieunaiss: 'string',
      profession: 'string'
    },
    theme: 'identite'
  },

  'autres.comptable_local': {
    display: 'comptable_local',
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

  'autres.conseil_constitutionel': {
    display: 'conseil_constitutionel',
    database: 'autres',
    searchable: ['prenom', 'nom', 'datenaiss', 'sexe', 'cni', 'corps', 'appellation', 'lib_service', 'lib_org_niv1', 'telephone'],
    preview: ['prenom', 'nom', 'cni', 'corps', 'telephone'],
    filters: {
      sexe: 'enum',
      corps: 'string',
      datenaiss: 'date',
      telephone: 'string'
    },
    theme: 'pro'
  },

  'autres.education': {
    display: 'education',
    database: 'autres',
    searchable: ['prenom', 'nom', 'datenaiss', 'lieunaiss', 'cni', 'corps', 'lib_service', 'lib_org_niv1', 'telephone'],
    preview: ['prenom', 'nom', 'cni', 'corps', 'telephone'],
    filters: {
      corps: 'string',
      datenaiss: 'date',
      lieunaiss: 'string',
      telephone: 'string'
    },
    theme: 'pro'
  },

  'autres.esolde_new': {
    display: 'esolde_new',
    database: 'autres',
    searchable: ['matricule', 'prenom_nom', 'cni', 'telephone'],
    preview: ['matricule', 'prenom_nom', 'cni', 'telephone'],
    filters: {
      matricule: 'string',
      cni: 'string',
      telephone: 'string'
    },
    theme: 'identite'
  },

  'autres.sde_clients': {
    display: 'sde_clients',
    database: 'autres',
    searchable: ['telephone', 'prenom_nom', 'adresse', 'quartier'],
    preview: ['telephone', 'prenom_nom', 'adresse', 'quartier'],
    filters: {
      telephone: 'string',
      quartier: 'string'
    },
    theme: 'telecom'
  },

  'autres.tresor': {
    display: 'tresor',
    database: 'autres',
    searchable: ['prenom_nom', 'corps', 'cni', 'section', 'chapitre'],
    preview: ['prenom_nom', 'corps', 'cni', 'section'],
    filters: {
      corps: 'string',
      section: 'string',
      chapitre: 'string'
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

  'autres.Vehicules': {
    display: 'Vehicules',
    database: 'autres',
    searchable: ['Numero_Immatriculation', 'Code_Type', 'Numero_Serie', 'Prenoms', 'Nom', 'Tel_Fixe', 'Tel_Portable', 'Marque', 'Categorie'],
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

  'autres.agents_collectes_ansd': {
    display: 'agents_collectes_ansd',
    database: 'autres',
    searchable: ['prenom', 'nom', 'cni', 'date_naiss', 'telephone'],
    preview: ['prenom', 'nom', 'cni', 'telephone'],
    filters: {
      cni: 'string',
      date_naiss: 'date',
      telephone: 'string'
    },
    theme: 'identite'
  },

  'autres.petrosen': {
    display: 'petrosen',
    database: 'autres',
    searchable: ['nom', 'telephone', 'email', 'departement', 'titre', 'responsable'],
    preview: ['nom', 'telephone', 'email', 'departement', 'titre'],
    filters: {
      departement: 'string',
      titre: 'string',
      telephone: 'string'
    },
    theme: 'pro'
  },

  'autres.candidats_ansd': {
    display: 'candidats_ansd',
    database: 'autres',
    searchable: ['nin', 'prenom', 'nom', 'date_naiss', 'lieu_naiss', 'adresse', 'email', 'telephone', 'telephone2'],
    preview: ['nin', 'prenom', 'nom', 'telephone', 'email'],
    filters: {
      date_naiss: 'date',
      lieu_naiss: 'string',
      telephone: 'string'
    },
    theme: 'identite'
  },

  'autres.fichemilitaire': {
    display: 'fichemilitaire',
    database: 'autres',
    searchable: ['Nom', 'Prenom', 'Genre', 'MatriculeSolde', 'MatriculeMilitaire', 'CNI', 'Grade', 'Bataillon', 'Compagnie'],
    preview: ['Nom', 'Prenom', 'CNI', 'Grade', 'Bataillon'],
    filters: {
      Genre: 'enum',
      Grade: 'string',
      Bataillon: 'string',
      DateDeNaissance: 'date'
    },
    theme: 'militaire'
  },

  'autres.ong': {
    display: 'ong',
    database: 'autres',
    searchable: [
      'OrganizationName',
      'Name',
      'EmailAddress',
      'Telephone'
    ],
    preview: ['OrganizationName', 'Name', 'EmailAddress', 'Telephone'],
    filters: {
      Type: 'string',
      SelectAreaofInterest: 'string',
      SelectSectorsofInterest: 'string'
    },
    theme: 'ong'
  },

  'autres.entreprises': {
    display: 'entreprises',
    database: 'autres',
    searchable: ['ninea_ninet', 'cuci', 'raison_social', 'ensemble_sigle', 'numrc', 'telephone', 'email', 'region', 'departement', 'ville'],
    preview: ['ninea_ninet', 'raison_social', 'telephone', 'region', 'forme_juridique'],
    filters: {
      forme_juridique: 'string',
      region: 'string',
      ville: 'string',
      regime_fiscal: 'string',
      premiere_annee_exercice: 'number'
    },
    theme: 'entreprise'
  }
};