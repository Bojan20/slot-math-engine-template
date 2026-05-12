//! GLI-16 compliant PAR Sheet generator — Faza 8 extended.
//!
//! Produces a structured [`PARSheet`] that can be serialised to JSON or
//! printed as a human-readable report. The field set mirrors GLI-16 Appendix D
//! requirements for slot math certification.
//!
//! ### Sections
//! 1. **Meta** — game id, version, simulation parameters
//! 2. **RTP summary** — total, base game, features, per-feature breakdown
//! 3. **Hit frequency** — overall hit rate, feature trigger 1-in-N averages
//! 4. **Volatility** — Welford CV, actual variance, max win, category
//! 5. **Win distribution** — HDR histogram mapped to standard report buckets
//! 6. **Jackpot section** — per-tier hit frequency, avg payout, RTP contribution
//! 7. **Compliance** — RTP range, max-win cap, jurisdiction notes
//! 8. **Statistical confidence** — CI-95%/99%/99.9%, std error, seed count
//! 9. **Quantiles** *(Faza 8)* — P50/P90/P99/P99.9 from HDR
//! 10. **Moments** *(Faza 8)* — Welford mean, variance, skewness, excess kurtosis
//! 11. **Bonus distances** *(Faza 8)* — FS + H&W inter-trigger distribution
//! 12. **Required spins** *(Faza 8)* — sample-size estimates for precision targets

use crate::jackpot::JackpotMetrics;
use crate::stats::{AtomicStats, PARMetrics, HDR_BUCKET_COUNT};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::atomic::Ordering;

// ─── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PARMeta {
    pub game_id: String,
    pub game_version: String,
    pub engine_version: String,
    pub generated_at_utc: String,
    pub total_spins: u64,
    pub seeds_used: u32,
    pub rng_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RTPSection {
    pub total_rtp_pct: f64,
    pub base_rtp_pct: f64,
    pub free_spins_rtp_pct: f64,
    pub hold_and_win_rtp_pct: f64,
    pub cascade_rtp_pct: f64,
    pub jackpot_rtp_pct: f64,
    pub target_rtp_pct: f64,
    pub rtp_tolerance_pct: f64,
    pub within_tolerance: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HitFreqSection {
    pub overall_hit_rate_pct: f64,
    pub base_hit_rate_pct: f64,
    pub feature_freq: BTreeMap<String, f64>,
    pub avg_fs_spins: f64,
    pub avg_hnw_respins: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolatilitySection {
    /// Coefficient of variation σ/μ (Welford-based).
    pub cv: f64,
    /// Per-spin win variance (bet multiples²) from Welford accumulator.
    pub variance: f64,
    /// Standard deviation (bet multiples) from Welford accumulator.
    pub std_dev: f64,
    /// Maximum single-spin win in bet multiples.
    pub max_win_x: f64,
    /// Qualitative volatility category.
    pub category: String,
}

/// One win-distribution bucket in the PAR report.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WinBucket {
    pub from_x: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_x: Option<f64>,
    pub label: String,
    pub count: u64,
    pub probability: f64,
    pub rtp_contribution_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceSection {
    pub jurisdictions: Vec<String>,
    pub rtp_range_required: [f64; 2],
    pub rtp_within_required: bool,
    pub max_win_cap_required: f64,
    pub max_win_within_cap: bool,
    pub near_miss_rule: String,
    pub ldw_disclosure: bool,
    pub session_time_display: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatisticalSection {
    pub ci_95_low: f64,
    pub ci_95_high: f64,
    /// CI 99% — Faza 8.
    #[serde(default)]
    pub ci_99_low: f64,
    #[serde(default)]
    pub ci_99_high: f64,
    /// CI 99.9% — Faza 8.
    #[serde(default)]
    pub ci_999_low: f64,
    #[serde(default)]
    pub ci_999_high: f64,
    pub std_error: f64,
    pub std_dev_across_seeds: f64,
    /// True when `std_error < 0.1pp` — threshold for GLI adequacy.
    pub confidence_adequate: bool,
}

// ─── Faza 8 sections ──────────────────────────────────────────────────────────

/// P-quantile report section (from HDR histogram).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct QuantileSection {
    pub p50: f64,
    pub p90: f64,
    pub p99: f64,
    pub p999: f64,
}

/// Welford online 4-moment snapshot.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MomentsSection {
    /// Mean per-spin win in bet multiples.
    pub mean_win_x: f64,
    /// Per-spin win variance (bet multiples²).
    pub variance: f64,
    /// Per-spin win std deviation (bet multiples).
    pub std_dev: f64,
    /// Coefficient of variation σ/μ.
    pub cv: f64,
    /// Population skewness (Terriberry algorithm).
    pub skewness: f64,
    /// Excess kurtosis (Pearson − 3; normal = 0).
    pub excess_kurtosis: f64,
    /// Number of observations in the accumulator.
    pub sample_count: u64,
}

/// Per-feature bonus distance statistics.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BonusDistanceEntry {
    /// Mean spins between consecutive triggers (Infinity if never triggered).
    pub mean_distance: f64,
    /// Maximum spins between consecutive triggers.
    pub max_distance: u64,
}

