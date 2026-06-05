<script lang="ts">
	let {
		canEdit,
		orgName = $bindable(),
		orgAddress = $bindable(),
		superintendentEmail = $bindable(),
		superintendentPhone = $bindable(),
		plantName = $bindable(),
		plantLatStr = $bindable(),
		plantLngStr = $bindable()
	}: {
		canEdit: boolean;
		orgName: string;
		orgAddress: string;
		superintendentEmail: string;
		superintendentPhone: string;
		plantName: string;
		plantLatStr: string;
		plantLngStr: string;
	} = $props();
</script>

<section class="card">
	<h3>General Information</h3>
	<p class="card-desc">Your organization's basic details.</p>

	<div class="form-grid-2">
		<div class="field">
			<label for="orgName">Organization name</label>
			<input id="orgName" type="text" bind:value={orgName} disabled={!canEdit} />
		</div>

		<div class="field">
			<label for="supEmail">Superintendent email</label>
			<input id="supEmail" type="email" bind:value={superintendentEmail} disabled={!canEdit} placeholder="superintendent@company.com" />
		</div>

		<div class="field">
			<label for="supPhone">Superintendent phone</label>
			<input id="supPhone" type="tel" bind:value={superintendentPhone} disabled={!canEdit} placeholder="(555) 123-4567" />
		</div>

		<div class="field form-row-full">
			<label for="orgAddress">Address</label>
			<textarea id="orgAddress" rows="3" bind:value={orgAddress} disabled={!canEdit} placeholder="Street, City, State ZIP"></textarea>
		</div>
	</div>
</section>

<section class="card">
	<h3>Asphalt Plant Location</h3>
	<p class="card-desc">Set your plant's location to compute haul distance to each job site.</p>

	<div class="form-grid-2">
		<div class="field form-row-full">
			<label for="plantName">Plant name</label>
			<input id="plantName" type="text" bind:value={plantName} disabled={!canEdit} placeholder="e.g. Main Street Plant" />
		</div>

		<div class="field">
			<label for="plantLat">Latitude</label>
			<input
				id="plantLat"
				type="number"
				step="0.000001"
				min="-90"
				max="90"
				bind:value={plantLatStr}
				disabled={!canEdit}
				placeholder="e.g. 33.7490"
			/>
		</div>

		<div class="field">
			<label for="plantLng">Longitude</label>
			<input
				id="plantLng"
				type="number"
				step="0.000001"
				min="-180"
				max="180"
				bind:value={plantLngStr}
				disabled={!canEdit}
				placeholder="e.g. -84.3880"
			/>
		</div>
	</div>
	<p class="plant-hint">Tip: you can get coordinates from Google Maps by right-clicking your plant location.</p>
</section>
