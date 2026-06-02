<script lang="ts">
	import { config } from '$lib/config';
</script>

<svelte:head>
	<title>{config.app.name} — Paving math that keeps up with your crew</title>
	<meta name="description" content="In-field asphalt paving calculators. Spread rate, tack coat, tonnage — GDOT-spec accurate, offline-first, built for the job site." />
</svelte:head>

<!-- ─── Hero ─────────────────────────────────────────────────────────────── -->
<section class="hero">
	<div class="hero-inner">
		<div class="hero-badge">Offline-first · GDOT-spec accurate · Free to start</div>
		<h1 class="hero-heading">Paving math that keeps up with your crew</h1>
		<p class="hero-sub">
			Spread rate. Tack coat. Tonnage. All the numbers your foreman needs — instantly, on the job
			site, without a signal.
		</p>
		<div class="hero-ctas">
			<a href="/register" class="btn btn-primary">Get Started Free</a>
			<a href="/login" class="btn btn-ghost">Sign In</a>
		</div>
	</div>

	<!-- App mockup (pure CSS) -->
	<div class="mockup" aria-hidden="true">
		<div class="mockup-bar">
			<div class="mockup-dot"></div>
			<div class="mockup-dot"></div>
			<div class="mockup-dot"></div>
			<span class="mockup-title">paverate.com</span>
		</div>
		<div class="mockup-screen">
			<div class="mockup-card">
				<div class="mockup-label">Spread Rate</div>
				<div class="mockup-value accent">112 <span class="mockup-unit">lb/sy</span></div>
			</div>
			<div class="mockup-card">
				<div class="mockup-label">Tack Coat</div>
				<div class="mockup-value">0.05 <span class="mockup-unit">gal/sy</span></div>
			</div>
			<div class="mockup-divider"></div>
			<div class="mockup-card">
				<div class="mockup-label">Estimated Tonnage</div>
				<div class="mockup-value">48.6 <span class="mockup-unit">tons</span></div>
			</div>
			<div class="mockup-pill good">In spec</div>
		</div>
	</div>
</section>

<!-- ─── Features ─────────────────────────────────────────────────────────── -->
<section class="features">
	<div class="container">
		<h2 class="section-heading">Built for the field, not the office</h2>
		<div class="features-grid">
			<div class="feature-card">
				<div class="feature-icon">
					<!-- Signal-off icon -->
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<line x1="2" y1="2" x2="22" y2="22"></line>
						<path d="M8.5 16.5A5 5 0 0 1 4 12c0-1.4.6-2.8 1.5-3.8"></path>
						<path d="M5 5C3 6.5 2 9.1 2 12a10 10 0 0 0 10 10 9.7 9.7 0 0 0 7-2.8"></path>
						<path d="M10.7 5.1A10 10 0 0 1 22 12c0 .6-.1 1.2-.2 1.8"></path>
						<path d="M15 9a5 5 0 0 1 1 3 5 5 0 0 1-.4 2"></path>
					</svg>
				</div>
				<h3>Offline-First</h3>
				<p>Works in dead zones, tunnels, and rural cuts. Install as a PWA and it loads instantly — no signal needed.</p>
			</div>
			<div class="feature-card">
				<div class="feature-icon">
					<!-- Checkmark/spec icon -->
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<path d="M9 11l3 3L22 4"></path>
						<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
					</svg>
				</div>
				<h3>GDOT-Spec Accurate</h3>
				<p>Every formula is traced to verified GDOT specifications. Spread rates, tack coat targets, and compaction factors — all spec-backed.</p>
			</div>
			<div class="feature-card">
				<div class="feature-icon">
					<!-- Mobile/crew icon -->
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<rect x="5" y="2" width="14" height="20" rx="2"></rect>
						<line x1="12" y1="18" x2="12.01" y2="18" stroke-width="3"></line>
					</svg>
				</div>
				<h3>Built for Crews</h3>
				<p>Large touch targets. High contrast for bright sunlight. Every screen designed for gloves-on use at 375px on an asphalt site.</p>
			</div>
			<div class="feature-card">
				<div class="feature-icon">
					<!-- Clipboard/log icon -->
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
						<path d="M9 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2"></path>
						<rect x="9" y="1" width="6" height="4" rx="1"></rect>
						<line x1="9" y1="12" x2="15" y2="12"></line>
						<line x1="9" y1="16" x2="13" y2="16"></line>
					</svg>
				</div>
				<h3>Daily Log</h3>
				<p>Log truck loads throughout the shift. Track what was laid, when, and the running tonnage total. Close out at end of day with one tap.</p>
			</div>
		</div>
	</div>
