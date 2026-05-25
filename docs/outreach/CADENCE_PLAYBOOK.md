# Outreach Cadence Playbook

> Single source of truth for the 4-week outreach cadence to land an Vendor B C-level conversation. Realistic, not aspirational.

## Honest expectations

- **Reply rate on first cold email**: 4–8% (assuming targeted, personalized).
- **Reply rate on warm intro**: 60–80%.
- **Meeting-to-pilot conversion**: 20–35% on average over 12+ meetings.
- **Total time from first cold to signed pilot**: 6–12 weeks for committed pursuit.
- **Cost of doing this badly**: get blacklisted on internal "do not engage" lists; recovery takes 12+ months.

Two-thirds of cold outreach will go nowhere. Plan for that. Stay graceful.

---

## Week 1: Research and warm-intro path

### Day 1–2: Research the target

For each Vendor B C-level target, build a one-page research note:

| Field | Source |
|---|---|
| Name, role, tenure at Vendor B | LinkedIn |
| Prior companies, prior titles shipped | LinkedIn + Mobygames / SlotCatalog |
| Public-facing posts in last 6 months | LinkedIn + Twitter/X + company blog |
| Conferences they spoke at | YouTube + ICE / G2E / SBC archives |
| Glassdoor review themes about their org | Glassdoor |
| Recent press releases mentioning their name | Google News |
| Mutual connections on LinkedIn | LinkedIn second-degree search |
| Investor / board-overlap with people we know | Crunchbase + your investor network |
| Charity / sports / hobby signals | Public bio, often on company About page |

This is 2 hours of work per target. Don't skip it. The 1 useful detail you find is what unlocks the reply.

### Day 3–4: Walk the warm-intro graph

For each target, identify 2nd-degree connections. Look for:

- People who explicitly worked WITH them (not just at the same company)
- People who left Vendor B amicably (LinkedIn endorsements visible)
- Mutual investors / advisors
- People you have given value to in the past 6 months (ledger of favors matters)

