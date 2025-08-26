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
        Numero_Immatriculation, Code_Type, Numero_Serie, Date_Immatriculation, Serie_Immatriculation,
        Categorie, Marque, Appelation_Com, Genre, Carrosserie, Etat_Initial, Immat_Etrangere, Date_Etrangere,
        Date_Mise_Circulation, Date_Premiere_Immat, Energie, Puissance_Adm, Cylindre, Places_Assises,
        PTR, PTAC_Code, Poids_Vide, CU, Prenoms, Nom, Date_Naissance, Exact, Lieu_Naissance,
        Adresse_Vehicule, Code_Localite, Tel_Fixe, Tel_Portable, PrecImmat, Date_PrecImmat
      ) LIKE ?`;
      params.push(`%${search}%`);
    }

    const totalResult = await database.queryOne(
      `SELECT COUNT(*) AS count FROM vehicules ${whereClause}`,
      params
    );

    const rows = await database.query(
      `SELECT
        ID, Numero_Immatriculation, Code_Type, Numero_Serie, Date_Immatriculation, Serie_Immatriculation,
        Categorie, Marque, Appelation_Com, Genre, Carrosserie, Etat_Initial, Immat_Etrangere, Date_Etrangere,
        Date_Mise_Circulation, Date_Premiere_Immat, Energie, Puissance_Adm, Cylindre, Places_Assises,
        PTR, PTAC_Code, Poids_Vide, CU, Prenoms, Nom, Date_Naissance, Exact, Lieu_Naissance,
        Adresse_Vehicule, Code_Localite, Tel_Fixe, Tel_Portable, PrecImmat, Date_PrecImmat
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
