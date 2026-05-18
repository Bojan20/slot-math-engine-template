/**
 * CORTI W209 Faza 500.0 — marketplace auth + license JWT.
 *
 * Three flows live here:
 *   1) Author API key — `X-Author-Key` header → AuthorRecord. Hashed
 *      with SHA-256 server-side, so the raw key is only ever known to
 *      the author. Used by the kernel submission endpoint.
 *   2) Operator tenant auth — re-uses the W208 `req.tenantId` resolver.
 *      Purchase, list-purchases, refund require tenantId.
 *   3) License JWT issuance + verification — we sign a compact 3-part
 *      base64url-encoded payload using the HSM ed25519 keypair, mirroring
 *      the JWT shape (`header.payload.signature`) without taking the
 *      jsonwebtoken dep. The header advertises `alg: 'Ed25519'`.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'node:crypto';
import { HsmStore } from '../state/hsm.js';
import type { MarketplaceStore } from '../state/marketplace.js';
import type { PostgresMarketplaceStore } from '../state/marketplace-pg.js';
import type { AuthorRecord, ItemType } from '../state/marketplace.js';

declare module 'fastify' {
  interface FastifyRequest {
    author?: AuthorRecord;
  }
}

export interface MarketplaceLicenseClaims {
  iss: string;
  sub: string; // tenant id
  aud: 'marketplace.kernel' | 'marketplace.template';
  itemId: string;
  itemType: ItemType;
  /** Issued at — unix seconds. */
  iat: number;
  /** Expires at — unix seconds (0 = perpetual). */
  exp: number;
  /** Purchase id (back-reference for revocation). */
  purchaseId: string;
  /** License style. */
  licenseType: 'perpetual' | 'subscription' | 'metered';
  /** Random nonce so two licences for the same tenant+item are distinct. */
  jti: string;
}

export interface MarketplaceLicenseVerifyResult {
  valid: boolean;
  reason?: string;
  claims?: MarketplaceLicenseClaims;
}

// ---------------------------------------------------------------------------
// base64url helpers — local so we keep zero deps.
// ---------------------------------------------------------------------------

function b64urlEncode(input: string | Uint8Array): string {
  const buf =
    typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const std = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(std, 'base64');
}

// ---------------------------------------------------------------------------
// License JWT issuance + verification
// ---------------------------------------------------------------------------

export interface IssueLicenseInput {
  tenantId: string;
  itemId: string;
  itemType: ItemType;
  purchaseId: string;
  licenseType?: 'perpetual' | 'subscription' | 'metered';
  /** Validity in seconds. 0 / undefined → perpetual. */
  ttlSeconds?: number;
  /** Override issuer label — defaults to 'slot-math-engine'. */
  issuer?: string;
}

const DEFAULT_TTL_PERPETUAL = 0;
const DEFAULT_TTL_SUBSCRIPTION_SECONDS = 365 * 24 * 60 * 60;

export function issueLicenseJwt(hsm: HsmStore, input: IssueLicenseInput): string {
  const now = Math.floor(Date.now() / 1000);
  const lt = input.licenseType ?? 'perpetual';
  const ttl =
    input.ttlSeconds !== undefined
      ? input.ttlSeconds
      : lt === 'perpetual'
        ? DEFAULT_TTL_PERPETUAL
        : DEFAULT_TTL_SUBSCRIPTION_SECONDS;
  const claims: MarketplaceLicenseClaims = {
    iss: input.issuer ?? 'slot-math-engine',
    sub: input.tenantId,
    aud:
      input.itemType === 'kernel'
        ? 'marketplace.kernel'
        : 'marketplace.template',
    itemId: input.itemId,
    itemType: input.itemType,
    iat: now,
    exp: ttl > 0 ? now + ttl : 0,
    purchaseId: input.purchaseId,
    licenseType: lt,
    jti: randomBytes(8).toString('hex'),
  };
  const header = { alg: 'Ed25519', typ: 'JWT', kid: hsm.getPublicKeyHex().slice(0, 16) };
  const headerB64 = b64urlEncode(JSON.stringify(header));
  const claimsB64 = b64urlEncode(JSON.stringify(claims));
  const signingInput = `${headerB64}.${claimsB64}`;
  const sig = hsm.signString(signingInput);
  const sigB64 = b64urlEncode(Buffer.from(sig.signature, 'hex'));
  return `${signingInput}.${sigB64}`;
}

