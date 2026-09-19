import {
  RecordAlreadyExistsError,
  RecordNotFoundError,
  type PresetRepository,
} from '@/application/ports';
import type { CanastaDatabase } from './db';

/**
 * Stores user-created rule sets (spec §12).
 *
 * Built-in rule sets are deliberately **not** rows here — they live in code, so
 * "de ingebouwde standaardregelsets mogen niet overschreven worden" is
 * structurally true rather than a flag someone can flip.
 *
 * A preset is also not the same thing as a running game's rule-set snapshot:
 * editing a preset must never change a game that was already started.
 */
export function createPresetRepository(db: CanastaDatabase): PresetRepository {
  return {
    async create(preset) {
      const record = structuredClone(preset);
      await db.transaction('rw', db.presets, async () => {
        if (await db.presets.get(record.id)) {
          throw new RecordAlreadyExistsError('presets', record.id);
        }
        await db.presets.add(record);
      });
      return structuredClone(record);
    },

    async get(id) {
      const record = await db.presets.get(id);
      return record ? structuredClone(record) : undefined;
    },

    async update(preset) {
      const record = structuredClone(preset);
      await db.transaction('rw', db.presets, async () => {
        if (!(await db.presets.get(record.id))) {
          throw new RecordNotFoundError('presets', record.id);
        }
        await db.presets.put(record);
      });
      return structuredClone(record);
    },

    async delete(id) {
      await db.presets.delete(id);
    },

    async list() {
      const records = await db.presets.toArray();
      records.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
      return records.map((record) => structuredClone(record));
    },
  };
}