/// FS + H&W inter-trigger distance statistics.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BonusDistancesSection {
    pub free_spins: BonusDistanceEntry,
    pub hold_and_win: BonusDistanceEntry,
}

/// Required spin counts for precision targets.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RequiredSpinsSection {
    /// Spins needed for 0.1pp CI half-width at 95% confidence.
    pub for_01pp_ci_95: u64,
    /// Spins needed for 0.01pp CI half-width at 95% confidence.
    pub for_001pp_ci_95: u64,
    /// Spins needed for 0.1pp CI half-width at 99% confidence.
    pub for_01pp_ci_99: u64,
}

/// Complete GLI-compliant PAR sheet (serialisable to JSON).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PARSheet {
    pub schema_version: String,
    pub meta: PARMeta,
    pub rtp: RTPSection,
    pub hit_frequency: HitFreqSection,
    pub volatility: VolatilitySection,
    pub win_distribution: Vec<WinBucket>,
    pub jackpots: Vec<JackpotMetrics>,
    pub compliance: ComplianceSection,
    pub statistics: StatisticalSection,
    // ── Faza 8 additions (serde default so old JSON still deserialises) ────────
    #[serde(default)]
    pub quantiles: QuantileSection,
    #[serde(default)]
    pub moments: MomentsSection,
    #[serde(default)]
    pub bonus_distances: BonusDistancesSection,
    #[serde(default)]
    pub required_spins: RequiredSpinsSection,
}

// ─── Generator ────────────────────────────────────────────────────────────────

pub struct PARGenerator;

