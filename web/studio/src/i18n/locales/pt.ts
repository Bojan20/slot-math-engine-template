// W208 — Portuguese (pt-BR) translations.
//
// Target: Brazilian Portuguese — the dominant Lusophone iGaming market.
// Industry loanwords ("RTP", "Wild", "Scatter") kept in English where
// they are standard usage in Brazilian operator UIs. "Bonificação"
// preferred over "Bônus" for the symbol type because that is the
// industry-standard term in BR slot UIs.

import type { TranslationDict } from './en.js';

export const pt: TranslationDict = {
  // Navigation
  'nav.build': 'CONSTRUIR',
  'nav.compose': 'COMPOR',
  'nav.catalog': 'CATÁLOGO',
  'nav.play': 'JOGAR',
  'nav.sensitivity': 'SENSIBILIDADE',
  'nav.certify': 'CERTIFICAR',
  'nav.math': 'MATEMÁTICA',
  'nav.design': 'DESIGN',
  'nav.production': 'PRODUÇÃO',
  'nav.persona': 'PERSONA',
  'nav.notebook': 'CADERNO',
  'nav.library': 'BIBLIOTECA',

  // Actions
  'actions.save': 'Salvar',
  'actions.cancel': 'Cancelar',
  'actions.delete': 'Excluir',
  'actions.duplicate': 'Duplicar',
  'actions.run': 'Executar',
  'actions.compute': 'Calcular',
  'actions.recompute': 'Recalcular',
  'actions.export': 'Exportar',
  'actions.import': 'Importar',
  'actions.new_game': 'Novo jogo',
  'actions.new_variant': 'Nova variante',
  'actions.load': 'Carregar',
  'actions.simulate': 'Simular',
  'actions.spin': 'Girar',
  'actions.close': 'Fechar',
  'actions.apply': 'Aplicar',
  'actions.reset': 'Redefinir',
  'actions.confirm': 'Confirmar',

  // Symbols
  'symbols.hp': 'Pagamento alto',
  'symbols.mp': 'Pagamento médio',
  'symbols.lp': 'Pagamento baixo',
  'symbols.wild': 'Curinga',
  'symbols.scatter': 'Disperso',
  'symbols.bonus': 'Bônus',
  'symbols.mult': 'Multiplicador',
  'symbols.tier_grand': 'Máximo',
  'symbols.tier_major': 'Grande',
  'symbols.tier_minor': 'Pequeno',
  'symbols.tier_mini': 'Mini',
  'symbols.paytable_header_symbol': 'Símbolo',
  'symbols.paytable_header_count': 'Quantidade',
  'symbols.paytable_header_payout': 'Pagamento',

  // Metrics
  'metrics.rtp': 'RTP',
  'metrics.rtp_target': 'RTP alvo',
  'metrics.variance': 'Variância',
  'metrics.volatility': 'Volatilidade',
  'metrics.hit_frequency': 'Frequência de prêmios',
  'metrics.max_win': 'Prêmio máximo',
  'metrics.drift': 'Desvio',
  'metrics.confidence_interval': 'Intervalo de confiança',
  'metrics.spins_simulated': '{count} rodadas simuladas',
  'metrics.std_dev': 'Desvio padrão',

  // Modals
  'modals.new_game.title': 'Criar novo jogo',
  'modals.new_game.name_label': 'Nome do jogo',
  'modals.new_game.name_placeholder': 'Meu slot incrível',
  'modals.new_variant.title': 'Nova variante',
  'modals.new_variant.basis_label': 'Baseada em',
  'modals.compare.title': 'Comparar A / B',
  'modals.compare.left_label': 'Variante A',
  'modals.compare.right_label': 'Variante B',
  'modals.icon_picker.title': 'Escolher um ícone',
  'modals.icon_picker.search_placeholder': 'Buscar ícones…',
  'modals.error.title': 'Algo deu errado',
  'modals.confirm_delete.title': 'Confirmar exclusão',
  'modals.confirm_delete.body': 'Excluir "{name}"? Esta ação não pode ser desfeita.',

  // Errors
  'errors.generic': 'Ocorreu um erro inesperado.',
  'errors.network': 'Erro de rede — tente novamente.',
  'errors.validation': 'Falha na validação: {reason}',
  'errors.not_found': 'Não encontrado.',
  'errors.permission': 'Você não tem permissão para isto.',
  'errors.rtp_out_of_range': 'O RTP deve estar entre 0 e 1.',
  'errors.no_game_loaded': 'Nenhum jogo carregado.',

  // Tooltips
  'tooltips.rtp': 'Return-to-Player — fração média devolvida ao jogador.',
  'tooltips.variance': 'Dispersão dos resultados em torno da média.',
  'tooltips.hit_frequency': 'Fração de rodadas que produzem prêmio.',
  'tooltips.max_win': 'Teto máximo de pagamento, em múltiplos da aposta.',
  'tooltips.recompute': 'Re-executar o solucionador fechado.',
  'tooltips.export': 'Baixar o pacote de artefatos.',
  'tooltips.locale_switcher': 'Alterar o idioma da interface.',

  // Producer KPIs
  'producer.cost_saved': 'Custo economizado',
  'producer.time_saved': 'Tempo economizado',
  'producer.reject_rate': 'Taxa de rejeição',
  'producer.cycle_time': 'Tempo de ciclo',
  'producer.throughput': 'Vazão',
  'producer.titles_shipped': 'Títulos publicados',
  'producer.reroll_count': 'Repetições',
  'producer.regulator_passes': 'Aprovações regulatórias',
};
