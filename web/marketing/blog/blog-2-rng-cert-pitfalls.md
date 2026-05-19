---
title: "5 RNG Cert Pitfalls We've Seen in GLI-19 Submissions"
slug: rng-cert-pitfalls
publishDate: 2026-05-12
author: slot-math-engine team
tags: [rng, gli-19, certification, pitfalls]
excerpt: "Five RNG mistakes we keep seeing in GLI-19 submissions and how to dodge each one before the lab finds them."
readingTimeMinutes: 3
---

# 5 RNG Cert Pitfalls We've Seen in GLI-19 Submissions

We've reviewed a few hundred GLI-19 submissions in the last 18 months. Five RNG-related mistakes show up over and over. Catch them before the auditor does.

## 1. Seeding the PRNG from `Date.now()` at boot

This one is still common. A studio uses a Mersenne-Twister or xoshiro PRNG, seeds it from `Date.now()` on process start, and calls it a day. Two problems:

* If two server replicas boot in the same millisecond, they produce identical spin streams. The audit log shows the collision and the title fails.
* Replaying a session is impossible because the seed wasn't captured.

Fix: seed from a CSPRNG (`crypto.randomBytes(32)`), persist the seed alongside every session log, and require the same seed for replay verification.

## 2. Re-using the same nonce stream across jurisdictions

If your overlay engine emits a single global nonce counter, a UK session can collide with an MGA session. The fix is per-jurisdiction nonces — and writing that down explicitly in the architecture document so the auditor doesn't have to infer it.

## 3. Modulo bias on small ranges

`rand_u32() % 6` is not uniform when 2^32 is not divisible by 6. The bias is ~10⁻⁹ per draw, which sounds tiny — until the lab runs 10⁸ spins on a Yahtzee-style mechanic and sees the bias surface in the chi-square.

Fix: rejection sampling. Use `rand_uniform_below(n)` that rejects draws ≥ floor(2^32/n)·n.

## 4. Static reel strips with shared symbol indices

Cosmetic-only "symbols" (i.e., a wild that visually shows different art depending on the line) sometimes share an index with a paying symbol. Lab catches this when the symbol frequency on the reel strip doesn't match the documented frequency.

Fix: model every visually distinct symbol as a distinct math symbol. Even if the art collapses them, the math IR should not.

## 5. Cert dossier with a non-deterministic build

This is the one that costs the most. Studio ships an operator-package archive with the same nominal contents, but the tarball bytes change between builds because the build tool emits a non-zero timestamp on every file. Lab hashes don't match. Audit re-run.

Fix: deterministic archives. `tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --format=ustar -czf …` is a starting point. The slot-math-engine W194 operator-package tooling produces byte-stable archives out of the box.

## How to dodge all five at once

Most studios catch 1-3 with a careful code review, but 4 and 5 require tooling. The closed-form solver path is naturally deterministic — and the operator-package builder (W194+) enforces byte-stability so the lab gets the same hash every time. Pair that with a CSPRNG seed and per-jurisdiction nonces and your submission stops generating audit re-runs.

## Want a checklist?

Our cert dossier includes a pre-submission checklist (P-IDs 27, 41, 81). The full version is in the operator-package tarball; we'll mail you a redacted PDF on request — ping `cert@slot-math-engine.example`.
