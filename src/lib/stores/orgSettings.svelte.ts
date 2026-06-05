// Org settings store: holds the logged-in org's branding + value overrides and
// exposes an org-aware resolver layered over the static YAML config.
//
// When no org is loaded (anonymous use, offline, or fetch failure), the resolver
// returns the plain YAML defaults, so the public/offline calculator is unaffected.
import { makeResolver, type OrgOverrides, type ConfigResolver } from '$lib/config/overrides';

interface OrgSettingsState {
	orgId: string | null;
	orgName: string | null;
	orgSlug: string | null;
	role: 'owner' | 'admin' | 'member' | null;
	accentColor: string | null;
	hasLogo: boolean;
	overrides: OrgOverrides;
	loaded: boolean;
	plantLat: number | null;
	plantLng: number | null;
	plantName: string | null;
}

class OrgSettingsStore {
	#state = $state<OrgSettingsState>({
		orgId: null,
		orgName: null,
		orgSlug: null,
		role: null,
		accentColor: null,
		hasLogo: false,
		overrides: {},
		loaded: false,
		plantLat: null,
		plantLng: null,
		plantName: null
	});

	#resolver = $derived<ConfigResolver>(makeResolver(this.#state.overrides));

	get accentColor() {
		return this.#state.accentColor;
	}

	get hasLogo() {
		return this.#state.hasLogo;
	}

	get role() {
		return this.#state.role;
	}

	get orgName() {
		return this.#state.orgName;
	}

	get overrides() {
		return this.#state.overrides;
	}

	get loaded() {
		return this.#state.loaded;
	}

	get plantLat() {
		return this.#state.plantLat;
	}

	get plantLng() {
		return this.#state.plantLng;
	}

	get plantName() {
		return this.#state.plantName;
	}

	/** Logo URL for the current org, or null when no custom logo is set. */
	get logoUrl(): string | null {
		return this.#state.hasLogo ? '/api/org/logo' : null;
	}

	/** Org-aware constant lookup (falls back to YAML default). */
	resolvedConstant(id: string): number {
		return this.#resolver.constant(id);
	}

	get resolvedDefaults() {
		return this.#resolver.defaults;
	}

	get resolvedTackField() {
		return this.#resolver.tackField;
	}

	get resolvedTackSpec() {
		return this.#resolver.tackSpec;
	}

	resolvedSpreadToleranceFor(courseId: string | null | undefined) {
		return this.#resolver.spreadToleranceFor(courseId);
	}

	async fetch(): Promise<void> {
		try {
			const res = await fetch('/api/org/settings', { credentials: 'include' });
			if (!res.ok) {
				this.clear();
				return;
			}
			const data = (await res.json()) as {
				org?: { id?: string | null; name?: string | null; slug?: string | null } | null;
				role?: 'owner' | 'admin' | 'member' | null;
				accentColor?: string | null;
				hasLogo?: boolean;
				overrides?: OrgOverrides;
				plantLat?: number | null;
				plantLng?: number | null;
				plantName?: string | null;
			};
			this.#state.orgId = data.org?.id ?? null;
			this.#state.orgName = data.org?.name ?? null;
			this.#state.orgSlug = data.org?.slug ?? null;
			this.#state.role = data.role ?? null;
			this.#state.accentColor = data.accentColor ?? null;
			this.#state.hasLogo = !!data.hasLogo;
			this.#state.overrides = data.overrides ?? {};
			this.#state.plantLat = data.plantLat ?? null;
			this.#state.plantLng = data.plantLng ?? null;
			this.#state.plantName = data.plantName ?? null;
			this.#state.loaded = true;
		} catch (err) {
			console.error('Org settings fetch error:', err);
			this.clear();
		}
	}

	/** Apply a fresh settings payload (e.g. after a save) without a refetch. */
	apply(data: {
		accentColor?: string | null;
		hasLogo?: boolean;
		overrides?: OrgOverrides;
		orgName?: string | null;
		plantLat?: number | null;
		plantLng?: number | null;
		plantName?: string | null;
	}): void {
		if (data.accentColor !== undefined) this.#state.accentColor = data.accentColor;
		if (data.hasLogo !== undefined) this.#state.hasLogo = data.hasLogo;
		if (data.overrides !== undefined) this.#state.overrides = data.overrides;
		if (data.orgName !== undefined) this.#state.orgName = data.orgName;
		if (data.plantLat !== undefined) this.#state.plantLat = data.plantLat;
		if (data.plantLng !== undefined) this.#state.plantLng = data.plantLng;
		if (data.plantName !== undefined) this.#state.plantName = data.plantName;
	}

	clear(): void {
		this.#state.orgId = null;
		this.#state.orgName = null;
		this.#state.orgSlug = null;
		this.#state.role = null;
		this.#state.accentColor = null;
		this.#state.hasLogo = false;
		this.#state.overrides = {};
		this.#state.plantLat = null;
		this.#state.plantLng = null;
		this.#state.plantName = null;
		this.#state.loaded = true;
	}
}

export const orgSettingsStore = new OrgSettingsStore();
