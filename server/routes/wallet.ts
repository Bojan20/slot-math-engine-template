/**
 * CORTI 200.4-BACKEND — wallet endpoints (mock).
 *
 *  GET  /api/wallet/:playerId/balance
 *  POST /api/wallet/:playerId/deposit
 *  POST /api/wallet/:playerId/withdraw
 *  GET  /api/wallet/:playerId/transactions
 */

import type { FastifyInstance } from 'fastify';
import type { WalletStore, Currency } from '../state/wallet.js';
import type { AuditStore } from '../state/audit.js';

export interface WalletRouteDeps {
  wallet: WalletStore;
  audit: AuditStore;
}

interface DepositBody {
  amountMinor: number;
  currency?: Currency;
  ref?: string;
  sessionId?: string;
}

interface WithdrawBody {
  amountMinor: number;
  currency?: Currency;
  ref?: string;
  sessionId?: string;
}

export async function registerWalletRoutes(
  app: FastifyInstance,
  deps: WalletRouteDeps
): Promise<void> {
  app.get<{ Params: { playerId: string } }>(
    '/api/wallet/:playerId/balance',
    async (req, reply) => {
      const wallet = deps.wallet.getOrCreate(req.params.playerId);
      return reply.send({
        playerId: wallet.playerId,
        balanceMinor: wallet.balanceMinor,
        currency: wallet.currency,
        lastUpdate: wallet.lastUpdate,
      });
    }
  );

  app.post<{ Params: { playerId: string }; Body: DepositBody }>(
    '/api/wallet/:playerId/deposit',
    async (req, reply) => {
      const body = req.body ?? ({} as DepositBody);
      if (!body.amountMinor || body.amountMinor <= 0) {
        return reply.code(400).send({ error: 'invalid_amount' });
      }
      try {
        const result = deps.wallet.deposit(req.params.playerId, {
          amountMinor: body.amountMinor,
          ...(body.currency !== undefined ? { currency: body.currency } : {}),
          ...(body.ref !== undefined ? { ref: body.ref } : {}),
        });
        if (body.sessionId) {
          deps.audit.append({
            sessionId: body.sessionId,
            type: 'wallet.deposit',
            payload: { playerId: req.params.playerId, ...result, amountMinor: body.amountMinor },
          });
        }
        return reply.send({
          newBalanceMinor: result.newBalanceMinor,
          transactionId: result.transactionId,
          status: result.status,
        });
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'deposit_failed',
        });
      }
    }
  );

  app.post<{ Params: { playerId: string }; Body: WithdrawBody }>(
    '/api/wallet/:playerId/withdraw',
    async (req, reply) => {
      const body = req.body ?? ({} as WithdrawBody);
      if (!body.amountMinor || body.amountMinor <= 0) {
        return reply.code(400).send({ error: 'invalid_amount' });
      }
      try {
        const result = deps.wallet.withdraw(req.params.playerId, {
          amountMinor: body.amountMinor,
          ...(body.currency !== undefined ? { currency: body.currency } : {}),
          ...(body.ref !== undefined ? { ref: body.ref } : {}),
        });
        if (body.sessionId) {
          deps.audit.append({
            sessionId: body.sessionId,
            type: 'wallet.withdraw',
            payload: { playerId: req.params.playerId, ...result, amountMinor: body.amountMinor },
          });
        }
        return reply.send({
          newBalanceMinor: result.newBalanceMinor,
          transactionId: result.transactionId,
          status: result.status,
          ...(result.reason ? { reason: result.reason } : {}),
        });
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'withdraw_failed',
        });
      }
    }
  );

  app.get<{ Params: { playerId: string } }>(
    '/api/wallet/:playerId/transactions',
    async (req, reply) => {
      const txs = deps.wallet.transactions(req.params.playerId);
      return reply.send({ transactions: txs, count: txs.length });
    }
  );
}
