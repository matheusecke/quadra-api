import { AffiliationToken } from './affiliation-token.util';

describe('AffiliationToken', () => {
  describe('generate()', () => {
    it('returns raw token as 64-char hex string', () => {
      const { raw } = AffiliationToken.generate();
      expect(raw).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(raw)).toBe(true);
    });

    it('returns hash as 64-char hex string', () => {
      const { hash } = AffiliationToken.generate();
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it('raw and hash are different', () => {
      const { raw, hash } = AffiliationToken.generate();
      expect(raw).not.toBe(hash);
    });

    it('returns expiresAt 7 days in future by default', () => {
      const before = Date.now();
      const { expiresAt } = AffiliationToken.generate();
      const after = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + sevenDaysMs - 1000,
      );
      expect(expiresAt.getTime()).toBeLessThanOrEqual(
        after + sevenDaysMs + 1000,
      );
    });

    it('respects custom expiry days', () => {
      const { expiresAt } = AffiliationToken.generate(3);
      const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
      expect(expiresAt.getTime()).toBeCloseTo(Date.now() + threeDaysMs, -3);
    });

    it('two calls return different tokens', () => {
      const a = AffiliationToken.generate();
      const b = AffiliationToken.generate();
      expect(a.raw).not.toBe(b.raw);
      expect(a.hash).not.toBe(b.hash);
    });
  });

  describe('hash()', () => {
    it('produces same hash for same input', () => {
      const raw = 'abc123';
      expect(AffiliationToken.hash(raw)).toBe(AffiliationToken.hash(raw));
    });

    it('produces different hashes for different inputs', () => {
      expect(AffiliationToken.hash('abc')).not.toBe(
        AffiliationToken.hash('xyz'),
      );
    });
  });
});
