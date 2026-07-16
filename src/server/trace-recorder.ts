import { v4 as uuid } from 'uuid';
import type { Trace, TraceStep } from '@/domain/types';
import { writeJsonAtomic, readJson, fileExists } from './fs-atomic';
import { tracesDir, traceFile, caseFile } from './paths';
import { caseSchema } from '@/domain/schemas';

type StepInput = Omit<TraceStep, 'id' | 'startedAt' | 'endedAt' | 'durationMs'> & {
  durationMs?: number;
  startedAt?: string;
  endedAt?: string;
};

export class TraceRecorder {
  private readonly traceId: string;
  private readonly caseId: string;
  private readonly triggeredBy: Trace['triggeredBy'];
  private readonly triggerRef?: string;
  private readonly createdAt: string;
  private readonly startMs: number;
  private readonly steps: TraceStep[] = [];

  get lastStep(): TraceStep | undefined {
    return this.steps[this.steps.length - 1];
  }

  constructor(caseId: string, triggeredBy: Trace['triggeredBy'], triggerRef?: string) {
    this.traceId = uuid();
    this.caseId = caseId;
    this.triggeredBy = triggeredBy;
    this.triggerRef = triggerRef;
    this.createdAt = new Date().toISOString();
    this.startMs = Date.now();
  }

  async step<T>(
    kind: TraceStep['kind'],
    label: string,
    fn: () => Promise<T>,
    options?: { detail?: string; meta?: Record<string, unknown> }
  ): Promise<T> {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    try {
      const result = await fn();
      const endedAt = new Date().toISOString();
      const durationMs = Date.now() - t0;
      this.steps.push({
        id: uuid(),
        kind,
        label,
        startedAt,
        endedAt,
        durationMs,
        status: 'ok',
        detail: options?.detail,
        meta: options?.meta
      });
      return result;
    } catch (err) {
      const endedAt = new Date().toISOString();
      const durationMs = Date.now() - t0;
      this.steps.push({
        id: uuid(),
        kind,
        label,
        startedAt,
        endedAt,
        durationMs,
        status: 'failed',
        detail: options?.detail,
        error: (err as Error).message,
        meta: options?.meta
      });
      throw err;
    }
  }

  add(step: StepInput): void {
    const now = new Date().toISOString();
    this.steps.push({
      id: uuid(),
      startedAt: step.startedAt ?? now,
      endedAt: step.endedAt ?? now,
      durationMs: step.durationMs ?? 0,
      ...step
    } as TraceStep);
  }

  async finalize(): Promise<Trace> {
    const totalMs = Date.now() - this.startMs;
    const trace: Trace = {
      id: this.traceId,
      caseId: this.caseId,
      triggeredBy: this.triggeredBy,
      triggerRef: this.triggerRef,
      createdAt: this.createdAt,
      totalMs,
      steps: this.steps
    };

    // Write trace file
    await writeJsonAtomic(traceFile(this.caseId, this.traceId), trace);

    // Append traceId to case.traceIds (read-modify-write with schema validation)
    const cf = caseFile(this.caseId);
    if (await fileExists(cf)) {
      try {
        const raw = await readJson<Record<string, unknown>>(cf);
        const existing = Array.isArray(raw.traceIds) ? (raw.traceIds as string[]) : [];
        if (!existing.includes(this.traceId)) {
          const updated = { ...raw, traceIds: [...existing, this.traceId] };
          caseSchema.parse(updated); // validate before write
          await writeJsonAtomic(cf, updated);
        }
      } catch {
        // non-fatal: trace file was written, case update failed
      }
    }

    return trace;
  }
}
