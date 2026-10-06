# Legacy documents

This repository grew out of earlier products that shared the same Next.js
codebase before it became Juno:

- **Norr** (Algorand) — see `NORR-README.md`.
- **Veil** (pay-per-tap blur-to-reveal on Tempo, with an auto-blur model) —
  see `veil/`.

None of it is part of the Juno CLOCK IN submission. The design files and the
Python auto-blur model that used to sit at the repo root (`tempo-onlyfans/`,
`auto-blur/`) were removed for CLOCK IN; they remain in git history. Some
Norr/Veil routes still live inside the Next.js app because the Juno API is
served from the same app, but the Juno mobile app never calls them.
