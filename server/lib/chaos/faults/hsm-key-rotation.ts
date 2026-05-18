/**
 * W212 Faza 600.1 — Chaos fault: HSM key rotation mid-request.
 *
 * Simulates an Ed25519 key id rotating between the moment a JWT/license
 * was signed and the moment it is verified. The verifier should
 * gracefully reject the now-stale signature (audit trail still intact)
 * rather than crash or silently accept it.
 *
 * The chaos surface is a small "key resolver" wrapper: when the fault
 * fires, return a rotated key id so the existing verifier flow runs
 * against fresh material.
 */

import type { ChaosController } from '../index.js';

export interface KeyResolution {
  keyId: string;
  /** True when the chaos controller rotated the id underneath us. */
  rotated: boolean;
}

export interface HsmKeyRotationChaosOptions {
  /** Suffix appended to the rotated key id. Default: '#rotated'. */
  rotationMarker?: string;
}

/**
 * Resolve a key id with chaos interception. When the fault fires, the
 * resolved id is the caller's id with the rotation marker appended.
 * Callers should treat the returned `rotated` flag as a forced
 * mismatch signal — typically: return 401 'key_rotated_during_request'.
 */
export function resolveKeyIdWithChaos(
  chaos: ChaosController,
  currentKeyId: string,
  opts: HsmKeyRotationChaosOptions = {}
): KeyResolution {
  const rotationMarker = opts.rotationMarker ?? '#rotated';
  if (!chaos.shouldInject('hsm.key-rotation')) {
    return { keyId: currentKeyId, rotated: false };
  }
  return {
    keyId: `${currentKeyId}${rotationMarker}`,
    rotated: true,
  };
}

/**
 * Convenience: verify a signature object, treating chaos-rotated keys
 * as an explicit failure. Returns `{ ok: false, reason: 'key_rotated' }`
 * when chaos fires; otherwise forwards to `realVerify`.
 */
export async function verifyWithRotationChaos<T>(
  chaos: ChaosController,
  currentKeyId: string,
  realVerify: (keyId: string) => Promise<T> | T
): Promise<
  | { ok: true; value: T; keyId: string }
  | { ok: false; reason: 'key_rotated'; keyId: string }
> {
  const { keyId, rotated } = resolveKeyIdWithChaos(chaos, currentKeyId);
  if (rotated) {
    return { ok: false, reason: 'key_rotated', keyId };
  }
  const value = await realVerify(keyId);
  return { ok: true, value, keyId };
}

/**
 * Toggle helper for the admin chaos route. Returns the new state.
 */
export function setHsmKeyRotationChaos(
  chaos: ChaosController,
  enabled: boolean,
  probability = 0.02
): { enabled: boolean; probability: number } {
  if (enabled) {
    const r = chaos.enable('hsm.key-rotation', probability);
    return { enabled: true, probability: r.probability };
  }
  chaos.disable('hsm.key-rotation');
  return { enabled: false, probability: 0 };
}
