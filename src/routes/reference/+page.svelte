<script lang="ts">
</script>

<svelte:head><title>Reference Tables · Paverate</title></svelte:head>

<div class="ref-screen">
	<h1>GDOT Reference Tables</h1>
	<p class="ref-intro">
		Specification tables from Georgia Department of Transportation for asphalt paving operations.
	</p>

	<nav class="toc">
		<a href="#table-2">Table 2: Tack Coat Rates</a>
		<a href="#table-4">Table 4: Lift Thickness vs Temperature</a>
		<a href="#table-5">Table 5: Mix Type Thickness Limits</a>
	</nav>

	<section id="table-2">
		<h2>Table 2 — Application Rates for Emulsified Asphalt (Tack Coat)</h2>
		<p class="table-note">
			Applies to: Anionic Emulsified Asphalt or Cationic Emulsified Asphalt (gal/yd²)
		</p>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Tack Use</th>
						<th>Min (gal/yd²)</th>
						<th>Max (gal/yd²)</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>New AC Pavement to New AC Pavement or Thin Lift Leveling</td>
						<td>0.05<br /><span class="metric">(0.23 L/m²)</span></td>
						<td>0.08<br /><span class="metric">(0.36 L/m²)</span></td>
					</tr>
					<tr>
						<td>New AC (≤25% RAP) to Aged Existing Pavement or Milled Surface</td>
						<td>0.06<br /><span class="metric">(0.27 L/m²)</span></td>
						<td>0.10<br /><span class="metric">(0.45 L/m²)</span></td>
					</tr>
					<tr>
						<td>New AC (>25% RAP) to Aged Existing Pavement or Milled Surface</td>
						<td>0.08<br /><span class="metric">(0.36 L/m²)</span></td>
						<td>0.12<br /><span class="metric">(0.54 L/m²)</span></td>
					</tr>
				</tbody>
			</table>
		</div>
		<div class="table-notes">
			<p><strong>Notes:</strong></p>
			<ul>
				<li>
					Allow standard emulsion to break per manufacturer's recommendation
				</li>
				<li>
					Proceed with paving only after emulsion has cured to the satisfaction of the Engineer
				</li>
				<li>
					Do NOT use anionic/cationic emulsified asphalt under OGFC or PEM on interstates or
					limited access state routes
				</li>
			</ul>
		</div>
	</section>

	<section id="table-4">
		<h2>Table 4 — Lift Thickness vs. Minimum Temperature</h2>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Lift Thickness</th>
						<th>Minimum Air Temperature</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>1 in. (25 mm) or less</td>
						<td>55°F (13°C)</td>
					</tr>
					<tr>
						<td>1.1 to 2 in. (26–50 mm)</td>
						<td>45°F (8°C)</td>
					</tr>
					<tr>
						<td>2.1 to 3 in. (51–75 mm)</td>
						<td>40°F (4°C)</td>
					</tr>
					<tr>
						<td>3.1 to 4 in. (76–100 mm)</td>
						<td>35°F (2°C)</td>
					</tr>
					<tr>
						<td>4.1 to 8 in. (101–200 mm)</td>
						<td>32°F (0°C) and rising<br /><span class="note-inline"
								>base must not be frozen</span
							></td>
					</tr>
				</tbody>
			</table>
		</div>
		<div class="table-notes">
			<p><strong>Additional Weather Limitation (Section 400.3.05.E):</strong></p>
			<p>Beyond Table 4 above, OGFC mix and PEM have a stricter placement floor:</p>
			<ul>
				<li>Do <strong>not</strong> place OGFC mix or PEM below <strong>60°F (16°C)</strong> air temperature.</li>
				<li>
					With an MTV (Material Transfer Vehicle), OGFC/PEM may be placed at <strong>55°F (13°C)</strong>
					<em>when approved by the Engineer</em>.
				</li>
				<li>Do not mix and place any asphaltic concrete on a wet or frozen surface.</li>
			</ul>
		</div>
	</section>

	<section id="table-5">
		<h2>Table 5 — Mix Type Minimum, Maximum Layer and Total Thickness</h2>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Mix Type</th>
						<th>Min Layer Thickness</th>
						<th>Max Layer Thickness</th>
						<th>Max Total Thickness</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>25 mm Superpave</td>
						<td>2½ in. (64 mm)</td>
						<td>5 in. (125 mm)*</td>
						<td>—</td>
					</tr>
					<tr>
						<td>19 mm Superpave</td>
						<td>1¾ in. (44 mm)</td>
						<td>3 in. (75 mm)*</td>
						<td>—</td>
					</tr>
					<tr>
						<td>12.5 mm Superpave</td>
						<td>1⅜ in. (35 mm)</td>
						<td>2½ in. (64 mm)*/**</td>
						<td>8 in. (200 mm)</td>
					</tr>
					<tr>
						<td>9.5 mm Superpave Type 2</td>
						<td>1⅛ in. (29 mm)</td>
						<td>1½ in. (38 mm)***</td>
						<td>4 in. (100 mm)</td>
					</tr>
					<tr>
						<td>9.5 mm Superpave Type 1</td>
						<td>⅞ in. (22 mm)</td>
						<td>1¼ in. (32 mm)</td>
						<td>4 in. (100 mm)</td>
					</tr>
					<tr>
						<td>4.75 mm Mix</td>
						<td>¾ in. (19 mm)</td>
						<td>1⅛ in. (29 mm)</td>
						<td>2 in. (50 mm)</td>
					</tr>
					<tr>
						<td>9.5 mm OGFC</td>
						<td>75 lbs/yd² (41 kg/m²)</td>
						<td>95 lbs/yd² (51 kg/m²)</td>
						<td>—</td>
					</tr>
					<tr>
						<td>12.5 mm OGFC</td>
						<td>85 lbs/yd² (46 kg/m²)</td>
						<td>110 lbs/yd² (60 kg/m²)</td>
						<td>—</td>
					</tr>
					<tr>
						<td>12.5 mm PEM</td>
						<td>110 lbs/yd² (60 kg/m²)</td>
						<td>165 lbs/yd² (90 kg/m²)</td>
						<td>—</td>
					</tr>
					<tr>
						<td>9.5 mm SMA</td>
						<td>1⅛ in. (29 mm)</td>
						<td>1½ in. (38 mm)</td>
						<td>4 in. (100 mm)</td>
					</tr>
					<tr>
						<td>12.5 mm SMA</td>
						<td>1⅜ in. (35 mm)</td>
						<td>3 in. (75 mm)</td>
						<td>6 in. (150 mm)</td>
					</tr>
					<tr>
						<td>19 mm SMA</td>
						<td>1¾ in. (44 mm)</td>
						<td>3 in. (75 mm)</td>
						<td>—</td>
					</tr>
				</tbody>
			</table>
		</div>
		<div class="table-notes">
			<p><strong>Footnotes:</strong></p>
			<ul>
				<li>* Allow up to 6 in. (150 mm) per lift on trench widening</li>
				<li>
					** Allow up to 4 in. (100 mm) per lift on trench widening of ≤2 ft when no overlay is
					required
				</li>
				<li>
					*** Place 9.5 mm Superpave and 12.5 mm Superpave up to 4 in. (100 mm) thick for driveway
					and side road transition
				</li>
			</ul>
		</div>
	</section>

	<footer class="ref-footer">
		<p>
			<strong>Status:</strong> These tables are transcribed from GDOT specifications. Refer to
			official GDOT documents for authoritative values.
		</p>
	</footer>
</div>

<style>
	.ref-screen {
		max-width: 900px;
	}

	.ref-screen h1 {
		margin: 0 0 8px;
		font-size: 1.8rem;
	}

	.ref-intro {
		color: var(--text-muted);
		margin: 0 0 24px;
		font-size: 0.95rem;
	}

	.toc {
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		margin-bottom: 32px;
	}

	.toc a {
		color: var(--accent);
		text-decoration: none;
		font-weight: 500;
	}

	.toc a:hover {
		text-decoration: underline;
	}

	section {
		margin-bottom: 48px;
		scroll-margin-top: 20px;
	}

	section h2 {
		margin: 0 0 12px;
		font-size: 1.4rem;
		border-bottom: 2px solid var(--accent);
		padding-bottom: 8px;
	}

	.table-note {
		font-size: 0.9rem;
		color: var(--text-muted);
		margin: 0 0 16px;
		font-style: italic;
	}

	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		margin-bottom: 16px;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--surface);
		font-size: 0.9rem;
	}

	thead {
		background: var(--surface-alt);
	}

	th {
		text-align: left;
		padding: 12px 16px;
		font-weight: 700;
		border-bottom: 2px solid var(--border);
		white-space: nowrap;
	}

	td {
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
	}

	tbody tr:last-child td {
		border-bottom: none;
	}

	tbody tr:hover {
		background: var(--surface-alt);
	}

	.metric {
		font-size: 0.85em;
		color: var(--text-muted);
	}

	.note-inline {
		font-size: 0.85em;
		color: var(--text-muted);
		font-style: italic;
	}

	.table-notes {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		font-size: 0.88rem;
	}

	.table-notes p {
		margin: 0 0 8px;
	}

	.table-notes ul {
		margin: 8px 0 0;
		padding-left: 24px;
	}

	.table-notes li {
		margin-bottom: 6px;
		line-height: 1.5;
	}

	.ref-footer {
		margin-top: 48px;
		padding: 16px;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		color: var(--text-muted);
		text-align: center;
	}

	.ref-footer p {
		margin: 0;
	}

	@media (max-width: 600px) {
		.ref-screen {
			max-width: 100%;
		}

		table {
			font-size: 0.8rem;
		}

		th,
		td {
			padding: 10px 12px;
		}
	}
</style>
