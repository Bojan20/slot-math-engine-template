// W208 — Spanish (es) translations.
//
// Target audience: Spain + LatAm. Uses neutral Castilian Spanish where
// possible (e.g. "ordenador" avoided in favour of "equipo" / generic
// terms). Gambling industry terms preserved where they are loanwords
// in Spanish-speaking iGaming markets ("RTP", "Wild", "Scatter").

import type { TranslationDict } from './en.js';

export const es: TranslationDict = {
  // Navigation
  'nav.build': 'DISEÑAR',
  'nav.compose': 'COMPONER',
  'nav.catalog': 'CATÁLOGO',
  'nav.play': 'JUGAR',
  'nav.sensitivity': 'SENSIBILIDAD',
  'nav.certify': 'CERTIFICAR',
  'nav.math': 'MATEMÁTICAS',
  'nav.design': 'DISEÑO',
  'nav.production': 'PRODUCCIÓN',
  'nav.persona': 'PERSONA',
  'nav.notebook': 'CUADERNO',
  'nav.library': 'BIBLIOTECA',

  // Actions
  'actions.save': 'Guardar',
  'actions.cancel': 'Cancelar',
  'actions.delete': 'Eliminar',
  'actions.duplicate': 'Duplicar',
  'actions.run': 'Ejecutar',
  'actions.compute': 'Calcular',
  'actions.recompute': 'Recalcular',
  'actions.export': 'Exportar',
  'actions.import': 'Importar',
  'actions.new_game': 'Nuevo juego',
  'actions.new_variant': 'Nueva variante',
  'actions.load': 'Cargar',
  'actions.simulate': 'Simular',
  'actions.spin': 'Girar',
  'actions.close': 'Cerrar',
  'actions.apply': 'Aplicar',
  'actions.reset': 'Restablecer',
  'actions.confirm': 'Confirmar',

  // Symbols
  'symbols.hp': 'Pago alto',
  'symbols.mp': 'Pago medio',
  'symbols.lp': 'Pago bajo',
  'symbols.wild': 'Comodín',
  'symbols.scatter': 'Dispersión',
  'symbols.bonus': 'Bonificación',
  'symbols.mult': 'Multiplicador',
  'symbols.tier_grand': 'Mayor',
  'symbols.tier_major': 'Grande',
  'symbols.tier_minor': 'Pequeño',
  'symbols.tier_mini': 'Mini',
  'symbols.paytable_header_symbol': 'Símbolo',
  'symbols.paytable_header_count': 'Cantidad',
  'symbols.paytable_header_payout': 'Pago',

  // Metrics
  'metrics.rtp': 'RTP',
  'metrics.rtp_target': 'RTP objetivo',
  'metrics.variance': 'Varianza',
  'metrics.volatility': 'Volatilidad',
  'metrics.hit_frequency': 'Frecuencia de premios',
  'metrics.max_win': 'Premio máximo',
  'metrics.drift': 'Desviación',
  'metrics.confidence_interval': 'Intervalo de confianza',
  'metrics.spins_simulated': '{count} giros simulados',
  'metrics.std_dev': 'Desviación estándar',

  // Modals
  'modals.new_game.title': 'Crear nuevo juego',
  'modals.new_game.name_label': 'Nombre del juego',
  'modals.new_game.name_placeholder': 'Mi tragaperras genial',
  'modals.new_variant.title': 'Nueva variante',
  'modals.new_variant.basis_label': 'Basada en',
  'modals.compare.title': 'Comparar A / B',
  'modals.compare.left_label': 'Variante A',
  'modals.compare.right_label': 'Variante B',
  'modals.icon_picker.title': 'Elegir un icono',
  'modals.icon_picker.search_placeholder': 'Buscar iconos…',
  'modals.error.title': 'Algo salió mal',
  'modals.confirm_delete.title': 'Confirmar eliminación',
  'modals.confirm_delete.body': '¿Eliminar «{name}»? Esta acción no se puede deshacer.',

  // Errors
  'errors.generic': 'Se ha producido un error inesperado.',
  'errors.network': 'Error de red — inténtalo de nuevo.',
  'errors.validation': 'La validación ha fallado: {reason}',
  'errors.not_found': 'No encontrado.',
  'errors.permission': 'No tienes permiso para hacer esto.',
  'errors.rtp_out_of_range': 'El RTP debe estar entre 0 y 1.',
  'errors.no_game_loaded': 'No hay ningún juego cargado.',

  // Tooltips
  'tooltips.rtp': 'Return-to-Player — fracción media devuelta al jugador.',
  'tooltips.variance': 'Dispersión de los resultados respecto a la media.',
  'tooltips.hit_frequency': 'Fracción de giros que producen un premio.',
  'tooltips.max_win': 'Tope máximo de pago, en múltiplos de la apuesta.',
  'tooltips.recompute': 'Volver a ejecutar el solucionador cerrado.',
  'tooltips.export': 'Descargar el paquete de artefactos.',
  'tooltips.locale_switcher': 'Cambiar el idioma de la interfaz.',

  // Producer KPIs
  'producer.cost_saved': 'Coste ahorrado',
  'producer.time_saved': 'Tiempo ahorrado',
  'producer.reject_rate': 'Tasa de rechazo',
  'producer.cycle_time': 'Tiempo de ciclo',
  'producer.throughput': 'Rendimiento',
  'producer.titles_shipped': 'Títulos publicados',
  'producer.reroll_count': 'Repeticiones',
  'producer.regulator_passes': 'Aprobaciones regulatorias',
};
