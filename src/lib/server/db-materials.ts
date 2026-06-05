import type { D1Database } from '../../cloudflare';

export interface DbOrgMaterial {
	id: string;
	org_id: string;
	name: string;
	category: string;
	density_tons_per_yd3: number | null;
	supplier: string | null;
	notes: string | null;
	base_material_id: string | null;
	material_type: string | null;
	residual_rate_gal_sy: number | null;
	is_active: number;
	sort_order: number;
	created_at: number;
}

export interface CreateMaterialInput {
	name: string;
	category: string;
	density_tons_per_yd3?: number | null;
	supplier?: string | null;
	notes?: string | null;
	base_material_id?: string | null;
	material_type?: string | null;
	residual_rate_gal_sy?: number | null;
	sort_order?: number;
}

export interface UpdateMaterialInput extends Partial<CreateMaterialInput> {}

export class DbMaterialsHelper {
	constructor(private db: D1Database) {}

	async getOrgMaterials(orgId: string): Promise<DbOrgMaterial[]> {
		return await this.db
			.prepare(
				`SELECT * FROM org_materials WHERE org_id = ? AND is_active = 1
				 ORDER BY sort_order ASC, name ASC`
			)
			.bind(orgId)
			.all<DbOrgMaterial>()
			.then((r) => r.results);
	}

	async getMaterialById(id: string, orgId: string): Promise<DbOrgMaterial | null> {
		return await this.db
			.prepare('SELECT * FROM org_materials WHERE id = ? AND org_id = ? AND is_active = 1')
			.bind(id, orgId)
			.first<DbOrgMaterial>();
	}

	async getMaterialByBaseMaterialId(
		orgId: string,
		baseMaterialId: string
	): Promise<DbOrgMaterial | null> {
		return await this.db
			.prepare(
				'SELECT * FROM org_materials WHERE org_id = ? AND base_material_id = ? AND is_active = 1'
			)
			.bind(orgId, baseMaterialId)
			.first<DbOrgMaterial>();
	}

	async createOrgMaterial(orgId: string, input: CreateMaterialInput): Promise<DbOrgMaterial> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				`INSERT INTO org_materials (
					id, org_id, name, category,
					density_tons_per_yd3, supplier, notes,
					base_material_id, material_type, residual_rate_gal_sy,
					is_active, sort_order, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
			)
			.bind(
				id,
				orgId,
				input.name.trim(),
				input.category,
				input.density_tons_per_yd3 ?? null,
				input.supplier ?? null,
				input.notes ?? null,
				input.base_material_id ?? null,
				input.material_type ?? null,
				input.residual_rate_gal_sy ?? null,
				input.sort_order ?? 0,
				now
			)
			.run();

		const created = await this.getMaterialById(id, orgId);
		if (!created) throw new Error('Failed to retrieve created material');
		return created;
	}

	async updateOrgMaterial(
		id: string,
		orgId: string,
		input: UpdateMaterialInput
	): Promise<DbOrgMaterial | null> {
		const fields: string[] = [];
		const values: unknown[] = [];

		if (input.name !== undefined) {
			fields.push('name = ?');
			values.push(input.name.trim());
		}
		if (input.category !== undefined) {
			fields.push('category = ?');
			values.push(input.category);
		}
		if (input.density_tons_per_yd3 !== undefined) {
			fields.push('density_tons_per_yd3 = ?');
			values.push(input.density_tons_per_yd3);
		}
		if (input.supplier !== undefined) {
			fields.push('supplier = ?');
			values.push(input.supplier);
		}
		if (input.notes !== undefined) {
			fields.push('notes = ?');
			values.push(input.notes);
		}
		if (input.material_type !== undefined) {
			fields.push('material_type = ?');
			values.push(input.material_type);
		}
		if (input.residual_rate_gal_sy !== undefined) {
			fields.push('residual_rate_gal_sy = ?');
			values.push(input.residual_rate_gal_sy);
		}
		if (input.sort_order !== undefined) {
			fields.push('sort_order = ?');
			values.push(input.sort_order);
		}

		if (fields.length === 0) {
			return this.getMaterialById(id, orgId);
		}

		values.push(id);
		values.push(orgId);

		await this.db
			.prepare(`UPDATE org_materials SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`)
			.bind(...values)
			.run();

		return this.getMaterialById(id, orgId);
	}

	/** Soft-delete a fully custom material (base_material_id IS NULL). Returns false if not found or is a built-in override. */
	async deleteOrgMaterial(id: string, orgId: string): Promise<boolean> {
		const material = await this.getMaterialById(id, orgId);
		if (!material || material.base_material_id !== null) {
			return false;
		}
		const result = await this.db
			.prepare('UPDATE org_materials SET is_active = 0 WHERE id = ? AND org_id = ?')
			.bind(id, orgId)
			.run();
		return (result.meta?.changes ?? 0) > 0;
	}

	/** Clear the override row for a built-in material (sets is_active = 0). Returns false if not a built-in override. */
	async clearBuiltinOverride(id: string, orgId: string): Promise<boolean> {
		const material = await this.getMaterialById(id, orgId);
		if (!material || material.base_material_id === null) {
			return false;
		}
		const result = await this.db
			.prepare('UPDATE org_materials SET is_active = 0 WHERE id = ? AND org_id = ?')
			.bind(id, orgId)
			.run();
		return (result.meta?.changes ?? 0) > 0;
	}

	/** Upsert an override for a built-in material. Creates if no active row exists, updates if one does. */
	async upsertBuiltinOverride(
		orgId: string,
		baseMaterialId: string,
		input: UpdateMaterialInput
	): Promise<DbOrgMaterial> {
		const existing = await this.getMaterialByBaseMaterialId(orgId, baseMaterialId);
		if (existing) {
			const updated = await this.updateOrgMaterial(existing.id, orgId, input);
			if (!updated) throw new Error('Failed to update override');
			return updated;
		}
		// Create new override row
		if (!input.name) throw new Error('name is required for new override');
		if (!input.category) throw new Error('category is required for new override');
		return this.createOrgMaterial(orgId, {
			name: input.name,
			category: input.category,
			density_tons_per_yd3: input.density_tons_per_yd3 ?? null,
			supplier: input.supplier ?? null,
			notes: input.notes ?? null,
			base_material_id: baseMaterialId,
			material_type: input.material_type ?? null,
			residual_rate_gal_sy: input.residual_rate_gal_sy ?? null,
			sort_order: input.sort_order ?? 0
		});
	}
}
