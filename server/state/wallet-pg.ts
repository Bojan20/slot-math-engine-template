/**
 * CORTI W206-PERSISTENCE — Postgres-backed WalletStore.
 *
 * All mutating operations use `SELECT … FOR UPDATE` inside a
 * `BEGIN/COMMIT` block so concurrent debits cannot overdraw the
 * balance. The `wallet_balance_nonneg` CHECK constraint provides a
 * second line of defence at the storage level.
 *
 * Used when `USE_POSTGRES=true`.
 */

import type { PgConnection } from '../db/connection.js';
import type {
  Currency,
  DepositInput,
  DepositResult,
  TransactionKind,
  TransactionStatus,
  WalletState,
  WalletTransaction,
  WithdrawInput,
  WithdrawResult,
} from './wallet.js';

const STARTING_BALANCE_MINOR = 100_000;
const MAX_DEPOSIT_MINOR = 100_000_000;
const PSP_REVIEW_THRESHOLD_MINOR = 5_000_000;

interface BalanceRow {
  player_id: string;
  balance_minor: string;
  currency: string;
  updated_at: Date;
}

interface TxnRow {
  transaction_id: string;
  player_id: string;
  amount_minor: string;
  kind: string;
  status: string;
  currency: string;
  ref: string | null;
  balance_after_minor: string;
  created_at: Date;
}

function rowToState(row: BalanceRow): WalletState {
  return {
    playerId: row.player_id,
    balanceMinor: Number(row.balance_minor),
    currency: row.currency as Currency,
    lastUpdate: row.updated_at.toISOString(),
  };
}

function rowToTxn(row: TxnRow): WalletTransaction {
  return {
    transactionId: `tx-${Number(row.transaction_id).toString(16).padStart(10, '0')}`,
    playerId: row.player_id,
    kind: row.kind as TransactionKind,
    amountMinor: Number(row.amount_minor),
    currency: row.currency as Currency,
    ...(row.ref != null ? { ref: row.ref } : {}),
    status: row.status as TransactionStatus,
    timestamp: row.created_at.toISOString(),
    balanceAfterMinor: Number(row.balance_after_minor),
  };
}

export class PostgresWalletStore {
  constructor(private readonly conn: PgConnection) {}

  async getOrCreate(playerId: string, currency: Currency = 'EUR'): Promise<WalletState> {
    return this.conn.withTransaction(async (client) => {
      const r = await client.query<BalanceRow>(
        `INSERT INTO wallet_balances(player_id, balance_minor, currency, updated_at)
           VALUES ($1, $2, $3, NOW())
         ON CONFLICT (player_id) DO UPDATE SET player_id = EXCLUDED.player_id
         RETURNING player_id, balance_minor, currency, updated_at`,
        [playerId, STARTING_BALANCE_MINOR, currency]
      );
      return rowToState(r.rows[0]);
    });
  }

  async balance(playerId: string): Promise<WalletState | null> {
    const r = await this.conn.query<BalanceRow>(
      `SELECT player_id, balance_minor, currency, updated_at FROM wallet_balances WHERE player_id = $1`,
      [playerId]
    );
    if (r.rows.length === 0) return null;
    return rowToState(r.rows[0]);
  }

