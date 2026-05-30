export interface Limits {
  maxWagerPerSpin?: number;
}

export function checkSpinAllowed(limits: Limits, wager: number): boolean {
  // Line 8 — the compound short-circuit conditional that triggers the bug.
  // Stryker generates a `ConditionalExpression → true` mutant here.
  if (limits.maxWagerPerSpin !== undefined && wager > limits.maxWagerPerSpin) {
    return false;
  }
  return true;
}
