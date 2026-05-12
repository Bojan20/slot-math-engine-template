//! Faza 11.9 — Jurisdiction Adapter (Rust mirror).
pub mod adapter;
pub mod profiles;
pub mod types;

pub use adapter::{auto_fix, validate};
pub use profiles::get_profile;
pub use types::{AutoFixResult, ComplianceReport, ComplianceViolation, JurisdictionProfile};
