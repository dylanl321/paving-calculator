import type { D1Database } from '../../cloudflare';
import type { DbBidItem, DbProductionMix, DbSchematic, DbJobDocument } from './db-jobsites';

export class DbJobSiteDocumentsHelper {
	constructor(private db: D1Database) {}

	// ── Bid Items ─────────────────────────────────────────────────────────

	async getBidItems(jobSiteId: string): Promise<DbBidItem[]> {
		return await this.db
			.prepare('SELECT * FROM job_bid_items WHERE job_site_id = ? ORDER BY sort_order ASC, created_at ASC')
			.bind(jobSiteId)
			.all<DbBidItem>()
			.then((r) => r.results);
	}

	async createBidItem(
		jobSiteId: string,
		item: Omit<DbBidItem, 'id' | 'job_site_id' | 'created_at'>
	): Promise<DbBidItem> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				`INSERT INTO job_bid_items (
					id, job_site_id, line_number, item_id, description, quantity,
					unit, unit_price, bid_amount, section, is_alternate, selected,
					sort_order, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				jobSiteId,
				item.line_number ?? null,
				item.item_id ?? null,
				item.description,
				item.quantity ?? null,
				item.unit ?? null,
				item.unit_price ?? null,
				item.bid_amount ?? null,
				item.section ?? null,
				item.is_alternate ?? 0,
				item.selected ?? 1,
				item.sort_order ?? 0,
				now
			)
			.run();

		return { id, job_site_id: jobSiteId, created_at: now, ...item };
	}

	async deleteBidItems(jobSiteId: string): Promise<void> {
		await this.db.prepare('DELETE FROM job_bid_items WHERE job_site_id = ?').bind(jobSiteId).run();
	}

	// ── Production Mixes ──────────────────────────────────────────────────

	async getProductionMixes(jobSiteId: string): Promise<DbProductionMix[]> {
		return await this.db
			.prepare('SELECT * FROM job_production_mixes WHERE job_site_id = ? ORDER BY sort_order ASC, created_at ASC')
			.bind(jobSiteId)
			.all<DbProductionMix>()
			.then((r) => r.results);
	}

	async createProductionMix(
		jobSiteId: string,
		mix: Omit<DbProductionMix, 'id' | 'job_site_id' | 'created_at'>
	): Promise<DbProductionMix> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);

		await this.db
			.prepare(
				`INSERT INTO job_production_mixes (
					id, job_site_id, mix_name, unit, bid_quantity, takeoff_tonnage,
					quantity_per_day, est_days, mix_type, target_thickness_in,
					target_spread_rate, tack_type, target_tack_rate, contract_unit_price,
					is_active, sort_order, created_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				jobSiteId,
				mix.mix_name,
				mix.unit ?? null,
				mix.bid_quantity ?? null,
				mix.takeoff_tonnage ?? null,
				mix.quantity_per_day ?? null,
				mix.est_days ?? null,
				mix.mix_type ?? null,
				mix.target_thickness_in ?? null,
				mix.target_spread_rate ?? null,
				mix.tack_type ?? null,
				mix.target_tack_rate ?? null,
				mix.contract_unit_price ?? null,
				mix.is_active ?? 0,
				mix.sort_order ?? 0,
				now
			)
			.run();

