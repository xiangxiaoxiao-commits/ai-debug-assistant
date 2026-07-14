import { describe, it, expect } from 'vitest';
import { createInitialPipelineState } from '@/server/pipeline-init';
import { STEP_NAMES } from '@/domain/constants';

describe('createInitialPipelineState', () => {
  it('生成 8 步 waiting 状态', () => {
    const s = createInitialPipelineState();
    expect(s.currentStep).toBe('Normalize');
    expect(s.steps).toHaveLength(8);
    expect(s.steps.map(x => x.step)).toEqual([...STEP_NAMES]);
    expect(s.steps.every(x => x.status === 'waiting')).toBe(true);
    expect(s.runIds).toEqual([]);
  });
});
