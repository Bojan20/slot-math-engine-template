"""W7.6 — Player betting strategies.

Each `Strategy` is a state machine that decides the next bet size +
whether to continue playing given the per-spin payout history.

Common interface:

    s = Martingale(base_bet=1.0, max_bet=64.0)
    s.reset(bankroll=100.0)
    while s.continue_playing():
        bet = s.next_bet()           # how much to wager next spin
        payout = engine_spin(bet)    # MC payout for this bet (× total bet)
        s.observe(bet, payout)       # update internal state

The strategy ends when `continue_playing()` returns False (bankroll
exhausted, stop-loss hit, win-target hit, or session-length cap).
"""
from __future__ import annotations
from abc import ABC, abstractmethod


class Strategy(ABC):
    """Base class for player betting strategies."""

    name: str = "Strategy"

    def __init__(
        self,
        base_bet: float = 1.0,
        bankroll: float = 100.0,
        max_session_spins: int = 1000,
    ):
        self.base_bet = float(base_bet)
        self.starting_bankroll = float(bankroll)
        self.max_session_spins = int(max_session_spins)
        # Mutable session state
        self.bankroll = self.starting_bankroll
        self.spins_played = 0
        self.total_wagered = 0.0
        self.total_won = 0.0
        self.peak_bankroll = self.starting_bankroll
        self.trough_bankroll = self.starting_bankroll
        self.ruin = False
        self.history_payouts: list[float] = []

    def reset(self, bankroll: float | None = None) -> None:
        """Restart session with optional new bankroll."""
        if bankroll is not None:
            self.starting_bankroll = float(bankroll)
        self.bankroll = self.starting_bankroll
        self.spins_played = 0
        self.total_wagered = 0.0
        self.total_won = 0.0
        self.peak_bankroll = self.starting_bankroll
        self.trough_bankroll = self.starting_bankroll
        self.ruin = False
        self.history_payouts = []

    def continue_playing(self) -> bool:
        """Override-able termination condition. Default:
        - bankroll must cover the strategy's next intended bet
        - session-length cap not yet reached

        Ruin flag: independently of cap, a session ending with bankroll
        below half the base bet is recorded as ruin.
        """
        # Independent ruin flag — fires whenever bankroll drops below
        # half base bet, regardless of why the session ends.
        if self.bankroll < self.base_bet * 0.5:
            self.ruin = True
        if self.spins_played >= self.max_session_spins:
            return False
        if self.bankroll < self.next_bet() - 1e-9:
            return False
        return True

    @abstractmethod
    def next_bet(self) -> float:
        """The bet size this strategy wants to wager next."""

    def observe(self, bet: float, payout: float) -> None:
        """Update state given the just-completed spin.

        `bet` is total wagered this spin; `payout` is total received
        (in same currency units; payout > bet means net win)."""
        self.bankroll -= bet
        self.bankroll += payout
        self.spins_played += 1
        self.total_wagered += bet
        self.total_won += payout
        self.history_payouts.append(payout - bet)
        if self.bankroll > self.peak_bankroll:
            self.peak_bankroll = self.bankroll
        if self.bankroll < self.trough_bankroll:
            self.trough_bankroll = self.bankroll
        self._on_spin_complete(bet, payout)

    def _on_spin_complete(self, bet: float, payout: float) -> None:
        """Hook for subclasses to update internal sub-state. Default no-op."""

    @property
    def net_pnl(self) -> float:
        return self.bankroll - self.starting_bankroll

    @property
    def max_drawdown(self) -> float:
        """Largest peak-to-trough bankroll drop during the session."""
        return self.peak_bankroll - self.trough_bankroll


# ─── concrete strategies ────────────────────────────────────────────────────


class FixedBet(Strategy):
    """Baseline: always bet `base_bet`, never adjust. Sessions end on
    bankroll exhaustion or session-length cap."""

    name = "FixedBet"

    def next_bet(self) -> float:
        return self.base_bet