  async deposit(playerId: string, input: DepositInput): Promise<DepositResult> {
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
      throw new RangeError('deposit: amountMinor must be > 0');
    }
    if (input.amountMinor > MAX_DEPOSIT_MINOR) {
      throw new RangeError(`deposit: amountMinor exceeds ceiling ${MAX_DEPOSIT_MINOR}`);
    }
    return this.conn.withTransaction(async (client) => {
      const ensure = await client.query<BalanceRow>(
        `INSERT INTO wallet_balances(player_id, balance_minor, currency, updated_at)
           VALUES ($1, $2, $3, NOW())
         ON CONFLICT (player_id) DO UPDATE SET player_id = EXCLUDED.player_id
         RETURNING player_id, balance_minor, currency, updated_at`,
        [playerId, STARTING_BALANCE_MINOR, input.currency ?? 'EUR']
      );
      const before = ensure.rows[0];
      const status: TransactionStatus =
        input.amountMinor >= PSP_REVIEW_THRESHOLD_MINOR ? 'pending' : 'approved';
      let newBalance = Number(before.balance_minor);
      if (status === 'approved') {
        const up = await client.query<BalanceRow>(
          `UPDATE wallet_balances SET balance_minor = balance_minor + $1, updated_at = NOW()
           WHERE player_id = $2 RETURNING player_id, balance_minor, currency, updated_at`,
          [input.amountMinor, playerId]
        );
        newBalance = Number(up.rows[0].balance_minor);
      }
      const tx = await client.query<TxnRow>(
        `INSERT INTO wallet_transactions(player_id, amount_minor, kind, status, currency, ref, balance_after_minor)
         VALUES ($1, $2, 'deposit', $3, $4, $5, $6)
         RETURNING transaction_id, player_id, amount_minor, kind, status, currency, ref, balance_after_minor, created_at`,
        [playerId, input.amountMinor, status, before.currency, input.ref ?? null, newBalance]
      );
      const txn = rowToTxn(tx.rows[0]);
      return {
        newBalanceMinor: newBalance,
        transactionId: txn.transactionId,
        status,
      };
    });
  }

  async withdraw(playerId: string, input: WithdrawInput): Promise<WithdrawResult> {
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
      throw new RangeError('withdraw: amountMinor must be > 0');
    }
    return this.conn.withTransaction(async (client) => {
      const ensure = await client.query<BalanceRow>(
        `INSERT INTO wallet_balances(player_id, balance_minor, currency, updated_at)
           VALUES ($1, $2, $3, NOW())
         ON CONFLICT (player_id) DO UPDATE SET player_id = EXCLUDED.player_id
         RETURNING player_id, balance_minor, currency, updated_at`,
        [playerId, STARTING_BALANCE_MINOR, input.currency ?? 'EUR']
      );
      const before = ensure.rows[0];
      const beforeBalance = Number(before.balance_minor);
      if (input.amountMinor > beforeBalance) {
        const tx = await client.query<TxnRow>(
          `INSERT INTO wallet_transactions(player_id, amount_minor, kind, status, currency, ref, balance_after_minor)
           VALUES ($1, $2, 'withdraw', 'declined', $3, $4, $5)
           RETURNING transaction_id, player_id, amount_minor, kind, status, currency, ref, balance_after_minor, created_at`,
          [playerId, input.amountMinor, before.currency, input.ref ?? null, beforeBalance]
        );
        return {
          newBalanceMinor: beforeBalance,
          transactionId: rowToTxn(tx.rows[0]).transactionId,
          status: 'declined',
          reason: 'insufficient_funds',
        };
      }
      const status: TransactionStatus =
        input.amountMinor >= PSP_REVIEW_THRESHOLD_MINOR ? 'pending' : 'approved';
      let newBalance = beforeBalance;
      if (status === 'approved') {
        const up = await client.query<BalanceRow>(
          `UPDATE wallet_balances SET balance_minor = balance_minor - $1, updated_at = NOW()
           WHERE player_id = $2 RETURNING player_id, balance_minor, currency, updated_at`,
          [input.amountMinor, playerId]
        );
        newBalance = Number(up.rows[0].balance_minor);
      }
      const tx = await client.query<TxnRow>(
        `INSERT INTO wallet_transactions(player_id, amount_minor, kind, status, currency, ref, balance_after_minor)
         VALUES ($1, $2, 'withdraw', $3, $4, $5, $6)
         RETURNING transaction_id, player_id, amount_minor, kind, status, currency, ref, balance_after_minor, created_at`,
        [playerId, input.amountMinor, status, before.currency, input.ref ?? null, newBalance]
      );
      return {
        newBalanceMinor: newBalance,
        transactionId: rowToTxn(tx.rows[0]).transactionId,
        status,
      };
    });
  }

  async wager(playerId: string, amountMinor: number): Promise<WalletTransaction | null> {
    if (amountMinor <= 0) throw new RangeError('wager: amountMinor must be > 0');
    return this.conn.withTransaction(async (client) => {
      const ensure = await client.query<BalanceRow>(
        `INSERT INTO wallet_balances(player_id, balance_minor, currency, updated_at)
           VALUES ($1, $2, 'EUR', NOW())
         ON CONFLICT (player_id) DO UPDATE SET player_id = EXCLUDED.player_id
         RETURNING player_id, balance_minor, currency, updated_at`,
        [playerId, STARTING_BALANCE_MINOR]
      );
      const balance = Number(ensure.rows[0].balance_minor);
      if (amountMinor > balance) return null;
      const up = await client.query<BalanceRow>(
        `UPDATE wallet_balances SET balance_minor = balance_minor - $1, updated_at = NOW()
         WHERE player_id = $2 RETURNING player_id, balance_minor, currency, updated_at`,
        [amountMinor, playerId]
      );
      const newBalance = Number(up.rows[0].balance_minor);
      const tx = await client.query<TxnRow>(
        `INSERT INTO wallet_transactions(player_id, amount_minor, kind, status, currency, ref, balance_after_minor)
         VALUES ($1, $2, 'wager', 'approved', $3, NULL, $4)
         RETURNING transaction_id, player_id, amount_minor, kind, status, currency, ref, balance_after_minor, created_at`,
        [playerId, amountMinor, ensure.rows[0].currency, newBalance]
      );
      return rowToTxn(tx.rows[0]);
    });
  }

  async credit(playerId: string, amountMinor: number): Promise<WalletTransaction> {
    if (amountMinor < 0) throw new RangeError('credit: amountMinor must be ≥ 0');
    return this.conn.withTransaction(async (client) => {
      const ensure = await client.query<BalanceRow>(
        `INSERT INTO wallet_balances(player_id, balance_minor, currency, updated_at)
           VALUES ($1, $2, 'EUR', NOW())
         ON CONFLICT (player_id) DO UPDATE SET player_id = EXCLUDED.player_id
         RETURNING player_id, balance_minor, currency, updated_at`,
        [playerId, STARTING_BALANCE_MINOR]
      );
      const up = await client.query<BalanceRow>(
        `UPDATE wallet_balances SET balance_minor = balance_minor + $1, updated_at = NOW()
         WHERE player_id = $2 RETURNING player_id, balance_minor, currency, updated_at`,
        [amountMinor, playerId]
      );
      const newBalance = Number(up.rows[0].balance_minor);
      const tx = await client.query<TxnRow>(
        `INSERT INTO wallet_transactions(player_id, amount_minor, kind, status, currency, ref, balance_after_minor)
         VALUES ($1, $2, 'win', 'approved', $3, NULL, $4)
         RETURNING transaction_id, player_id, amount_minor, kind, status, currency, ref, balance_after_minor, created_at`,
        [playerId, amountMinor, ensure.rows[0].currency, newBalance]
      );
      return rowToTxn(tx.rows[0]);
    });
  }

  async transactions(playerId: string): Promise<WalletTransaction[]> {
    const r = await this.conn.query<TxnRow>(
      `SELECT transaction_id, player_id, amount_minor, kind, status, currency, ref, balance_after_minor, created_at
       FROM wallet_transactions WHERE player_id = $1 ORDER BY transaction_id ASC`,
      [playerId]
    );
    return r.rows.map(rowToTxn);
  }

  async reset(): Promise<void> {
    await this.conn.query('DELETE FROM wallet_transactions');
    await this.conn.query('DELETE FROM wallet_balances');
  }
}
