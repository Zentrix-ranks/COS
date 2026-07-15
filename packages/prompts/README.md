# @cos/prompts

Prompt library for every agent (system / role / task prompts). Prompts are **code**:
versioned, referenced by id on `run_steps`, and paired with strict zod output schemas.
Source of truth: [`spec/09-prompt-library.md`](../../spec/09-prompt-library.md).

## Contents

- `assembly.ts` — the four-layer prompt assembly (doc 09 §2): global system + role system +
  memory/KB block + task, plus the shared `GLOBAL_SYSTEM` house rules.
- `creative.ts` — M1 Creative-stage task templates and output schemas (idea, hook, outline,
  draft, cta, brand review, grammar, seo, ig optimisation) for the carousel path.

More departments' prompts are added as their milestones land (doc 16 §6).
