// W208 — English source of truth for studio i18n.
//
// All translation keys are defined here. Other locales must mirror this
// shape (parity is enforced by the i18n test suite). Use ICU-style
// `{name}` placeholders for interpolation.
//
// Namespaces:
//   nav.*       Navigation / tab labels
//   actions.*   Common button/CTA copy
//   symbols.*   Symbol tier / paytable labels
//   metrics.*   Math KPI labels
//   modals.*    Modal dialog copy
//   errors.*    Error messages
//   tooltips.*  Hover hint text
//   producer.*  Producer-persona KPI labels

export const en = {
  // ── Navigation / tab labels ────────────────────────────────────────
  'nav.build': 'BUILD',
  'nav.compose': 'COMPOSE',
  'nav.catalog': 'CATALOG',
  'nav.play': 'PLAY',
  'nav.sensitivity': 'SENSITIVITY',
  'nav.certify': 'CERTIFY',
  'nav.math': 'MATH',
  'nav.design': 'DESIGN',
  'nav.production': 'PRODUCTION',
  'nav.persona': 'PERSONA',
  'nav.notebook': 'NOTEBOOK',
  'nav.library': 'LIBRARY',

  // ── Common action buttons ──────────────────────────────────────────
  'actions.save': 'Save',
  'actions.cancel': 'Cancel',
  'actions.delete': 'Delete',
  'actions.duplicate': 'Duplicate',
  'actions.run': 'Run',
  'actions.compute': 'Compute',
  'actions.recompute': 'Recompute',
  'actions.export': 'Export',
  'actions.import': 'Import',
  'actions.new_game': 'New Game',
  'actions.new_variant': 'New Variant',
  'actions.load': 'Load',
  'actions.simulate': 'Simulate',
  'actions.spin': 'Spin',
  'actions.close': 'Close',
  'actions.apply': 'Apply',
  'actions.reset': 'Reset',
  'actions.confirm': 'Confirm',

  // ── Symbol tiers / paytable ────────────────────────────────────────
  'symbols.hp': 'High Pay',
  'symbols.mp': 'Mid Pay',
  'symbols.lp': 'Low Pay',
  'symbols.wild': 'Wild',
  'symbols.scatter': 'Scatter',
  'symbols.bonus': 'Bonus',
  'symbols.mult': 'Multiplier',
  'symbols.tier_grand': 'Grand',
  'symbols.tier_major': 'Major',
  'symbols.tier_minor': 'Minor',
  'symbols.tier_mini': 'Mini',
  'symbols.paytable_header_symbol': 'Symbol',
  'symbols.paytable_header_count': 'Count',
  'symbols.paytable_header_payout': 'Payout',

  // ── Math metrics / KPIs ────────────────────────────────────────────
  'metrics.rtp': 'RTP',
  'metrics.rtp_target': 'Target RTP',
  'metrics.variance': 'Variance',
  'metrics.volatility': 'Volatility',
  'metrics.hit_frequency': 'Hit Frequency',
  'metrics.max_win': 'Max Win',
  'metrics.drift': 'Drift',
  'metrics.confidence_interval': 'Confidence Interval',
  'metrics.spins_simulated': '{count} spins simulated',
  'metrics.std_dev': 'Std. Deviation',

  // ── Modals ─────────────────────────────────────────────────────────
  'modals.new_game.title': 'Create New Game',
  'modals.new_game.name_label': 'Game name',
  'modals.new_game.name_placeholder': 'My Awesome Slot',
  'modals.new_variant.title': 'New Variant',
  'modals.new_variant.basis_label': 'Based on',
  'modals.compare.title': 'Compare A / B',
  'modals.compare.left_label': 'Variant A',
  'modals.compare.right_label': 'Variant B',
  'modals.icon_picker.title': 'Pick an icon',
  'modals.icon_picker.search_placeholder': 'Search icons…',
  'modals.error.title': 'Something went wrong',
  'modals.confirm_delete.title': 'Confirm delete',
  'modals.confirm_delete.body': 'Delete "{name}"? This cannot be undone.',

  // ── Errors ─────────────────────────────────────────────────────────
  'errors.generic': 'An unexpected error occurred.',
  'errors.network': 'Network error — please try again.',
  'errors.validation': 'Validation failed: {reason}',
  'errors.not_found': 'Not found.',
  'errors.permission': 'You do not have permission to do that.',
  'errors.rtp_out_of_range': 'RTP must be between 0 and 1.',
  'errors.no_game_loaded': 'No game loaded.',

  // ── Tooltips ───────────────────────────────────────────────────────
  'tooltips.rtp': 'Return-to-Player — average payout fraction.',
  'tooltips.variance': 'Spread of outcomes around the mean.',
  'tooltips.hit_frequency': 'Fraction of spins that produce a win.',
  'tooltips.max_win': 'Maximum payout cap, in bet multiples.',
  'tooltips.recompute': 'Re-run the closed-form solver.',
  'tooltips.export': 'Download artefact bundle.',
  'tooltips.locale_switcher': 'Change interface language.',

  // ── Producer-persona KPIs ──────────────────────────────────────────
  'producer.cost_saved': 'Cost saved',
  'producer.time_saved': 'Time saved',
  'producer.reject_rate': 'Reject rate',
  'producer.cycle_time': 'Cycle time',
  'producer.throughput': 'Throughput',
  'producer.titles_shipped': 'Titles shipped',
  'producer.reroll_count': 'Rerolls',
  'producer.regulator_passes': 'Regulator passes',
} as const;

export type TranslationKey = keyof typeof en;
export type TranslationDict = Record<TranslationKey, string>;
