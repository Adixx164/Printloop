import { AppDataSource } from '../config/database';
import { SystemSetting } from '../entities/systemSetting.entity';

/** Admin-configurable upload limits (Storage settings). Falls back to safe
 *  defaults if a row is missing. Cheap single query per upload. */
export async function getUploadLimits(): Promise<{
  maxFileBytes: number;
  maxPages: number;
}> {
  let maxMb = 50;
  let maxPages = 300;
  try {
    const rows = await AppDataSource.getRepository(SystemSetting).find();
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const mb = Number(byKey.get('maxFileSizeMb'));
    const mp = Number(byKey.get('maxPagesPerFile'));
    if (Number.isFinite(mb) && mb > 0) maxMb = mb;
    if (Number.isFinite(mp) && mp > 0) maxPages = mp;
  } catch {
    /* settings optional — use defaults */
  }
  return { maxFileBytes: maxMb * 1024 * 1024, maxPages };
}
