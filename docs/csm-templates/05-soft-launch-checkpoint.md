# 05 — Soft launch checkpoint

> Send 5 business days into the soft launch window.

**Subject:** Soft launch checkpoint — {{customer_name}}

**Audience:** Sponsor + ops lead + math lead

**Cadence:** T+5 days into `soft_launch` stage

---

Hi {{primary_contact_first_name}},

We're 5 days into your soft launch — time for a structured checkpoint.
Below are the numbers and the questions I want us to align on before
we make the call on going full-launch.

### Operational metrics (since soft launch)

| Metric | Value | Target |
|---|---|---|
| Spins served | {{spins_total}} | {{spins_target}} |
| Achieved RTP | {{rtp_achieved}}% | {{rtp_target}}% |
| Hit frequency | {{hit_freq}}% | {{hit_freq_target}}% |
| p99 latency | {{p99_ms}} ms | < 100 ms |
| Uptime | {{uptime}}% | > 99.95% |
| Tickets opened | {{tickets_opened}} | < 5 |
| Anomaly events | {{anomalies}} | 0 |

### Questions for go/no-go

1. Are you comfortable with the achieved RTP vs target?
2. Did the support volume scale linearly with player count?
3. Any qualitative feedback from your VIP / RG teams?
4. Marketing readiness — when is the public launch window?

### Recommendation

{{recommendation_paragraph}}

Could we lock in 30 minutes on **{{proposed_meeting_date}}** to walk
through this together? My calendar: {{calendar_link}}.

— {{csm_name}}

---

**Internal notes:**
- Pull all numbers from the CSM dashboard + W215 MBR generator.
- If `anomalies > 0`, attach the anomaly-mitigation report (W212).
- Document the go/no-go decision in the deal-room.