</section>

<!-- ─── Stats bar ─────────────────────────────────────────────────────────── -->
<section class="stats-bar">
	<div class="container stats-inner">
		<div class="stat">
			<div class="stat-value">0</div>
			<div class="stat-label">required signal bars</div>
		</div>
		<div class="stat-divider"></div>
		<div class="stat">
			<div class="stat-value">100%</div>
			<div class="stat-label">client-side — no data leaves your phone</div>
		</div>
		<div class="stat-divider"></div>
		<div class="stat">
			<div class="stat-value">Free</div>
			<div class="stat-label">forever for solo crews</div>
		</div>
	</div>
</section>

<!-- ─── How it works ─────────────────────────────────────────────────────── -->
<section class="how">
	<div class="container">
		<h2 class="section-heading">Three steps, then pave</h2>
		<ol class="steps">
			<li class="step">
				<div class="step-num">1</div>
				<div class="step-body">
					<h3>Set up the job</h3>
					<p>Enter your lift thickness, lane width, and pass length. Paverate fills in the rest from GDOT specs.</p>
				</div>
			</li>
			<li class="step">
				<div class="step-num">2</div>
				<div class="step-body">
					<h3>Get your numbers</h3>
					<p>Spread rate, tack coat target, and estimated tonnage display instantly. In-spec indicators turn green when you hit the target.</p>
				</div>
			</li>
			<li class="step">
				<div class="step-num">3</div>
				<div class="step-body">
					<h3>Log loads all day</h3>
					<p>Each truck gets logged with one tap. Running totals update in real time. At end of shift, your daily record is ready.</p>
				</div>
			</li>
		</ol>
	</div>
</section>

<!-- ─── CTA ──────────────────────────────────────────────────────────────── -->
<section class="cta-section">
	<div class="container cta-inner">
		<h2>Ready to run tighter jobs?</h2>
		<p>Free for solo use. Team features available when you need them.</p>
		<div class="hero-ctas">
			<a href="/register" class="btn btn-primary">Get Started Free</a>
			<a href="/app" class="btn btn-ghost">Open the Calculator</a>
		</div>
	</div>
</section>

<!-- ─── Footer ───────────────────────────────────────────────────────────── -->
<footer class="site-footer">
	<div class="container footer-inner">
		<div class="footer-brand">
			<!-- Inline brand SVG -->
			<svg width="28" height="28" viewBox="0 0 32 32" aria-label="Paverate" role="img">
				<rect width="32" height="32" rx="6" fill="#2e3b46"/>
				<path d="M16 7 L22 25 M16 7 L10 25" stroke="#f2c037" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
				<line x1="12" y1="18" x2="20" y2="18" stroke="#f2c037" stroke-width="2" stroke-linecap="round"/>
			</svg>
			<span class="footer-name">{config.app.name}</span>
		</div>
		<nav class="footer-nav" aria-label="Footer">
			<a href="/app">Calculator</a>
			<a href="/login">Sign In</a>
			<a href="/register">Register</a>
		</nav>
		<p class="footer-copy">&copy; {new Date().getFullYear()} Paverate. Built for paving crews.</p>
	</div>
</footer>