		return { id, job_site_id: jobSiteId, created_at: now, ...mix };
	}

	async getProductionMix(mixId: string): Promise<DbProductionMix | null> {
		return await this.db
			.prepare('SELECT * FROM job_production_mixes WHERE id = ?')
			.bind(mixId)
			.first<DbProductionMix>();
	}

	async updateProductionMix(
		mixId: string,
		updates: Partial<Omit<DbProductionMix, 'id' | 'job_site_id' | 'created_at'>>
	): Promise<void> {
		const columns: (keyof typeof updates)[] = [
			'mix_name',
			'unit',
			'bid_quantity',
			'takeoff_tonnage',
			'quantity_per_day',
			'est_days',
			'mix_type',
			'target_thickness_in',
			'target_spread_rate',
			'tack_type',
			'target_tack_rate',
			'contract_unit_price',
			'is_active',
			'sort_order'
		];
		const fields: string[] = [];
		const values: (string | number | null)[] = [];
		for (const col of columns) {
			const value = updates[col];
			if (value !== undefined) {
				fields.push(`${col} = ?`);
				values.push(value as string | number | null);
			}
		}
		if (fields.length === 0) return;
		values.push(mixId);
		await this.db
			.prepare(`UPDATE job_production_mixes SET ${fields.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run();
	}

	async setActiveMix(jobSiteId: string, mixId: string): Promise<void> {
		await this.db
			.prepare('UPDATE job_production_mixes SET is_active = 0 WHERE job_site_id = ?')
			.bind(jobSiteId)
			.run();
		await this.db
			.prepare('UPDATE job_production_mixes SET is_active = 1 WHERE id = ? AND job_site_id = ?')
			.bind(mixId, jobSiteId)
			.run();
	}

	async deleteProductionMix(mixId: string): Promise<void> {
		await this.db.prepare('DELETE FROM job_production_mixes WHERE id = ?').bind(mixId).run();
	}

	async deleteProductionMixes(jobSiteId: string): Promise<void> {
		await this.db
			.prepare('DELETE FROM job_production_mixes WHERE job_site_id = ?')
			.bind(jobSiteId)
			.run();
	}

	// ── Schematics ────────────────────────────────────────────────────────

	async getSchematics(jobSiteId: string): Promise<DbSchematic[]> {
		return await this.db
			.prepare('SELECT * FROM job_schematics WHERE job_site_id = ? ORDER BY sort_order ASC, page_number ASC, created_at ASC')
			.bind(jobSiteId)
			.all<DbSchematic>()
			.then((r) => r.results);
	}

	async getSchematic(id: string): Promise<DbSchematic | null> {
		return await this.db.prepare('SELECT * FROM job_schematics WHERE id = ?').bind(id).first<DbSchematic>();
	}

	async createSchematic(
		jobSiteId: string,
		schematic: Omit<DbSchematic, 'id' | 'job_site_id' | 'created_at'>
	): Promise<DbSchematic> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				`INSERT INTO job_schematics (id, job_site_id, r2_key, page_number, label, content_type, sort_order, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				jobSiteId,
				schematic.r2_key,
				schematic.page_number ?? null,
				schematic.label ?? null,
				schematic.content_type ?? 'image/png',
				schematic.sort_order ?? 0,
				now
			)
			.run();
		return { id, job_site_id: jobSiteId, created_at: now, ...schematic };
	}

	// ── Job Documents ─────────────────────────────────────────────────────

	async getJobDocuments(jobSiteId: string): Promise<DbJobDocument[]> {
		return await this.db
			.prepare('SELECT * FROM job_documents WHERE job_site_id = ? ORDER BY created_at ASC')
			.bind(jobSiteId)
			.all<DbJobDocument>()
			.then((r) => r.results);
	}

	async getJobDocument(id: string): Promise<DbJobDocument | null> {
		return await this.db.prepare('SELECT * FROM job_documents WHERE id = ?').bind(id).first<DbJobDocument>();
	}

	async createJobDocument(
		jobSiteId: string,
		doc: Omit<DbJobDocument, 'id' | 'job_site_id' | 'created_at'>
	): Promise<DbJobDocument> {
		const id = crypto.randomUUID();
		const now = Math.floor(Date.now() / 1000);
		await this.db
			.prepare(
				`INSERT INTO job_documents (id, job_site_id, r2_key, filename, doc_type, content_type, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				id,
				jobSiteId,
				doc.r2_key,
				doc.filename,
				doc.doc_type ?? null,
				doc.content_type ?? 'application/pdf',
				now
			)
			.run();
		return { id, job_site_id: jobSiteId, created_at: now, ...doc };
	}
}
