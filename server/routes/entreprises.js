import express from 'express';
import database from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { sanitizeLimit, sanitizeOffset, toSafeInteger } from '../utils/number-utils.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const page = toSafeInteger(req.query.page, { defaultValue: 1, min: 1 });
    const limit = sanitizeLimit(req.query.limit, { defaultValue: 12, min: 1, max: 500 });
    const search = (req.query.search || '').trim();
    const offset = sanitizeOffset((page - 1) * limit, { defaultValue: 0 });

    let whereClause = '';
    const params = [];

    if (search) {
      whereClause = `WHERE CONCAT_WS(' ',
        ninea_ninet, cuci, raison_social, ensemble_sigle, numrc,
        syscoa1, syscoa2, syscoa3, naemas, naemas_rev1, citi_rev4,
        adresse, telephone, telephone1, numero_telecopie, email,
        bp, region, departement, ville, commune, quartier,
        personne_contact, adresse_personne_contact, qualite_personne_contact,
        premiere_annee_exercice, forme_juridique, regime_fiscal,
        pays_du_siege_de_lentreprise, nombre_etablissement, controle,
        date_reception, libelle_activite_principale, observations, systeme
      ) LIKE ?`;
      params.push(`%${search}%`);
    }

    const totalResult = await database.queryOne(
      `SELECT COUNT(*) AS count FROM entreprises ${whereClause}`,
      params
    );

    const rows = await database.query(
      `SELECT
        ninea_ninet, cuci, raison_social, ensemble_sigle, numrc,
        syscoa1, syscoa2, syscoa3, naemas, naemas_rev1, citi_rev4,
        adresse, telephone, telephone1, numero_telecopie, email,
        bp, region, departement, ville, commune, quartier,
        personne_contact, adresse_personne_contact, qualite_personne_contact,
        premiere_annee_exercice, forme_juridique, regime_fiscal,
        pays_du_siege_de_lentreprise, nombre_etablissement, controle,
        date_reception, libelle_activite_principale, observations, systeme
      FROM entreprises ${whereClause} LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    res.json({ entries: rows, total: totalResult.count });
  } catch (error) {
    console.error('Erreur entreprises:', error);
    res.status(500).json({ error: "Erreur lors de la récupération des entreprises" });
  }
});

export default router;
