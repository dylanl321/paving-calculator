import type { D1Database } from '../../cloudflare';

export interface DbOrgMixPreset {
	id: string;
	org_id: string;
	name: string;
	mix_type: string | null;
	target_thickness_in: number | null;
	target_spread_rate: number | null;
	tack_type: string | null;
	target_tack_rate: number | null;
	plant_supplier: string | null;
	notes: string | null;
	is_default: number;
	sort_order: number;
	created_at: number;
	updated_at: number;
}

export interface CreateMixPresetInput {
	name: string;
	mix_type?: string | null;
	target_thickness_in?: number | null;
	target_spread_rate?: number | null;
	tack_type?: string | null;
	target_tack_rate?: number | null;
	plant_supplier?: string | null;
	notes?: string | null;
	is_default?: boolean;
	sort_order?: number;
}

export interface UpdateMixPresetInput extends Partial<CreateMixPresetInput> {}

export class DbMixPresetsHelper {
	constructor(private db: D1Database) {}

	async getOrgMixPresets(orgId: string): Promise<DbOrgMixPreset[]> {
		return await this.db
			.prepare(
				`SELECT * FROM org_mix_presets WHERE org_id = ?
				 ORDER BY sort_order ASC, name ASC`
			)
			.bind(orgId)
			.all<DbOrgMixPreset>()
			.then((r) => r.results);
	}

	async getMixPresetById(id: string, orgId: string): Promise<DbOrgMixPreset | null> {
		return await this.db
			.prepare('SELECT * FROM org_mix_presets WHERE id = ? AND org_id = ?')
			.bind(id, orgId)
			.first<DbOrgMixPreset>();
	}

	async getMixPresetByName(orgId: string, name: string): Promise<DbOrgMixPreset | null> {
		return await this.db
			.prepare(
				'SELECT * FROM org_mix_presets WHERE org_id = ? AND name = ? COLLATE NOCASE'
			)
			.bind(orgId, name)
			.first<DbOrgMixPreset>();
	}

	async createOrgMixPreset(
		orgId: string,
		input: CreateMixPresetInput
	): Promise<DbOrgMixPreset> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				`INSERT INTO org_mix_presets (
					id, org_id, name, mix_type,
					target_thickness_in, target_spread_rate,
					tack_type, target_tack_rate,
					plant_supplier, notes,
					is_default, sort_order,
					created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				orgId,
				input.name,
				input.mix_type ?? null,
				input.target_thickness_in ?? null,
				input.target_spread_rate ?? null,
				input.tack_type ?? null,
				input.target_tack_rate ?? null,
				input.plant_supplier ?? null,
				input.notes ?? null,
				input.is_default ? 1 : 0,
				input.sort_order ?? 0,
				now,
				now
			)
			.run();

		return (await this.getMixPresetById(id, orgId)) as DbOrgMixPreset;
	}

	async updateOrgMixPreset(
		id: string,
		orgId: string,
		input: UpdateMixPresetInput
	): Promise<DbOrgMixPreset | null> {
		const now = Math.floor(Date.now() / 1000);

		const fields: string[] = [];
		const values: unknown[] = [];

		if (input.name !== undefined) {
			fields.push('name = ?');
			values.push(input.name);
		}
		if (input.mix_type !== undefined) {
			fields.push('mix_type = ?');
			values.push(input.mix_type);
		}
		if (input.target_thickness_in !== undefined) {
			fields.push('target_thickness_in = ?');
			values.push(input.target_thickness_in);
		}
		if (input.target_spread_rate !== undefined) {
			fields.push('target_spread_rate = ?');
			values.push(input.target_spread_rate);
		}
		if (input.tack_type !== undefined) {
			fields.push('tack_type = ?');
			values.push(input.tack_type);
		}
		if (input.target_tack_rate !== undefined) {
			fields.push('target_tack_rate = ?');
			values.push(input.target_tack_rate);
		}
		if (input.plant_supplier !== undefined) {
			fields.push('plant_supplier = ?');
			values.push(input.plant_supplier);
		}
		if (input.notes !== undefined) {
			fields.push('notes = ?');
			values.push(input.notes);
		}
		if (input.is_default !== undefined) {
			fields.push('is_default = ?');
			values.push(input.is_default ? 1 : 0);
		}
		if (input.sort_order !== undefined) {
			fields.push('sort_order = ?');
			values.push(input.sort_order);
		}

		if (fields.length === 0) {
			return this.getMixPresetById(id, orgId);
		}

		fields.push('updated_at = ?');
		values.push(now);
		values.push(id);
		values.push(orgId);

		await this.db
			.prepare(
				`UPDATE org_mix_presets SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`
			)
			.bind(...values)
			.run();

		return this.getMixPresetById(id, orgId);
	}

	async deleteOrgMixPreset(id: string, orgId: string): Promise<boolean> {
		const result = await this.db
			.prepare('DELETE FROM org_mix_presets WHERE id = ? AND org_id = ?')
			.bind(id, orgId)
			.run();
		return (result.meta?.changes ?? 0) > 0;
	}

	async duplicateOrgMixPreset(
		id: string,
		orgId: string
	): Promise<DbOrgMixPreset | null> {
		const original = await this.getMixPresetById(id, orgId);
		if (!original) return null;

		// Build a unique copy name
		const baseName = `${original.name} (Copy)`;
		let copyName = baseName;
		let attempt = 1;
		while (await this.getMixPresetByName(orgId, copyName)) {
			attempt++;
			copyName = `${baseName} ${attempt}`;
		}

		return this.createOrgMixPreset(orgId, {
			name: copyName,
			mix_type: original.mix_type,
			target_thickness_in: original.target_thickness_in,
			target_spread_rate: original.target_spread_rate,
			tack_type: original.tack_type,
			target_tack_rate: original.target_tack_rate,
			plant_supplier: original.plant_supplier,
			notes: original.notes,
			is_default: false,
			sort_order: original.sort_order
		});
	}
}
