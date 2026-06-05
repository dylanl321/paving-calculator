/**
 * GDOT active construction / paving project ingestion.
 *
 * Data source: GDOT GeoPI ArcGIS REST (public, no auth required)
 * Endpoint:    https://gis.dot.ga.gov/maps/rest/services/GEOPI_APP/MapServer/0/query
 *
 * The GEOPI_APP layer 0 ("Active Projects") contains current letting/construction
 * projects. We filter to paving/resurfacing types and store in
 * gdot_construction_projects for county-level "nearby project" awareness.
 */

import { fetchArcgisFeatures } from './arcgis-fetch';
import type { DbHelper } from '$lib/server/db';

/** GDOT GeoPI active projects layer */
const GDOT_GEOPI_URL =
  'https://gis.dot.ga.gov/maps/rest/services/GEOPI_APP/MapServer/0/query';

/** Keywords that identify paving / resurfacing work */
const PAVING_KEYWORDS = [
  'paving',
  'resurfacing',
  'resurface',
  'mill',
  'overlay',
  'microsurface',
  'microseal',
  'cape seal',
  'chip seal',
  'friction course',
  'asphalt',
  'bituminous',
  'pavement',
  'rehabilitation',
  'reconstruct'
];

export interface GdotConstructionProjectRaw {
  OBJECTID?: number;
  PROJECT_NUMBER?: string;
  DESCRIPTION?: string;
  COUNTY?: string;
  DISTRICT?: string;
  LET_DATE?: number | null;
  COMP_DATE?: number | null;
  PROJECT_TYPE?: string;
  WORK_TYPE?: string;
  ROUTE?: string;
  [key: string]: unknown;
}

export interface ConstructionIngestionResult {
  upserted: number;
  skipped: number;
  errors: number;
}

function isPavingProject(raw: GdotConstructionProjectRaw): boolean {
  const text = [
    raw.DESCRIPTION,
    raw.PROJECT_TYPE,
    raw.WORK_TYPE
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return PAVING_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Ingests GDOT active construction / paving projects from the GeoPI ArcGIS layer.
 * Filters to paving/resurfacing project types and upserts into
 * gdot_construction_projects.
 */
export async function ingestGdotConstructionProjects(
  db: DbHelper
): Promise<ConstructionIngestionResult> {
  console.log('[dot:gdot-construction] Starting construction project ingestion...');

  let upserted = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Fetch all active projects — no geometry needed, just attribute data
    const features = await fetchArcgisFeatures(
      GDOT_GEOPI_URL,
      {
        where: '1=1',
        returnGeometry: 'true'
      },
      10000
    );

    console.log(`[dot:gdot-construction] Fetched ${features.length} total GeoPI features`);

    for (const feature of features) {
      try {
        const raw = feature.attributes as GdotConstructionProjectRaw;

        // Filter: only paving/resurfacing projects
        if (!isPavingProject(raw)) {
          skipped++;
          continue;
        }

        const projectNumber = String(
          raw.PROJECT_NUMBER || raw.OBJECTID || `unknown-${Date.now()}`
        );

        // Extract point geometry if present
        let latitude: number | null = null;
        let longitude: number | null = null;
        let geometryGeojson: string | null = null;

        if (feature.geometry) {
          geometryGeojson = JSON.stringify(feature.geometry);
          // For a point geometry, extract centroid from first coordinate
          if (
            feature.geometry.type === 'LineString' &&
            Array.isArray(feature.geometry.coordinates) &&
            feature.geometry.coordinates.length > 0
          ) {
            // Use midpoint of the line
            const mid = Math.floor(feature.geometry.coordinates.length / 2);
            const coord = feature.geometry.coordinates[mid];
            if (Array.isArray(coord) && coord.length >= 2) {
              longitude = coord[0] as number;
              latitude = coord[1] as number;
            }
          }
        }

        await db.upsertGdotConstructionProject({
          project_number: projectNumber,
          description: (raw.DESCRIPTION as string) || null,
          county: (raw.COUNTY as string) || null,
          district: (raw.DISTRICT as string) || null,
          let_date: (raw.LET_DATE as number) || null,
          comp_date: (raw.COMP_DATE as number) || null,
          project_type: ((raw.PROJECT_TYPE || raw.WORK_TYPE) as string) || null,
          route: (raw.ROUTE as string) || null,
          latitude,
          longitude,
          geometry_geojson: geometryGeojson,
          raw_json: JSON.stringify(raw)
        });
        upserted++;
      } catch (err) {
        console.error('[dot:gdot-construction] Error upserting project:', err);
        errors++;
      }
    }

    const status =
      errors === 0 ? 'success' : errors < features.length ? 'partial' : 'failed';
    await db.logDotSync('GA', 'gdot_construction', status, upserted, errors > 0 ? `${errors} errors` : null);

    console.log(
      `[dot:gdot-construction] Done: ${upserted} upserted, ${skipped} skipped (non-paving), ${errors} errors`
    );
    return { upserted, skipped, errors };
  } catch (err) {
    console.error('[dot:gdot-construction] Fatal error:', err);
    await db.logDotSync('GA', 'gdot_construction', 'failed', 0, String(err));
    throw err;
  }
}
