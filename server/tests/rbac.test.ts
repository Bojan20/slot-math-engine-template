/**
 * CORTI W206-SECURITY — RBAC test suite (OWASP A01 remediation).
 *
 * Covers:
 *   1. Role enum + weight ordering
 *   2. Permission matrix per role (with inheritance)
 *   3. attachRolePreHandler resolves header → req.userRole
 *   4. requireRole / requirePermission middleware
 *   5. Escalation attempts are logged
 *   6. End-to-end via inject() — header-driven 403 vs 200 across the
 *      admin / cert / wallet / audit endpoints.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers.js';
import {
  ROLES,
  ROLE_WEIGHT,
  ROLE_INHERITS,
  ROLE_PERMISSIONS,
  permissionsFor,
  hasPermission,
  parseRoleHeader,
  escalationLog,
  EscalationLog,
  type Role,
} from '../state/rbac.js';
import { UserStore, seedDefaultUsers } from '../state/users.js';

describe('RBAC — Role hierarchy', () => {
  it('exposes the five roles in canonical order', () => {
    expect(ROLES).toEqual(['admin', 'operator', 'regulator', 'player', 'guest']);
  });

  it('assigns strictly increasing weights (admin highest, guest lowest)', () => {
    expect(ROLE_WEIGHT.admin).toBeGreaterThan(ROLE_WEIGHT.operator);
    expect(ROLE_WEIGHT.operator).toBeGreaterThan(ROLE_WEIGHT.regulator);
    expect(ROLE_WEIGHT.regulator).toBeGreaterThan(ROLE_WEIGHT.player);
    expect(ROLE_WEIGHT.player).toBeGreaterThan(ROLE_WEIGHT.guest);
    expect(ROLE_WEIGHT.guest).toBe(0);
  });

  it('admin inherits from operator, regulator, player, guest', () => {
    expect(ROLE_INHERITS.admin).toEqual(['operator', 'regulator', 'player', 'guest']);
  });

  it('guest has the most restrictive own-permissions', () => {
    const guestPerms = ROLE_PERMISSIONS.guest;
    expect(guestPerms.has('game:read')).toBe(true);
    expect(guestPerms.has('wallet:read:any')).toBe(false);
  });
});

describe('RBAC — Permission matrix', () => {
  it('admin sees every permission via inheritance', () => {
    const adminPerms = permissionsFor('admin');
    expect(adminPerms.has('tenant:write')).toBe(true);
    expect(adminPerms.has('wallet:read:any')).toBe(true);
    expect(adminPerms.has('audit:read')).toBe(true);
    expect(adminPerms.has('cert:approve')).toBe(true);
    expect(adminPerms.has('session:spin')).toBe(true);
    expect(adminPerms.has('game:read')).toBe(true);
  });

  it('regulator may approve/reject cert but cannot submit', () => {
    expect(hasPermission('regulator', 'cert:approve')).toBe(true);
    expect(hasPermission('regulator', 'cert:reject')).toBe(true);
    expect(hasPermission('regulator', 'cert:submit')).toBe(false);
  });

  it('operator can submit cert and write games but not approve', () => {
    expect(hasPermission('operator', 'cert:submit')).toBe(true);
    expect(hasPermission('operator', 'game:write')).toBe(true);
    expect(hasPermission('operator', 'cert:approve')).toBe(false);
    expect(hasPermission('operator', 'tenant:write')).toBe(false);
  });

  it('player can spin but cannot read other wallets', () => {
    expect(hasPermission('player', 'session:spin')).toBe(true);
    expect(hasPermission('player', 'wallet:write:own')).toBe(true);
    expect(hasPermission('player', 'wallet:read:any')).toBe(false);
  });

  it('hasPermission rejects undefined role', () => {
    expect(hasPermission(undefined, 'game:read')).toBe(false);
  });
});

describe('RBAC — parseRoleHeader', () => {
  it('returns the canonical role for valid input', () => {
    expect(parseRoleHeader('admin')).toBe('admin');
    expect(parseRoleHeader('OPERATOR')).toBe('operator');
    expect(parseRoleHeader('  player  ')).toBe('player');
  });

  it('returns undefined for invalid / missing / bogus input', () => {
    expect(parseRoleHeader(undefined)).toBeUndefined();
    expect(parseRoleHeader('')).toBeUndefined();
    expect(parseRoleHeader('superuser')).toBeUndefined();
  });

  it('handles array headers (Fastify normalization)', () => {
    expect(parseRoleHeader(['regulator', 'admin'])).toBe('regulator');
  });
});

describe('RBAC — EscalationLog', () => {
  it('appends and lists events', () => {
    const log = new EscalationLog(8);
    log.push({
      attemptedAt: '2026-05-18T00:00:00Z',
      callerRole: 'player',
      requiredRole: 'admin',
      url: '/api/admin/tenants',
      method: 'POST',
    });
    expect(log.size()).toBe(1);
    expect(log.list()[0].callerRole).toBe('player');
  });

  it('respects the ring-buffer capacity', () => {
    const log = new EscalationLog(2);
    for (let i = 0; i < 5; i++) {
      log.push({
        attemptedAt: new Date().toISOString(),
        callerRole: 'guest',
        requiredRole: 'admin',
        url: `/x/${i}`,
        method: 'GET',
      });
    }
    expect(log.size()).toBe(2);
  });
});

describe('RBAC — end-to-end via inject()', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    escalationLog.clear();
    // Build app WITHOUT the default-admin stamp so we test raw RBAC.
    app = await buildTestApp({ defaultRole: null });
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/admin/tenants with no role → 403', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/tenants' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('forbidden');
  });

  it('GET /api/admin/tenants with role=admin → 200', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/tenants',
      headers: { 'x-user-role': 'admin' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('POST /api/cert/submit with role=player → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cert/submit',
      headers: { 'x-user-role': 'player', 'x-tenant-id': 'default' },
      payload: { ir: { gameId: 'g' }, jurisdiction: 'UKGC' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/cert/submit with role=operator → 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cert/submit',
      headers: { 'x-user-role': 'operator', 'x-tenant-id': 'default' },
      payload: { ir: { gameId: 'g', symbols: { A: 1 } }, jurisdiction: 'UKGC' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /api/cert/:id/approve with role=operator → 403', async () => {
    // First create a submission as operator
    const sub = await app.inject({
      method: 'POST',
      url: '/api/cert/submit',
      headers: { 'x-user-role': 'operator', 'x-tenant-id': 'default' },
      payload: { ir: { gameId: 'g' }, jurisdiction: 'UKGC' },
    });
    const { submissionId } = sub.json();
    const res = await app.inject({
      method: 'POST',
      url: `/api/cert/${submissionId}/approve`,
      headers: { 'x-user-role': 'operator', 'x-tenant-id': 'default' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/cert/:id/approve with role=regulator → 200', async () => {
    const sub = await app.inject({
      method: 'POST',
      url: '/api/cert/submit',
      headers: { 'x-user-role': 'operator', 'x-tenant-id': 'default' },
      payload: { ir: { gameId: 'g' }, jurisdiction: 'UKGC' },
    });
    const { submissionId } = sub.json();
    const res = await app.inject({
      method: 'POST',
      url: `/api/cert/${submissionId}/approve`,
      headers: { 'x-user-role': 'regulator', 'x-tenant-id': 'default' },
      payload: { feedback: 'ok' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('completed');
  });

  it('logs an escalation event when caller is rejected', async () => {
    await app.inject({
      method: 'GET',
      url: '/api/admin/tenants',
      headers: { 'x-user-role': 'player' },
    });
    const events = escalationLog.list();
    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1];
    expect(last.callerRole).toBe('player');
    expect(last.requiredRole).toBe('admin');
    expect(last.url).toBe('/api/admin/tenants');
  });

  it('admin inheritance lets admin call player + regulator routes', async () => {
    const sub = await app.inject({
      method: 'POST',
      url: '/api/cert/submit',
      headers: { 'x-user-role': 'admin', 'x-tenant-id': 'default' },
      payload: { ir: { gameId: 'g' }, jurisdiction: 'UKGC' },
    });
    expect(sub.statusCode).toBe(201);
    const { submissionId } = sub.json();
    const approve = await app.inject({
      method: 'POST',
      url: `/api/cert/${submissionId}/approve`,
      headers: { 'x-user-role': 'admin', 'x-tenant-id': 'default' },
    });
    expect(approve.statusCode).toBe(200);
  });
});

describe('UserStore', () => {
  it('upserts roles by userId', () => {
    const us = new UserStore();
    us.upsert('u1', 'operator');
    expect(us.roleOf('u1')).toBe('operator');
    us.upsert('u1', 'admin');
    expect(us.roleOf('u1')).toBe('admin');
  });

  it('seeds the four service accounts', () => {
    const us = new UserStore();
    seedDefaultUsers(us);
    expect(us.size()).toBe(4);
    expect(us.roleOf('svc-admin')).toBe('admin');
    expect(us.roleOf('svc-regulator')).toBe('regulator');
  });

  it('throws on missing userId', () => {
    const us = new UserStore();
    expect(() => us.upsert('', 'admin' as Role)).toThrow();
  });
});
