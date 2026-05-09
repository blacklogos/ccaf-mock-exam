# CCAF Mock Exam

A free, browser-based mock exam for the **Claude Certified Architect — Foundations (CCAF)** credential.

- 60 multiple-choice questions across four scenario domains
- 120-minute proctor-style timer (or untimed practice mode)
- 1000-point scoring with per-domain breakdown
- Explanations on every option after you submit
- Light + dark theme, keyboard shortcuts, mobile-friendly
- Pure static HTML/CSS/JS — no server, no tracking, no build step

## Run locally

```sh
# any static server works — for example:
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Domains covered

- **Research pipelines** — multi-agent retrieval, citation grounding, sub-agent isolation
- **Code exploration** — tool granularity, side-effect tiers, refactor invariants
- **Customer support** — intent routing, PII boundaries, refund authority, hand-off
- **Extraction pipelines** — schema versioning, evidence-span grounding, idempotency

## Keyboard shortcuts

- `← / →` — previous / next question
- `1`–`4` — pick option A–D
- `F` — flag the current question for review

## Disclaimer

This is an unofficial, community-built study tool. It is not affiliated with or endorsed by Anthropic. The official CCAF credential is awarded by Anthropic to architects at partner organizations who complete the Claude Academy learning path and pass the proctored exam. The 700 / 1000 pass benchmark used here is community-set for self-assessment only — the real exam's pass mark is not public.
