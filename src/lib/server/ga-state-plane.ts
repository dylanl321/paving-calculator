/**
 * Georgia State Plane reprojection for GDOT plan mid-point coordinates.
 * Never trust the plan's zone label — try all candidate EPSG codes.
 */

import proj4 from 'proj4';

/** PROJ4 strings from EPSG registry (via pyproj), stripped of +type=crs. */
const GA_EPSG_PROJ4: Record<number, string> = {
	2239: '+proj=tmerc +lat_0=30 +lon_0=-82.1666666666667 +k=0.9999 +x_0=200000.0001016 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
	2240: '+proj=tmerc +lat_0=30 +lon_0=-84.1666666666667 +k=0.9999 +x_0=699999.9998984 +y_0=0 +datum=NAD83 +units=us-ft +no_defs',
	6445: '+proj=tmerc +lat_0=30 +lon_0=-82.1666666666667 +k=0.9999 +x_0=200000.0001016 +y_0=0 +ellps=GRS80 +units=us-ft +no_defs',
	6446: '+proj=tmerc +lat_0=30 +lon_0=-84.1666666666667 +k=0.9999 +x_0=700000 +y_0=0 +ellps=GRS80 +units=m +no_defs',
	26766: '+proj=tmerc +lat_0=30 +lon_0=-82.1666666666667 +k=0.9999 +x_0=152400.30480061 +y_0=0 +datum=NAD27 +units=us-ft +no_defs',
	26767: '+proj=tmerc +lat_0=30 +lon_0=-84.1666666666667 +k=0.9999 +x_0=152400.30480061 +y_0=0 +datum=NAD27 +units=us-ft +no_defs',
	26966: '+proj=tmerc +lat_0=30 +lon_0=-82.1666666666667 +k=0.9999 +x_0=200000 +y_0=0 +datum=NAD83 +units=m +no_defs',
	26967: '+proj=tmerc +lat_0=30 +lon_0=-84.1666666666667 +k=0.9999 +x_0=700000 +y_0=0 +datum=NAD83 +units=m +no_defs'
};

for (const [code, def] of Object.entries(GA_EPSG_PROJ4)) {
	proj4.defs(`EPSG:${code}`, def);
}
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

export const GA_CRS_CANDIDATES: Array<{ label: string; epsg: number }> = [
	{ label: 'NAD83 GA-East ftUS', epsg: 2239 },
	{ label: 'NAD83 GA-West ftUS', epsg: 2240 },
	{ label: 'NAD83(2011) GA-East ftUS', epsg: 6445 },
	{ label: 'NAD83(2011) GA-West ftUS', epsg: 6446 },
	{ label: 'NAD27 GA-East ftUS', epsg: 26766 },
	{ label: 'NAD27 GA-West ftUS', epsg: 26767 },
	{ label: 'NAD83 GA-East m', epsg: 26966 },
	{ label: 'NAD83 GA-West m', epsg: 26967 }
];

/** (easting, northing) in `epsg` → (lon, lat) WGS84. */
export function reprojectMidpoint(easting: number, northing: number, epsg: number): [number, number] {
	const [lon, lat] = proj4(`EPSG:${epsg}`, 'EPSG:4326', [easting, northing]);
	return [lon, lat];
}

/** Rough Georgia bounds check for reprojected points. */
export function isInGeorgia(lon: number, lat: number): boolean {
	return lon > -86 && lon < -80 && lat > 30 && lat < 35.5;
}
