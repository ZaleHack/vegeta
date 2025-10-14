import express from 'express';
import database from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = (req.query.search || '').trim();
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params = [];

    if (search) {
      whereClause = `WHERE CONCAT_WS(' ',
        numero_immatriculation, code_type, numero_serie, date_immatriculation, serie_immatriculation,
        categorie, marque, appelation_com, genre, carrosserie, etat_initial, immat_etrangere, date_etrangere,
        date_mise_circulation, date_premiere_immat, energie, puissance_adm, cylindre, places_assises,
        ptr, ptac_code, poids_vide, cu, prenoms, nom, date_naissance, exact, lieu_naissance,
        adresse_vehicule, code_localite, tel_fixe, tel_portable, PrecImmat, Date_PrecImmat
      ) LIKE ?`;
      params.push(`%${search}%`);
    }

    const totalResult = await database.queryOne(
      `SELECT COUNT(*) AS count FROM vehicules ${whereClause}`,
      params
    );

    const rows = await database.query(
      `SELECT
        id,
        numero_immatriculation AS Numero_Immatriculation,
        code_type AS Code_Type,
        numero_serie AS Numero_Serie,
        date_immatriculation AS Date_Immatriculation,
        serie_immatriculation AS Serie_Immatriculation,
        categorie AS Categorie,
        marque AS Marque,
        appelation_com AS Appelation_Com,
        genre AS Genre,
        carrosserie AS Carrosserie,
        etat_initial AS Etat_Initial,
        immat_etrangere AS Immat_Etrangere,
        date_etrangere AS Date_Etrangere,
        date_mise_circulation AS Date_Mise_Circulation,
        date_premiere_immat AS Date_Premiere_Immat,
        energie AS Energie,
        puissance_adm AS Puissance_Adm,
        cylindre AS Cylindre,
        places_assises AS Places_Assises,
        ptr AS PTR,
        ptac_code AS PTAC_Code,
        poids_vide AS Poids_Vide,
        cu AS CU,
        prenoms AS Prenoms,
        nom AS Nom,
        date_naissance AS Date_Naissance,
        exact AS Exact,
        lieu_naissance AS Lieu_Naissance,
        adresse_vehicule AS Adresse_Vehicule,
        code_localite AS Code_Localite,
        tel_fixe AS Tel_Fixe,
        tel_portable AS Tel_Portable,
        PrecImmat,
        Date_PrecImmat
      FROM vehicules ${whereClause} LIMIT ? OFFSET ?`,
      [...params, limit, offset],
      { lowercaseKeys: false }
    );

    res.json({ entries: rows, total: totalResult.count });
  } catch (error) {
    console.error('Erreur récupération véhicules:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des véhicules' });
  }
});

export default router;
