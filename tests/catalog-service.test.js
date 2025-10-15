import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { CatalogService } from '../server/services/CatalogService.js';

test('CatalogService persists and updates sources', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'catalog-'));
  const previousPath = process.env.UPLOAD_CATALOG_PATH;
  process.env.UPLOAD_CATALOG_PATH = path.join(tempRoot, 'catalog.json');

  const service = new CatalogService();

  try {
    const created = await service.upsertSource({
      id: 'tests.database',
      name: 'Tests DB',
      description: 'Base de test'
    });
    assert.equal(created.id, 'tests.database');
    assert.equal(created.active, true);

    const listed = await service.listSources();
    assert.equal(listed.length, 1);

    await service.setSourceActive('tests.database', false);
    const fetched = await service.getSource('tests.database');
    assert.equal(fetched.active, false);

    const includeInactive = await service.listSources({ includeInactive: true });
    assert.equal(includeInactive.length, 1);
    assert.equal(includeInactive[0].active, false);

    await service.removeSource('tests.database');
    const remaining = await service.listSources({ includeInactive: true });
    assert.equal(remaining.length, 0);
  } finally {
    process.env.UPLOAD_CATALOG_PATH = previousPath;
    await rm(tempRoot, { recursive: true, force: true });
  }
});
