// apps/worker/model/provider.ts
// Model-provider abstraction. Source: spec/02 §4 (OpenRouter + Claude/OpenAI), spec/09 §7
// (per-stage routing). Output is constrained to a typed zod schema (doc 09 §2).
//
// The MockProvider returns deterministic, schema-valid content so the pipeline runs
// end-to-end without model API keys (doc 02 §9: local uses "mock or low-cost models").
// Real providers (OpenRouter/Anthropic) implement the same interface for staging/prod.
import type { PromptContext } from '@cos/prompts';
import type { z } from 'zod';

export interface ModelRoute {
  model: string;
  temperature: number;
}

export interface GenerateArgs<T> {
  agentId: string;
  kind: string; // stage key — lets the mock pick a shape; real providers use `schema`
  system: string;
  user: string;
  schema: z.ZodType<T>;
  route: ModelRoute;
  ctx: PromptContext;
}

export interface GenerateResult<T> {
  output: T;
  usage: { tokens_in: number; tokens_out: number; cost_usd: number };
}

export interface ModelProvider {
  readonly name: string;
  generate<T>(args: GenerateArgs<T>): Promise<GenerateResult<T>>;
}

/** Deterministic, schema-valid mock. Content is derived from the prompt context. */
export class MockProvider implements ModelProvider {
  readonly name = 'mock';

  async generate<T>(args: GenerateArgs<T>): Promise<GenerateResult<T>> {
    const raw = buildMockOutput(args.kind, args.ctx);
    // Validate against the real schema so the mock can never drift from the contract.
    const output = args.schema.parse(raw);
    const tokens_in = Math.ceil((args.system.length + args.user.length) / 4);
    const tokens_out = Math.ceil(JSON.stringify(raw).length / 4);
    // Cost is $0 by default; COS_MOCK_COST_USD lets tests exercise budget caps (doc 02 §8.3).
    const cost_usd = Number(process.env.COS_MOCK_COST_USD ?? 0);
    return { output, usage: { tokens_in, tokens_out, cost_usd } };
  }
}

function buildMockOutput(kind: string, c: PromptContext): unknown {
  const title = c.asset.title ?? c.idea.title;
  const hook = c.asset.hook ?? `Stop scrolling — ${title}`;
  const n = c.slides;
  const slidePoints = Array.from({ length: n }, (_, i) => ({ n: i + 1, point: mockPoint(i, n, title) }));
  const slideText = Array.from({ length: n }, (_, i) => ({
    n: i + 1,
    text: i === 0 ? hook : i === n - 1 ? 'Save this and follow for more.' : `${title}: key point ${i}.`,
    design_intent: i === 0 ? 'bold cover, high contrast' : 'clean layout, brand palette',
  }));
  const caption = `${title}. ${c.idea.angle ?? ''} For ${c.persona.name}. #zentrix`.trim();
  const rs = `Mock generation for ${kind}; used ${c.persona.name} persona and recalled winners.`;

  switch (kind) {
    case 'idea_generation':
      return { title, angle: c.idea.angle ?? 'contrarian, evidence-led', rationale: 'On-theme and novel.', confidence: 0.8, reasoning_summary: rs };
    case 'hook_creation':
      return {
        hook_candidates: [
          { text: hook, score: 8.6, why: 'pattern-interrupt + specificity' },
          { text: `The truth about ${title}`, score: 7.2, why: 'curiosity gap' },
          { text: `${title}? Most get this wrong.`, score: 7.9, why: 'contrarian' },
        ],
        chosen_hook: hook,
        rationale: 'Highest stopping power vs recalled winners.',
        confidence: 0.82,
        reasoning_summary: rs,
      };
    case 'outline':
      return { slides: slidePoints, confidence: 0.78, reasoning_summary: rs };
    case 'draft':
      return { slides: slideText, caption, confidence: 0.8, reasoning_summary: rs };
    case 'cta':
      return { cta_text: 'Save this for your next session.', kind: 'save', placement: 'last slide', confidence: 0.83, reasoning_summary: rs };
    case 'brand_review':
      // Pass on brand voice; fail-closed logic is exercised via the real gate in the engine.
      return { pass: true, violations: [], edited_caption: caption, confidence: 0.86, reasoning_summary: rs };
    case 'grammar':
      return { clean_caption: caption, changed: false, confidence: 0.9, reasoning_summary: rs };
    case 'seo':
      return { hashtags: ['#trading', '#smc', '#zentrix', '#forex'], optimized_caption: `${caption} #trading #smc`, confidence: 0.8, reasoning_summary: rs };
    case 'ig_optimisation':
      return { slide_count_ok: true, cover_text: hook.slice(0, 40), notes: 'Pin a first comment with the CTA.', confidence: 0.82, reasoning_summary: rs };
    default:
      throw new Error(`MockProvider: no output template for kind '${kind}'`);
  }
}

function mockPoint(i: number, n: number, title: string): string {
  if (i === 0) return `Hook: ${title}`;
  if (i === n - 1) return 'CTA: save + follow';
  return `Value point ${i}: proof/example`;
}

/**
 * Real provider via OpenRouter (doc 02 §4, doc 09 §7). Output is constrained by instructing the
 * model to return only JSON, then zod-parsing (with one repair retry). Per-stage model routing
 * from the agent's model_policy is a follow-up; a default model is used for now.
 */
export class OpenRouterProvider implements ModelProvider {
  readonly name = 'openrouter';
  constructor(
    private readonly apiKey: string,
    private readonly defaultModel = process.env.COS_OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet',
  ) {}

  async generate<T>(args: GenerateArgs<T>): Promise<GenerateResult<T>> {
    const model = args.route.model && args.route.model !== 'mock' ? args.route.model : this.defaultModel;
    const system = `${args.system}\n\nRespond with ONLY a single minified JSON object matching the required schema. No prose, no markdown fences.`;
    const call = async (extra?: string) => {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: args.route.temperature,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: extra ? `${args.user}\n\n${extra}` : args.user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
      return (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
    };

    let json = await call();
    let parsed = tryParse(args.schema, json.choices[0]?.message.content ?? '');
    if (!parsed.ok) {
      // One repair attempt with the validation error surfaced.
      json = await call(`Your previous output failed validation: ${parsed.error}. Return corrected JSON only.`);
      parsed = tryParse(args.schema, json.choices[0]?.message.content ?? '');
      if (!parsed.ok) throw new Error(`OpenRouter output failed schema validation: ${parsed.error}`);
    }
    const usage = json.usage ?? {};
    return {
      output: parsed.value,
      usage: {
        tokens_in: usage.prompt_tokens ?? 0,
        tokens_out: usage.completion_tokens ?? 0,
        cost_usd: 0, // OpenRouter returns cost via a separate generation lookup; wire in follow-up.
      },
    };
  }
}

function tryParse<T>(schema: z.ZodType<T>, content: string): { ok: true; value: T } | { ok: false; error: string } {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, error: 'no JSON object found in response' };
  try {
    const result = schema.safeParse(JSON.parse(match[0]));
    return result.success ? { ok: true, value: result.data } : { ok: false, error: result.error.message };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Select the provider from env. Defaults to mock unless a real key + provider are set. */
export function getModelProvider(): ModelProvider {
  const provider = process.env.COS_MODEL_PROVIDER ?? 'mock';
  if (provider === 'openrouter') {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('COS_MODEL_PROVIDER=openrouter requires OPENROUTER_API_KEY');
    return new OpenRouterProvider(key);
  }
  return new MockProvider();
}
