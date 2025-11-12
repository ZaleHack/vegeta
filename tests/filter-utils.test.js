import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasActiveFilters, isFilterValueActive } from '../server/utils/filter-utils.js';

describe('filter-utils', () => {
  describe('isFilterValueActive', () => {
    it('returns false for empty arrays', () => {
      assert.equal(isFilterValueActive([]), false);
    });

    it('returns false for empty objects', () => {
      assert.equal(isFilterValueActive({}), false);
    });

    it('returns false for empty strings', () => {
      assert.equal(isFilterValueActive('   '), false);
    });

    it('returns true for numbers and booleans', () => {
      assert.equal(isFilterValueActive(0), true);
      assert.equal(isFilterValueActive(true), true);
      assert.equal(isFilterValueActive(false), false);
    });

    it('detects nested active values', () => {
      assert.equal(
        isFilterValueActive({ from: null, to: '2024-01-01' }),
        true
      );
      assert.equal(
        isFilterValueActive({ values: ['', null, 'abc'] }),
        true
      );
    });
  });

  describe('hasActiveFilters', () => {
    it('returns false when filters are empty or missing', () => {
      assert.equal(hasActiveFilters(null), false);
      assert.equal(hasActiveFilters(undefined), false);
      assert.equal(hasActiveFilters({}), false);
    });

    it('ignores filters with only empty values', () => {
      assert.equal(
        hasActiveFilters({
          status: [],
          range: { from: null, to: null },
          search: '   '
        }),
        false
      );
    });

    it('detects active filters deep in nested structures', () => {
      assert.equal(
        hasActiveFilters({
          tags: [''],
          range: { from: null, to: '2024-01-01' }
        }),
        true
      );
      assert.equal(
        hasActiveFilters({ numbers: [0] }),
        true
      );
      assert.equal(
        hasActiveFilters({ flags: { includeArchived: true } }),
        true
      );
    });
  });
});
