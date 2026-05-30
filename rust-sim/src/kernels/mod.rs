//! W244 math kernel Rust ports.
//!
//! Hot-path implementations of the W244 closed-form kernels. Each
//! kernel mirrors its `tools/math_dsl/*.py` counterpart with 1:1 math
//! semantics and byte-identical output (within float64 epsilon).
//!
//! Parity gate: `tools/parity/w244_rust_python_parity.py` runs both
//! Python and Rust paths over identical fixtures and asserts equal RTP.
//!
//! Performance target: 10-50× speedup vs Python (sub-millisecond →
//! sub-microsecond per kernel evaluation).

pub mod both_ways;
pub mod cascade;
pub mod charge_meter;
pub mod cluster_pays;
pub mod expanding_symbol;
pub mod money_collect;
pub mod must_hit_by;
pub mod pay_anywhere;
pub mod stacked_wilds;
pub mod wheel;

// Re-export common types
pub use both_ways::{both_ways_rtp, BothWaysParams};
pub use cascade::{cascade_rtp, CascadeParams};
pub use charge_meter::{charge_meter_rtp, ChargeMeterParams, ChargeTier};
pub use cluster_pays::{cluster_pays_rtp, ClusterPaysParams};
pub use expanding_symbol::{expanding_symbol_rtp, ExpandingSymbolParams};
pub use money_collect::{money_collect_rtp_contribution, MoneyCollectParams};
pub use must_hit_by::{must_hit_by_rtp, MustHitByParams, MustHitByPot};
pub use pay_anywhere::{pay_anywhere_rtp, PayAnywhereParams};
pub use stacked_wilds::{stacked_wilds_rtp, StackedWildsParams};
pub use wheel::{wheel_rtp, WheelParams, WheelSegment};
