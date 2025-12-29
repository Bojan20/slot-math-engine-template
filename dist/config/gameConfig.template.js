/**
 * GAME CONFIG TEMPLATE
 *
 * Kopiraj ovaj fajl u gameConfig.ts i popuni vrednosti za svoju igru.
 *
 * WORKFLOW:
 * 1. Kopiraj: cp gameConfig.template.ts gameConfig.ts
 * 2. Popuni vrednosti ispod
 * 3. Build: npm run build
 * 4. Simulacija: npm run sim:quick
 */
export const GAME_CONFIG = {
    // ============================================
    // BASIC INFO — Popuni za svoju igru
    // ============================================
    name: 'YOUR_GAME_NAME', // Ime igre
    version: '1.0.0', // Verzija math-a
    theme: 'YOUR_THEME', // Tema (Egyptian, Greek, etc.)
    // ============================================
    // LAYOUT — Odaberi layout
    // ============================================
    reels: 5, // Broj rilova (3-7)
    rows: 3, // Broj redova (3-5)
    paylines: 20, // Broj paylines (ili 'ways' za 243/1024)
    // ============================================
    // TARGETS — Definisi ciljeve
    // ============================================
    targets: {
        rtp: 0.96, // Target RTP (0.92-0.97)
        volatility: 'medium', // low | medium | high | extreme
        hitRate: 0.28, // Target hit rate (0.20-0.40)
        maxWinMultiplier: 5000, // Max win cap (500-50000)
    },
    // ============================================
    // RTP BUDGET — Alociraj RTP
    // ============================================
    rtpBudget: {
        baseGame: 0.50, // Base game target (40-60%)
        freeSpins: 0.20, // Free Spins target (15-30%)
        bonus: 0.20, // Bonus/H&W target (15-30%)
        scatterPays: 0.02, // Scatter pays (1-5%)
        // TOTAL = baseGame + freeSpins + bonus + scatterPays ≈ targets.rtp
    },
    // ============================================
    // CAPS — Definisi limite
    // ============================================
    caps: {
        maxWinMultiplier: 5000, // Hard cap na total win
        maxFsMultiplier: 10, // Max FS progressive multiplier
        featureLoopCap: 100, // Max feature rounds
        maxRetriggers: 5, // Max FS retriggers
    },
    // ============================================
    // FREE SPINS CONFIG
    // ============================================
    freeSpins: {
        enabled: true,
        triggerSymbol: 'SCATTER', // Symbol koji triggeruje
        triggerCount: 3, // Minimum za trigger
        awards: {
            3: 8, // 3 scatters = 8 spins
            4: 12, // 4 scatters = 12 spins
            5: 15, // 5 scatters = 15 spins
        },
        retrigger: true,
        progressiveMultiplier: {
            enabled: true,
            initial: 1,
            increment: 1,
            max: 10,
        },
    },
    // ============================================
    // HOLD & WIN CONFIG (ako koristiš)
    // ============================================
    holdAndWin: {
        enabled: true,
        name: 'Feature Name',
        triggerSymbol: 'SPECIAL', // Symbol koji triggeruje
        triggerCount: 6, // Minimum za trigger
        initialRespins: 3,
        maxRespins: 3,
        gridSize: 15, // reels × rows
    },
    // ============================================
    // BONUS CONFIG (ako koristiš)
    // ============================================
    bonus: {
        enabled: false,
        // Dodaj svoju bonus logiku
    },
};
/**
 * SLEDECI KORACI:
 *
 * 1. Popuni GAME_CONFIG iznad
 * 2. Kreiraj symbols.ts sa svojim simbolima
 * 3. Kreiraj paytable.ts sa svojim vrednostima
 * 4. Kreiraj reels.ts sa reel strips
 * 5. Implementiraj features u engine/
 * 6. Pokreni simulaciju
 * 7. Tune do target RTP
 * 8. Lock i dokumentuj
 */
//# sourceMappingURL=gameConfig.template.js.map