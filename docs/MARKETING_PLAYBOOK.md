# slot-math-engine — Marketing Playbook (W215 / Faza 800.2)

This playbook is the canonical reference for marketing operations on
the slot-math-engine public site. It exists to keep editorial cadence,
SEO priorities, lead-magnet strategy, channel mix and conversion KPIs
all visible in one place. Update on every wave that ships content.

---

## 1. Editorial calendar (rolling 4 weeks)

Cadence: 1 case study + 2 blog posts + 1 product update every 4 weeks.

| Week | Content type | Topic theme | Owner | Target word count |
| --- | --- | --- | --- | --- |
| W1 | Case study   | Multi-jurisdiction launch / cert-cost reduction | Sales eng | 1 200 |
| W2 | Blog post #1 | Math deep-dive (closed-form, RTP, volatility)    | Math team | 1 000 |
| W2 | Blog post #2 | Mechanic walkthrough (Megaways, Hold&Win, jackpots) | Math team | 1 000 |
| W3 | Product update | Release notes for the latest wave (W2nn)        | Engineering | 600 |
| W4 | Buffer / repurpose | LinkedIn thread, HN front-page push       | Marketing | n/a |

Case-study source titles already shipped (W215 cohort):

* `case-study-1-multi-jurisdiction.html` — Tier-1 European Operator A
* `case-study-2-rapid-prototype.html`    — Indie Studio X
* `case-study-3-cert-cost-reduction.html`— Mid-Tier US Operator B

Blog source posts already shipped (W215 cohort):

* `blog-1-closed-form-rtp.md`
* `blog-2-rng-cert-pitfalls.md`
* `blog-3-megaways-implementation.md`
* `blog-4-volatility-tuning.md`

---

## 2. SEO priorities

Target keywords (organized by intent + DR realism):

| Keyword | Search volume | Difficulty (DR) | Priority | Landing page |
| --- | --- | --- | --- | --- |
| slot math engine          | 320 / mo  | 28 | P0 | `/index.html` |
| closed-form RTP solver    | 110 / mo  | 22 | P0 | `/blog/blog-1-closed-form-rtp.html` |
| GLI-19 cert checklist     | 270 / mo  | 35 | P1 | `/blog/blog-2-rng-cert-pitfalls.html` |
| Megaways math            | 420 / mo  | 48 | P1 | `/blog/blog-3-megaways-implementation.html` |
| slot volatility tuning    | 95 / mo   | 29 | P1 | `/blog/blog-4-volatility-tuning.html` |
| slot rng audit            | 140 / mo  | 33 | P2 | `/blog/blog-2-rng-cert-pitfalls.html` |
| jackpot solver            | 70 / mo   | 24 | P2 | `/case-studies/case-study-2-rapid-prototype.html` |

Domain-rating goal: DR 25 by Q3 2026, DR 40 by EoY. Path: 12 high-
quality outbound references per quarter from regulator / lab / academic
sources.

On-page SEO is enforced by `scripts/marketing/seo-audit.mjs --strict`
on every commit. Required checks: title 30–60 chars, meta-desc 120–160
chars, canonical link, og:image, exactly one h1, alt on every img,
valid JSON-LD, and sitemap.xml coverage.

---

## 3. Lead-magnet strategy

Already shipped:

* **Whitepaper** — "Closed-Form RTP: A Path to 11-Day GLI-19 Cycles" (PDF, 24 pp). Gated behind contact form.
* **Demo video** — 8-minute screen recording of the studio → IR → operator-package → cert pipeline. Ungated.
* **ROI calculator** — `/pages/demo.html` (interactive component shipped W214). Returns annual savings on cert cycle + math consulting.

Planned (W216+):

* **Cert dossier sample** — redacted operator-package tarball. Gated.
* **σ-tuning notebook** — runnable Jupyter notebook with the convex solver. Ungated, signed in to a sandbox env.
* **Jurisdiction matrix poster** — printable single-sheet of which mechanics ship in which jurisdiction. Gated.

Conversion target per magnet: ≥ 3 % of unique visitors → gated download → 25 % of gated downloads → demo request.

---

## 4. Channel mix

| Channel | Cadence | Audience | KPI |
| --- | --- | --- | --- |
| LinkedIn (company page) | 2 posts / week | CTO / Math lead / Studio CFO | 8 % avg engagement on math-deep posts |
| Hacker News           | 1 submission / month | Engineers, indie founders | 40+ upvotes target on the launch post |
| Industry publications | 1 byline / quarter | iGaming Business / Gambling Insider readers | 1 inbound demo per byline |
| Conference talks       | 2 / year | ICE London, G2E Las Vegas | 25 demo requests per talk |
| Email newsletter       | 1 / month | Existing leads + opt-in subscribers | 25 % open rate, 4 % click rate |

LinkedIn rotation: math deep-dive (40 %), case-study lift-out (30 %),
product update (15 %), team / culture (15 %). HN posts are anchored on
blog posts that have already gone through internal review.

---

## 5. Conversion KPIs (W215 baseline → target)

| Stage | Baseline | Q3 2026 target | Q4 2026 target |
| --- | ---: | ---: | ---: |
| Visitor → demo request | 1.8 % | 3.0 % | 4.0 % |
| Demo → pilot           | 18 %  | 25 %  | 30 %  |
| Pilot → paid           | 52 %  | 60 %  | 65 %  |
| End-to-end (visitor → paid) | 0.17 % | 0.45 % | 0.78 % |

Funnel snapshots are produced weekly by
`scripts/marketing/conversion-funnel-snapshot.mjs` and rendered on
`web/marketing/analytics/analytics-dashboard.html`. A/B experiments
listed in `web/marketing/analytics/ab-testing.js` are reviewed at the
end of every editorial sprint; any variant whose 95 % credible
interval is fully above baseline gets promoted.

---

## 6. Operational checklist

Run before every editorial release:

* `node scripts/marketing/seo-audit.mjs --strict` — must exit 0
* `node scripts/marketing/conversion-funnel-snapshot.mjs` — must produce deterministic JSON
* `npm run marketing:test`                            — must pass
* `npm test`                                          — must pass
* Refresh `web/marketing/sitemap.xml` if pages added
* Update this file's editorial calendar section

Run after every editorial release:

* Push new posts to LinkedIn (math deep-dive lift-outs)
* Submit highest-fit post to Hacker News no earlier than Tuesday 09:00 PT
* Trigger newsletter draft via the support automation queue
* Tag GitHub release with the editorial-sprint name (e.g. `editorial-w215`)

---

## 7. Voice & house style

* Strong verbs, short sentences. Cite numbers wherever possible.
* No marketing fluff. The audience is engineers and math leads. They detect spin.
* Never name a real operator unless they sign-off in writing. Use the clean-room labels: "Tier-1 European Operator A", "Indie Studio X", "Mid-Tier US Operator B".
* Math notation: prefer code blocks with ASCII (`σ`, `Σ`) over MathJax. Faster to render, sharper on mobile.
* Reading time on every post; 4–7 minutes is the sweet spot for technical readers.

---

## 8. What we don't do

* No A/B test that wasn't pre-registered. All experiments live in `ab-testing.js`.
* No tracking pixels, no third-party cookies, no fingerprinting. The analytics layer is privacy-first by design.
* No paid amplification for posts that haven't passed internal review.
* No real-operator names, even with permission, until legal sign-off.

---

Last reviewed: 2026-05-19 · Owner: marketing + engineering shared.