Rank candidates by:
1. Strength of connection to target (worked closely > worked same company > just connected)
2. Strength of YOUR relationship with them (would they pick up your call?)
3. Their willingness to make intros (some people are "intro generous", some aren't)

Pick the top candidate per target. Send THEM a request for intro:

> Hi [name], hope you're well. Quick ask — I'm trying to get on [target name]'s calendar for ~20 minutes to discuss [framing]. Would you be willing to forward this [one-pager] to them with a one-line endorsement? Totally fine if not; just wanted to ask. — [you]

### Day 5: Wait

Give your intro contact 5 business days to respond. Don't follow up early; you'll burn the relationship.

---

## Week 2: Cold outreach if warm-intro stalls

### Day 6–7: Decide warm or cold

- If intro contact agreed → wait for the intro to land, then use `warm-*-intro.md`
- If intro contact declined / no response → proceed to cold

### Day 8: Send the cold LinkedIn DM

Use `cold-cto-linkedin.md` / `cold-cmo-linkedin.md` / `cold-cfo-linkedin.md` based on role.

Send between 9:00 and 11:00 target-local time. Tuesday / Wednesday / Thursday only — avoid Mondays (inbox triage) and Fridays (already mentally checked out).

### Day 10: If no LinkedIn response, send cold email

Use `cold-cto-email.md` / `cold-cmo-email.md` / `cold-cfo-email.md`.

Subject line A/B: split your 10-target batch into 2 halves, send each half a different subject. Track open + reply rates for next round.

### Day 12: Connect to a second contact in same org

If primary target has not responded, identify a parallel contact:

- Primary target is CTO → second contact is Head of Math or Engineering Director
- Primary target is CMO → second contact is Head of Studio or Marketing Director
- Primary target is CFO → second contact is Corp Dev lead or VP Finance

DO NOT mention you reached out to the primary first. Different angle, different bait.

---

## Week 3: Indirect engagement

### Day 13–15: Comment on their public posts

- LinkedIn: leave 1 substantive comment (not "great post!", a real insight) per week per target
- Twitter/X: same; aim for 1 reply per week with technical content
- Goal: become a recognized name in their notification feed before they read your DM

### Day 16: Attend their next conference appearance

Cross-reference target's speaker schedule. If they're at G2E / ICE / SBC in next 60 days:

- Register
- Plan a hallway intercept (don't ambush, but be visible at the booth where they're scheduled)
- Bring the one-pager + a printed pilot SOW

### Day 18: If still no direct response, follow-up email

Send `followup-no-response.md` with one NEW artifact attached. Always new, never re-pitch.

---

## Week 4: Industry-analyst angle

### Day 22–25: Get coverage in industry press

If direct paths failed, indirect-influence path:

- Pitch industry analysts: H2 Gambling Capital, Eilers & Krejcik, Vixio Regulating
- Story angle: "What Vendor B could do with closed-form math engines" (not "the company we want them to acquire")
- Outcome: analyst publishes; Vendor B internal stakeholders forward your name internally

### Day 26: Sponsor a conference

If budget allows: sponsor G2E or ICE booth adjacent to Vendor B's. Visibility = warmth multiplier.

### Day 28: Decide go / wait / abandon

Decision tree:

```
Has primary target replied? ─┬─ YES → continue with warm flow
                             │
                             └─ NO → Has secondary target replied?
                                     │
                                     ├─ YES → use secondary as entry, primary loops in later
                                     │
                                     └─ NO → Has analyst / press coverage landed?
                                             │
                                             ├─ YES → wait for inbound, do not push
                                             │
                                             └─ NO → SHELVE for 90 days, revisit at next quarterly cycle
```

---

## Decision tree (text-art)

```
                          ┌─────────────────────┐
                          │  Target identified  │
                          └──────────┬──────────┘
                                     │
                          ┌──────────▼──────────┐
                          │  Warm-intro path?   │
                          └─────┬──────────┬────┘
                          YES   │          │   NO
                                │          │
                  ┌─────────────▼──┐   ┌───▼──────────────┐
                  │  Intro lands?  │   │  Cold LinkedIn   │
                  └──┬──────────┬──┘   └──────┬───────────┘
                YES  │          │  NO         │
                     │          │             │
        ┌────────────▼───┐      └─────────────▼────────┐
        │ warm-*-intro.md│      │  Reply within 5d?    │
        └────────┬───────┘      └─┬──────────────────┬─┘
                 │           YES  │                  │  NO
                 │                │                  │
                 │                │      ┌───────────▼──────┐
                 │                │      │  Cold email      │
                 │                │      └──┬───────────────┘
                 │                │         │
                 ▼                ▼         ▼
        ┌──────────────────────────────────────────────┐
        │  Meeting scheduled  →  pre-pitch-checklist   │
        │  No meeting after 14d → followup-no-response │
        │  After follow-up still nothing → indirect    │
        │  After indirect still nothing → shelve 90d   │
        └──────────────────────────────────────────────┘
```

---

## Success metrics per stage

| Stage | Expected reply | Expected next-step | Notes |
|---|---|---|---|
| Cold LinkedIn DM | 5–10% reply | 20% of replies become meetings | Highest variance; first-line text is everything |
| Cold email | 4–8% reply | 30% of replies become meetings | Subject line is the lever |
| Warm intro | 60–80% reply | 50% of replies become meetings | Best ROI by far |
| Follow-up (day 5) | +2–4% reply on prior non-responders | 25% of those become meetings | Don't expect a miracle |
| Conference hallway | 30–50% conversation | 10% of conversations become meetings | Volume game |
| Analyst-led inbound | n/a | varies widely | Lagging indicator, plant seeds early |

---

## Anti-patterns (what NOT to do)

- DO NOT send mass-blasted templated emails without personalization.
- DO NOT send three or more follow-ups. Two and you're done.
- DO NOT use false urgency ("offer expires Friday").
- DO NOT CC people the target hasn't approved.
- DO NOT mention competitors by name negatively in cold outreach. Targets often have ex-colleagues there.
- DO NOT lie about progress. "We're in pilot with [BigCo]" when you're not = career suicide.
- DO NOT chase past a clear "no". Note the date and revisit in 6+ months.
- DO NOT switch channels (email → LinkedIn → SMS) without their consent.

---

## When to stop

You shelve a target when:

- 4-week cadence complete with no reply
- Or, they replied "not now / not interested" politely
- Or, you got the meeting and pilot was a clean no after Day 30

Re-engagement window: 90–180 days minimum before next touch. World changes; people change roles; new news gives you a new opening.

---

## Tooling

- **CRM export**: `scripts/outreach/crm-export.mjs` — converts contact list to HubSpot / Salesforce / Pipedrive / VCard.
- **Email merge dry-run**: `node scripts/outreach/crm-export.mjs --merge --template=cold-cto-email.md --contacts=lw-contacts.csv --dry-run`.
- **Open tracking**: use your CRM's email open tracker, with consent banner per GDPR.
- **Master TODO row**: update `SLOT_ENGINE_MASTER_TODO.md` after every meeting result.

---

## Honest closing note

This playbook is realistic, not aspirational. We expect ~5 cold outreach attempts to land 1 meeting. Plan for 50–100 cold reaches over 12 weeks to build a healthy 10-meeting pipeline. The pipeline is the strategy; individual emails are tactics.

Stay graceful. Stay specific. Ship the artifacts.
