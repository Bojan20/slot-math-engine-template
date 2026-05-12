//! Faza 11.9 — Static jurisdiction profiles.

use super::types::JurisdictionProfile;

pub static UKGC: JurisdictionProfile = JurisdictionProfile {
    id: "UKGC",
    name: "UK Gambling Commission",
    rtp_range: [0.94, 0.99],
    max_win_x: None,
    prohibited_features: &["gamble", "buy_feature"],
    require_ldw_disclosure: true,
    require_session_time_display: true,
    required_near_miss_rule: Some("must_be_random"),
    informational_notes: &[
        "Auto-play is prohibited for online slots (LCCP SR Code 7.1.2, effective 31 Oct 2021).",
        "Maximum stake must not exceed £125 per spin.",
        "RNG must hold a certificate from an approved test house.",
        "Mandatory RTP disclosure to players on game load screen.",
    ],
};

pub static MGA: JurisdictionProfile = JurisdictionProfile {
    id: "MGA",
    name: "Malta Gaming Authority",
    rtp_range: [0.92, 0.99],
    max_win_x: Some(250_000.0),
    prohibited_features: &[],
    require_ldw_disclosure: true,
    require_session_time_display: true,
    required_near_miss_rule: Some("must_be_random"),
    informational_notes: &[
        "Session time reminder must display every 60 minutes.",
        "RNG must be certified by an approved test laboratory.",
    ],
};

pub static ADM: JurisdictionProfile = JurisdictionProfile {
    id: "ADM",
    name: "Agenzia delle Dogane e dei Monopoli (Italy)",
    rtp_range: [0.85, 0.97],
    max_win_x: Some(1_000.0),
    prohibited_features: &["gamble"],
    require_ldw_disclosure: true,
    require_session_time_display: true,
    required_near_miss_rule: Some("must_be_random"),
    informational_notes: &[
        "Maximum jackpot per play: \u{20ac}1,000 (VLT) or \u{20ac}100 (AWP).",
        "Only EUR currency is allowed.",
        "Auto-play is prohibited.",
    ],
};

pub static BMM: JurisdictionProfile = JurisdictionProfile {
    id: "BMM",
    name: "BMM Testlabs / GLI-16",
    rtp_range: [0.80, 0.99],
    max_win_x: None,
    prohibited_features: &[],
    require_ldw_disclosure: false,
    require_session_time_display: false,
    required_near_miss_rule: Some("must_be_random"),
    informational_notes: &[
        "GLI-16 v3 requires RTP verification within \u{b1}0.05% of declared value.",
        "PAR sheet must be available and match IR declarations.",
        "Recall capability (hash-chained audit trail) required for GLI-16 \u{a7}4.5.",
    ],
};

pub static GLI19: JurisdictionProfile = JurisdictionProfile {
    id: "GLI19",
    name: "Gaming Laboratories International Standard 19",
    rtp_range: [0.80, 0.99],
    max_win_x: None,
    prohibited_features: &[],
    require_ldw_disclosure: false,
    require_session_time_display: false,
    required_near_miss_rule: Some("must_be_random"),
    informational_notes: &[
        "Hash-chained spin audit trail required (Faza 8.5 recall journal satisfies this).",
        "Minimum 5-year audit log retention.",
        "Replay capability from any stored spin required.",
    ],
};

pub static AGCO: JurisdictionProfile = JurisdictionProfile {
    id: "AGCO",
    name: "Alcohol and Gaming Commission of Ontario",
    rtp_range: [0.85, 0.99],
    max_win_x: None,
    prohibited_features: &["gamble"],
    require_ldw_disclosure: true,
    require_session_time_display: true,
    required_near_miss_rule: Some("must_be_random"),
    informational_notes: &[
        "Mandatory pre-commitment tools \u{2014} not modelled in IR.",
        "Auto-play restricted (manual stop required).",
    ],
};

pub static DGA: JurisdictionProfile = JurisdictionProfile {
    id: "DGA",
    name: "Spillemyndigheden (Denmark)",
    rtp_range: [0.92, 0.99],
    max_win_x: None,
    prohibited_features: &[],
    require_ldw_disclosure: true,
    require_session_time_display: true,
    required_near_miss_rule: Some("must_be_random"),
    informational_notes: &[
        "Self-exclusion integration with ROFUS required.",
        "RNG must be tested by accredited test house.",
    ],
};

pub static NJDGE: JurisdictionProfile = JurisdictionProfile {
    id: "NJDGE",
    name: "New Jersey Division of Gaming Enforcement",
    rtp_range: [0.83, 0.99],
    max_win_x: None,
    prohibited_features: &[],
    require_ldw_disclosure: true,
    require_session_time_display: true,
    required_near_miss_rule: Some("must_be_random"),
    informational_notes: &[
        "RNG must be approved by NJDGE or a DGE-approved testing lab.",
        "PAR sheet submission required for each game variant.",
    ],
};

pub static ALL_PROFILES: &[&JurisdictionProfile] = &[
    &UKGC, &MGA, &ADM, &BMM, &GLI19, &AGCO, &DGA, &NJDGE,
];

pub fn get_profile(id: &str) -> Option<&'static JurisdictionProfile> {
    ALL_PROFILES.iter().copied().find(|p| p.id == id)
}
