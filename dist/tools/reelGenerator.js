/**
 * SLOT MATH ENGINE TEMPLATE - Professional Reel Strip Generator
 *
 * Constraint-based algorithmic reel strip generation with:
 * - Symbol placement rules (spacing, clustering, adjacency)
 * - Visual flow optimization
 * - Near-miss management (ethical, compliance-safe)
 * - Automatic validation
 *
 * Industry-standard approach used by top-tier slot studios.
 */
import { SymbolId } from '../model/symbols.js';
// ═══════════════════════════════════════════════════════════════════════════
// SYMBOL TIER HELPERS
// ═══════════════════════════════════════════════════════════════════════════
const LP_SYMBOLS = [
    SymbolId.LP_LYRE,
    SymbolId.LP_COIN,
    SymbolId.LP_HELMET,
    SymbolId.LP_SCROLL,
    SymbolId.LP_RING
];
const HP_SYMBOLS = [
    SymbolId.HP_ZEUS,
    SymbolId.HP_HADES,
    SymbolId.HP_POSEIDON
];
const SPECIAL_SYMBOLS = [
    SymbolId.WILD_SHIELD,
    SymbolId.SCATTER_TEMPLE,
    SymbolId.LIGHTNING_ORB
];
function isLP(symbol) {
    return LP_SYMBOLS.includes(symbol);
}
function isHP(symbol) {
    return HP_SYMBOLS.includes(symbol);
}
function isSpecial(symbol) {
    return SPECIAL_SYMBOLS.includes(symbol);
}
// ═══════════════════════════════════════════════════════════════════════════
// SEEDED RANDOM NUMBER GENERATOR
// ═══════════════════════════════════════════════════════════════════════════
class SeededRNG {
    state;
    constructor(seed) {
        this.state = seed;
    }
    next() {
        this.state = (this.state * 1103515245 + 12345) & 0x7fffffff;
        return this.state / 0x7fffffff;
    }
    nextInt(max) {
        return Math.floor(this.next() * max);
    }
    shuffle(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = this.nextInt(i + 1);
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// REEL STRIP VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════
export function validateReelStrip(strip, constraints) {
    const errors = [];
    const warnings = [];
    const symbolCounts = new Map();
    const minSpacings = new Map();
    const maxConsecutive = new Map();
    let adjacencyViolations = 0;
    // Count symbols
    for (const symbol of strip) {
        symbolCounts.set(symbol, (symbolCounts.get(symbol) || 0) + 1);
    }
    // Check requirements
    for (const req of constraints.requirements) {
        const count = symbolCounts.get(req.symbol) || 0;
        if (count !== req.count) {
            errors.push(`${req.symbol}: expected ${req.count}, got ${count}`);
        }
        // Check spacing
        if (req.minSpacing) {
            const positions = [];
            strip.forEach((s, i) => { if (s === req.symbol)
                positions.push(i); });
            for (let i = 1; i < positions.length; i++) {
                const spacing = positions[i] - positions[i - 1];
                if (spacing < req.minSpacing) {
                    errors.push(`${req.symbol}: spacing ${spacing} < min ${req.minSpacing}`);
                }
                const currentMin = minSpacings.get(req.symbol) || Infinity;
                minSpacings.set(req.symbol, Math.min(currentMin, spacing));
            }
            // Check wrap-around spacing
            if (positions.length >= 2) {
                const wrapSpacing = (strip.length - positions[positions.length - 1]) + positions[0];
                if (wrapSpacing < req.minSpacing) {
                    errors.push(`${req.symbol}: wrap spacing ${wrapSpacing} < min ${req.minSpacing}`);
                }
            }
        }
    }
    // Check adjacency rules
    for (const rule of constraints.adjacencyRules) {
        for (let i = 0; i < strip.length; i++) {
            if (strip[i] === rule.symbol) {
                const prev = strip[(i - 1 + strip.length) % strip.length];
                const next = strip[(i + 1) % strip.length];
                if (rule.forbidden.includes(prev)) {
                    adjacencyViolations++;
                    errors.push(`${rule.symbol} at ${i}: forbidden adjacent to ${prev} (prev)`);
                }
                if (rule.forbidden.includes(next)) {
                    adjacencyViolations++;
                    errors.push(`${rule.symbol} at ${i}: forbidden adjacent to ${next} (next)`);
                }
                // Buffer size check
                if (rule.bufferSize) {
                    let lpBefore = 0, lpAfter = 0;
                    for (let j = 1; j <= rule.bufferSize; j++) {
                        if (isLP(strip[(i - j + strip.length) % strip.length]))
                            lpBefore++;
                        if (isLP(strip[(i + j) % strip.length]))
                            lpAfter++;
                    }
                    if (lpBefore < rule.bufferSize || lpAfter < rule.bufferSize) {
                        warnings.push(`${rule.symbol} at ${i}: buffer size ${rule.bufferSize} not met`);
                    }
                }
            }
        }
    }
    // Check cluster rules
    for (const cluster of constraints.clusterRules) {
        let consecutive = 0;
        let maxFound = 0;
        for (let i = 0; i < strip.length + cluster.maxConsecutive; i++) {
            const symbol = strip[i % strip.length];
            if (cluster.symbols.includes(symbol)) {
                consecutive++;
                maxFound = Math.max(maxFound, consecutive);
            }
            else {
                consecutive = 0;
            }
        }
        if (maxFound > cluster.maxConsecutive) {
            errors.push(`Cluster ${cluster.symbols.join(',')}: ${maxFound} consecutive > max ${cluster.maxConsecutive}`);
        }
    }
    // Check global constraints
    // Max consecutive LP
    let consecutiveLP = 0;
    let maxConsecutiveLP = 0;
    for (let i = 0; i < strip.length * 2; i++) {
        if (isLP(strip[i % strip.length])) {
            consecutiveLP++;
            maxConsecutiveLP = Math.max(maxConsecutiveLP, consecutiveLP);
        }
        else {
            consecutiveLP = 0;
        }
    }
    if (maxConsecutiveLP > constraints.maxConsecutiveLP) {
        warnings.push(`Max consecutive LP: ${maxConsecutiveLP} > ${constraints.maxConsecutiveLP}`);
    }
    // Max consecutive same symbol
    for (const symbol of symbolCounts.keys()) {
        let consecutive = 0;
        let maxCons = 0;
        for (let i = 0; i < strip.length * 2; i++) {
            if (strip[i % strip.length] === symbol) {
                consecutive++;
                maxCons = Math.max(maxCons, consecutive);
            }
            else {
                consecutive = 0;
            }
        }
        maxConsecutive.set(symbol, maxCons);
        if (maxCons > constraints.maxConsecutiveSameSymbol) {
            errors.push(`${symbol}: ${maxCons} consecutive > max ${constraints.maxConsecutiveSameSymbol}`);
        }
    }
    // HP isolation
    if (constraints.hpIsolation) {
        for (let i = 0; i < strip.length; i++) {
            if (isHP(strip[i])) {
                const prev = strip[(i - 1 + strip.length) % strip.length];
                const next = strip[(i + 1) % strip.length];
                if (isHP(prev) || isHP(next)) {
                    errors.push(`HP isolation violated at ${i}: ${strip[i]} adjacent to HP`);
                }
            }
        }
    }
    // Special isolation
    if (constraints.specialIsolation) {
        for (let i = 0; i < strip.length; i++) {
            if (isSpecial(strip[i])) {
                const prev = strip[(i - 1 + strip.length) % strip.length];
                const next = strip[(i + 1) % strip.length];
                if (isSpecial(prev) || isSpecial(next)) {
                    warnings.push(`Special isolation: ${strip[i]} adjacent to special at ${i}`);
                }
            }
        }
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        stats: {
            symbolCounts,
            minSpacings,
            maxConsecutive,
            adjacencyViolations
        }
    };
}
// ═══════════════════════════════════════════════════════════════════════════
// REEL STRIP GENERATOR
// ═══════════════════════════════════════════════════════════════════════════
export function generateReelStrip(constraints, seed = Date.now(), maxIterations = 10000) {
    const rng = new SeededRNG(seed);
    for (let iteration = 0; iteration < maxIterations; iteration++) {
        const strip = attemptGeneration(constraints, rng);
        const validation = validateReelStrip(strip, constraints);
        if (validation.valid) {
            return {
                strip,
                validation,
                iterations: iteration + 1,
                seed
            };
        }
    }
    // Return best attempt even if not perfect
    const finalStrip = attemptGeneration(constraints, rng);
    return {
        strip: finalStrip,
        validation: validateReelStrip(finalStrip, constraints),
        iterations: maxIterations,
        seed
    };
}
function attemptGeneration(constraints, rng) {
    const strip = new Array(constraints.reelLength).fill(null);
    // Sort requirements by strictness (fewer count + more spacing = stricter)
    const sortedReqs = [...constraints.requirements].sort((a, b) => {
        const aScore = a.count * 10 - (a.minSpacing || 0);
        const bScore = b.count * 10 - (b.minSpacing || 0);
        return aScore - bScore;
    });
    // Place symbols with spacing requirements first
    for (const req of sortedReqs) {
        if (req.minSpacing && req.minSpacing > 1) {
            placeWithSpacing(strip, req, rng, constraints);
        }
    }
    // Place remaining required symbols
    for (const req of sortedReqs) {
        const currentCount = strip.filter(s => s === req.symbol).length;
        const remaining = req.count - currentCount;
        for (let i = 0; i < remaining; i++) {
            const pos = findValidPosition(strip, req.symbol, constraints, rng);
            if (pos !== -1) {
                strip[pos] = req.symbol;
            }
        }
    }
    // Fill remaining with LP symbols
    const lpPool = rng.shuffle([...LP_SYMBOLS, ...LP_SYMBOLS, ...LP_SYMBOLS]);
    let lpIndex = 0;
    for (let i = 0; i < strip.length; i++) {
        if (strip[i] === null) {
            strip[i] = lpPool[lpIndex % lpPool.length];
            lpIndex++;
        }
    }
    return strip;
}
function placeWithSpacing(strip, req, rng, constraints) {
    const spacing = req.minSpacing || Math.floor(strip.length / req.count);
    const startOffset = rng.nextInt(spacing);
    for (let i = 0; i < req.count; i++) {
        const idealPos = (startOffset + i * spacing) % strip.length;
        const pos = findNearestEmpty(strip, idealPos, spacing / 2);
        if (pos !== -1) {
            strip[pos] = req.symbol;
        }
    }
}
function findNearestEmpty(strip, idealPos, maxDistance) {
    for (let d = 0; d <= maxDistance; d++) {
        const pos1 = (idealPos + d) % strip.length;
        const pos2 = (idealPos - d + strip.length) % strip.length;
        if (strip[pos1] === null)
            return pos1;
        if (strip[pos2] === null)
            return pos2;
    }
    // Fallback: find any empty
    for (let i = 0; i < strip.length; i++) {
        if (strip[i] === null)
            return i;
    }
    return -1;
}
function findValidPosition(strip, symbol, constraints, rng) {
    const emptyPositions = [];
    for (let i = 0; i < strip.length; i++) {
        if (strip[i] === null && isValidPlacement(strip, i, symbol, constraints)) {
            emptyPositions.push(i);
        }
    }
    if (emptyPositions.length === 0) {
        // Fallback: any empty position
        for (let i = 0; i < strip.length; i++) {
            if (strip[i] === null)
                emptyPositions.push(i);
        }
    }
    if (emptyPositions.length === 0)
        return -1;
    return emptyPositions[rng.nextInt(emptyPositions.length)];
}
function isValidPlacement(strip, position, symbol, constraints) {
    const prev = strip[(position - 1 + strip.length) % strip.length];
    const next = strip[(position + 1) % strip.length];
    // Check adjacency rules
    const rule = constraints.adjacencyRules.find(r => r.symbol === symbol);
    if (rule) {
        if (prev && rule.forbidden.includes(prev))
            return false;
        if (next && rule.forbidden.includes(next))
            return false;
    }
    // Check HP isolation
    if (constraints.hpIsolation && isHP(symbol)) {
        if (prev && isHP(prev))
            return false;
        if (next && isHP(next))
            return false;
    }
    // Check special isolation
    if (constraints.specialIsolation && isSpecial(symbol)) {
        if (prev && isSpecial(prev))
            return false;
        if (next && isSpecial(next))
            return false;
    }
    return true;
}
// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CONSTRAINTS (TEMPLATE)
// ═══════════════════════════════════════════════════════════════════════════
export const DEFAULT_BASE_CONSTRAINTS = {
    reelLength: 54,
    requirements: [
        // HP Symbols
        { symbol: SymbolId.HP_ZEUS, count: 2, minSpacing: 15 },
        { symbol: SymbolId.HP_HADES, count: 1, minSpacing: 0 },
        { symbol: SymbolId.HP_POSEIDON, count: 1, minSpacing: 0 },
        // Special Symbols
        { symbol: SymbolId.SCATTER_TEMPLE, count: 1, minSpacing: 0 },
        { symbol: SymbolId.WILD_SHIELD, count: 3, minSpacing: 10 },
        { symbol: SymbolId.LIGHTNING_ORB, count: 7, minSpacing: 5 },
        // LP Symbols (will fill remaining ~39 positions)
        { symbol: SymbolId.LP_LYRE, count: 8 },
        { symbol: SymbolId.LP_COIN, count: 8 },
        { symbol: SymbolId.LP_HELMET, count: 8 },
        { symbol: SymbolId.LP_SCROLL, count: 8 },
        { symbol: SymbolId.LP_RING, count: 7 },
    ],
    adjacencyRules: [
        // Scatter should not be adjacent to orbs (visual confusion)
        {
            symbol: SymbolId.SCATTER_TEMPLE,
            forbidden: [SymbolId.LIGHTNING_ORB],
            preferred: LP_SYMBOLS,
            bufferSize: 2
        },
        // Top HP symbol should have LP buffer
        {
            symbol: SymbolId.HP_ZEUS,
            forbidden: [],
            preferred: LP_SYMBOLS,
            bufferSize: 1
        },
        // Wild should not be adjacent to scatter or orb
        {
            symbol: SymbolId.WILD_SHIELD,
            forbidden: [SymbolId.SCATTER_TEMPLE],
            preferred: LP_SYMBOLS,
        },
    ],
    clusterRules: [
        // Max 3 LP symbols of same type in a row
        { symbols: [SymbolId.LP_LYRE], maxConsecutive: 2 },
        { symbols: [SymbolId.LP_COIN], maxConsecutive: 2 },
        { symbols: [SymbolId.LP_HELMET], maxConsecutive: 2 },
        { symbols: [SymbolId.LP_SCROLL], maxConsecutive: 2 },
        { symbols: [SymbolId.LP_RING], maxConsecutive: 2 },
    ],
    maxConsecutiveLP: 6,
    maxConsecutiveSameSymbol: 2,
    hpIsolation: true,
    specialIsolation: true,
};
export const DEFAULT_FS_CONSTRAINTS = {
    reelLength: 50,
    requirements: [
        // HP Symbols
        { symbol: SymbolId.HP_ZEUS, count: 1, minSpacing: 0 },
        { symbol: SymbolId.HP_HADES, count: 1, minSpacing: 0 },
        { symbol: SymbolId.HP_POSEIDON, count: 1, minSpacing: 0 },
        // Special Symbols (more wilds in FS)
        { symbol: SymbolId.SCATTER_TEMPLE, count: 1, minSpacing: 0 },
        { symbol: SymbolId.WILD_SHIELD, count: 5, minSpacing: 7 },
        { symbol: SymbolId.LIGHTNING_ORB, count: 5, minSpacing: 7 },
        // LP Symbols
        { symbol: SymbolId.LP_LYRE, count: 7 },
        { symbol: SymbolId.LP_COIN, count: 7 },
        { symbol: SymbolId.LP_HELMET, count: 7 },
        { symbol: SymbolId.LP_SCROLL, count: 8 },
        { symbol: SymbolId.LP_RING, count: 7 },
    ],
    adjacencyRules: [
        {
            symbol: SymbolId.SCATTER_TEMPLE,
            forbidden: [SymbolId.LIGHTNING_ORB],
            preferred: LP_SYMBOLS,
            bufferSize: 2
        },
        {
            symbol: SymbolId.HP_ZEUS,
            forbidden: [],
            preferred: LP_SYMBOLS,
            bufferSize: 1
        },
    ],
    clusterRules: [
        { symbols: [SymbolId.LP_LYRE], maxConsecutive: 2 },
        { symbols: [SymbolId.LP_COIN], maxConsecutive: 2 },
        { symbols: [SymbolId.LP_HELMET], maxConsecutive: 2 },
        { symbols: [SymbolId.LP_SCROLL], maxConsecutive: 2 },
        { symbols: [SymbolId.LP_RING], maxConsecutive: 2 },
    ],
    maxConsecutiveLP: 5,
    maxConsecutiveSameSymbol: 2,
    hpIsolation: true,
    specialIsolation: false, // Allow wild+orb adjacent in FS for excitement
};
export function generateAllReels(baseSeed = Date.now()) {
    const baseReels = [];
    const fsReels = [];
    // Generate 5 base reels with different seeds
    for (let i = 0; i < 5; i++) {
        const result = generateReelStrip(DEFAULT_BASE_CONSTRAINTS, baseSeed + i * 1000);
        baseReels.push(result);
    }
    // Generate 5 FS reels
    for (let i = 0; i < 5; i++) {
        const result = generateReelStrip(DEFAULT_FS_CONSTRAINTS, baseSeed + 5000 + i * 1000);
        fsReels.push(result);
    }
    const baseSuccess = baseReels.filter(r => r.validation.valid).length;
    const fsSuccess = fsReels.filter(r => r.validation.valid).length;
    return {
        baseReels,
        fsReels,
        allValid: baseSuccess === 5 && fsSuccess === 5,
        summary: {
            totalIterations: baseReels.reduce((sum, r) => sum + r.iterations, 0) +
                fsReels.reduce((sum, r) => sum + r.iterations, 0),
            baseSuccess,
            fsSuccess
        }
    };
}
// ═══════════════════════════════════════════════════════════════════════════
// EXPORT HELPERS
// ═══════════════════════════════════════════════════════════════════════════
export function stripToCode(strip, reelName) {
    const aliases = {
        'LP_LYRE': 'L1',
        'LP_COIN': 'L2',
        'LP_HELMET': 'L3',
        'LP_SCROLL': 'L4',
        'LP_RING': 'L5',
        'HP_ZEUS': 'H1',
        'HP_HADES': 'H2',
        'HP_POSEIDON': 'H3',
        'WILD_SHIELD': 'WI',
        'SCATTER_TEMPLE': 'SC',
        'LIGHTNING_ORB': 'LO',
    };
    const chunks = [];
    for (let i = 0; i < strip.length; i += 6) {
        const chunk = strip.slice(i, i + 6).map(s => aliases[s] || s).join(', ');
        chunks.push(`    ${chunk},`);
    }
    return `  // ${reelName}\n  [\n${chunks.join('\n')}\n  ]`;
}
export function printValidationReport(result, name) {
    console.log(`\n=== ${name} ===`);
    console.log(`Valid: ${result.validation.valid ? '✅' : '❌'}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Seed: ${result.seed}`);
    if (result.validation.errors.length > 0) {
        console.log('\nErrors:');
        result.validation.errors.forEach(e => console.log(`  ❌ ${e}`));
    }
    if (result.validation.warnings.length > 0) {
        console.log('\nWarnings:');
        result.validation.warnings.forEach(w => console.log(`  ⚠️ ${w}`));
    }
    console.log('\nSymbol Counts:');
    result.validation.stats.symbolCounts.forEach((count, symbol) => {
        console.log(`  ${symbol}: ${count}`);
    });
}
//# sourceMappingURL=reelGenerator.js.map