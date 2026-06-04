export function plannedSegmentEndStation(startStation: number, lengthFt: number): number | null {
	if (!Number.isFinite(startStation) || !Number.isFinite(lengthFt) || lengthFt <= 0) return null;
	return startStation + lengthFt / 100;
}

export function validatePlannedSegment(
	startStation: number,
	lengthFt: number,
	routeLengthFt: number | null | undefined
): { stationEnd: number; error: null } | { stationEnd: null; error: string } {
	const stationEnd = plannedSegmentEndStation(startStation, lengthFt);
	if (stationEnd == null) {
		return { stationEnd: null, error: 'Enter a valid planned length' };
	}
	if (routeLengthFt != null && Number.isFinite(routeLengthFt) && stationEnd * 100 > routeLengthFt + 0.01) {
		return { stationEnd: null, error: 'Planned segment extends beyond the route' };
	}
	return { stationEnd, error: null };
}
