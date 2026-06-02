// Shared job state for Paverate. This is the single source of LIVE values that
// every calculator reads and writes: road width, target thickness, machine,
// truck load, tack application. Seeded from config defaults, persisted to
// localStorage so the same crew settings carry across calculators and sessions.
import { defaults } from '$lib/config';

const STORAGE_KEY = 'paverate.job.v1';

export interface JobState {
	siteName: string;
	siteDescription: string;
	widthFt: number;
	thicknessIn: number;
	machineId: string;
	firstPass: boolean;
	truckLoadTons: number;
	tackApplication: string;
	wastePct: number;
	courseType: string;
}

function initial(): JobState {
	return {
		siteName: '',
		siteDescription: '',
		widthFt: defaults.roadWidthFt,
		thicknessIn: 1.5,
		machineId: defaults.machine,
		firstPass: defaults.firstPass,
		truckLoadTons: defaults.truckLoadTons,
		tackApplication: defaults.tackApplication,
		wastePct: defaults.wastePct,
		courseType: defaults.courseType
	};
}

function load(): JobState {
	if (typeof localStorage === 'undefined') return initial();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return initial();
		return { ...initial(), ...JSON.parse(raw) };
	} catch {
		return initial();
	}
}

class Job {
	#state = $state<JobState>(initial());

	constructor() {
		// Hydrate from storage on the client after construction.
		if (typeof localStorage !== 'undefined') {
			this.#state = load();
		}
	}

	get widthFt() {
		return this.#state.widthFt;
	}
	set widthFt(v: number) {
		this.#state.widthFt = v;
		this.#save();
	}

	get siteName() {
		return this.#state.siteName;
	}
	set siteName(v: string) {
		this.#state.siteName = v;
		this.#save();
	}

	get siteDescription() {
		return this.#state.siteDescription;
	}
	set siteDescription(v: string) {
		this.#state.siteDescription = v;
		this.#save();
	}

	get thicknessIn() {
		return this.#state.thicknessIn;
	}
	set thicknessIn(v: number) {
		this.#state.thicknessIn = v;
		this.#save();
	}

	get machineId() {
		return this.#state.machineId;
	}
	set machineId(v: string) {
		this.#state.machineId = v;
		this.#save();
	}

	get firstPass() {
		return this.#state.firstPass;
	}
	set firstPass(v: boolean) {
		this.#state.firstPass = v;
		this.#save();
	}

	get truckLoadTons() {
		return this.#state.truckLoadTons;
	}
	set truckLoadTons(v: number) {
		this.#state.truckLoadTons = v;
		this.#save();
	}

	get tackApplication() {
		return this.#state.tackApplication;
	}
	set tackApplication(v: string) {
		this.#state.tackApplication = v;
		this.#save();
	}

	get wastePct() {
		return this.#state.wastePct;
	}
	set wastePct(v: number) {
		this.#state.wastePct = v;
		this.#save();
	}

	get courseType() {
		return this.#state.courseType;
	}
	set courseType(v: string) {
		this.#state.courseType = v;
		this.#save();
	}

	reset() {
		this.#state = initial();
		this.#save();
	}

	#save() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#state));
		} catch {
			// ignore quota / private-mode errors
		}
	}
}

export const job = new Job();
