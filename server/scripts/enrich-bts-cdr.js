#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import BtsCdrEnrichmentService from '../services/BtsCdrEnrichmentService.js';

dotenv.config();

const service = new BtsCdrEnrichmentService();

const logResult = (result) => {
  const relativePath = path.relative(process.cwd(), result.filePath);
  const enrichedInfo = `${result.enrichedRows}/${result.rows}`;
  console.log(`✅ ${relativePath} - ${enrichedInfo} lignes enrichies`);
};

const logError = (file, error) => {
  const reason = error?.message || 'Erreur inconnue';
  console.error(`❌ ${file} - ${reason}`);
};

const processSingleFile = async (filePath) => {
  try {
    const result = await service.enrichFile(filePath);
    logResult(result);
  } catch (error) {
    logError(filePath, error);
    process.exitCode = 1;
  }
};

const processDirectory = async () => {
  await service.ensureBaseDirectory();
  const baseDir = service.getBaseDirectory();
  let entries = [];

  try {
    entries = await fs.promises.readdir(baseDir);
  } catch (error) {
    console.error(`Erreur lecture dossier ${baseDir}:`, error.message);
    process.exitCode = 1;
    return;
  }

  const csvFiles = entries.filter((entry) => entry.toLowerCase().endsWith('.csv'));

  if (csvFiles.length === 0) {
    console.log('Aucun fichier CSV à traiter dans le dossier bts/.');
    return;
  }

  for (const file of csvFiles) {
    await processSingleFile(file);
  }
};

const run = async () => {
  const target = process.argv[2];
  if (target) {
    await processSingleFile(target);
    return;
  }

  await processDirectory();
};

run().catch((error) => {
  console.error('Erreur lors de l\'enrichissement des CDR BTS:', error);
  process.exit(1);
});
