/**
 * Test helpers — build a per-test Fastify instance with isolated stores.
 */

import { build } from '../index.js';
import { SessionStore } from '../state/sessions.js';
import { WalletStore } from '../state/wallet.js';
import { AuditStore } from '../state/audit.js';
import { GamesRegistry } from '../state/games.js';
import { CertStore } from '../state/cert.js';
import { TenantStore } from '../state/tenants.js';
import { UserStore, seedDefaultUsers } from '../state/users.js';

export interface BuildTestAppOptions {
  /**
   * When provided, injects an `onRequest` hook that stamps every test
   * request with this role (so legacy specs don't need to send headers).
   * Defaults to `'admin'` for backward-compat.
   * Pass `null` to disable the injection and exercise raw RBAC behavior.
   */
  defaultRole?: 'admin' | 'operator' | 'regulator' | 'player' | 'guest' | null;
}

export async function buildTestApp(opts: BuildTestAppOptions = {}) {
  const defaultRole = opts.defaultRole === undefined ? 'admin' : opts.defaultRole;
  const games = new GamesRegistry();
  // Register a small known game registry for tests rather than relying
  // on the on-disk library (keeps tests hermetic).
  games.register({
    id: 'test-game-1',
    title: 'Test Game 1',
    supplier: 'Test Co',
    year: 2026,
    topology: 'rectangular',
    category: 'classics',
    irFile: 'classics/test-game-1.ir.json',
    rtp: 0.96,
    jurisdictions: ['UKGC', 'MGA', 'SE', 'NJ', 'GENERIC'],
  });
  games.register({
    id: 'test-game-2',
    title: 'Test Game 2',
    supplier: 'Test Co',
    year: 2026,
    topology: 'cluster_grid',
    category: 'lw-mgaps',
    mGap: 'M3',
    irFile: 'lw-mgaps/test-game-2.ir.json',
    rtp: 0.955,
    jurisdictions: ['MGA', 'NJ'], // NOT UKGC
  });

  const users = new UserStore();
  seedDefaultUsers(users);
  const app = await build({
    stores: {
      sessions: new SessionStore(),
      wallet: new WalletStore(),
      audit: new AuditStore(),
      games,
      cert: new CertStore(),
      tenants: new TenantStore(),
      users,
    },
    logger: false,
  });
  if (defaultRole !== null) {
    app.addHook('onRequest', async (req) => {
      if (!req.headers['x-user-role']) {
        req.headers['x-user-role'] = defaultRole;
      }
    });
  }
  return app;
}