impl PARGenerator {
    /// Build a complete PAR sheet from accumulated simulation stats.
    ///
    /// All RTP / tolerance values are in **percentage points** (e.g., 96.0).
    #[allow(clippy::too_many_arguments)]
    pub fn generate(
        stats: &AtomicStats,
        par: &PARMetrics,
        jackpots: Vec<JackpotMetrics>,
        game_id: &str,
        game_version: &str,
        target_rtp: f64,
        rtp_tolerance: f64,
        max_win_cap: f64,
        jurisdictions: Vec<String>,
        rtp_range_required: [f64; 2],
        near_miss_rule: &str,
        ldw_disclosure: bool,
        session_time_display: bool,
        seeds_used: u32,
    ) -> PARSheet {
        let total_spins = stats.total_spins.load(Ordering::Relaxed);
        let hdr = stats.get_hdr_histogram();
        let win_distribution = Self::build_win_buckets(&hdr, total_spins);

        let jackpot_rtp_pct: f64 = jackpots.iter().map(|j| j.contribution_rtp * 100.0).sum();

        let actual_rtp = par.total_rtp;
        let within_tolerance = (actual_rtp - target_rtp).abs() <= rtp_tolerance;
        let max_win_within_cap = par.max_win <= max_win_cap;
        let rtp_within_required =
            actual_rtp >= rtp_range_required[0] && actual_rtp <= rtp_range_required[1];

        // Volatility: use Welford-based CV (Faza 8 fix — was using legacy WinDistribution CV).
        let cv = par.welford_cv.max(par.volatility_index); // fall back to legacy if Welford not populated
        let vol_category = Self::volatility_category(cv);

        // Feature frequencies.
        let mut feature_freq = BTreeMap::new();
        if par.fs_frequency > 0.0 {
            feature_freq.insert("free_spins".to_string(), par.fs_frequency);
        }
        if par.hnw_frequency > 0.0 {
            feature_freq.insert("hold_and_win".to_string(), par.hnw_frequency);
        }

        PARSheet {
            schema_version: "1.0.0".to_string(),
            meta: PARMeta {
                game_id: game_id.to_string(),
                game_version: game_version.to_string(),
                engine_version: env!("CARGO_PKG_VERSION").to_string(),
                generated_at_utc: "2026-05-12T00:00:00Z".to_string(),
                total_spins,
                seeds_used,
                rng_kind: "mulberry32".to_string(),
            },
            rtp: RTPSection {
                total_rtp_pct: actual_rtp,
                base_rtp_pct: par.base_rtp,
                free_spins_rtp_pct: par.fs_rtp,
                hold_and_win_rtp_pct: par.hnw_rtp,
                cascade_rtp_pct: par.cascade_rtp,
                jackpot_rtp_pct,
                target_rtp_pct: target_rtp,
                rtp_tolerance_pct: rtp_tolerance,
                within_tolerance,
            },
            hit_frequency: HitFreqSection {
                overall_hit_rate_pct: par.hit_rate,
                base_hit_rate_pct: par.hit_rate,
                feature_freq,
                avg_fs_spins: par.avg_fs_spins,
                avg_hnw_respins: par.avg_hnw_orbs,
            },
            volatility: VolatilitySection {
                cv,
                // Faza 8 fix: use actual Welford variance, not CV².
                variance: par.welford_variance,
                std_dev: par.welford_std_dev,
                max_win_x: par.max_win,
                category: vol_category,
            },
            win_distribution,
            jackpots,
            compliance: ComplianceSection {
                jurisdictions,
                rtp_range_required,
                rtp_within_required,
                max_win_cap_required: max_win_cap,
                max_win_within_cap,
                near_miss_rule: near_miss_rule.to_string(),
                ldw_disclosure,
                session_time_display,
            },
            statistics: StatisticalSection {
                ci_95_low: par.ci_95_low,
                ci_95_high: par.ci_95_high,
                ci_99_low: par.ci_99_low,
                ci_99_high: par.ci_99_high,
                ci_999_low: par.ci_999_low,
                ci_999_high: par.ci_999_high,
                std_error: par.std_error,
                std_dev_across_seeds: 0.0,
                confidence_adequate: par.std_error < 0.1,
            },
            // Faza 8 sections.
            quantiles: QuantileSection {
                p50: par.p50,
                p90: par.p90,
                p99: par.p99,
                p999: par.p999,
            },
            moments: MomentsSection {
                mean_win_x: par.welford_mean,
                variance: par.welford_variance,
                std_dev: par.welford_std_dev,
                cv: par.welford_cv,
                skewness: par.welford_skewness,
                excess_kurtosis: par.welford_excess_kurtosis,
                sample_count: par.welford_sample_count,
            },
            bonus_distances: BonusDistancesSection {
                free_spins: BonusDistanceEntry {
                    mean_distance: par.fs_mean_distance,
                    max_distance: par.fs_max_distance,
                },
                hold_and_win: BonusDistanceEntry {
                    mean_distance: par.hnw_mean_distance,
                    max_distance: par.hnw_max_distance,
                },
            },
            required_spins: RequiredSpinsSection {
                for_01pp_ci_95: par.required_spins_01pp_95,
                for_001pp_ci_95: par.required_spins_001pp_95,
                for_01pp_ci_99: par.required_spins_01pp_99,
            },
        }
    }

    /// Volatility category from CV.
    ///
    /// Fixed in Faza 8: was `match cv as u32` which truncated CV < 1.0 to 0 → always VERY_LOW.
    fn volatility_category(cv: f64) -> String {
        if cv < 0.5 {
            "VERY_LOW"
        } else if cv < 2.0 {
            "LOW"
        } else if cv < 5.0 {
            "MEDIUM"
        } else if cv < 10.0 {
            "HIGH"
        } else if cv < 20.0 {
            "VERY_HIGH"
        } else {
            "EXTREME"
        }
        .to_string()
    }

