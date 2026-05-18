/**
 * Example: Cabinet driver skeleton.
 *
 * Runs on the cabinet onboard computer. Bridges the spin button to the
 * engine GaaS spin endpoint, then drives the reel-stop animation.
 *
 * Expected output (truncated):
 *   cabinet boot, serial=SN-0001
 *   spin button pressed: bet=$1.00
 *   spin result: reel-stop=[[HP,MP,LP], ...], win=$0.50
 *   meter update: coinIn=100, coinOut=50
 *
 * Run:
 *   tsx examples/cabinet-driver.ts
 */

import { SlotMathClient, SlotMathLiveClient } from '@slot-math-engine/sdk';

interface CabinetState {
  serial: string;
  sessionId: string;
  balance: number;
}

const state: CabinetState = {
  serial: process.env.CABINET_SERIAL ?? 'SN-0001',
  sessionId: process.env.CABINET_SESSION ?? 'sess-cabinet-0001',
  balance: 100,
};

const client = new SlotMathClient({
  apiUrl: process.env.API_URL ?? 'http://localhost:4000',
  apiKey: process.env.API_KEY ?? '',
});

const live = new SlotMathLiveClient({
  apiUrl: process.env.API_URL ?? 'http://localhost:4000',
  apiKey: process.env.API_KEY ?? '',
});

async function boot(): Promise<void> {
  console.log(`cabinet boot, serial=${state.serial}`);
  await live.connect();
  live.subscribe([state.sessionId]);
  live.on('wallet-update', (e) => {
    state.balance = e.balance;
    cabinetMeterTick({ coinIn: 0, coinOut: 0, balance: e.balance });
  });
}

async function onSpinButton(betAmount: number): Promise<void> {
  console.log(`spin button pressed: bet=$${betAmount.toFixed(2)}`);
  const result = await client.spin('demo-1', state.sessionId, betAmount);
  console.log(
    `spin result: reel-stop=${JSON.stringify(result.reelStop)}, win=$${result.totalWin.toFixed(2)}`
  );
  cabinetAnimateReels(result.reelStop);
  cabinetMeterTick({
    coinIn: Math.round(betAmount * 100),
    coinOut: Math.round(result.totalWin * 100),
    balance: result.balance,
  });
}

function cabinetAnimateReels(reelStop: string[][]): void {
  // Real driver: hand off to the cabinet's GPU. Here we just log.
  for (let r = 0; r < reelStop.length; r++) {
    void reelStop[r];
  }
}

function cabinetMeterTick(m: { coinIn: number; coinOut: number; balance: number }): void {
  console.log(`meter update: coinIn=${m.coinIn}, coinOut=${m.coinOut}`);
}

async function main(): Promise<void> {
  await boot();
  // Simulate two button presses.
  await onSpinButton(1.0);
  await onSpinButton(1.0);
  setTimeout(() => live.close(), 1000);
}

main().catch((err) => {
  console.error('cabinet driver crashed', err);
  process.exit(1);
});
