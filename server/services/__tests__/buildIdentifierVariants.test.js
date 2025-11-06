import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildIdentifierVariants } from '../phoneUtils.js';

describe('buildIdentifierVariants', () => {
  it('normalizes Senegal numbers with international prefix', () => {
    const variants = buildIdentifierVariants('221771234567');
    assert(variants.has('221771234567'));
    assert(variants.has('771234567'));
    assert(variants.has('0771234567'));
    assert(variants.has('00221771234567'));
  });

  it('handles numbers starting with local prefix', () => {
    const variants = buildIdentifierVariants('0771234567');
    assert(variants.has('0771234567'));
    assert(variants.has('771234567'));
    assert(variants.has('221771234567'));
    assert(variants.has('00221771234567'));
  });

  it('includes raw trimmed value when containing formatting characters', () => {
    const variants = buildIdentifierVariants(' 00 221 77 123 45 67 ');
    assert(variants.has('00221771234567'));
    assert(variants.has('221771234567'));
    assert(variants.has('771234567'));
  });
});
