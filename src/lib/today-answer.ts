// The foreman's Today answer: "are we going to finish what we ordered, and
// when?" Pure so the Today card, the job page and tests share one rule.

export interface TodayLoad {
	tons: number;
	/** Unix seconds. */
	timestamp: number;
	spread_rate: number | null;
	rejected?: number | boolean | null;
}

export interface TodayInput {
	loads: TodayLoad[];
	/** Tons ordered for today (daily log target_tons). */
	targetTons: number | null;
	laneWidthFt: number | null;
	targetRateLbsSy: number | null;
	/** "HH:MM" the crew plans to stop; defaults to 17:00. */
	endTime?: string | null;
	now: Date;
}

export type TodayTone = 'good' | 'warn' | 'bad' | 'neutral';

export interface TodayAnswer {
	headline: string;
	tone: TodayTone;
	placedTons: number;
	loadCount: number;
	tonsLeft: number | null;
	feetLeft: number | null;
	feetPlaced: number | null;
	loadsLeft: number | null;
	finishAt: Date | null;
	tonsPerHour: number | null;
	avgRateLbsSy: number | null;
}

/** Tons of mix per linear foot for a width and spread rate (lbs/SY). */
export function tonsPerFoot(widthFt: number, rateLbsSy: number): number {
	return (widthFt * rateLbsSy) / 9 / 2000;
}

export function formatClock(d: Date): string {
	return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function endOfDay(now: Date, endTime: string | null | undefined): Date {
	const [h, m] = (endTime && /^\d{1,2}:\d{2}$/.test(endTime) ? endTime : '17:00').split(':').map(Number);
	const end = new Date(now);
	end.setHours(h, m, 0, 0);
	return end;
}

const MIN_PACE_MINUTES = 20;

export function computeTodayAnswer(input: TodayInput): TodayAnswer {
	const good = input.loads.filter((l) => !l.rejected && Number.isFinite(l.tons) && l.tons > 0);
	const placedTons = good.reduce((sum, l) => sum + l.tons, 0);
	const loadCount = good.length;

	const tpf =
		input.laneWidthFt && input.targetRateLbsSy && input.laneWidthFt > 0 && input.targetRateLbsSy > 0
			? tonsPerFoot(input.laneWidthFt, input.targetRateLbsSy)
			: null;

	const target = input.targetTons && input.targetTons > 0 ? input.targetTons : null;
	const tonsLeft = target != null ? Math.max(0, target - placedTons) : null;
	const feetLeft = tonsLeft != null && tpf ? tonsLeft / tpf : null;
	const feetPlaced = tpf ? placedTons / tpf : null;
	const avgLoad = loadCount > 0 ? placedTons / loadCount : null;
	const loadsLeft = tonsLeft != null && avgLoad ? Math.ceil(tonsLeft / avgLoad - 1e-9) : null;

	const rates = good.map((l) => l.spread_rate).filter((r): r is number => r != null && r > 0);
	const avgRateLbsSy = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

	let tonsPerHour: number | null = null;
	if (loadCount >= 2) {
		const first = Math.min(...good.map((l) => l.timestamp));
		const minutes = (input.now.getTime() / 1000 - first) / 60;
		if (minutes >= MIN_PACE_MINUTES) tonsPerHour = placedTons / (minutes / 60);
	}

	const finishAt =
		tonsLeft != null && tonsLeft > 0 && tonsPerHour && tonsPerHour > 0
			? new Date(input.now.getTime() + (tonsLeft / tonsPerHour) * 3600_000)
			: null;

	const base = { placedTons, loadCount, tonsLeft, feetLeft, feetPlaced, loadsLeft, finishAt, tonsPerHour, avgRateLbsSy };
	const t = (n: number) => Math.round(n).toLocaleString('en-US');

	if (loadCount === 0) {
		return {
			...base,
			tone: 'neutral',
			headline: target != null ? `No loads yet. ${t(target)} t ordered for today.` : 'No loads yet today'
		};
	}
	if (target == null) {
		return { ...base, tone: 'neutral', headline: `${t(placedTons)} t placed today` };
	}
	if (tonsLeft === 0) {
		return { ...base, tone: 'good', headline: `Today's order is down: ${t(placedTons)} of ${t(target)} t` };
	}
	if (!finishAt) {
		return { ...base, tone: 'neutral', headline: `${t(tonsLeft!)} t left of today's ${t(target)} t` };
	}
	if (finishAt <= endOfDay(input.now, input.endTime)) {
		return { ...base, tone: 'good', headline: `On pace, done by ${formatClock(finishAt)}` };
	}
	return { ...base, tone: 'warn', headline: `Behind pace, done around ${formatClock(finishAt)}` };
}