    /// Map the HDR histogram snapshot to labelled WinBucket rows.
    fn build_win_buckets(hdr: &[u64; HDR_BUCKET_COUNT], total_spins: u64) -> Vec<WinBucket> {
        use crate::stats::HdrHistogram;
        let thresholds = HdrHistogram::THRESHOLDS;
        let mut buckets = Vec::with_capacity(HDR_BUCKET_COUNT);

        let zero_count = hdr[0];
        let zero_prob = if total_spins > 0 {
            zero_count as f64 / total_spins as f64
        } else {
            0.0
        };
        buckets.push(WinBucket {
            from_x: 0.0,
            to_x: Some(0.0),
            label: "no win".to_string(),
            count: zero_count,
            probability: zero_prob,
            rtp_contribution_pct: 0.0,
        });

        for i in 0..thresholds.len() {
            let from = if i == 0 { 0.0 } else { thresholds[i - 1] };
            let to = thresholds[i];
            let count = hdr[i + 1];
            let prob = if total_spins > 0 {
                count as f64 / total_spins as f64
            } else {
                0.0
            };
            let midpoint = (from + to) / 2.0;
            buckets.push(WinBucket {
                from_x: from,
                to_x: Some(to),
                label: format!("{from:.1}x–{to:.1}x"),
                count,
                probability: prob,
                rtp_contribution_pct: prob * midpoint * 100.0,
            });
        }

        let top_from = *thresholds.last().unwrap_or(&50000.0);
        let top_count = hdr[HDR_BUCKET_COUNT - 1];
        let top_prob = if total_spins > 0 {
            top_count as f64 / total_spins as f64
        } else {
            0.0
        };
        buckets.push(WinBucket {
            from_x: top_from,
            to_x: None,
            label: format!("{top_from:.0}x+"),
            count: top_count,
            probability: top_prob,
            rtp_contribution_pct: top_prob * top_from * 100.0,
        });

        buckets
    }

