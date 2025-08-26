import express from 'express';
import database from '../config/database.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const rows = await database.query(`SELECT 
      ID, Numero_Immatriculation, Code_Type, Numero_Serie, Date_Immatriculation, Serie_Immatriculation,
      Categorie, Marque, Appelation_Com, Genre, Carrosserie, Etat_Initial, Immat_Etrangere, Date_Etrangere,
      Date_Mise_Circulation, Date_Premiere_Immat, Energie, Puissance_Adm, Cylindre, Places_Assises,
      PTR, PTAC_Code, Poids_Vide, CU, Prenoms, Nom, Date_Naissance, Exact, Lieu_Naissance,
      Adresse_Vehicule, Code_Localite, Tel_Fixe, Tel_Portable, PrecImmat, Date_PrecImmat
      FROM vehicules`);
    res.json({ entries: rows });
  } catch (error) {
    console.error('Erreur récupération véhicules:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des véhicules' });
  }
});

export default router;
