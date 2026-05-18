// W208 — German (de) translations.
//
// Standard High German. Loanwords kept where they are industry-standard
// in German iGaming UIs ("RTP", "Wild", "Scatter", "Bonus"). Capitalised
// nouns per Duden rules. Casual address style ("du"-form) avoided in
// favour of neutral/imperative wording for a professional tool.

import type { TranslationDict } from './en.js';

export const de: TranslationDict = {
  // Navigation
  'nav.build': 'ERSTELLEN',
  'nav.compose': 'KOMPONIEREN',
  'nav.catalog': 'KATALOG',
  'nav.play': 'SPIELEN',
  'nav.sensitivity': 'SENSITIVITÄT',
  'nav.certify': 'ZERTIFIZIEREN',
  'nav.math': 'MATHEMATIK',
  'nav.design': 'DESIGN',
  'nav.production': 'PRODUKTION',
  'nav.persona': 'PERSONA',
  'nav.notebook': 'NOTIZBUCH',
  'nav.library': 'BIBLIOTHEK',

  // Actions
  'actions.save': 'Speichern',
  'actions.cancel': 'Abbrechen',
  'actions.delete': 'Löschen',
  'actions.duplicate': 'Duplizieren',
  'actions.run': 'Ausführen',
  'actions.compute': 'Berechnen',
  'actions.recompute': 'Neu berechnen',
  'actions.export': 'Exportieren',
  'actions.import': 'Importieren',
  'actions.new_game': 'Neues Spiel',
  'actions.new_variant': 'Neue Variante',
  'actions.load': 'Laden',
  'actions.simulate': 'Simulieren',
  'actions.spin': 'Drehen',
  'actions.close': 'Schließen',
  'actions.apply': 'Anwenden',
  'actions.reset': 'Zurücksetzen',
  'actions.confirm': 'Bestätigen',

  // Symbols
  'symbols.hp': 'Hohe Auszahlung',
  'symbols.mp': 'Mittlere Auszahlung',
  'symbols.lp': 'Niedrige Auszahlung',
  'symbols.wild': 'Wild',
  'symbols.scatter': 'Scatter',
  'symbols.bonus': 'Bonus',
  'symbols.mult': 'Multiplikator',
  'symbols.tier_grand': 'Grand',
  'symbols.tier_major': 'Major',
  'symbols.tier_minor': 'Minor',
  'symbols.tier_mini': 'Mini',
  'symbols.paytable_header_symbol': 'Symbol',
  'symbols.paytable_header_count': 'Anzahl',
  'symbols.paytable_header_payout': 'Auszahlung',

  // Metrics
  'metrics.rtp': 'RTP',
  'metrics.rtp_target': 'Ziel-RTP',
  'metrics.variance': 'Varianz',
  'metrics.volatility': 'Volatilität',
  'metrics.hit_frequency': 'Trefferquote',
  'metrics.max_win': 'Maximalgewinn',
  'metrics.drift': 'Abweichung',
  'metrics.confidence_interval': 'Konfidenzintervall',
  'metrics.spins_simulated': '{count} Drehungen simuliert',
  'metrics.std_dev': 'Standardabweichung',

  // Modals
  'modals.new_game.title': 'Neues Spiel erstellen',
  'modals.new_game.name_label': 'Spielname',
  'modals.new_game.name_placeholder': 'Mein toller Slot',
  'modals.new_variant.title': 'Neue Variante',
  'modals.new_variant.basis_label': 'Basierend auf',
  'modals.compare.title': 'A / B vergleichen',
  'modals.compare.left_label': 'Variante A',
  'modals.compare.right_label': 'Variante B',
  'modals.icon_picker.title': 'Symbol auswählen',
  'modals.icon_picker.search_placeholder': 'Symbole suchen…',
  'modals.error.title': 'Etwas ist schiefgelaufen',
  'modals.confirm_delete.title': 'Löschen bestätigen',
  'modals.confirm_delete.body': '„{name}" löschen? Dies kann nicht rückgängig gemacht werden.',

  // Errors
  'errors.generic': 'Ein unerwarteter Fehler ist aufgetreten.',
  'errors.network': 'Netzwerkfehler — bitte erneut versuchen.',
  'errors.validation': 'Validierung fehlgeschlagen: {reason}',
  'errors.not_found': 'Nicht gefunden.',
  'errors.permission': 'Keine Berechtigung für diese Aktion.',
  'errors.rtp_out_of_range': 'RTP muss zwischen 0 und 1 liegen.',
  'errors.no_game_loaded': 'Kein Spiel geladen.',

  // Tooltips
  'tooltips.rtp': 'Return-to-Player — durchschnittlich an den Spieler zurückgezahlter Anteil.',
  'tooltips.variance': 'Streuung der Ergebnisse um den Mittelwert.',
  'tooltips.hit_frequency': 'Anteil der Drehungen mit Gewinn.',
  'tooltips.max_win': 'Maximale Auszahlung in Einsatz-Vielfachen.',
  'tooltips.recompute': 'Closed-Form-Solver erneut ausführen.',
  'tooltips.export': 'Artefakt-Paket herunterladen.',
  'tooltips.locale_switcher': 'Sprache der Oberfläche ändern.',

  // Producer KPIs
  'producer.cost_saved': 'Eingesparte Kosten',
  'producer.time_saved': 'Eingesparte Zeit',
  'producer.reject_rate': 'Ablehnungsquote',
  'producer.cycle_time': 'Durchlaufzeit',
  'producer.throughput': 'Durchsatz',
  'producer.titles_shipped': 'Veröffentlichte Titel',
  'producer.reroll_count': 'Wiederholungen',
  'producer.regulator_passes': 'Regulator-Freigaben',
};
