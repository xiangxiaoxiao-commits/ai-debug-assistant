import type { PipelineState } from '@/domain/types';
import { STEP_NAMES } from '@/domain/constants';

export function createInitialPipelineState(): PipelineState {
  return {
    currentStep: 'Normalize',
    runIds: [],
    steps: STEP_NAMES.map((step) => ({ step, status: 'waiting' as const }))
  };
}
