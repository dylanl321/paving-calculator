<script lang="ts">
	import { config } from '$lib/config';
</script>

<svelte:head>
	<title>Calculator Guide — {config.app.name}</title>
</svelte:head>

<div class="guide-page">
	<header class="page-header">
		<div>
			<h2 class="page-title">Calculator Guide</h2>
			<p class="page-subtitle">5 essential calculations every foreman needs</p>
		</div>
		<a href="/dashboard" class="ghost-btn">Back to Dashboard</a>
	</header>

	<div class="guide-intro">
		<p>
			These five calculators cover the math you use every day on a paving job. Each one explains
			what it does in plain English, shows the formula, walks through an example, and tells you
			what goes wrong when the numbers are off.
		</p>
	</div>

	<!-- 1. SPREAD RATE -->
	<section class="calc-card">
		<div class="calc-header">
			<div class="calc-number">1</div>
			<div>
				<h3 class="calc-title">Spread Rate (lbs/SY)</h3>
				<p class="calc-subtitle">How much asphalt per square yard</p>
			</div>
		</div>

		<div class="calc-explanation">
			<p>
				<strong>Plain English:</strong> Spread rate tells you how many pounds of asphalt are laid
				per square yard — it's how you know if you're putting down too much or too little.
			</p>
		</div>

		<div class="calc-visual">
			<svg viewBox="0 0 300 180" fill="none" xmlns="http://www.w3.org/2000/svg">
				<rect x="20" y="100" width="260" height="60" fill="#4B5563" />
				<rect x="20" y="88" width="260" height="12" fill="#F59E0B" />
				<text x="150" y="120" text-anchor="middle" fill="#F3F4F6" font-size="14" font-weight="600"
					>Asphalt Layer</text
				>
				<text x="150" y="138" text-anchor="middle" fill="#9CA3AF" font-size="12">200 lbs/SY</text>
				<line x1="20" y1="75" x2="280" y2="75" stroke="#10B981" stroke-width="2" />
				<text x="150" y="65" text-anchor="middle" fill="#10B981" font-size="12" font-weight="600"
					>1 Square Yard</text
				>
			</svg>
		</div>

		<div class="calc-formula">
			<div class="formula-label">Formula</div>
			<div class="formula-box">
				Spread Rate = (Tons × 2,000) ÷ Square Yards
			</div>
			<div class="formula-vars">
				<div><span class="var">Tons</span> = total material delivered</div>
				<div><span class="var">Square Yards</span> = area paved</div>
			</div>
		</div>

		<div class="calc-example">
			<div class="example-label">Example</div>
			<div class="example-content">
				<p><strong>Job:</strong> 50 tons over 500 square yards</p>
				<p><strong>Math:</strong> (50 × 2,000) ÷ 500 = <strong>200 lbs/SY</strong></p>
			</div>
		</div>

		<div class="calc-consequences">
			<div class="consequence-label">What goes wrong</div>
			<div class="consequence-grid">
				<div class="consequence bad">
					<div class="consequence-icon">⚠️</div>
					<div>
						<strong>Too high:</strong> Waste money, too heavy = rutting risk
					</div>
				</div>
				<div class="consequence warn">
					<div class="consequence-icon">⚠️</div>
					<div>
						<strong>Too low:</strong> Fails spec, road fails early
					</div>
				</div>
			</div>
		</div>

		<div class="calc-spec">
			<strong>GDOT Spec:</strong>
			<a
				href="https://www.dot.ga.gov/PartnerSmart/DesignManual/Specifications"
				target="_blank"
				rel="noopener noreferrer">Section 400</a
			>
		</div>
	</section>

	<!-- 2. TONNAGE -->
	<section class="calc-card">
		<div class="calc-header">
			<div class="calc-number">2</div>
			<div>
				<h3 class="calc-title">Tonnage</h3>
				<p class="calc-subtitle">How much material to order</p>
			</div>
		</div>

		<div class="calc-explanation">
			<p>
				<strong>Plain English:</strong> Tonnage tells you exactly how many tons to order so you don't
				run short or waste material on a job.
			</p>
		</div>

		<div class="calc-visual">
			<svg viewBox="0 0 300 180" fill="none" xmlns="http://www.w3.org/2000/svg">
				<rect x="50" y="80" width="80" height="60" rx="4" fill="#3B82F6" />
				<rect x="140" y="80" width="80" height="60" rx="4" fill="#3B82F6" />
				<rect x="230" y="80" width="20" height="60" rx="4" fill="#3B82F6" opacity="0.5" />
				<text x="90" y="115" text-anchor="middle" fill="#F3F4F6" font-size="16" font-weight="700"
					>20t</text
				>
				<text x="180" y="115" text-anchor="middle" fill="#F3F4F6" font-size="16" font-weight="700"
					>20t</text
				>
				<text x="240" y="115" text-anchor="middle" fill="#F3F4F6" font-size="16" font-weight="700"
					>10t</text
				>
				<text x="150" y="35" text-anchor="middle" fill="#10B981" font-size="14" font-weight="600"
					>50 Tons Total</text
				>
			</svg>
		</div>

		<div class="calc-formula">
			<div class="formula-label">Formula</div>
			<div class="formula-box">Tons = (Area in SY × Spread Rate) ÷ 2,000</div>
			<div class="formula-vars">
				<div><span class="var">Area</span> = square yards to pave</div>
				<div><span class="var">Spread Rate</span> = lbs per square yard</div>
			</div>
		</div>

		<div class="calc-example">
			<div class="example-label">Example</div>
			<div class="example-content">
				<p><strong>Job:</strong> 500 SY at 200 lbs/SY spread rate</p>
				<p><strong>Math:</strong> (500 × 200) ÷ 2,000 = <strong>50 tons</strong></p>
			</div>
		</div>

		<div class="calc-consequences">
			<div class="consequence-label">What goes wrong</div>
			<div class="consequence-grid">
				<div class="consequence bad">
					<div class="consequence-icon">⚠️</div>
					<div>
						<strong>Too high:</strong> Waste money, leftover material
					</div>
				</div>
				<div class="consequence warn">
					<div class="consequence-icon">⚠️</div>
					<div>
						<strong>Too low:</strong> Short on material, job stops mid-pour
					</div>
				</div>
			</div>
		</div>

		<div class="calc-spec">
			<strong>GDOT Spec:</strong>
			<a
				href="https://www.dot.ga.gov/PartnerSmart/DesignManual/Specifications"
				target="_blank"
				rel="noopener noreferrer">Section 400</a
			>
		</div>
	</section>

	<!-- 3. TACK RATE -->
	<section class="calc-card">
		<div class="calc-header">
			<div class="calc-number">3</div>
			<div>
				<h3 class="calc-title">Tack Rate (gal/SY)</h3>
				<p class="calc-subtitle">The glue between layers</p>
			</div>
		</div>

		<div class="calc-explanation">
			<p>
				<strong>Plain English:</strong> Tack coat is the glue between layers. Get this wrong and the
				new layer slides or delams.
			</p>
		</div>

		<div class="calc-visual">
			<svg viewBox="0 0 300 180" fill="none" xmlns="http://www.w3.org/2000/svg">
				<rect x="30" y="110" width="240" height="50" fill="#4B5563" />
				<rect x="30" y="105" width="240" height="5" fill="#F59E0B" />
				<line
					x1="40"
					y1="95"
					x2="40"
					y2="105"
					stroke="#F59E0B"
					stroke-width="2"
					stroke-linecap="round"
				/>
				<line
					x1="80"
					y1="95"
					x2="80"
					y2="105"
					stroke="#F59E0B"
					stroke-width="2"
					stroke-linecap="round"
				/>
				<line
					x1="120"
					y1="95"
					x2="120"
					y2="105"
					stroke="#F59E0B"
					stroke-width="2"
					stroke-linecap="round"
				/>
				<line
					x1="160"
					y1="95"
					x2="160"
					y2="105"
					stroke="#F59E0B"
					stroke-width="2"
					stroke-linecap="round"
				/>
				<line
					x1="200"
					y1="95"
					x2="200"
					y2="105"
					stroke="#F59E0B"
					stroke-width="2"
					stroke-linecap="round"
				/>
				<line
					x1="240"
					y1="95"
					x2="240"
					y2="105"
					stroke="#F59E0B"
					stroke-width="2"
					stroke-linecap="round"
				/>
				<rect x="30" y="60" width="240" height="40" fill="#6B7280" />
				<text
					x="150"
					y="130"
					text-anchor="middle"
					fill="#F3F4F6"
					font-size="12"
					font-weight="600">New Layer</text
				>
				<text x="150" y="85" text-anchor="middle" fill="#F3F4F6" font-size="12" font-weight="600"
					>Old Layer</text
				>
				<text x="150" y="35" text-anchor="middle" fill="#F59E0B" font-size="12" font-weight="600"
					>Tack Coat (0.05 gal/SY)</text
				>
			</svg>
		</div>

		<div class="calc-formula">
			<div class="formula-label">Formula</div>
			<div class="formula-box">Gallons = Area (SY) × Shot Rate (gal/SY)</div>
			<div class="formula-vars">
				<div><span class="var">Area</span> = square yards to tack</div>
				<div><span class="var">Shot Rate</span> = typically 0.04–0.06 gal/SY</div>
			</div>
		</div>

		<div class="calc-example">
			<div class="example-label">Example</div>
			<div class="example-content">
				<p><strong>Job:</strong> 500 SY at 0.05 gal/SY shot rate</p>
				<p><strong>Math:</strong> 500 × 0.05 = <strong>25 gallons</strong></p>
			</div>
		</div>

		<div class="calc-consequences">
			<div class="consequence-label">What goes wrong</div>
			<div class="consequence-grid">
				<div class="consequence bad">
					<div class="consequence-icon">⚠️</div>
					<div>
						<strong>Too high:</strong> Bleeds through, slippery surface
					</div>
				</div>
				<div class="consequence warn">
					<div class="consequence-icon">⚠️</div>
					<div>
						<strong>Too low:</strong> Layers don't bond, delamination
					</div>
				</div>
			</div>
		</div>

		<div class="calc-spec">
			<strong>GDOT Spec:</strong>
			<a
				href="https://www.dot.ga.gov/PartnerSmart/DesignManual/Specifications"
				target="_blank"
				rel="noopener noreferrer">Section 413</a
			>
		</div>
	</section>

	<!-- 4. AREA -->
	<section class="calc-card">
		<div class="calc-header">
			<div class="calc-number">4</div>
			<div>
				<h3 class="calc-title">Area (Square Yards)</h3>
				<p class="calc-subtitle">The foundation of all other calculations</p>
			</div>
		</div>

		<div class="calc-explanation">
			<p>
				<strong>Plain English:</strong> Area is the size of what you're paving. Everything else — tons,
				tack, cost — is based on this number.
			</p>
		</div>

		<div class="calc-visual">
			<svg viewBox="0 0 300 180" fill="none" xmlns="http://www.w3.org/2000/svg">
				<rect x="40" y="60" width="220" height="80" fill="none" stroke="#10B981" stroke-width="3" />
				<text x="150" y="105" text-anchor="middle" fill="#10B981" font-size="16" font-weight="700"
					>900 SY</text
				>
				<line
					x1="40"
					y1="150"
					x2="260"
					y2="150"
					stroke="#3B82F6"
					stroke-width="2"
					marker-end="url(#arrowblue)"
					marker-start="url(#arrowblue)"
				/>
				<text x="150" y="167" text-anchor="middle" fill="#3B82F6" font-size="12" font-weight="600"
					>450 ft (150 yd)</text
				>
				<line
					x1="270"
					y1="60"
					x2="270"
					y2="140"
					stroke="#3B82F6"
					stroke-width="2"
					marker-end="url(#arrowblue)"
					marker-start="url(#arrowblue)"
				/>
				<text x="285" y="105" fill="#3B82F6" font-size="12" font-weight="600">18 ft</text>
				<text x="285" y="118" fill="#3B82F6" font-size="12" font-weight="600">(6 yd)</text>
				<defs>
					<marker
						id="arrowblue"
						markerWidth="6"
						markerHeight="6"
						refX="3"
						refY="3"
						orient="auto"
						markerUnits="strokeWidth"
					>
						<path d="M0,0 L0,6 L6,3 z" fill="#3B82F6" />
					</marker>
				</defs>
			</svg>
		</div>

		<div class="calc-formula">
			<div class="formula-label">Formula</div>
			<div class="formula-box">Square Yards = (Length ft × Width ft) ÷ 9</div>
			<div class="formula-vars">
				<div><span class="var">Length</span> = road length in feet</div>
				<div><span class="var">Width</span> = road width in feet</div>
				<div><span class="var">÷ 9</span> = converts square feet to square yards</div>
			</div>
		</div>

		<div class="calc-example">
			<div class="example-label">Example</div>
			<div class="example-content">
				<p><strong>Job:</strong> 450 ft long × 18 ft wide</p>
				<p><strong>Math:</strong> (450 × 18) ÷ 9 = 8,100 ÷ 9 = <strong>900 SY</strong></p>
			</div>
		</div>

		<div class="calc-consequences">
			<div class="consequence-label">What goes wrong</div>
			<div class="consequence-grid">
				<div class="consequence bad">
					<div class="consequence-icon">⚠️</div>
					<div>
						<strong>Too high (error):</strong> Over-order, waste money
					</div>
				</div>
				<div class="consequence warn">
					<div class="consequence-icon">⚠️</div>
					<div>
						<strong>Too low (error):</strong> Under-order, job stops
					</div>
				</div>
			</div>
		</div>

		<div class="calc-spec">
			<strong>GDOT Spec:</strong>
			<a
				href="https://www.dot.ga.gov/PartnerSmart/DesignManual/Specifications"
				target="_blank"
				rel="noopener noreferrer">Section 400</a
			>
		</div>
	</section>

	<!-- 5. PAVING WINDOW -->
	<section class="calc-card">
		<div class="calc-header">
			<div class="calc-number">5</div>
			<div>
				<h3 class="calc-title">Paving Window (Temperature)</h3>
				<p class="calc-subtitle">How long you have to compact</p>
			</div>
		</div>

		<div class="calc-explanation">
			<p>
				<strong>Plain English:</strong> Asphalt cools fast. If it's too cold outside or the mat gets
				too thin, the mix stiffens before you can compact it right.
			</p>
		</div>

		<div class="calc-visual">
			<svg viewBox="0 0 300 180" fill="none" xmlns="http://www.w3.org/2000/svg">
				<rect x="30" y="100" width="60" height="60" fill="#EF4444" />
				<rect x="100" y="100" width="60" height="60" fill="#F59E0B" />
				<rect x="170" y="100" width="60" height="60" fill="#FBBF24" />
				<rect x="240" y="100" width="30" height="60" fill="#9CA3AF" />
				<text x="60" y="125" text-anchor="middle" fill="#000" font-size="14" font-weight="700"
					>300°F</text
				>
				<text x="130" y="125" text-anchor="middle" fill="#000" font-size="14" font-weight="700"
					>250°F</text
				>
				<text x="200" y="125" text-anchor="middle" fill="#000" font-size="14" font-weight="700"
					>200°F</text
				>
				<text x="255" y="125" text-anchor="middle" fill="#000" font-size="14" font-weight="700"
					>175°F</text
				>
				<line
					x1="30"
					y1="85"
					x2="270"
					y2="85"
					stroke="#3B82F6"
					stroke-width="2"
					marker-end="url(#arrow)"
				/>
				<text x="150" y="75" text-anchor="middle" fill="#3B82F6" font-size="12" font-weight="600"
					>~40 minutes (2" lift, 50°F air)</text
				>
				<defs>
					<marker
						id="arrow"
						markerWidth="6"
						markerHeight="6"
						refX="3"
						refY="3"
						orient="auto"
						markerUnits="strokeWidth"
					>
						<path d="M0,0 L0,6 L6,3 z" fill="#3B82F6" />
					</marker>
				</defs>
			</svg>
		</div>

		<div class="calc-formula">
			<div class="formula-label">Rule of Thumb</div>
			<div class="formula-box">Mat temp drops ~1°F per minute per inch of thickness</div>
			<div class="formula-vars">
				<div><span class="var">Start temp</span> = mat temperature at laydown (usually 280–320°F)</div>
				<div>
					<span class="var">Stop temp</span> = minimum temp for compaction (usually 175°F)
				</div>
				<div>
					<span class="var">Cooling rate</span> = faster in cold air, thinner lifts, or wind
				</div>
			</div>
		</div>

		<div class="calc-example">
			<div class="example-label">Example</div>
			<div class="example-content">
				<p><strong>Job:</strong> 2-inch lift, 300°F mat temp, 50°F air temp</p>
				<p>
					<strong>Window:</strong> Roughly 40 minutes to get rollers on before it cools below 175°F
				</p>
				<p class="example-note">
					(Actual cooling depends on wind, humidity, base temp — this is a field estimate)
				</p>
			</div>
		</div>

		<div class="calc-consequences">
			<div class="consequence-label">What goes wrong</div>
			<div class="consequence-grid">
				<div class="consequence warn">
					<div class="consequence-icon">⚠️</div>
					<div>
						<strong>Too cold:</strong> Can't compact, fails density test
					</div>
				</div>
				<div class="consequence bad">
					<div class="consequence-icon">⚠️</div>
					<div>
						<strong>Too hot:</strong> Runs ahead of roller, surface deforms
					</div>
				</div>
			</div>
		</div>

		<div class="calc-spec">
			<strong>GDOT Spec:</strong>
			<a
				href="https://www.dot.ga.gov/PartnerSmart/DesignManual/Specifications"
				target="_blank"
				rel="noopener noreferrer">Section 400</a
			>
		</div>
	</section>

	<footer class="guide-footer">
		<p>
			<strong>Need to run these calculations?</strong> Go back to your
			<a href="/dashboard">dashboard</a> and open a project to use the built-in calculators.
		</p>
	</footer>
</div>

<style>
	.guide-page {
		width: 100%;
		max-width: 900px;
		margin: 0 auto;
		padding-bottom: var(--sp-10);
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 24px;
		flex-wrap: wrap;
		gap: 16px;
	}

	.page-title {
		font-size: 1.75rem;
		margin: 0 0 4px;
	}

	.page-subtitle {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.ghost-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		padding: 0 16px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
		transition: background 0.2s;
	}

	.ghost-btn:hover {
		background: var(--surface-hover);
	}

	.guide-intro {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 32px;
	}

	.guide-intro p {
		margin: 0;
		line-height: 1.6;
		color: var(--text-muted);
	}

	.calc-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 24px;
		margin-bottom: 24px;
	}

	.calc-header {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 20px;
	}

	.calc-number {
		width: 48px;
		height: 48px;
		min-width: 48px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-text);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		font-weight: 800;
	}

	.calc-title {
		margin: 0 0 4px;
		font-size: 1.4rem;
	}

	.calc-subtitle {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-muted);
		font-weight: 500;
	}

	.calc-explanation {
		margin-bottom: 24px;
		padding: 16px;
		background: var(--bg);
		border-left: 4px solid var(--accent);
		border-radius: var(--radius);
	}

	.calc-explanation p {
		margin: 0;
		line-height: 1.6;
	}

	.calc-visual {
		margin-bottom: 24px;
		padding: 20px;
		background: var(--bg);
		border-radius: var(--radius);
	}

	.calc-visual svg {
		width: 100%;
		height: auto;
		max-width: 400px;
		margin: 0 auto;
		display: block;
	}

	.calc-formula {
		margin-bottom: 24px;
	}

	.formula-label {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
		margin-bottom: 8px;
	}

	.formula-box {
		background: var(--bg);
		border: 2px solid var(--accent);
		border-radius: var(--radius);
		padding: 16px;
		font-family: ui-monospace, 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--accent);
		margin-bottom: 12px;
		text-align: center;
	}

	.formula-vars {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 0.85rem;
		color: var(--text-muted);
		padding: 0 8px;
	}

	.formula-vars .var {
		font-weight: 600;
		color: var(--text);
		font-family: ui-monospace, 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
	}

	.calc-example {
		margin-bottom: 24px;
		padding: 16px;
		background: var(--bg);
		border-radius: var(--radius);
	}

	.example-label {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
		margin-bottom: 8px;
	}

	.example-content p {
		margin: 0 0 8px;
		line-height: 1.6;
	}

	.example-content p:last-child {
		margin-bottom: 0;
	}

	.example-note {
		font-size: 0.8rem;
		color: var(--text-muted);
		font-style: italic;
		margin-top: 8px !important;
	}

	.calc-consequences {
		margin-bottom: 20px;
	}

	.consequence-label {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
		margin-bottom: 12px;
	}

	.consequence-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 12px;
	}

	@media (min-width: 600px) {
		.consequence-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	.consequence {
		display: flex;
		gap: 12px;
		padding: 14px;
		border-radius: var(--radius);
		border: 2px solid;
	}

	.consequence.bad {
		background: rgba(239, 68, 68, 0.1);
		border-color: #ef4444;
		color: var(--text);
	}

	.consequence.warn {
		background: rgba(245, 158, 11, 0.1);
		border-color: #f59e0b;
		color: var(--text);
	}

	.consequence-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.consequence strong {
		color: var(--text);
		font-weight: 700;
	}

	.calc-spec {
		padding: 12px;
		background: var(--bg);
		border-radius: var(--radius);
		font-size: 0.85rem;
	}

	.calc-spec strong {
		color: var(--text);
		font-weight: 700;
	}

	.calc-spec a {
		color: var(--accent);
		font-weight: 600;
		text-decoration: none;
	}

	.calc-spec a:hover {
		text-decoration: underline;
	}

	.guide-footer {
		margin-top: 48px;
		padding: 24px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		text-align: center;
	}

	.guide-footer p {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.6;
	}

	.guide-footer a {
		color: var(--accent);
		font-weight: 600;
		text-decoration: none;
	}

	.guide-footer a:hover {
		text-decoration: underline;
	}
</style>
