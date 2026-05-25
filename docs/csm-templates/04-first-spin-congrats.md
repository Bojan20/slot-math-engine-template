# 04 — First spin congrats

> Send within 1 hour of the first real-money spin landing in the audit log.

**Subject:** First spin landed — congratulations, {{customer_name}}!

**Audience:** Sponsor + entire customer team; cc CEO of Vendor B platform

**Cadence:** Day of `first_spin` stage transition

---

Hi {{primary_contact_first_name}},

The audit log just registered your **first real-money spin** on the
platform — milestone unlocked!

- **Time of first spin:** {{first_spin_at}}
- **Game:** {{first_spin_game}}
- **Jurisdiction:** {{first_spin_jurisdiction}}
- **Bet size:** {{first_spin_bet}}
- **Outcome:** {{first_spin_outcome}}

This is the moment where every architectural decision pays off. From
here, three things happen automatically:

1. **Live RTP monitoring** kicks in — you can see drift in real time on the
   operator dashboard.
2. **Daily reconciliation** between wallet ledger and operator settlement
   runs at 02:00 UTC.
3. **CSM check-in cadence** shifts from weekly to bi-weekly until the
   `soft_launch` milestone.

I would love to grab 30 minutes within the next 5 days to do a "first
72 hours" retrospective — what surprised us, what blocked us, what we'd
do differently. Calendar: {{calendar_link}}.

Congratulations to your team. Drinks are on us at G2E.

— {{csm_name}}

---

**Internal notes:**
- Verify the first-spin tx in the audit log before sending.
- Trigger the internal `#wins` Slack post via the CSM dashboard button.
- Move the customer's onboarding stage to `first_spin` (W215 transition API).
- Schedule the 72-hour retro automatically.
