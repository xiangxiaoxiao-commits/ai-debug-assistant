import { modelConfigSchema, type ModelConfig } from '@/domain/model-config';
import { writeJsonAtomic, readJson } from '@/server/fs-atomic';
import { configFile } from '@/server/paths';

export async function readSavedConfig(): Promise<ModelConfig | null> {
  try {
    const raw = await readJson<unknown>(configFile());
    const parsed = modelConfigSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeSavedConfig(cfg: ModelConfig): Promise<void> {
  await writeJsonAtomic(configFile(), cfg);
}
