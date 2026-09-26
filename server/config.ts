import 'dotenv/config';
import crypto from 'crypto';

const developmentSecrets = new Map<string, string>();

function getSigningSecret(name: 'JWT_SECRET' | 'QR_SIGNING_SECRET' | 'IP_HASH_SECRET'): string {
  const configured = process.env[name]?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} must be configured in the production environment.`);
  }

  let generated = developmentSecrets.get(name);
  if (!generated) {
    generated = crypto.randomBytes(48).toString('base64url');
    developmentSecrets.set(name, generated);
    console.warn(`[Config] ${name} is not configured; using an ephemeral development-only value.`);
  }
  return generated;
}

export const JWT_SECRET = getSigningSecret('JWT_SECRET');
export const QR_SIGNING_SECRET = getSigningSecret('QR_SIGNING_SECRET');
export function getIpHashSecret(): string {
  return getSigningSecret('IP_HASH_SECRET');
}

