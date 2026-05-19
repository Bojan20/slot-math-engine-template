/*
 * ════════════════════════════════════════════════════════════════════════════
 *   DNA  —  Merkle Fingerprint of an IR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The DNA is a Merkle root over the math-relevant sections of an IR.  It is
 * the IR's identity card: any change to a math-meaningful field changes the
 * root.  Cosmetic fields (meta.name, validated_metrics, rtp_allocation if
 * informational) are excluded so re-naming a workspace does NOT invalidate
 * the seal.
 *
 * Sections hashed (each as a Merkle leaf):
 *   1. topology      — reels, rows, kind
 *   2. symbols       — id, kind, paytable_key (NO cosmetic name/color)
 *   3. reels.base    — full strip
 *   4. reels.fs      — full strip (or null)
 *   5. reels.scatter_prevention  — block
 *   6. paytable      — full {sym → {3,4,5}} map
 *   7. paylines      — payline coordinates
 *   8. evaluation    — kind, min_match, wild_substitution
 *   9. features      — sorted by kind, each feature serialized canonically
 *  10. limits        — max_win_x, bet caps
 *  11. rng           — kind, default_seed
 *  12. bet           — base_bet, multipliers
 *
 * Each leaf = sha256(canonical_json(section)).
 * Root = sha256(leaf_1 || leaf_2 || ... || leaf_N) — flat concatenation, not
 * a binary tree.  For 12 leaves flat is just as collision-resistant as a tree
 * and the implementation is shorter.
 *
 * Public API:
 *   await MTLDNA.compute(ir) → { root, leaves: { topology, symbols, reels_base, ... } }
 *   await MTLDNA.verify(ir, expected_root) → boolean
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (root) {
  'use strict';

  const O = root.MTLOracle;
  if (!O) {
    console.error('[MTLDNA] requires oracle.js to be loaded first');
    return;
  }

  // Strip cosmetic-only fields from a symbol so renaming "ZEUS" → "Zeus, King"
  // doesn't invalidate the math DNA.  Math identity = id + kind + paytable shape.
  function canonicalSymbol(s) {
    return {
      id: s.id,
      kind: s.kind,
      // include paytable_key if present (some IRs use this to alias paytable rows)
      paytable_key: s.paytable_key || s.id,
    };
  }

  function canonicalFeature(f) {
    // Keep ALL math-relevant fields; strip cosmetic banners/strings.
    const out = {};
    for (const k of Object.keys(f).sort()) {
      const v = f[k];
      if (k === 'banner' || k === 'overlay' || k === 'sfx' || k === 'art') continue;
      if (v && typeof v === 'object') out[k] = v;
      else out[k] = v;
    }
    return out;
  }

  async function leafHash(value) {
    return O.sha256Hex(O.canonicalJSON(value));
  }

  async function compute(ir) {
    const sections = {};

    sections.topology = {
      reels: (ir.topology && ir.topology.reels) || null,
      rows: (ir.topology && ir.topology.rows) || null,
      kind: (ir.topology && ir.topology.kind) || null,
    };
    sections.symbols = (ir.symbols || []).map(canonicalSymbol).sort((a, b) => (a.id < b.id ? -1 : 1));
    sections.reels_base = (ir.reels && ir.reels.base) || null;
    sections.reels_fs = (ir.reels && ir.reels.free_spins) || null;
    sections.reels_scatter_prevention = (ir.reels && ir.reels.scatter_prevention) || null;
    sections.paytable = ir.paytable || null;
    sections.paylines = (ir.evaluation && ir.evaluation.paylines) || null;
    sections.evaluation = {
      kind: (ir.evaluation && ir.evaluation.kind) || null,
      min_match: (ir.evaluation && ir.evaluation.min_match) || null,
      wild_substitution: (ir.evaluation && ir.evaluation.wild_substitution) || null,
    };
    sections.features = (ir.features || [])
      .slice()
      .sort((a, b) => (a.kind < b.kind ? -1 : 1))
      .map(canonicalFeature);
    sections.limits = ir.limits || null;
    sections.rng = ir.rng || null;
    sections.bet = ir.bet || null;

    // Hash each section
    const leafNames = Object.keys(sections).sort();
    const leaves = {};
    for (const name of leafNames) {
      leaves[name] = await leafHash(sections[name]);
    }

    // Flat concat root
    const concat = leafNames.map((n) => leaves[n]).join('');
    const rootHash = await O.sha256Hex(concat);

    return {
      root: rootHash,
      leaves: leaves,
      sections: sections,
    };
  }

  async function verify(ir, expectedRoot) {
    const dna = await compute(ir);
    return dna.root === expectedRoot;
  }

  // Helper: which leaf differs between two IRs?  Used by the diagnostic
  // panel to tell Boki "you changed the paytable" without him having to
  // diff JSON manually.
  async function diffLeaves(irA, irB) {
    const a = await compute(irA);
    const b = await compute(irB);
    const out = [];
    for (const name of Object.keys(a.leaves)) {
      if (a.leaves[name] !== b.leaves[name]) out.push(name);
    }
    return out;
  }

  root.MTLDNA = {
    compute: compute,
    verify: verify,
    diffLeaves: diffLeaves,
  };
})(typeof window !== 'undefined' ? window : globalThis);
