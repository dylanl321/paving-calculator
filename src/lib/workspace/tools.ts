import type { Component } from 'svelte';
import SpreadRateCard from '$lib/components/SpreadRateCard.svelte';
import FeetLeftCard from '$lib/components/FeetLeftCard.svelte';
import DistancePlannerCard from '$lib/components/DistancePlannerCard.svelte';
import TonnageCard from '$lib/components/TonnageCard.svelte';
import TackCard from '$lib/components/TackCard.svelte';
import StickCheckCard from '$lib/components/StickCheckCard.svelte';
import SoilCompactionCard from '$lib/components/SoilCompactionCard.svelte';
import SubgradeCalcCard from '$lib/components/SubgradeCalcCard.svelte';
import ConcreteVolumeCard from '$lib/components/ConcreteVolumeCard.svelte';
import ConcretePSICard from '$lib/components/ConcretePSICard.svelte';
import SlopeGradeCard from '$lib/components/SlopeGradeCard.svelte';

import type { EntryType } from '$lib/stores/today.svelte';

export interface Tool {
	id: string;
	label: string;
	/** one-line description for the tool list */
	blurb: string;
	component: Component;
	/** Which kind of Today entry this tool's result logs into, if loggable. */
	logsAs?: EntryType;
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
				id: 'spread-rate',
				label: 'Spread Rate',
				blurb: 'Target vs. actual lbs/SY',
				component: SpreadRateCard,
				logsAs: 'paving'
			},
			{
				id: 'feet-left',
				label: 'Feet Left Today',
				blurb: 'Remaining length from tonnage',
				component: FeetLeftCard,
				logsAs: 'paving'
			},
			{
				id: 'distance-planner',
				label: 'Distance Planner',
				blurb: 'How far your tons will reach',
				component: DistancePlannerCard,
				logsAs: 'paving'
			},
			{
				id: 'tonnage',
				label: 'Tonnage to Order',
				blurb: 'Tons to order for a length',
				component: TonnageCard,
				logsAs: 'paving'
			},
			{
				id: 'tack',
				label: 'Tack Rate',
				blurb: 'Gallons of tack to shoot',
				component: TackCard,
				logsAs: 'tack'
			},
			{
				id: 'stick-check',
				label: 'Stick Check',
				blurb: 'Loose height behind the screed',
				component: StickCheckCard,
				logsAs: 'note'
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
				component: SoilCompactionCard,
				logsAs: 'note'
			},
			{
				id: 'subgrade',
				label: 'Base Stone',
				blurb: 'Tonnage for a base layer',
				component: SubgradeCalcCard,
				logsAs: 'note'
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
				component: ConcreteVolumeCard,
				logsAs: 'note'
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
				component: SlopeGradeCard,
				logsAs: 'note'
			}
		]
	}
];

export const allTools: Tool[] = toolGroups.flatMap((g) => g.tools);

export function findTool(id: string | null | undefined): Tool {
	return allTools.find((t) => t.id === id) ?? allTools[0];
}
