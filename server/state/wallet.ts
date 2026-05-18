/**
 * CORTI 200.4-BACKEND — mock wallet API state.
 *
 * Real-money production deployment must replace this with a PSP /
 * cashier integration (Worldpay, Skrill, etc.). The shape mirrors the
 * common PSP contract so swapping is mechanical.
 */

export type Currency = 'EUR' | 'USD' | 'GBP';
export type TransactionStatus = 'approved' | 'pending' | 'declined';
export type TransactionKind = 'deposit' | 'withdraw' | 'wager' | 'win';

export interface WalletTransaction {
  transactionId: string;
  playerId: string;
  kind: TransactionKind;
  amountMinor: number;
  currency: Currency;
  ref?: string;
  status: TransactionStatus;
  timestamp: string;
  balanceAfterMinor: number;
}

export interface WalletState {
  playerId: string;
  balanceMinor: number;
  currency: Currency;
  lastUpdate: string;
}

export interface DepositInput {
  amountMinor: number;
  currency?: Currency;
  ref?: string;
}

export interface WithdrawInput {
  amountMinor: number;
  currency?: Currency;
  ref?: string;
}

export interface DepositResult {
  newBalanceMinor: number;
  transactionId: string;
  status: TransactionStatus;
}

export interface WithdrawResult {
  newBalanceMinor: number;
  transactionId: string;
  status: TransactionStatus;
  reason?: string;
}

const STARTING_BALANCE_MINOR = 100_000; // 1000.00 for demo
const MAX_DEPOSIT_MINOR = 100_000_000; // 1M ceiling for sanity
const PSP_REVIEW_THRESHOLD_MINOR = 5_000_000; // > 50k triggers "pending"

export class WalletStore {
  private readonly wallets = new Map<string, WalletState>();
  private readonly transactionsByPlayer = new Map<string, WalletTransaction[]>();
  private seq = 0;

  /** Get-or-create wallet for the player. */
  getOrCreate(playerId: string, currency: Currency = 'EUR'): WalletState {
    let w = this.wallets.get(playerId);
    if (!w) {
      w = {
        playerId,
        balanceMinor: STARTING_BALANCE_MINOR,
        currency,
        lastUpdate: new Date().toISOString(),
      };
      this.wallets.set(playerId, w);
    }
    return w;
  }

  balance(playerId: string): WalletState | null {
    return this.wallets.get(playerId) ?? null;
  }

  deposit(playerId: string, input: DepositInput): DepositResult {
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
      throw new RangeError('deposit: amountMinor must be > 0');
    }
    if (input.amountMinor > MAX_DEPOSIT_MINOR) {
      throw new RangeError(`deposit: amountMinor exceeds ceiling ${MAX_DEPOSIT_MINOR}`);
    }
    const wallet = this.getOrCreate(playerId, input.currency);
    const status: TransactionStatus =
      input.amountMinor >= PSP_REVIEW_THRESHOLD_MINOR ? 'pending' : 'approved';
    if (status === 'approved') {
      wallet.balanceMinor += input.amountMinor;
      wallet.lastUpdate = new Date().toISOString();
    }
    const tx = this.recordTx(playerId, {
      kind: 'deposit',
      amountMinor: input.amountMinor,
      currency: wallet.currency,
      ref: input.ref,
      status,
      balanceAfterMinor: wallet.balanceMinor,
    });
    return {
      newBalanceMinor: wallet.balanceMinor,
      transactionId: tx.transactionId,
      status,
    };
  }

  withdraw(playerId: string, input: WithdrawInput): WithdrawResult {
    if (!Number.isFinite(input.amountMinor) || input.amountMinor <= 0) {
      throw new RangeError('withdraw: amountMinor must be > 0');
    }
    const wallet = this.getOrCreate(playerId, input.currency);
    if (input.amountMinor > wallet.balanceMinor) {
      const tx = this.recordTx(playerId, {
        kind: 'withdraw',
        amountMinor: input.amountMinor,
        currency: wallet.currency,
        ref: input.ref,
        status: 'declined',
        balanceAfterMinor: wallet.balanceMinor,
      });
      return {
        newBalanceMinor: wallet.balanceMinor,
        transactionId: tx.transactionId,
        status: 'declined',
        reason: 'insufficient_funds',
      };
    }
    const status: TransactionStatus =
      input.amountMinor >= PSP_REVIEW_THRESHOLD_MINOR ? 'pending' : 'approved';
    if (status === 'approved') {
      wallet.balanceMinor -= input.amountMinor;
      wallet.lastUpdate = new Date().toISOString();
    }
    const tx = this.recordTx(playerId, {
      kind: 'withdraw',
      amountMinor: input.amountMinor,
      currency: wallet.currency,
      ref: input.ref,
      status,
      balanceAfterMinor: wallet.balanceMinor,
    });
    return {
      newBalanceMinor: wallet.balanceMinor,
      transactionId: tx.transactionId,
      status,
    };
  }

  /** Atomic wager debit — returns null if insufficient funds. */
  wager(playerId: string, amountMinor: number): WalletTransaction | null {
    const wallet = this.getOrCreate(playerId);
    if (amountMinor <= 0) throw new RangeError('wager: amountMinor must be > 0');
    if (amountMinor > wallet.balanceMinor) return null;
    wallet.balanceMinor -= amountMinor;
    wallet.lastUpdate = new Date().toISOString();
    return this.recordTx(playerId, {
      kind: 'wager',
      amountMinor,
      currency: wallet.currency,
      status: 'approved',
      balanceAfterMinor: wallet.balanceMinor,
    });
  }

  /** Credit a win to the wallet. */
  credit(playerId: string, amountMinor: number): WalletTransaction {
    const wallet = this.getOrCreate(playerId);
    if (amountMinor < 0) throw new RangeError('credit: amountMinor must be ≥ 0');
    wallet.balanceMinor += amountMinor;
    wallet.lastUpdate = new Date().toISOString();
    return this.recordTx(playerId, {
      kind: 'win',
      amountMinor,
      currency: wallet.currency,
      status: 'approved',
      balanceAfterMinor: wallet.balanceMinor,
    });
  }

  transactions(playerId: string): WalletTransaction[] {
    return (this.transactionsByPlayer.get(playerId) ?? []).slice();
  }

  reset(): void {
    this.wallets.clear();
    this.transactionsByPlayer.clear();
    this.seq = 0;
  }

  private recordTx(
    playerId: string,
    tx: Omit<WalletTransaction, 'transactionId' | 'playerId' | 'timestamp'>
  ): WalletTransaction {
    this.seq++;
    const full: WalletTransaction = {
      ...tx,
      playerId,
      transactionId: `tx-${this.seq.toString(16).padStart(10, '0')}`,
      timestamp: new Date().toISOString(),
    };
    const list = this.transactionsByPlayer.get(playerId) ?? [];
    list.push(full);
    this.transactionsByPlayer.set(playerId, list);
    return full;
  }
}
