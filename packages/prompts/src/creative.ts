// packages/prompts/src/creative.ts
// Task templates + strict output schemas for the M1 Creative stages (carousel path).
// Source: spec/09-prompt-library.md §6/§8.2, spec/12 §4.3–§4.10. Each schema carries the
// house-rule fields confidence + reasoning_summary (doc 09 §3 rule 5).
import { z } from 'zod';
import type { AssetSnapshot } from '@cos/shared';

const base = { confidence: z.number().min(0).max(1), reasoning_summary: z.string() };

export interface PromptContext {
  idea: { title: string; angle: string | null };
  format: string;
  persona: { name: string; pains: string[] };
  brandVoiceSummary: string;
  slides: number; // target slide count for carousel
  asset: AssetSnapshot;
}

// ---- Schemas ----
export const ideaSchema = z.object({
  title: z.string(),
  angle: z.string(),
  rationale: z.string(),
  ...base,
});
export const hookSchema = z.object({
  hook_candidates: z.array(z.object({ text: z.string(), score: z.number(), why: z.string() })).min(1),
  chosen_hook: z.string(),
  rationale: z.string(),
  ...base,
});
export const outlineSchema = z.object({
  slides: z.array(z.object({ n: z.number().int(), point: z.string() })).min(1),
  ...base,
});
export const draftSchema = z.object({
  slides: z
    .array(z.object({ n: z.number().int(), text: z.string(), design_intent: z.string() }))
    .min(1),
  caption: z.string(),
  ...base,
});
export const ctaSchema = z.object({
  cta_text: z.string(),
  kind: z.string(),
  placement: z.string(),
  ...base,
});
export const brandReviewSchema = z.object({
  pass: z.boolean(),
  violations: z.array(z.object({ issue: z.string(), fix: z.string() })),
  edited_caption: z.string(),
  ...base,
});
export const grammarSchema = z.object({
  clean_caption: z.string(),
  changed: z.boolean(),
  ...base,
});
export const seoSchema = z.object({
  hashtags: z.array(z.string()).min(1),
  optimized_caption: z.string(),
  ...base,
});
export const igSchema = z.object({
  slide_count_ok: z.boolean(),
  cover_text: z.string(),
  notes: z.string(),
  ...base,
});

// ---- Task builders (doc 09 §6) ----
export const CREATIVE_TASKS = {
  idea_generation: (c: PromptContext) =>
    `Refine this idea into a crisp, brand-fit content concept for Instagram.\nSeed: ${c.idea.title} — angle: ${c.idea.angle ?? 'open'}\nAudience: ${c.persona.name} (${c.persona.pains.join(', ')})\nReturn a final title, a sharpened angle, and a one-line rationale. Score novelty+relevance as confidence.`,
  hook_creation: (c: PromptContext) =>
    `Idea: ${c.asset.title ?? c.idea.title} — angle: ${c.idea.angle ?? ''}\nFormat: ${c.format}  Audience: ${c.persona.name} (${c.persona.pains.join(', ')})\nBrand voice: ${c.brandVoiceSummary}\nProduce 5–10 distinct opening hooks optimized to stop the scroll for this persona. Score each 0–10 using recalled winners as calibration. Return the top hook plus alternatives.`,
  outline: (c: PromptContext) =>
    `Outline a ${c.slides}-slide carousel for hook: "${c.asset.hook ?? ''}".\nSlide 1 = hook; middle = value/proof; last = CTA slot. One structural point per slide (arc: hook→value→proof→CTA).`,
  draft: (c: PromptContext) =>
    `Write the ${c.slides}-slide carousel from the outline. Each slide ≤ 25 words, high retention, save-worthy. Provide design intent per slide. Also write a caption draft. Hook is fixed: "${c.asset.hook ?? ''}".`,
  cta: (c: PromptContext) =>
    `Choose the strongest call-to-action for this ${c.format} for ${c.persona.name}. Return CTA text, kind (save/follow/comment/link), and placement (last slide / caption).`,
  brand_review: (c: PromptContext) =>
    `Review the draft caption and slides against Zentrix brand rules and the trading-content compliance filter. Caption: "${c.asset.caption ?? ''}". Return pass/fail, violations with fixes, and an edited caption that preserves meaning. Never pass uncertain voice — fail-closed.`,
  grammar: (c: PromptContext) =>
    `Grammar/spelling/clarity pass (low temperature) on: "${c.asset.caption ?? ''}". Preserve meaning. Return clean caption and whether anything changed.`,
  seo: (c: PromptContext) =>
    `Optimise discoverability for this ${c.format}. From caption "${c.asset.caption ?? ''}", produce relevant non-spammy hashtags and a keyword-optimised caption.`,
  ig_optimisation: (c: PromptContext) =>
    `Instagram-tune this ${c.slides}-slide carousel: confirm slide count, propose cover text from the hook "${c.asset.hook ?? ''}", and note first-comment strategy.`,
} as const;

export const CREATIVE_SCHEMAS = {
  idea_generation: ideaSchema,
  hook_creation: hookSchema,
  outline: outlineSchema,
  draft: draftSchema,
  cta: ctaSchema,
  brand_review: brandReviewSchema,
  grammar: grammarSchema,
  seo: seoSchema,
  ig_optimisation: igSchema,
} as const;

export type CreativeStageKey = keyof typeof CREATIVE_TASKS;
