export default {
  'autres.profiles': {
    display: 'profiles',
    database: 'autres',
    primaryKey: 'id',
    searchable: ['first_name', 'last_name', 'phone', 'email'],
    linkedFields: ['phone', 'email'],
    preview: ['first_name', 'last_name', 'phone', 'email', 'comment'],
    filters: {
      division_id: 'number',
      phone: 'string',
      email: 'string'
    },
    theme: 'interne',
    sync: {
      type: 'profile',
      elasticsearchIndex: 'profiles',
      purgeBeforeIndex: true,
      batchSize: 500
    }
  },

  // Base esolde
  'esolde.mytable': {
    display: 'mytable',
    database: 'esolde',
    primaryKey: 'matricule',
    searchable: ['matricule', 'nomprenom', 'cni', 'telephone'],
    linkedFields: ['cni', 'telephone'],
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
    primaryKey: 'cni',
    searchable: ['prenom', 'nom', 'date_naiss', 'lieu_naiss', 'sexe', 'adresse', 'email', 'telephone', 'cni', 'prenom_pere', 'nom_pere', 'nom_mere'],
    linkedFields: ['cni', 'telephone'],
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
    searchable: [
      'matricule',
      'prenom',
      'nom',
      'corps',
      'emploi',
      'cod_section',
      'section',
      'cod_chapitre',
      'chapitre',
      'poste',
      'direction'
    ],
    preview: ['matricule', 'prenom', 'nom', 'corps', 'emploi'],
    filters: {
      corps: 'string',
      emploi: 'string',
      section: 'string',
      direction: 'string'
    },
    theme: 'pro'
  },

  // Base rhgendarmerie
  'rhgendarmerie.personne': {
    display: 'personne',
    database: 'rhgendarmerie',
    searchable: ['matricule', 'prenom', 'nom', 'carteidentite', 'tel', 'email', 'adresse', 'pere', 'mere'],
    linkedFields: ['carteidentite', 'tel'],
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
    searchable: ['numero_permis', 'prenoms', 'nom', 'numeropiece', 'categorie', 'lieu_naissance'],
    preview: ['numero_permis', 'prenoms', 'nom', 'categorie', 'date_obtention'],
    filters: {
      categorie: 'enum',
      sexe: 'enum',
      date_obtention: 'date',
      date_naissance: 'date'
    },
    theme: 'transport'
  },

  // Base expresso
  'expresso.expresso': {
    display: 'expresso',
    database: 'expresso',
    searchable: ['numero', 'prenom', 'nom', 'cni'],
    linkedFields: ['cni'],
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
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.dagana': {
    display: 'dagana',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.dakar': {
    display: 'dakar',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.diourbel': {
    display: 'diourbel',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.fatick': {
    display: 'fatick',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.guediawaye': {
    display: 'guediawaye',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.guinguineo': {
    display: 'guinguineo',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.kaffrine': {
    display: 'kaffrine',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.kaolack': {
    display: 'kaolack',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.kedougou': {
    display: 'kedougou',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.kolda': {
    display: 'kolda',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.louga': {
    display: 'louga',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.matam': {
    display: 'matam',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.mbacke': {
    display: 'mbacke',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.nioro': {
    display: 'nioro',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.pikine': {
    display: 'pikine',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.podor': {
    display: 'podor',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.rufisque': {
    display: 'rufisque',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.saintlouis': {
    display: 'saintlouis',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.sedhiou': {
    display: 'sedhiou',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.thies': {
    display: 'thies',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
      datenaiss: 'date',
      lieunaiss: 'string'
    },
    theme: 'civique'
  },

  'elections.ziguinchor': {
    display: 'ziguinchor',
    database: 'elections',
    searchable: ['numero_electeur', 'prenoms', 'nom', 'cni', 'lieunaiss'],
    preview: ['numero_electeur', 'prenoms', 'nom', 'cni'],
    filters: {
      cni: 'string',
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
    searchable: ['libelle', 'telephone', 'souscategorie', 'secteur'],
    preview: ['libelle', 'telephone', 'souscategorie', 'secteur'],
    filters: {
      libelle: 'string',
      telephone: 'string',
      souscategorie: 'string',
      secteur: 'string'
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
    linkedFields: ['cni'],
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
    searchable: ['prenom', 'nom', 'numero', 'passeport'],
    preview: ['prenom', 'nom', 'numero', 'passeport'],
    filters: {
      numero: 'string',
      passeport: 'string'
    },
    theme: 'identite'
  },

  'autres.vehicules': {
    display: 'vehicules',
    database: 'autres',
    searchable: [
      'numero_immatriculation',
      'code_type',
      'numero_serie',
      'prenoms',
      'nom',
      'tel_fixe',
      'tel_portable',
      'marque',
      'categorie'
    ],
    preview: ['numero_immatriculation', 'marque', 'categorie', 'prenoms', 'nom'],
    filters: {
      categorie: 'string',
      marque: 'string',
      energie: 'string',
      date_mise_circulation: 'date',
      genre: 'string'
    },
    theme: 'transport'
  },

  'autres.agents_collectes_ansd': {
    display: 'agents_collectes_ansd',
    database: 'autres',
    searchable: ['prenom', 'nom', 'cni', 'date_naiss', 'telephone'],
    linkedFields: ['cni', 'telephone'],
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
    linkedFields: ['telephone'],
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
    linkedFields: ['telephone', 'telephone2'],
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
    searchable: [
      'nom',
      'prenom',
      'genre',
      'matricule_solde',
      'matricule_militaire',
      'cni',
      'grade',
      'bataillon',
      'compagnie'
    ],
    preview: ['nom', 'prenom', 'cni', 'grade', 'bataillon'],
    filters: {
      genre: 'enum',
      grade: 'string',
      bataillon: 'string',
      date_de_naissance: 'date'
    },
    theme: 'militaire'
  },

  'autres.ong': {
    display: 'ong',
    database: 'autres',
    searchable: [
      'organization_name',
      'name',
      'email_address',
      'telephone'
    ],
    preview: ['organization_name', 'name', 'email_address', 'telephone'],
    filters: {
      type: 'string',
      select_area_of_interest: 'string',
      select_sectors_of_interest: 'string'
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
  },

  'autres.uvs': {
    display: 'uvs',
    database: 'autres',
    searchable: ['id', 'matricule', 'cni_passeport', 'prenom', 'nom', 'telephone', 'email', 'login'],
    linkedFields: ['telephone'],
    preview: ['id', 'prenom', 'nom', 'telephone', 'email'],
    filters: {
      genre: 'enum',
      date: 'date',
      eno: 'string',
      pole: 'string',
      filiere: 'string'
    },
    theme: 'identite'
  },

  'autres.collections': {
    display: 'collections',
    database: 'autres',
    searchable: ['nom', 'prenom', 'date_naissance', 'cni', 'telephone', 'localite'],
    preview: ['nom', 'prenom', 'telephone', 'localite'],
    filters: {
      date_naissance: 'date',
      cni: 'string',
      telephone: 'string',
      localite: 'string'
    },
    theme: 'identite',
  },

  'autres.identified_numbers': {
    display: 'identified_numbers',
    database: 'autres',
    searchable: ['phone', 'data'],
    preview: ['phone', 'data'],
    filters: {
      phone: 'string'
    },
    linkedFields: ['phone'],
    theme: 'identite'
  }
};
