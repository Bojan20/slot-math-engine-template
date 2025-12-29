/**
 * SLOT MATH ENGINE TEMPLATE - Game Configuration
 *
 * Hold & Win + Free Spins dual feature system.
 * Central configuration file for all game parameters.
 *
 * CUSTOMIZATION:
 * 1. Update name and version for your game
 * 2. Adjust RTP targets and feature parameters
 * 3. Run simulation to verify RTP after changes
 */
export interface GameConfig {
    name: string;
    version: string;
    mathVersion: string;
    numReels: number;
    numRows: number;
    numPaylines: number;
    targetRTP: number;
    targetVolatility: 'low' | 'medium' | 'high' | 'extreme';
    maxWinMultiplier: number;
    defaultBet: number;
    minBet: number;
    maxBet: number;
    freeSpins: {
        enabled: boolean;
        scatter3Award: number;
        scatter4Award: number;
        scatter5Award: number;
        progressiveMultiplier: boolean;
        maxMultiplier: number;
        maxRetriggers: number;
    };
    holdAndWin: {
        enabled: boolean;
        triggerOrbCount: number;
        initialRespins: number;
        fullGridBonus: number;
    };
    caps: {
        maxWinMultiplier: number;
        maxFreeSpinsFromRetrigger: number;
    };
    rtpBudget: {
        baseGame: number;
        freeSpins: number;
        holdAndWin: number;
    };
    simulation: {
        defaultSpins: number;
        quickSpins: number;
        fullSpins: number;
    };
}
export declare const GAME_CONFIG: GameConfig;
/**
 * Get free spins awarded for scatter count
 */
export declare function getFreeSpinsAward(scatterCount: number): number;
/**
 * Check if H&W should trigger based on orb count
 */
export declare function shouldTriggerHnW(orbCount: number): boolean;
/**
 * Validate configuration
 */
export declare function validateConfig(): boolean;
export default GAME_CONFIG;
//# sourceMappingURL=gameConfig.d.ts.map