// packages/prompts/src/assembly.ts
// Four-layer prompt assembly. Source: spec/09-prompt-library.md §2–§5.
//   [GLOBAL SYSTEM] + [ROLE SYSTEM] + [MEMORY + KB] + [TASK]

/** Global house rules shared by every agent (doc 09 §3). */
export const GLOBAL_SYSTEM = `You are an agent inside Zentrix OS (COS), an autonomous content operating system run like a company. You have ONE job, defined by your role. Follow these house rules:
1. Ground everything in provided memory, knowledge, and tool results. NEVER invent metrics, trends, competitor facts, or citations. If a fact is not supplied and cannot be fetched via your tools, say so and lower your confidence.
2. Obey brand rules and compliance constraints supplied in context. For trading content, never promise guaranteed returns or give individualized financial advice; attach required disclaimers.
3. Prefer recalled winning patterns over generic output. Reuse what has worked for Zentrix.
4. Produce output that exactly matches the required schema. No prose outside the schema unless a 'notes' field is provided.
5. Include a numeric self-assessed confidence in [0,1] and a one-paragraph reasoning_summary describing how you used memory/tools.
6. Stay within your permissions. Do not attempt actions or tools you are not granted.
7. Be concise, specific, and on-brand. Optimize for the audience persona provided.`;

export interface AgentContractLite {
  id: string;
  name: string;
  department: string;
  goal: string;
  responsibilities: string[];
  tools: string[];
  reports_to: string | null;
  eval_primary?: string;
}

/** Role system prompt (doc 09 §4). */
export function roleSystem(agent: AgentContractLite): string {
  return [
    `ROLE: ${agent.name} (${agent.id}) — ${agent.department} department.`,
    `GOAL: ${agent.goal}`,
    'RESPONSIBILITIES:',
    ...agent.responsibilities.map((r) => `- ${r}`),
    `YOU REPORT TO: ${agent.reports_to ?? 'operator'}.`,
    `TOOLS AVAILABLE: ${agent.tools.join(', ') || '(none)'} (use them; do not guess what they would return)`,
    agent.eval_primary ? `EVALUATION: you are judged on ${agent.eval_primary}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface MemoryBlock {
  winners: string[];
  failures: string[];
  brand_rules: string[];
  preferences: string[];
}

/** Memory + KB context block (doc 09 §5, doc 05 §6.3). */
export function memoryBlock(m: MemoryBlock): string {
  const line = (xs: string[]) => (xs.length ? xs.join('; ') : 'none on record');
  return [
    '[MEMORY]',
    `Winning patterns (recall): ${line(m.winners)}`,
    `Failures to avoid: ${line(m.failures)}`,
    `Brand rules (MUST follow): ${line(m.brand_rules)}`,
    `Operator preferences: ${line(m.preferences)}`,
    '[/MEMORY]',
  ].join('\n');
}

export interface AssembledPrompt {
  system: string;
  user: string;
}

/** Assemble the full prompt for one agent call. */
export function assemblePrompt(args: {
  agent: AgentContractLite;
  memory: MemoryBlock;
  task: string;
}): AssembledPrompt {
  return {
    system: `${GLOBAL_SYSTEM}\n\n${roleSystem(args.agent)}`,
    user: `${memoryBlock(args.memory)}\n\n[TASK]\n${args.task}`,
  };
}
