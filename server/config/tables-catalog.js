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
    searchable: [
      'prenom',
      'nom',
      'date_naissance',
      'lieu_naissance',
      'sexe',
      'adresse',
      'email',
      'telephone',
      'telephone2',
      'cni',
      'prenom_pere',
      'prenom_mere',
      'nom_pere',
      'nom_mere'
    ],
    linkedFields: ['cni', 'telephone', 'telephone2'],
    preview: ['prenom', 'nom', 'cni', 'telephone', 'telephone2', 'email'],
    filters: {
      sexe: 'enum',
      lieu_naissance: 'string',
      date_naissance: 'date',
      telephone: 'string',
      telephone2: 'string',
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
    searchable: [
      'matricule',
      'prenom',
      'nom',
      'codesex',
      'lieu_naissance',
      'adresse',
      'telephone',
      'email',
      'cni',
      'prevenirnom',
      'prevenirtel',
      'pere',
      'mere',
      'gradeservice',
      'armeservice',
      'origine',
      'grsang',
      'rang'
    ],
    linkedFields: ['cni', 'telephone', 'prevenirtel'],
    preview: ['matricule', 'prenom', 'nom', 'cni', 'telephone', 'prevenirtel'],
    filters: {
      codesex: 'enum',
      lieu_naissance: 'string',
      telephone: 'string',
      prevenirtel: 'string',
      cni: 'string',
      gradeservice: 'string',
      armeservice: 'string',
      origine: 'string'
    },
    theme: 'identite'
  },

  // Base permis
  'permis.tables': {
    display: 'permis',
    database: 'permis',
    searchable: [
      'numero_permis',
      'prenom',
      'nom',
      'categorie',
      'sexe',
      'lieu_naissance',
      'adresse',
      'code_localite',
      'code_pays',
      'code_profession',
      'boite_postale',
      'telephone',
      'fax',
      'code_piece',
      'cni'
    ],
    preview: ['numero_permis', 'prenom', 'nom', 'categorie', 'date_obtention', 'cni'],
    filters: {
      categorie: 'enum',
      sexe: 'enum',
      date_obtention: 'date',
      date_naissance: 'date',
      code_localite: 'string',
      code_pays: 'string',
      code_profession: 'string'
    },
    theme: 'transport'
  },

  // Base expresso
  'expresso.expresso': {
    display: 'expresso',
    database: 'expresso',
    searchable: ['telephone', 'prenom', 'nom', 'cni'],
    linkedFields: ['cni', 'telephone'],
    preview: ['telephone', 'prenom', 'nom', 'cni'],
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
    searchable: [
      'prenom',
      'nom',
      'date_naissance',
      'cni',
      'sexe',
      'corps',
      'emploi',
      'lib_service',
      'lib_org_niv1'
    ],
    preview: ['prenom', 'nom', 'cni', 'corps', 'emploi'],
    filters: {
      sexe: 'enum',
      corps: 'string',
      emploi: 'string',
      date_naissance: 'date'
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
    searchable: ['Libelle', 'Telephone', 'SousCategorie', 'Secteur'],
    preview: ['Libelle', 'Telephone', 'SousCategorie', 'Secteur'],
    filters: {
      Libelle: 'string',
      Telephone: 'string',
      SousCategorie: 'string',
      Secteur: 'string'
    },
    theme: 'pro'
  },

  'autres.collectes1': {
    display: 'collectes1',
    database: 'autres',
    searchable: [
      'nom',
      'prenom',
      'date_naissance',
      'lieu_naissance',
      'sexe',
      'telephone',
      'profession'
    ],
    preview: ['nom', 'prenom', 'telephone', 'profession'],
    filters: {
      sexe: 'enum',
      date_naissance: 'date',
      lieu_naissance: 'string',
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
    searchable: [
      'prenom',
      'nom',
      'date_naissance',
      'sexe',
      'cni',
      'corps',
      'appellation',
      'lib_service',
      'lib_org_niv1',
      'telephone'
    ],
    preview: ['prenom', 'nom', 'cni', 'corps', 'telephone'],
    filters: {
      sexe: 'enum',
      corps: 'string',
      date_naissance: 'date',
      telephone: 'string'
    },
    theme: 'pro'
  },

  'autres.education': {
    display: 'education',
    database: 'autres',
    searchable: [
      'prenom',
      'nom',
      'date_naissance',
      'lieu_naissance',
      'cni',
      'corps',
      'lib_service',
      'lib_org_niv1',
      'telephone'
    ],
    preview: ['prenom', 'nom', 'cni', 'corps', 'telephone'],
    filters: {
      corps: 'string',
      date_naissance: 'date',
      lieu_naissance: 'string',
      telephone: 'string'
    },
    theme: 'pro'
  },

  'autres.edu_sn': {
    display: 'edu_sn',
    database: 'autres',
    searchable: [
      'cni',
      'prenom',
      'nom',
      'date_naissance',
      'lieu_naissance',
      'sexe',
      'email',
      'email2',
      'teelphone1',
      'telephone2',
      'adresse_residence',
      'diplome_academique',
      'discipline_diplome_academique',
      'diplome_profesionnel',
      'specialite_diplome_professionel',
      'ordre_enseignement_choisi',
      'experience_enseignement'
    ],
    preview: ['cni', 'prenom', 'nom', 'teelphone1', 'telephone2', 'email'],
    filters: {
      sexe: 'enum',
      date_naissance: 'date',
      ordre_enseignement_choisi: 'string',
      experience_enseignement: 'string',
      ia_depot: 'string',
      ief_depot: 'string'
    },
    theme: 'education'
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
    searchable: ['prenom', 'nom', 'telephone', 'cni'],
    preview: ['prenom', 'nom', 'telephone', 'cni'],
    filters: {
      telephone: 'string',
      cni: 'string'
    },
    theme: 'identite'
  },

  'autres.vehicules': {
    display: 'vehicules',
    database: 'autres',
    searchable: [
      'Numero_Immatriculation',
      'Code_Type',
      'Numero_Serie',
      'Prenoms',
      'Nom',
      'Tel_Fixe',
      'Tel_Portable',
      'Marque',
      'Categorie'
    ],
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
    searchable: ['prenom', 'nom', 'cni', 'date_naissance', 'telephone'],
    linkedFields: ['cni', 'telephone'],
    preview: ['prenom', 'nom', 'cni', 'telephone'],
    filters: {
      cni: 'string',
      date_naissance: 'date',
      telephone: 'string'
    },
    theme: 'identite'
  },

  'autres.agents_penitentiare': {
    display: 'agents_penitentiare',
    database: 'autres',
    searchable: ['prenom', 'nom', 'corps'],
    preview: ['prenom', 'nom', 'corps'],
    filters: {
      corps: 'string'
    },
    theme: 'pro'
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
    searchable: [
      'cni',
      'prenom',
      'nom',
      'date_naissance',
      'lieu_naissance',
      'adresse',
      'email',
      'telephone',
      'telephone2'
    ],
    linkedFields: ['telephone', 'telephone2'],
    preview: ['cni', 'prenom', 'nom', 'telephone', 'email'],
    filters: {
      date_naissance: 'date',
      lieu_naissance: 'string',
      telephone: 'string'
    },
    theme: 'identite'
  },

  'autres.cdr_cases': {
    display: 'cdr_cases',
    database: 'autres',
    searchable: ['name', 'user_id'],
    preview: ['name', 'user_id', 'created_at'],
    filters: {
      user_id: 'number',
      created_at: 'date'
    },
    theme: 'telecom'
  },

  'autres.cdr_case_files': {
    display: 'cdr_case_files',
    database: 'autres',
    searchable: ['filename', 'cdr_number'],
    preview: ['filename', 'cdr_number', 'line_count'],
    filters: {
      case_id: 'number',
      uploaded_at: 'date'
    },
    theme: 'telecom'
  },

  'autres.cdr_case_shares': {
    display: 'cdr_case_shares',
    database: 'autres',
    searchable: ['case_id', 'user_id'],
    preview: ['case_id', 'user_id', 'created_at'],
    filters: {
      case_id: 'number',
      user_id: 'number'
    },
    theme: 'telecom'
  },

  'autres.cdr_de_test': {
    display: 'cdr_de_test',
    database: 'autres',
    searchable: [
      'oce',
      'type_cdr',
      'cdr_numb',
      'numero_intl_appelant',
      'numero_intl_appele',
      'numero_intl_appele_original',
      'imei_appelant',
      'imei_appele',
      'imei_appele_original',
      'imsi_appelant',
      'imsi_appele',
      'cgi_appelant',
      'cgi_appele',
      'cgi_appele_original',
      'nom_localisation'
    ],
    preview: ['oce', 'type_cdr', 'numero_intl_appelant', 'numero_intl_appele', 'cdr_numb'],
    filters: {
      date_debut: 'date',
      date_fin: 'date',
      latitude: 'number',
      longitude: 'number'
    },
    theme: 'telecom'
  },

  'autres.cdr_records': {
    display: 'cdr_records',
    database: 'autres',
    searchable: [
      'oce',
      'type_cdr',
      'numero_intl_appelant',
      'numero_intl_appele',
      'numero_intl_appele_original',
      'imei_appelant',
      'imei_appele',
      'imei_appele_original',
      'imsi_appelant',
      'imsi_appele',
      'cgi_appelant',
      'cgi_appele',
      'cgi_appele_original',
      'nom_localisation'
    ],
    preview: ['oce', 'type_cdr', 'numero_intl_appelant', 'numero_intl_appele', 'nom_localisation'],
    filters: {
      date_debut: 'date',
      date_fin: 'date',
      latitude: 'number',
      longitude: 'number'
    },
    theme: 'telecom'
  },

  'autres.cdr_temps_reel': {
    display: 'cdr_temps_reel',
    database: 'autres',
    searchable: [
      'type_appel',
      'statut_appel',
      'cause_liberation',
      'facturation',
      'date_debut',
      'date_fin',
      'heure_debut',
      'heure_fin',
      'numero_appelant',
      'numero_appele',
      'imei_appelant',
      'imsi_appelant',
      'cgi',
      'route_reseau',
      'device_id',
      'fichier_source'
    ],
    preview: [
      'type_appel',
      'numero_appelant',
      'numero_appele',
      'date_debut',
      'heure_debut',
      'route_reseau'
    ],
    filters: {
      type_appel: 'string',
      statut_appel: 'string',
      cause_liberation: 'string',
      date_debut: 'date',
      date_fin: 'date',
      heure_debut: 'string',
      heure_fin: 'string',
      numero_appelant: 'string',
      numero_appele: 'string',
      route_reseau: 'string'
    },
    theme: 'telecom',
    sync: {
      disabled: true
    }
  },

  'bts_orange.cdr_temps_reel': {
    display: 'cdr_temps_reel',
    database: 'bts_orange',
    searchable: [
      'type_appel',
      'statut_appel',
      'cause_liberation',
      'facturation',
      'date_debut',
      'date_fin',
      'heure_debut',
      'heure_fin',
      'numero_appelant',
      'numero_appele',
      'imei_appelant',
      'imsi_appelant',
      'cgi',
      'route_reseau',
      'device_id',
      'fichier_source'
    ],
    preview: [
      'type_appel',
      'numero_appelant',
      'numero_appele',
      'date_debut',
      'heure_debut',
      'route_reseau'
    ],
    filters: {
      type_appel: 'string',
      statut_appel: 'string',
      cause_liberation: 'string',
      date_debut: 'date',
      date_fin: 'date',
      heure_debut: 'string',
      heure_fin: 'string',
      numero_appelant: 'string',
      numero_appele: 'string',
      route_reseau: 'string'
    },
    theme: 'telecom',
    sync: {
      disabled: true
    }
  },

  'autres.fichemilitaire': {
    display: 'fichemilitaire',
    database: 'autres',
    searchable: [
      'nom',
      'prenom',
      'genre',
      'matriculesolde',
      'matriculemilitaire',
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
      date_naissance: 'date'
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
      'Telephone',
      'Type'
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
  },

  'autres.leaks': {
    display: 'leaks',
    database: 'autres',
    searchable: ['cni', 'nom', 'prenom', 'email', 'telephone', 'dataset', 'source', 'risk_level'],
    preview: ['cni', 'nom', 'prenom', 'dataset', 'risk_level'],
    filters: {
      dataset: 'string',
      risk_level: 'string',
      date_leak: 'date'
    },
    theme: 'securite'
  },

  'autres.uvs': {
    display: 'uvs',
    database: 'autres',
    searchable: [
      'id',
      'matricule',
      'cni',
      'prenom',
      'nom',
      'telephone',
      'email',
      'login'
    ],
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
    theme: 'identite'
  },

  'autres.blacklist': {
    display: 'blacklist',
    database: 'autres',
    searchable: ['number'],
    preview: ['number', 'created_at'],
    filters: {
      created_at: 'date'
    },
    theme: 'securite'
  },

  'autres.notifications': {
    display: 'notifications',
    database: 'autres',
    searchable: ['type', 'data'],
    preview: ['type', 'user_id', 'read_at'],
    filters: {
      user_id: 'number',
      read_at: 'date'
    },
    theme: 'systeme'
  },

  'autres.profile_attachments': {
    display: 'profile_attachments',
    database: 'autres',
    searchable: ['original_name', 'file_path'],
    preview: ['original_name', 'file_path', 'created_at'],
    filters: {
      profile_id: 'number',
      created_at: 'date'
    },
    theme: 'interne'
  },

  'autres.profile_shares': {
    display: 'profile_shares',
    database: 'autres',
    searchable: ['profile_id', 'user_id'],
    preview: ['profile_id', 'user_id', 'created_at'],
    filters: {
      profile_id: 'number',
      user_id: 'number'
    },
    theme: 'interne'
  },

  'autres.sanctions': {
    display: 'sanctions',
    database: 'autres',
    searchable: ['cni', 'nom', 'prenom', 'motif', 'source', 'statut'],
    preview: ['cni', 'nom', 'prenom', 'motif', 'statut'],
    filters: {
      date_sanction: 'date',
      statut: 'string',
      source: 'string'
    },
    theme: 'securite'
  },

  'autres.search_logs': {
    display: 'search_logs',
    database: 'autres',
    searchable: ['username', 'search_term', 'search_type', 'ip_address', 'user_agent'],
    preview: ['username', 'search_term', 'results_count', 'search_date'],
    filters: {
      user_id: 'number',
      search_date: 'date'
    },
    theme: 'systeme'
  },

  'autres.search_sync_events': {
    display: 'search_sync_events',
    database: 'autres',
    searchable: ['schema_name', 'table_name', 'primary_value', 'operation'],
    preview: ['schema_name', 'table_name', 'operation', 'processed_at'],
    filters: {
      created_at: 'date',
      processed_at: 'date'
    },
    theme: 'systeme'
  },

  'autres.upload_history': {
    display: 'upload_history',
    database: 'autres',
    searchable: ['table_name', 'file_name', 'upload_mode'],
    preview: ['table_name', 'file_name', 'total_rows', 'success_rows'],
    filters: {
      user_id: 'number',
      created_at: 'date'
    },
    theme: 'systeme'
  },

  'autres.user_logs': {
    display: 'user_logs',
    database: 'autres',
    searchable: ['action', 'details'],
    preview: ['user_id', 'action', 'created_at'],
    filters: {
      user_id: 'number',
      created_at: 'date'
    },
    theme: 'systeme'
  },

  'autres.user_sessions': {
    display: 'user_sessions',
    database: 'autres',
    searchable: ['user_id'],
    preview: ['user_id', 'login_at', 'logout_at'],
    filters: {
      login_at: 'date',
      logout_at: 'date'
    },
    theme: 'systeme'
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
