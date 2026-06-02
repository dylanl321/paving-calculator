/**
 * Geofencing service for detecting arrival at job sites.
 */

export const DEFAULT_RADIUS_METERS = 200;

/**
 * Calculate the Haversine distance between two points on Earth.
 * @returns Distance in meters
 */
export function distanceMeters(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number
): number {
	const R = 6371000; // Earth radius in meters
	const toRad = (deg: number) => (deg * Math.PI) / 180;

	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);

	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return R * c;
}

export interface GeofenceSite {
	id: string;
	name: string;
	latitude: number;
	longitude: number;
}

export interface ArrivalCheck {
	arrived: boolean;
	site: { id: string; name: string } | null;
	distanceMeters: number | null;
}

/**
 * Check if the user has arrived at any job site.
 * @returns The nearest site within radius, or null if none are close enough
 */
export function checkArrival(
	userLat: number,
	userLng: number,
	sites: GeofenceSite[],
	radiusMeters: number = DEFAULT_RADIUS_METERS
): ArrivalCheck {
	let nearestSite: { id: string; name: string; distance: number } | null = null;

	for (const site of sites) {
		const distance = distanceMeters(userLat, userLng, site.latitude, site.longitude);

		if (distance <= radiusMeters) {
			if (!nearestSite || distance < nearestSite.distance) {
				nearestSite = {
					id: site.id,
					name: site.name,
					distance
				};
			}
		}
	}

	if (nearestSite) {
		return {
			arrived: true,
			site: { id: nearestSite.id, name: nearestSite.name },
			distanceMeters: nearestSite.distance
		};
	}

	return {
		arrived: false,
		site: null,
		distanceMeters: null
	};
}
