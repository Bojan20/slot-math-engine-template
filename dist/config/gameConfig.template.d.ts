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
export declare const GAME_CONFIG: {
    name: string;
    version: string;
    theme: string;
    reels: number;
    rows: number;
    paylines: number;
    targets: {
        rtp: number;
        volatility: string;
        hitRate: number;
        maxWinMultiplier: number;
    };
    rtpBudget: {
        baseGame: number;
        freeSpins: number;
        bonus: number;
        scatterPays: number;
    };
    caps: {
        maxWinMultiplier: number;
        maxFsMultiplier: number;
        featureLoopCap: number;
        maxRetriggers: number;
    };
    freeSpins: {
        enabled: boolean;
        triggerSymbol: string;
        triggerCount: number;
        awards: {
            3: number;
            4: number;
            5: number;
        };
        retrigger: boolean;
        progressiveMultiplier: {
            enabled: boolean;
            initial: number;
            increment: number;
            max: number;
        };
    };
    holdAndWin: {
        enabled: boolean;
        name: string;
        triggerSymbol: string;
        triggerCount: number;
        initialRespins: number;
        maxRespins: number;
        gridSize: number;
    };
    bonus: {
        enabled: boolean;
    };
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
//# sourceMappingURL=gameConfig.template.d.ts.map