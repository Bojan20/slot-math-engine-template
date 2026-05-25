/**
 * W210 Faza 600.0 — Wallet provider registry.
 *
 * Operators wire their tenant to one of N provider types; this registry
 * is the single map of provider name → factory. New connectors are
 * registered once at startup; thereafter the orchestrator instantiates
 * them per-tenant.
 *
 * The registry is mutable to allow tests to add lightweight fixtures
 * without touching production data. `resetRegistry()` rewinds to the
 * built-in defaults.
 */
import type {
  HttpClient,
  ProviderConfig,
  ProviderFactory,
  WalletProvider,
} from './types.js';
import { genericPamFactory } from './providers/generic-pam.js';
import { microgamingStyleFactory } from './providers/microgaming-style.js';
import { netentAggregatorFactory } from './providers/netent-aggregator.js';
import { playtechStyleFactory } from './providers/playtech-style.js';

export interface ProviderMeta {
  name: string;
  displayName: string;
  factory: ProviderFactory;
  /** Operator-facing description for the onboarding picker. */
  description: string;
  /** Required config keys beyond baseUrl + apiSecret. */
  requiredConfigKeys?: string[];
}

const BUILTINS: ProviderMeta[] = [
  {
    name: 'generic-pam',
    displayName: 'Generic PAM / REST',
    factory: genericPamFactory,
    description:
      'JSON REST + HMAC-SHA256. Compatible with most aggregator gateways (Pragmatic, Relax, Quickspin).',
  },
  {
    name: 'microgaming-style',
    displayName: 'Vendor G-Style (MGS legacy)',
    factory: microgamingStyleFactory,
    description: 'sessionId-based, cash + bonus purse split. Vendor G Quickfire compatibility.',
  },
  {
    name: 'netent-aggregator',
    displayName: 'Vendor D-Aggregator / MGS Quickfire',
    factory: netentAggregatorFactory,
    description: 'JWT identify + strict Idempotency-Key. Vendor D / MGS Quickfire compatibility.',
  },
  {
    name: 'playtech-style',
    displayName: 'Vendor F IMS',
    factory: playtechStyleFactory,
    description: 'cashier_session_id-based with brand_id signature scheme. Vendor F IMS protocol.',
  },
];

let registry: Map<string, ProviderMeta> = new Map(BUILTINS.map((m) => [m.name, m]));

export function registerProvider(meta: ProviderMeta): void {
  registry.set(meta.name, meta);
}

export function getProvider(name: string): ProviderMeta | null {
  return registry.get(name) ?? null;
}

export function listProviders(): ProviderMeta[] {
  return Array.from(registry.values());
}

export function instantiateProvider(
  name: string,
  config: ProviderConfig,
  http?: HttpClient
): WalletProvider {
  const meta = registry.get(name);
  if (!meta) throw new Error(`unknown_wallet_provider: ${name}`);
  if (!config.baseUrl) throw new Error(`wallet_provider_config_missing_baseUrl: ${name}`);
  if (!config.apiSecret)
    throw new Error(`wallet_provider_config_missing_apiSecret: ${name}`);
  if (meta.requiredConfigKeys) {
    for (const k of meta.requiredConfigKeys) {
      if (config[k] === undefined) {
        throw new Error(`wallet_provider_config_missing_${k}: ${name}`);
      }
    }
  }
  return meta.factory(config, http);
}

export function resetRegistry(): void {
  registry = new Map(BUILTINS.map((m) => [m.name, m]));
}

/** True if `name` is a built-in (not registered at runtime). */
export function isBuiltin(name: string): boolean {
  return BUILTINS.some((m) => m.name === name);
}
