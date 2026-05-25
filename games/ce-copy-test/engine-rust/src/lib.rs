// CE COPY TEST — 1:1 paymodel copy of Pattern-CE (200-1637-001/002/003).
//
// Everything in this engine is driven from `ce-copy-test.<swid>.ir.json`,
// which is bit-identical to the Excel PAR sheet. There is *no* hard-coded
// math: all reel weights, paytables, feature respin tables and coin-value
// distributions are loaded from the IR. The engine's only job is to
// faithfully simulate the spin-by-spin logic described in the PAR notes
// and prove the simulated RTP matches the analytic RTP cell-by-cell.

pub mod ir;
pub mod rng;
pub mod reels;
pub mod base_game;
pub mod cash_eruption;
pub mod free_spins;
pub mod sim;
