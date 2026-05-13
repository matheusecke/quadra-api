import { createHash, randomBytes } from 'crypto';

const DEFAULT_EXPIRES_DAYS =
  parseInt(process.env.INVITE_TOKEN_EXPIRES_DAYS ?? '7', 10) || 7;

export class AffiliationToken {
  static generate(expiresDays = DEFAULT_EXPIRES_DAYS): {
    raw: string;
    hash: string;
    expiresAt: Date;
  } {
    const raw = randomBytes(32).toString('hex');
    const hash = AffiliationToken.hash(raw);
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000);
    return { raw, hash, expiresAt };
  }

  static hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
