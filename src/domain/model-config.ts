import { z } from 'zod';

export const modelConfigSchema = z.object({
  provider: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1)
});

export type ModelConfig = z.infer<typeof modelConfigSchema>;

export const modelCandidateSchema = z.object({
  id: z.string(),
  source: z.enum(['claude-settings', 'env', 'dotenv', 'saved']),
  sourceLabel: z.string(),
  provider: z.string(),
  baseUrl: z.string(),
  model: z.string().nullable(),
  apiKeyMasked: z.string()
});

export type ModelCandidate = z.infer<typeof modelCandidateSchema>;