class Martingale(Strategy):
    """Classic Martingale: double bet after each loss, reset to base on
    a win. Bet bounded by `max_bet` to avoid unbounded escalation."""

    name = "Martingale"

    def __init__(self, base_bet: float = 1.0, bankroll: float = 100.0,
                 max_session_spins: int = 1000, max_bet: float = 64.0):
        super().__init__(base_bet, bankroll, max_session_spins)
        self.max_bet = float(max_bet)
        self.current_bet = base_bet

    def reset(self, bankroll: float | None = None) -> None:
        super().reset(bankroll)
        self.current_bet = self.base_bet

    def next_bet(self) -> float:
        return min(self.current_bet, self.max_bet)

    def _on_spin_complete(self, bet: float, payout: float) -> None:
        if payout >= bet:  # win or push → reset
            self.current_bet = self.base_bet
        else:
            # Loss → double, capped by max_bet
            self.current_bet = min(self.current_bet * 2.0, self.max_bet)


class AntiMartingale(Strategy):
    """Reverse Martingale (Paroli): double bet after each WIN, reset on
    a loss. Capped by `max_bet`."""

    name = "AntiMartingale"

    def __init__(self, base_bet: float = 1.0, bankroll: float = 100.0,
                 max_session_spins: int = 1000, max_bet: float = 64.0):
        super().__init__(base_bet, bankroll, max_session_spins)
        self.max_bet = float(max_bet)
        self.current_bet = base_bet

    def reset(self, bankroll: float | None = None) -> None:
        super().reset(bankroll)
        self.current_bet = self.base_bet

    def next_bet(self) -> float:
        return min(self.current_bet, self.max_bet)

    def _on_spin_complete(self, bet: float, payout: float) -> None:
        if payout > bet:
            self.current_bet = min(self.current_bet * 2.0, self.max_bet)
        else:
            self.current_bet = self.base_bet


class StopLoss(Strategy):
    """Fixed bet, but quits as soon as cumulative loss exceeds
    `loss_threshold` (in starting-bankroll units, e.g. 0.5 = stop at
    -50% bankroll)."""

    name = "StopLoss"

    def __init__(self, base_bet: float = 1.0, bankroll: float = 100.0,
                 max_session_spins: int = 1000, loss_threshold: float = 0.5):
        super().__init__(base_bet, bankroll, max_session_spins)
        self.loss_threshold = float(loss_threshold)

    def next_bet(self) -> float:
        return self.base_bet

    def continue_playing(self) -> bool:
        if not super().continue_playing():
            return False
        loss_fraction = (self.starting_bankroll - self.bankroll) / max(
            self.starting_bankroll, 1.0
        )
        return loss_fraction < self.loss_threshold


class WinChase(Strategy):
    """Fixed bet, but quits when cumulative WIN exceeds `win_target`
    (e.g. 0.5 = stop at +50% bankroll). Player "chases" until they
    hit a profit target then walks away."""

    name = "WinChase"

    def __init__(self, base_bet: float = 1.0, bankroll: float = 100.0,
                 max_session_spins: int = 1000, win_target: float = 0.5):
        super().__init__(base_bet, bankroll, max_session_spins)
        self.win_target = float(win_target)

    def next_bet(self) -> float:
        return self.base_bet

    def continue_playing(self) -> bool:
        if not super().continue_playing():
            return False
        win_fraction = (self.bankroll - self.starting_bankroll) / max(
            self.starting_bankroll, 1.0
        )
        return win_fraction < self.win_target


# Convenience defaults for cohort sim
DEFAULT_STRATEGIES: list[Strategy] = [
    FixedBet(base_bet=1.0, bankroll=100.0, max_session_spins=500),
    Martingale(base_bet=1.0, bankroll=100.0, max_session_spins=500, max_bet=32.0),
    AntiMartingale(base_bet=1.0, bankroll=100.0, max_session_spins=500, max_bet=32.0),
    StopLoss(base_bet=1.0, bankroll=100.0, max_session_spins=500, loss_threshold=0.5),
    WinChase(base_bet=1.0, bankroll=100.0, max_session_spins=500, win_target=0.5),
]