<style>
	/* ── Reset / base ─────────────────────────────────────────────────────── */
	:global(body) {
		margin: 0;
	}

	/* CSS custom props from the app theme are available via var(--bg) etc. */

	/* ── Layout helpers ───────────────────────────────────────────────────── */
	.container {
		max-width: 1100px;
		margin-inline: auto;
		padding-inline: 1.25rem;
	}

	/* ── Buttons ──────────────────────────────────────────────────────────── */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		padding: 0 1.5rem;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 600;
		text-decoration: none;
		transition: opacity 0.15s, background 0.15s;
		white-space: nowrap;
	}
	.btn-primary {
		background: var(--accent, #f2c037);
		color: var(--accent-text, #1b2228);
	}
	.btn-primary:hover { opacity: 0.9; }
	.btn-ghost {
		background: transparent;
		border: 1.5px solid var(--border, #37444f);
		color: var(--text, #f4f6f7);
	}
	.btn-ghost:hover { background: var(--surface-hover, #2b353e); }

	/* ── Hero ─────────────────────────────────────────────────────────────── */
	.hero {
		background: var(--bg, #1b2228);
		display: grid;
		grid-template-columns: 1fr;
		gap: 3rem;
		padding: 4rem 1.25rem 3rem;
		max-width: 1100px;
		margin-inline: auto;
	}
	@media (min-width: 800px) {
		.hero {
			grid-template-columns: 1fr 1fr;
			align-items: center;
			padding: 6rem 1.25rem 5rem;
		}
	}

	.hero-badge {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--accent, #f2c037);
		background: color-mix(in srgb, var(--accent, #f2c037) 12%, transparent);
		padding: 0.35rem 0.85rem;
		border-radius: 100px;
		margin-bottom: 1.25rem;
	}
	.hero-heading {
		font-size: clamp(2rem, 5vw, 3.25rem);
		font-weight: 800;
		line-height: 1.15;
		color: var(--text, #f4f6f7);
		margin: 0 0 1.1rem;
		letter-spacing: -0.02em;
	}
	.hero-sub {
		font-size: 1.0625rem;
		line-height: 1.65;
		color: var(--text-muted, #9fb0bd);
		margin: 0 0 2rem;
		max-width: 480px;
	}
	.hero-ctas {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	/* ── App mockup (pure CSS) ────────────────────────────────────────────── */
	.mockup {
		background: var(--surface, #232c34);
		border: 1px solid var(--border, #37444f);
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 24px 64px rgb(0 0 0 / 0.35);
	}
	.mockup-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0.75rem 1rem;
		background: var(--surface-alt, #2e3b46);
		border-bottom: 1px solid var(--border, #37444f);
	}
	.mockup-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--border, #37444f);
	}
	.mockup-title {
		margin-left: 0.5rem;
		font-size: 0.75rem;
		color: var(--text-muted, #9fb0bd);
		font-family: monospace;
	}
	.mockup-screen {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.mockup-card {
		background: var(--surface-alt, #2e3b46);
		border-radius: 8px;
		padding: 0.875rem 1rem;
	}
	.mockup-label {
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted, #9fb0bd);
		margin-bottom: 0.25rem;
	}
	.mockup-value {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--text, #f4f6f7);
		line-height: 1;
	}
	.mockup-value.accent {
		color: var(--accent, #f2c037);
	}
	.mockup-unit {
		font-size: 0.875rem;
		font-weight: 400;
		color: var(--text-muted, #9fb0bd);
	}
	.mockup-divider {
		height: 1px;
		background: var(--border, #37444f);
		margin: 0.25rem 0;
	}
	.mockup-pill {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.3rem 0.75rem;
		border-radius: 100px;
		align-self: flex-start;
	}
	.mockup-pill.good {
		background: color-mix(in srgb, var(--good, #3fb27f) 18%, transparent);
		color: var(--good, #3fb27f);
	}

	/* ── Features ─────────────────────────────────────────────────────────── */
	.features {
		background: var(--surface, #232c34);
		padding: 4.5rem 0;
	}
	.section-heading {
		font-size: clamp(1.5rem, 3.5vw, 2.25rem);
		font-weight: 700;
		color: var(--text, #f4f6f7);
		text-align: center;
		margin: 0 0 2.75rem;
		letter-spacing: -0.02em;
	}
	.features-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.25rem;
	}
	@media (min-width: 640px) {
		.features-grid { grid-template-columns: 1fr 1fr; }
	}
	@media (min-width: 960px) {
		.features-grid { grid-template-columns: repeat(4, 1fr); }
	}
	.feature-card {
		background: var(--surface-alt, #2e3b46);
		border: 1px solid var(--border, #37444f);
		border-radius: 10px;
		padding: 1.5rem;
	}
	.feature-icon {
		width: 44px;
		height: 44px;
		border-radius: 8px;
		background: color-mix(in srgb, var(--accent, #f2c037) 12%, transparent);
		color: var(--accent, #f2c037);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1rem;
	}
	.feature-card h3 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text, #f4f6f7);
		margin: 0 0 0.5rem;
	}
	.feature-card p {
		font-size: 0.875rem;
		line-height: 1.6;
		color: var(--text-muted, #9fb0bd);
		margin: 0;
	}

	/* ── Stats bar ────────────────────────────────────────────────────────── */
	.stats-bar {
		background: var(--bg, #1b2228);
		border-top: 1px solid var(--border, #37444f);
		border-bottom: 1px solid var(--border, #37444f);
		padding: 2.5rem 0;
	}
	.stats-inner {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 2rem;
	}
	.stat {
		text-align: center;
	}
	.stat-value {
		font-size: 2rem;
		font-weight: 800;
		color: var(--accent, #f2c037);
		line-height: 1;
		margin-bottom: 0.25rem;
	}
	.stat-label {
		font-size: 0.8125rem;
		color: var(--text-muted, #9fb0bd);
	}
	.stat-divider {
		width: 1px;
		height: 40px;
		background: var(--border, #37444f);
	}
	@media (max-width: 600px) {
		.stat-divider { display: none; }
	}

	/* ── How it works ─────────────────────────────────────────────────────── */
	.how {
		background: var(--bg, #1b2228);
		padding: 4.5rem 0;
	}
	.steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2rem;
		max-width: 680px;
		margin-inline: auto;
	}
	.step {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
	}
	.step-num {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--accent, #f2c037) 15%, transparent);
		border: 1.5px solid var(--accent, #f2c037);
		color: var(--accent, #f2c037);
		font-weight: 700;
		font-size: 1.125rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.step-body h3 {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text, #f4f6f7);
		margin: 0.1rem 0 0.35rem;
	}
	.step-body p {
		font-size: 0.9375rem;
		line-height: 1.6;
		color: var(--text-muted, #9fb0bd);
		margin: 0;
	}

	/* ── CTA section ──────────────────────────────────────────────────────── */
	.cta-section {
		background: var(--surface, #232c34);
		border-top: 1px solid var(--border, #37444f);
		padding: 4.5rem 0;
	}
	.cta-inner {
		text-align: center;
	}
	.cta-inner h2 {
		font-size: clamp(1.5rem, 3.5vw, 2.25rem);
		font-weight: 700;
		color: var(--text, #f4f6f7);
		margin: 0 0 0.75rem;
	}
	.cta-inner p {
		font-size: 1.0625rem;
		color: var(--text-muted, #9fb0bd);
		margin: 0 0 2rem;
	}
	.cta-inner .hero-ctas {
		justify-content: center;
	}

	/* ── Footer ───────────────────────────────────────────────────────────── */
	.site-footer {
		background: var(--bg, #1b2228);
		border-top: 1px solid var(--border, #37444f);
		padding: 2rem 0;
	}
	.footer-inner {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1.25rem;
		justify-content: space-between;
	}
	.footer-brand {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}
	.footer-name {
		font-weight: 700;
		font-size: 1rem;
		color: var(--text, #f4f6f7);
	}
	.footer-nav {
		display: flex;
		gap: 1.5rem;
	}
	.footer-nav a {
		font-size: 0.875rem;
		color: var(--text-muted, #9fb0bd);
		text-decoration: none;
	}
	.footer-nav a:hover {
		color: var(--text, #f4f6f7);
	}
	.footer-copy {
		font-size: 0.8125rem;
		color: var(--text-muted, #9fb0bd);
		margin: 0;
		width: 100%;
	}
	@media (min-width: 640px) {
		.footer-copy { width: auto; }
	}
</style>
