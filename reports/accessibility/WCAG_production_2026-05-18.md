# WCAG 2.1 AA Audit — production

**URL:** http://localhost:8080
**Date:** 2026-05-18

## Summary

| Severity | Count |
|---|---:|
| Critical | 0 |
| Serious  | 0 |
| Moderate | 0 |
| Minor    | 2 |
| **Total**| 2 |

## Minor findings

### no-banner-landmark
- **Rule:** WCAG 2.1 1.3.1 Info and Relationships
- **Description:** No <header role="banner"> landmark.
- **Fix:** Add <header role="banner"> wrapping nav/logo.

### no-skip-link
- **Rule:** WCAG 2.1 2.4.1 Bypass Blocks
- **Description:** No "skip to main content" link detected.
- **Fix:** Add <a class="skip" href="#main">Skip to content</a> as first focusable element.
