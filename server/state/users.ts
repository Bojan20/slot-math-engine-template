/**
 * CORTI W206-SECURITY — in-memory user store. Maps `userId → Role` so
 * route handlers can resolve the caller's role without a full OIDC
 * roundtrip during development / tests. Production swaps this out for a
 * verified JWT claim (the role lookup happens in the RBAC preHandler,
 * not in route bodies).
 *
 * NOTE: The store carries roles only — no credentials, no PII. Real
 * credential storage belongs in an HSM-backed identity service.
 */

import type { Role } from './rbac.js';

export interface UserRecord {
  userId: string;
  role: Role;
  displayName?: string;
  /** ISO timestamp of last role mutation. */
  updatedAt: string;
}

export class UserStore {
  private readonly byId = new Map<string, UserRecord>();

  upsert(userId: string, role: Role, displayName?: string): UserRecord {
    if (!userId || typeof userId !== 'string') {
      throw new RangeError('UserStore.upsert: userId required');
    }
    const rec: UserRecord = {
      userId,
      role,
      ...(displayName !== undefined ? { displayName } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.byId.set(userId, rec);
    return rec;
  }

  get(userId: string): UserRecord | null {
    return this.byId.get(userId) ?? null;
  }

  roleOf(userId: string): Role | null {
    return this.byId.get(userId)?.role ?? null;
  }

  list(): UserRecord[] {
    return [...this.byId.values()];
  }

  size(): number {
    return this.byId.size;
  }

  delete(userId: string): boolean {
    return this.byId.delete(userId);
  }

  reset(): void {
    this.byId.clear();
  }
}

/**
 * Seed the store with a default service account per role so tests and
 * smoke deploys can drive every endpoint without a registration step.
 */
export function seedDefaultUsers(store: UserStore): void {
  store.upsert('svc-admin', 'admin', 'Service Admin');
  store.upsert('svc-operator', 'operator', 'Service Operator');
  store.upsert('svc-regulator', 'regulator', 'Service Regulator');
  store.upsert('svc-player', 'player', 'Service Player');
}
