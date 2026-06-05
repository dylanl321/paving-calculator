import type { Component } from 'svelte';
import ProductionCheckCard from '$lib/components/ProductionCheckCard.svelte';
import SpreadRateCard from '$lib/components/SpreadRateCard.svelte';
import FeetLeftCard from '$lib/components/FeetLeftCard.svelte';
import DistancePlannerCard from '$lib/components/DistancePlannerCard.svelte';
import TonnageCard from '$lib/components/TonnageCard.svelte';
import TackCard from '$lib/components/TackCard.svelte';
import StickCheckCard from '$lib/components/StickCheckCard.svelte';
import PavingWindowCard from '$lib/components/PavingWindowCard.svelte';
import SoilCompactionCard from '$lib/components/SoilCompactionCard.svelte';
import SubgradeCalcCard from '$lib/components/SubgradeCalcCard.svelte';
import ConcreteVolumeCard from '$lib/components/ConcreteVolumeCard.svelte';
import ConcretePSICard from '$lib/components/ConcretePSICard.svelte';
import SlopeGradeCard from '$lib/components/SlopeGradeCard.svelte';
import IntersectionCalcCard from '$lib/components/IntersectionCalcCard.svelte';
import VariableWidthCard from '$lib/components/VariableWidthCard.svelte';

export interface Tool {
	id: string;
	label: string;
	/** one-line description for the tool list */
	blurb: string;
	component: Component;
}

export interface ToolGroup {
	id: string;
	label: string;
	tools: Tool[];
}

export const toolGroups: ToolGroup[] = [
	{
		id: 'asphalt',
		label: 'Asphalt',
		tools: [
			{
				id: 'production-check',
				label: 'Production Check',
				blurb: 'Spread rate & end-of-day reach',
				component: ProductionCheckCard
			},
			{
				id: 'spread-rate',
				label: 'Spread Rate',
				blurb: 'Target vs. actual lbs/SY',
				component: SpreadRateCard
			},
			{
				id: 'feet-left',
				label: 'Feet Left Today',
				blurb: 'Remaining length from tonnage',
				component: FeetLeftCard
			},
			{
				id: 'distance-planner',
				label: 'Distance Planner',
				blurb: 'How far your tons will reach',
				component: DistancePlannerCard
			},
			{
				id: 'tonnage',
				label: 'Tonnage to Order',
				blurb: 'Tons to order for a length',
				component: TonnageCard
			},
			{
				id: 'tack',
				label: 'Tack Rate',
				blurb: 'Gallons of tack to shoot',
				component: TackCard
			},
			{
				id: 'stick-check',
				label: 'Stick Check',
				blurb: 'Loose height behind the screed',
				component: StickCheckCard
			},
			{
				id: 'paving-window',
				label: 'Paving Window',
				blurb: 'Table 4 min temp for your lift thickness',
				component: PavingWindowCard
			}
		]
	},
	{
		id: 'soil',
		label: 'Soil & Subgrade',
		tools: [
			{
				id: 'soil-compaction',
				label: 'Soil Compaction',
				blurb: 'Density and % compaction',
				component: SoilCompactionCard
			},
			{
				id: 'subgrade',
				label: 'Base Stone',
				blurb: 'Tonnage for a base layer',
				component: SubgradeCalcCard
			}
		]
	},
	{
		id: 'concrete',
		label: 'Concrete',
		tools: [
			{
				id: 'concrete-volume',
				label: 'Concrete Volume',
				blurb: 'Yards, bags, and truckloads',
				component: ConcreteVolumeCard
			},
			{
				id: 'concrete-psi',
				label: 'Concrete PSI',
				blurb: 'GDOT strength reference',
				component: ConcretePSICard
			}
		]
	},
	{
		id: 'grading',
		label: 'Grading',
		tools: [
			{
				id: 'slope-grade',
				label: 'Slope / Grade',
				blurb: 'Grade %, ratio, and angle',
				component: SlopeGradeCard
			}
		]
	},
	{
		id: 'specialty',
		label: 'Specialty',
		tools: [
			{
				id: 'intersection-calc',
				label: 'Intersection',
				blurb: 'Two crossing roads — net area & tonnage',
				component: IntersectionCalcCard
			},
			{
				id: 'variable-width',
				label: 'Variable Width',
				blurb: 'Turn lane flare — trapezoidal area & tons',
				component: VariableWidthCard
			}
		]
	}
];

export const allTools: Tool[] = toolGroups.flatMap((g) => g.tools);

export function findTool(id: string | null | undefined): Tool | null {
	if (!id) return null;
	return allTools.find((t) => t.id === id) ?? null;
}