export function verifyLicenseJwt(
  jwt: string,
  publicKeyHex: string,
  opts: { now?: number } = {}
): MarketplaceLicenseVerifyResult {
  const parts = jwt.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'malformed' };
  let claims: MarketplaceLicenseClaims;
  try {
    const payloadJson = b64urlDecode(parts[1]).toString('utf8');
    claims = JSON.parse(payloadJson) as MarketplaceLicenseClaims;
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  const signingInput = `${parts[0]}.${parts[1]}`;
  const sigBytes = b64urlDecode(parts[2]);
  const sigHex = sigBytes.toString('hex');
  const verified = HsmStore.verifyString(sigHex, publicKeyHex, signingInput);
  if (!verified) return { valid: false, reason: 'signature_invalid' };
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (claims.exp !== 0 && now >= claims.exp) {
    return { valid: false, reason: 'expired', claims };
  }
  return { valid: true, claims };
}

// ---------------------------------------------------------------------------
// Author registration / KYC stub
// ---------------------------------------------------------------------------

export interface RegisterAuthorInput {
  name: string;
  email: string;
  tier?: 1 | 2 | 3;
}

export interface RegisterAuthorResult {
  author: AuthorRecord;
  apiKey: string;
}

/**
 * Register a new author. Returns the raw api key once (caller must
 * persist; we only keep the hash). KYC starts in `pending` and is
 * elevated via {@link approveAuthorKyc}.
 */
export async function registerAuthor(
  store: MarketplaceStoreLike,
  input: RegisterAuthorInput
): Promise<RegisterAuthorResult> {
  const apiKey = `mk_live_${randomBytes(18).toString('hex')}`;
  const author = await asPromise(
    store.upsertAuthor({
      name: input.name,
      email: input.email,
      tier: input.tier,
      apiKey,
      kycStatus: 'pending',
    })
  );
  return { author, apiKey };
}

export async function approveAuthorKyc(
  store: MarketplaceStoreLike,
  authorId: string
): Promise<AuthorRecord | null> {
  // Reuse upsert — upsertAuthor with same email + kycStatus update is
  // the simplest path. Pull the row first so we can keep its email.
  const existing = await asPromise(store.getAuthorById(authorId));
  if (!existing) return null;
  return await asPromise(
    store.upsertAuthor({
      id: existing.id,
      name: existing.name,
      email: existing.email,
      kycStatus: 'approved',
    })
  );
}

// ---------------------------------------------------------------------------
// Fastify preHandlers
// ---------------------------------------------------------------------------

/**
 * Resolve an author from the `X-Author-Key` header. On failure responds
 * 401 and short-circuits the request.
 */
export function authorAuthPreHandler(store: MarketplaceStoreLike) {
  return async function preHandler(
    req: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const raw = req.headers['x-author-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key || typeof key !== 'string') {
      return reply.code(401).send({ error: 'author_api_key_required' });
    }
    const author = await asPromise(store.getAuthorByApiKey(key));
    if (!author) return reply.code(401).send({ error: 'author_api_key_invalid' });
    req.author = author;
  };
}

// ---------------------------------------------------------------------------
// Store interface compatibility (async / sync)
// ---------------------------------------------------------------------------

export type MarketplaceStoreLike = MarketplaceStore | PostgresMarketplaceStore;

function asPromise<T>(v: T | Promise<T>): Promise<T> {
  return v instanceof Promise ? v : Promise.resolve(v);
}
