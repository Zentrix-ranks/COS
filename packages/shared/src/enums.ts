// packages/shared/src/enums.ts
// Mirrors the Postgres enum types in spec/04-database-schema.md §3, as const tuples so they
// double as zod enums and TS union types. Keep in lockstep with migrations/0002_enums.sql.
import { z } from 'zod';

export const AGENT_TIERS = ['executive', 'manager', 'specialist'] as const;
export const DEPARTMENTS = [
  'strategy',
  'creative',
  'design',
  'publishing',
  'analytics',
  'operations',
  'executive',
] as const;
export const TASK_STATUSES = [
  'queued',
  'running',
  'waiting_approval',
  'blocked',
  'done',
  'failed',
  'cancelled',
] as const;
export const RUN_STATUSES = ['running', 'paused', 'completed', 'failed', 'cancelled'] as const;
export const ASSET_TYPES = ['reel', 'carousel', 'story', 'image', 'caption', 'thread', 'short'] as const;
export const ASSET_STATUSES = [
  'idea',
  'drafting',
  'in_review',
  'needs_changes',
  'approved',
  'scheduled',
  'published',
  'archived',
  'failed',
] as const;
export const PLATFORMS = ['instagram', 'linkedin', 'tiktok', 'x', 'youtube', 'threads'] as const;
export const PIPELINE_STAGES = [
  'trend_detection',
  'research',
  'idea_generation',
  'hook_creation',
  'outline',
  'draft',
  'brand_review',
  'grammar',
  'seo',
  'ig_optimisation',
  'design',
  'thumbnail',
  'approval',
  'scheduling',
  'publishing',
  'analytics',
  'learning',
  'memory_update',
] as const;
export const STAGE_STATUSES = ['pending', 'running', 'passed', 'failed', 'skipped', 'held'] as const;
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'changes_requested'] as const;
export const PUBLICATION_STATUSES = ['queued', 'publishing', 'published', 'failed', 'cancelled'] as const;
export const MEMORY_KINDS = ['episode', 'semantic', 'preference', 'rule'] as const;
export const NOTIFICATION_SEVERITIES = ['info', 'success', 'warning', 'critical'] as const;
export const RECOMMENDATION_STATUSES = [
  'proposed',
  'accepted',
  'rejected',
  'implemented',
  'measured',
] as const;
export const CLUSTER_DIMENSIONS = [
  'topic',
  'hook',
  'cta',
  'length',
  'design',
  'posting_time',
  'format',
] as const;

export const zAgentTier = z.enum(AGENT_TIERS);
export const zDepartment = z.enum(DEPARTMENTS);
export const zTaskStatus = z.enum(TASK_STATUSES);
export const zRunStatus = z.enum(RUN_STATUSES);
export const zAssetType = z.enum(ASSET_TYPES);
export const zAssetStatus = z.enum(ASSET_STATUSES);
export const zPlatform = z.enum(PLATFORMS);
export const zPipelineStage = z.enum(PIPELINE_STAGES);
export const zStageStatus = z.enum(STAGE_STATUSES);
export const zApprovalStatus = z.enum(APPROVAL_STATUSES);
export const zPublicationStatus = z.enum(PUBLICATION_STATUSES);
export const zMemoryKind = z.enum(MEMORY_KINDS);
export const zNotificationSeverity = z.enum(NOTIFICATION_SEVERITIES);
export const zRecommendationStatus = z.enum(RECOMMENDATION_STATUSES);
export const zClusterDimension = z.enum(CLUSTER_DIMENSIONS);

export type AgentTier = (typeof AGENT_TIERS)[number];
export type Department = (typeof DEPARTMENTS)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type RunStatus = (typeof RUN_STATUSES)[number];
export type AssetType = (typeof ASSET_TYPES)[number];
export type AssetStatus = (typeof ASSET_STATUSES)[number];
export type Platform = (typeof PLATFORMS)[number];
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export type StageStatus = (typeof STAGE_STATUSES)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];
export type ClusterDimension = (typeof CLUSTER_DIMENSIONS)[number];
