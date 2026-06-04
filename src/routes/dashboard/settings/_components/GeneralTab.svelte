<script lang="ts">
	let {
		canEdit,
		orgName = $bindable(),
		orgAddress = $bindable(),
		superintendentEmail = $bindable(),
		superintendentPhone = $bindable()
	}: {
		canEdit: boolean;
		orgName: string;
		orgAddress: string;
		superintendentEmail: string;
		superintendentPhone: string;
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
