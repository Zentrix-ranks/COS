// packages/shared/src/pipeline.ts
// Pipeline state + stage-result types threaded through the workflow engine.
// Source: spec/06-workflow-engine.md §3 (state model), spec/12-content-pipeline-blueprint.md.
// State is JSON-serializable and persisted to runs.checkpoint after every node (doc 06 §4).
import type { AssetType, PipelineStage } from './enums.js';

export interface StageResult {
  stage: PipelineStage;
  passed: boolean;
  notes?: string;
  confidence?: number;
}

export interface CarouselSlide {
  n: number;
  text: string;
  design_intent?: string;
}

/** The mutable content of the asset as it moves through the pipeline. */
export interface AssetSnapshot {
  title?: string;
  hook?: string;
  slides?: CarouselSlide[];
  caption?: string;
  hashtags?: string[];
  cta?: { text: string; kind?: string; placement?: string };
}

export type ApprovalDecision = 'approved' | 'changes_requested' | 'rejected';

export interface PipelineState {
  assetId: string;
  ideaId: string | null;
  ideaTitle: string;
  ideaAngle: string | null;
  format: AssetType;
  node: string; // engine cursor: current pipeline node (may be a sub/gate node, e.g. 'cta')
  asset: AssetSnapshot;
  checks: Partial<Record<PipelineStage, StageResult>>;
  confidence: number; // rolling
  needsApproval: boolean;
  revisionCount: number; // bounded revision loops (doc 06 §7.1)
  decision?: ApprovalDecision; // injected on resume after HITL
  operatorNote?: string;
  memoryUsed: string[]; // recall summaries injected, for the Run Inspector (doc 05 §9)
  budget: { steps: number; units: number }; // units = target slides/frames/scenes per format
  correlationId: string;
}

/** Bounded revision-loop cap per quality gate (doc 06 §7.1, OQ-03: per-gate, default 2). */
export const MAX_REVISIONS = 2;
