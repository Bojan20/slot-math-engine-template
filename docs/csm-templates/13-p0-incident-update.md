# 13 — P0 incident update

> Send at the cadence committed in the incident response plan (default: every 30 min for P0).

**Subject:** P0 incident update — {{incident_id}} — {{update_index}}/N

**Audience:** All affected tenant contacts + status page subscribers

**Cadence:** Every 30 minutes during P0; transitions to per-hour on recovery

---

**Incident:** {{incident_id}}
**Status:** {{status}}  *(detected | investigating | mitigating | recovered | post-incident)*
**Severity:** P0
**Affected:** {{affected_services}}
**Started:** {{started_at}}
**Last verified update:** {{verified_at}}

### Summary

{{summary_paragraph}}

### What's happening now

- {{current_action_1}}
- {{current_action_2}}

### Next update

By **{{next_update_at}}**.

### Workarounds

- {{workaround_1}}
- {{workaround_2}}

If you have questions, call the hotline at {{hotline_phone}} or reply
to this email. Both reach the on-call team directly.

— {{on_call_lead_name}}, on-call incident commander

---

**Internal notes:**
- Status comes from the W212 chaos / incident state — not free-form text.
- The status page (`/api/health`) MUST agree with this email; bot
  publishes both.
- After `recovered`, send the post-incident review within 5 business
  days.