    /// Pretty-print a PAR sheet to stdout in GLI report style.
    pub fn print(par: &PARSheet) {
        let w = 74usize;
        let rule = "═".repeat(w - 2);

        println!("╔{rule}╗");
        println!(
            "║  PAR SHEET  ─  {}  v{:<width$}║",
            par.meta.game_id,
            par.meta.game_version,
            width = w.saturating_sub(par.meta.game_id.len() + par.meta.game_version.len() + 18)
        );
        println!(
            "║  Engine v{}  ·  Spins: {:>14}  ·  Seeds: {:<width$}║",
            par.meta.engine_version,
            par.meta.total_spins,
            par.meta.seeds_used,
            width = w.saturating_sub(
                par.meta.engine_version.len() + par.meta.seeds_used.to_string().len() + 33
            )
        );
        println!("╠{rule}╣");

        // RTP section.
        println!("║  RTP{:<width$}║", "", width = w - 6);
        println!(
            "║    Total:       {:>8.4}%   target {:.4}% ± {:.4}%  {:<width$}║",
            par.rtp.total_rtp_pct,
            par.rtp.target_rtp_pct,
            par.rtp.rtp_tolerance_pct,
            if par.rtp.within_tolerance {
                "✓"
            } else {
                "✗ OUT OF TOLERANCE"
            },
            width = w.saturating_sub(57)
        );
        println!(
            "║    Base game:   {:>8.4}%{:<width$}║",
            par.rtp.base_rtp_pct,
            "",
            width = w - 30
        );
        println!(
            "║    Free Spins:  {:>8.4}%{:<width$}║",
            par.rtp.free_spins_rtp_pct,
            "",
            width = w - 30
        );
        println!(
            "║    Hold & Win:  {:>8.4}%{:<width$}║",
            par.rtp.hold_and_win_rtp_pct,
            "",
            width = w - 30
        );
        if par.rtp.cascade_rtp_pct > 0.0 {
            println!(
                "║    Cascade:     {:>8.4}%{:<width$}║",
                par.rtp.cascade_rtp_pct,
                "",
                width = w - 30
            );
        }
        if par.rtp.jackpot_rtp_pct > 0.0 {
            println!(
                "║    Jackpot:     {:>8.4}%{:<width$}║",
                par.rtp.jackpot_rtp_pct,
                "",
                width = w - 30
            );
        }
        println!("╠{rule}╣");

        // Hit frequency.
        println!("║  HIT FREQUENCY{:<width$}║", "", width = w - 17);
        println!(
            "║    Overall:     {:>8.4}%{:<width$}║",
            par.hit_frequency.overall_hit_rate_pct,
            "",
            width = w - 30
        );
        for (kind, freq) in &par.hit_frequency.feature_freq {
            if freq.is_finite() {
                let line = format!("    {kind:.20}  1 in {freq:>12.1} spins");
                println!("║  {line:<width$}║", width = w - 4);
            }
        }
        if par.hit_frequency.avg_fs_spins > 0.0 {
            println!(
                "║    Avg FS spins:{:>8.1}{:<width$}║",
                par.hit_frequency.avg_fs_spins,
                "",
                width = w - 30
            );
        }
        println!("╠{rule}╣");

        // Volatility — Faza 8: show Welford variance + skewness.
        println!("║  VOLATILITY{:<width$}║", "", width = w - 13);
        let vol_line = format!(
            "    Category: {}   CV: {:.4}   Max win: {:.1}x",
            par.volatility.category, par.volatility.cv, par.volatility.max_win_x
        );
        println!("║  {vol_line:<width$}║", width = w - 4);
        let mom_line = format!(
            "    Var: {:.4}  σ: {:.4}  Skew: {:.4}  KurtEx: {:.4}",
            par.moments.variance,
            par.moments.std_dev,
            par.moments.skewness,
            par.moments.excess_kurtosis
        );
        println!("║  {mom_line:<width$}║", width = w - 4);

        // Faza 8: Quantiles.
        println!("╠{rule}╣");
        println!("║  QUANTILES{:<width$}║", "", width = w - 12);
        let q_line = format!(
            "    P50: {:.2}x   P90: {:.2}x   P99: {:.2}x   P99.9: {:.2}x",
            par.quantiles.p50, par.quantiles.p90, par.quantiles.p99, par.quantiles.p999
        );
        println!("║  {q_line:<width$}║", width = w - 4);
        println!("╠{rule}╣");

        // Win distribution.
        println!("║  WIN DISTRIBUTION{:<width$}║", "", width = w - 19);
        println!(
            "║    {:<16}  {:>10}  {:>9}  {:>12}{:<width$}║",
            "Range",
            "Count",
            "Prob %",
            "RTP contrib",
            "",
            width = w - 55
        );
        let mut shown = 0;
        for bucket in &par.win_distribution {
            if bucket.count == 0 {
                continue;
            }
            if shown >= 20 {
                break;
            }
            shown += 1;
            println!(
                "║    {:<16}  {:>10}  {:>8.4}%  {:>11.4}%{:<width$}║",
                bucket.label,
                bucket.count,
                bucket.probability * 100.0,
                bucket.rtp_contribution_pct,
                "",
                width = w - 55
            );
        }

        if !par.jackpots.is_empty() {
            println!("╠{rule}╣");
            println!("║  JACKPOTS{:<width$}║", "", width = w - 11);
            for j in &par.jackpots {
                let avg = if j.avg_interval.is_infinite() {
                    "never".to_string()
                } else {
                    format!("1 in {:>10.0}", j.avg_interval)
                };
                let line = format!(
                    "    {:.<18}  hits: {:>6}  {}  RTP: {:>6.4}%",
                    j.name,
                    j.hits,
                    avg,
                    j.contribution_rtp * 100.0
                );
                println!("║  {line:<width$}║", width = w - 4);
            }
        }

        println!("╠{rule}╣");

        // Compliance.
        println!("║  COMPLIANCE{:<width$}║", "", width = w - 13);
        println!(
            "║    RTP range:   [{:.2}%, {:.2}%]  {}{:<width$}║",
            par.compliance.rtp_range_required[0],
            par.compliance.rtp_range_required[1],
            if par.compliance.rtp_within_required {
                "✓"
            } else {
                "✗ FAIL"
            },
            "",
            width = w - 42
        );
        println!(
            "║    Max win cap: {:.0}x  {}{:<width$}║",
            par.compliance.max_win_cap_required,
            if par.compliance.max_win_within_cap {
                "✓"
            } else {
                "✗ FAIL"
            },
            "",
            width = w - 24
        );
        let jurs = par.compliance.jurisdictions.join(", ");
        println!(
            "║    Jurisdictions: {jurs:<width$}║",
            width = w - jurs.len() - 20
        );
        println!("╠{rule}╣");

        // Statistical confidence — Faza 8: show all three CI levels.
        println!("║  STATISTICAL CONFIDENCE{:<width$}║", "", width = w - 25);
        println!(
            "║    CI-95%%:      [{:.4}%, {:.4}%]{:<width$}║",
            par.statistics.ci_95_low,
            par.statistics.ci_95_high,
            "",
            width = w - 38
        );
        println!(
            "║    CI-99%%:      [{:.4}%, {:.4}%]{:<width$}║",
            par.statistics.ci_99_low,
            par.statistics.ci_99_high,
            "",
            width = w - 38
        );
        println!(
            "║    CI-99.9%%:    [{:.4}%, {:.4}%]{:<width$}║",
            par.statistics.ci_999_low,
            par.statistics.ci_999_high,
            "",
            width = w - 38
        );
        println!(
            "║    Std error:   {:>8.4}pp  {}{:<width$}║",
            par.statistics.std_error,
            if par.statistics.confidence_adequate {
                "adequate"
            } else {
                "INSUFFICIENT"
            },
            "",
            width = w - 34
        );

        // Faza 8: Required spins.
        println!("╠{rule}╣");
        println!(
            "║  REQUIRED SPINS FOR PRECISION{:<width$}║",
            "",
            width = w - 31
        );
        println!(
            "║    0.1pp @ 95%%:  {:>12}{:<width$}║",
            par.required_spins.for_01pp_ci_95,
            "",
            width = w - 31
        );
        println!(
            "║    0.01pp @ 95%: {:>12}{:<width$}║",
            par.required_spins.for_001pp_ci_95,
            "",
            width = w - 31
        );
        println!(
            "║    0.1pp @ 99%%:  {:>12}{:<width$}║",
            par.required_spins.for_01pp_ci_99,
            "",
            width = w - 31
        );

        // Faza 8: Bonus distances (only if triggered at all).
        if par.bonus_distances.free_spins.mean_distance.is_finite()
            || par.bonus_distances.hold_and_win.mean_distance.is_finite()
        {
            println!("╠{rule}╣");
            println!(
                "║  BONUS INTER-TRIGGER DISTANCES{:<width$}║",
                "",
                width = w - 32
            );
            if par.bonus_distances.free_spins.mean_distance.is_finite() {
                println!(
                    "║    Free Spins:  mean {:>10.1}  max {:>8}{:<width$}║",
                    par.bonus_distances.free_spins.mean_distance,
                    par.bonus_distances.free_spins.max_distance,
                    "",
                    width = w - 44
                );
            }
            if par.bonus_distances.hold_and_win.mean_distance.is_finite() {
                println!(
                    "║    Hold & Win:  mean {:>10.1}  max {:>8}{:<width$}║",
                    par.bonus_distances.hold_and_win.mean_distance,
                    par.bonus_distances.hold_and_win.max_distance,
                    "",
                    width = w - 44
                );
            }
        }

        println!("╚{rule}╝");
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stats::{AtomicStats, MultiSeedStats, PARMetrics, SeedStats};
    use std::sync::atomic::Ordering;

    fn make_stats() -> AtomicStats {
        let s = AtomicStats::new();
        s.total_spins.store(1_000_000, Ordering::Relaxed);
        s.total_wagered.store(1_000_000, Ordering::Relaxed);
        s.total_won.store(960_000, Ordering::Relaxed);
        s.total_base_won.store(600_000, Ordering::Relaxed);
        s.total_fs_won.store(360_000, Ordering::Relaxed);
        s.winning_spins.store(330_000, Ordering::Relaxed);
        s.fs_triggers.store(5_000, Ordering::Relaxed);
        s.total_fs_spins.store(60_000, Ordering::Relaxed);
        let mut rng = crate::rng::SlotRng::new(42);
        for i in 0u64..1_000_000 {
            let win = if rng.random() < 0.33 {
                0.0
            } else {
                rng.random() * 100.0
            };
            s.record_win_full(win, 42, i);
            if i % 200 == 0 {
                s.record_fs_trigger(i);
            }
        }
        s
    }

    fn make_par_metrics(stats: &AtomicStats) -> PARMetrics {
        let rtps = [
            96.00, 96.02, 95.98, 96.01, 95.99, 96.03, 95.97, 96.00, 96.01, 95.99, 96.00, 95.98,
            96.02, 96.01, 95.99, 96.00, 96.02, 95.98, 96.01, 95.99,
        ];
        let seeds: Vec<SeedStats> = rtps
            .iter()
            .map(|&rtp| SeedStats {
                spins: 50_000,
                wagered: 50_000,
                won: (50_000.0 * rtp / 100.0) as i64,
                rtp,
            })
            .collect();
        let multi = MultiSeedStats::from_seeds(seeds);
        PARMetrics::from_stats(stats, &multi, 1)
    }

    fn make_par() -> PARSheet {
        let stats = make_stats();
        let par_metrics = make_par_metrics(&stats);
        PARGenerator::generate(
            &stats,
            &par_metrics,
            vec![],
            "test-game",
            "1.0.0",
            96.0,
            0.5,
            5000.0,
            vec!["MGA".to_string(), "UKGC".to_string()],
            [85.0, 99.0],
            "must_be_random",
            true,
            true,
            20,
        )
    }

    // ── Backward-compat tests (identical to Faza 4 unit tests) ────────────────

    #[test]
    fn test_par_generates_all_sections() {
        let par = make_par();
        assert_eq!(par.meta.game_id, "test-game");
        assert_eq!(par.meta.seeds_used, 20);
        assert_eq!(par.meta.total_spins, 1_000_000);
        assert!(!par.win_distribution.is_empty());
        assert!(par.compliance.rtp_within_required);
    }

    #[test]
    fn test_rtp_within_tolerance() {
        let par = make_par();
        assert!(par.rtp.within_tolerance, "96% must be within 96% ± 0.5%");
    }

    #[test]
    fn test_rtp_out_of_tolerance() {
        let stats = make_stats();
        let mut par_metrics = make_par_metrics(&stats);
        par_metrics.total_rtp = 94.0;
        let par = PARGenerator::generate(
            &stats,
            &par_metrics,
            vec![],
            "g",
            "1.0.0",
            96.0,
            0.5,
            5000.0,
            vec![],
            [85.0, 99.0],
            "must_be_random",
            true,
            true,
            1,
        );
        assert!(!par.rtp.within_tolerance);
    }

    #[test]
    fn test_win_distribution_bucket_count() {
        let par = make_par();
        assert_eq!(par.win_distribution.len(), crate::stats::HDR_BUCKET_COUNT);
    }

    #[test]
    fn test_win_distribution_counts_sum_to_spins() {
        let par = make_par();
        let total: u64 = par.win_distribution.iter().map(|b| b.count).sum();
        assert_eq!(total, 1_000_000);
    }

    #[test]
    fn test_compliance_jurisdiction_check() {
        let par = make_par();
        assert!(
            par.compliance.rtp_within_required,
            "96% is within [85%, 99%]"
        );
        assert!(par.compliance.max_win_within_cap);
        assert_eq!(par.compliance.jurisdictions, vec!["MGA", "UKGC"]);
    }

    #[test]
    fn test_statistical_confidence_adequate() {
        let par = make_par();
        assert!(
            par.statistics.confidence_adequate,
            "std_error={}",
            par.statistics.std_error
        );
    }

    #[test]
    fn test_json_roundtrip() {
        let par = make_par();
        let json = serde_json::to_string_pretty(&par).unwrap();
        let par2: PARSheet = serde_json::from_str(&json).unwrap();
        assert_eq!(par.meta.game_id, par2.meta.game_id);
        assert!((par.rtp.total_rtp_pct - par2.rtp.total_rtp_pct).abs() < 1e-12);
        assert_eq!(par.win_distribution.len(), par2.win_distribution.len());
    }

    #[test]
    fn test_print_doesnt_panic() {
        let par = make_par();
        PARGenerator::print(&par);
    }

    // ── Faza 8: Volatility category fix ───────────────────────────────────────

    #[test]
    fn volatility_category_uses_f64_ranges() {
        // CV = 0.3 → < 0.5 → VERY_LOW (old code would give VERY_LOW only coincidentally)
        assert_eq!(PARGenerator::volatility_category(0.3), "VERY_LOW");
        // CV = 0.7 → [0.5, 2.0) → LOW (old code: 0 as u32 → VERY_LOW! BUG fixed)
        assert_eq!(PARGenerator::volatility_category(0.7), "LOW");
        assert_eq!(PARGenerator::volatility_category(1.5), "LOW");
        assert_eq!(PARGenerator::volatility_category(3.0), "MEDIUM");
        assert_eq!(PARGenerator::volatility_category(7.0), "HIGH");
        assert_eq!(PARGenerator::volatility_category(15.0), "VERY_HIGH");
        assert_eq!(PARGenerator::volatility_category(25.0), "EXTREME");
    }

    // ── Faza 8: new sections ──────────────────────────────────────────────────

    #[test]
    fn par_has_quantile_section() {
        let par = make_par();
        // P90 should be greater than P50.
        assert!(
            par.quantiles.p90 >= par.quantiles.p50,
            "P90={} should be >= P50={}",
            par.quantiles.p90,
            par.quantiles.p50
        );
        assert!(
            par.quantiles.p99 >= par.quantiles.p90,
            "P99={} should be >= P90={}",
            par.quantiles.p99,
            par.quantiles.p90
        );
    }

    #[test]
    fn par_has_moments_section() {
        let par = make_par();
        // With 1M spins all recorded via record_win_full, sample count should be 1M.
        assert_eq!(par.moments.sample_count, 1_000_000);
        assert!(par.moments.mean_win_x > 0.0, "mean must be positive");
        assert!(par.moments.variance >= 0.0, "variance must be non-negative");
        assert!(par.moments.std_dev >= 0.0, "std_dev must be non-negative");
    }

    #[test]
    fn par_has_ci_99_and_999() {
        let par = make_par();
        // CI99 must be wider than CI95.
        let width_95 = par.statistics.ci_95_high - par.statistics.ci_95_low;
        let width_99 = par.statistics.ci_99_high - par.statistics.ci_99_low;
        let width_999 = par.statistics.ci_999_high - par.statistics.ci_999_low;
        assert!(width_99 >= width_95, "CI99 must be >= CI95 width");
        assert!(width_999 >= width_99, "CI99.9 must be >= CI99 width");
    }

    #[test]
    fn par_has_required_spins() {
        let par = make_par();
        // Required spins for 0.01pp should be > for 0.1pp.
        assert!(
            par.required_spins.for_001pp_ci_95 > par.required_spins.for_01pp_ci_95,
            "tighter target needs more spins"
        );
        assert!(
            par.required_spins.for_01pp_ci_99 > par.required_spins.for_01pp_ci_95,
            "higher confidence needs more spins"
        );
    }

    #[test]
    fn par_has_bonus_distances() {
        let par = make_par();
        // FS was triggered every 200 spins → mean_distance ≈ 200.
        assert!(
            par.bonus_distances.free_spins.mean_distance.is_finite(),
            "fs mean_distance should be finite"
        );
        assert!(
            (par.bonus_distances.free_spins.mean_distance - 200.0).abs() < 5.0,
            "expected ~200, got {}",
            par.bonus_distances.free_spins.mean_distance
        );
    }

    #[test]
    fn par_variance_uses_welford_not_cv_squared() {
        // The old code had `variance: cv * cv` which is dimensionless and wrong.
        // With Welford, variance is in bet-multiples² ≥ 0.
        let par = make_par();
        // Variance from Welford should be numerically distinct from CV².
        // (For a distribution with mean ~66x and σ ~30x, CV≈0.45, CV²≈0.2
        //  but actual variance ≈ 900 — very different.)
        assert!(
            par.volatility.variance > 1.0 || par.volatility.cv < 0.01,
            "variance={} should be in bet-multiples² (not CV²)",
            par.volatility.variance
        );
    }

    #[test]
    fn par_jackpot_rtp_aggregation() {
        use crate::jackpot::{JackpotKind, JackpotMetrics};
        let stats = make_stats();
        let par_metrics = make_par_metrics(&stats);
        let jackpots = vec![
            JackpotMetrics {
                id: "mini".to_string(),
                name: "MINI".to_string(),
                kind: JackpotKind::Fixed,
                hits: 100,
                avg_interval: 10_000.0,
                total_paid_x: 1_000.0,
                total_contributed_x: 0.0,
                current_pool_x: 10.0,
                contribution_rtp: 0.001,
            },
            JackpotMetrics {
                id: "grand".to_string(),
                name: "GRAND".to_string(),
                kind: JackpotKind::Fixed,
                hits: 2,
                avg_interval: 500_000.0,
                total_paid_x: 10_000.0,
                total_contributed_x: 0.0,
                current_pool_x: 5000.0,
                contribution_rtp: 0.01,
            },
        ];
        let par = PARGenerator::generate(
            &stats,
            &par_metrics,
            jackpots,
            "g",
            "1.0.0",
            96.0,
            0.5,
            5000.0,
            vec![],
            [85.0, 99.0],
            "must_be_random",
            true,
            true,
            1,
        );
        assert!(
            (par.rtp.jackpot_rtp_pct - 1.1).abs() < 1e-9,
            "got {}",
            par.rtp.jackpot_rtp_pct
        );
    }
}
