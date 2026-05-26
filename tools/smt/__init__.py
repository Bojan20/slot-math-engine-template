"""W7.3 — SMT/Z3 closed-form RTP synthesizer.

Industry-first application of Z3 SMT solver to slot math synthesis.
Given a target RTP and a parametric IR family (paytable + reel weight
variables), the solver computes EXACT (rational) parameter values that
satisfy the closed-form RTP equation — no Monte Carlo, no convergence,
no random seed needed.

Why this matters:
  - Monte Carlo gives a *measurement*; this gives a *proof*.
  - For regulated jurisdictions (UKGC RTS-7, MGA Art. 11), an exact
    closed-form derivation is stronger evidence than billions of spins.
  - Closes Phase 6 of the SLOTH_MASTER roadmap (5/5 industry-first
    kernels: μ+λ ES, NSGA-II Pareto, Merkle provenance, behavior
    cohort sim, AND SMT synthesis).
"""
