# 03 — Weekly status during integration

> Recurring email, every Friday afternoon (customer's timezone).

**Subject:** Weekly status — {{customer_name}} — week of {{week_starting}}

**Audience:** Primary contact + sponsor; cc internal CSM team

**Cadence:** Weekly during the `integration_in_progress` stage

---

Hi {{primary_contact_first_name}},

Quick recap of the week. As always, reply if anything looks off.

### What landed this week

- {{landed_item_1}}
- {{landed_item_2}}
- {{landed_item_3}}

### In-flight

| Item | Owner | ETA |
|---|---|---|
| {{in_flight_1}} | {{owner_1}} | {{eta_1}} |
| {{in_flight_2}} | {{owner_2}} | {{eta_2}} |
| {{in_flight_3}} | {{owner_3}} | {{eta_3}} |

### Blocked

- {{blocker_1}} *(need: {{ask_1}})*

### Metrics watch

- Open tickets: **{{open_tickets}}**
- Mean time to first response: **{{mttfr_hours}} h**
- Cert submissions pending: **{{pending_certs}}**
- Last integration test: **{{last_test_result}}**

### Next week

- {{next_item_1}}
- {{next_item_2}}

If you want to walk through anything live, my calendar is open here:
{{calendar_link}}.

— {{csm_name}}

---

**Internal notes:**
- Pull metrics from the CSM dashboard (W215). Snapshot the numbers, do not
  link to the live URL since that is internal.
- If MTTFR > 4h, flag the row red and call it out under "Blocked".
- Capture the customer's reply in the CRM activity log.
