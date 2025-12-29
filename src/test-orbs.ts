// Quick diagnostic test for Lightning Orbs
import { RNG } from './engine/rng.js';
import { spin } from './engine/spin.js';
import { SymbolId } from './model/symbols.js';
import { BASE_REELS } from './model/reels.js';

// Check reel composition first
console.log('=== REEL STRIP ANALYSIS ===');
for (let i = 0; i < 5; i++) {
  const orbCount = BASE_REELS[i].filter(s => s === SymbolId.LIGHTNING_ORB).length;
  const scatterCount = BASE_REELS[i].filter(s => s === SymbolId.SCATTER_TEMPLE).length;
  const reelLength = BASE_REELS[i].length;
  console.log(`Reel ${i+1}: ${reelLength} stops, ${orbCount} orbs (${(orbCount/reelLength*100).toFixed(1)}%), ${scatterCount} scatters`);
}

// Simulate 10000 spins and count orbs
console.log('\n=== ORB COUNT DISTRIBUTION (10K spins) ===');
const rng = new RNG(12345);
const orbDistribution: Record<number, number> = {};
let totalOrbs = 0;
let hnwTriggers = 0;
let fsTriggers = 0;

for (let i = 0; i < 10000; i++) {
  const { grid } = spin(rng, false);

  let orbCount = 0;
  let scatterCount = 0;
  for (let row = 0; row < 3; row++) {
    for (let reel = 0; reel < 5; reel++) {
      if (grid[row][reel] === SymbolId.LIGHTNING_ORB) orbCount++;
      if (grid[row][reel] === SymbolId.SCATTER_TEMPLE) scatterCount++;
    }
  }

  orbDistribution[orbCount] = (orbDistribution[orbCount] || 0) + 1;
  totalOrbs += orbCount;

  if (orbCount >= 5) hnwTriggers++;
  if (scatterCount >= 3) fsTriggers++;
}

console.log('Orbs per spin distribution:');
for (let orbs = 0; orbs <= 10; orbs++) {
  const count = orbDistribution[orbs] || 0;
  console.log(`  ${orbs} orbs: ${count} spins (${(count/100).toFixed(2)}%)`);
}
console.log(`\nAvg orbs per spin: ${(totalOrbs/10000).toFixed(2)}`);
console.log(`H&W triggers (6+): ${hnwTriggers} = 1 in ${hnwTriggers > 0 ? Math.round(10000/hnwTriggers) : 'Infinity'}`);
console.log(`FS triggers (3+): ${fsTriggers} = 1 in ${fsTriggers > 0 ? Math.round(10000/fsTriggers) : 'Infinity'}`);
