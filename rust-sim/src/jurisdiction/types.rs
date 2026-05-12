//! Faza 11.9 — Jurisdiction types (Rust).

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ViolationSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceViolation {
    pub rule_id: String,
    pub jurisdiction: String,
    pub severity: ViolationSeverity,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
    pub can_auto_fix: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceSummary {
    pub errors: usize,
    pub warnings: usize,
    pub infos: usize,
    pub auto_fixable: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceReport {
    pub checked_jurisdictions: Vec<String>,
    pub violations: Vec<ComplianceViolation>,
    pub is_compliant: bool,
    pub auto_fixable: bool,
    pub summary: ComplianceSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppliedFix {
    pub rule_id: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoFixResult {
    pub applied_fixes: Vec<AppliedFix>,
    pub remaining_violations: Vec<ComplianceViolation>,
    pub is_fully_compliant: bool,
}

/// Jurisdiction requirements profile.
#[derive(Debug, Clone)]
pub struct JurisdictionProfile {
    pub id: &'static str,
    pub name: &'static str,
    pub rtp_range: [f64; 2],
    pub max_win_x: Option<f64>,
    pub prohibited_features: &'static [&'static str],
    pub require_ldw_disclosure: bool,
    pub require_session_time_display: bool,
    pub required_near_miss_rule: Option<&'static str>,
    pub informational_notes: &'static [&'static str],
}
