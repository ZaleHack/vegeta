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
        numero_immatriculation,
        code_type,
        numero_serie,
        date_immatriculation,
        serie_immatriculation,
        categorie,
        marque,
        appelation_com,
        genre,
        carrosserie,
        etat_initial,
        immat_etrangere,
        date_etrangere,
        date_mise_circulation,
        date_premiere_immat,
        energie,
        puissance_adm,
        cylindre,
        places_assises,
        ptr,
        ptac_code,
        poids_vide,
        cu,
        prenoms,
        nom,
        date_naissance,
        exact,
        lieu_naissance,
        adresse_vehicule,
        code_localite,
        tel_fixe,
        tel_portable,
        PrecImmat,
        Date_PrecImmat
      FROM vehicules ${whereClause} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ entries: rows, total: totalResult.count });
  } catch (error) {
    console.error('Erreur récupération véhicules:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des véhicules' });
  }
});

export default router;
