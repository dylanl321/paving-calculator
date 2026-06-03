<script lang="ts">
  function printPage() {
    window.print();
  }
</script>

<svelte:head><title>Formula Reference Cards · Paverate</title></svelte:head>

<div class="ref-formulas">
  <div class="page-header no-print">
    <div class="header-text">
      <h1>Formula Reference Cards</h1>
      <p class="subtitle">Core asphalt paving formulas — print and keep on the job site.</p>
    </div>
    <button class="print-btn" onclick={printPage}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="6 9 6 2 18 2 18 9"></polyline>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
        <rect x="6" y="14" width="12" height="8"></rect>
      </svg>
      Print
    </button>
  </div>

  <div class="print-header print-only">
    <h1>PaveRate — Formula Reference</h1>
    <p>paverate.com</p>
  </div>

  <div class="cards-grid">

    <!-- Spread Rate from Thickness -->
    <div class="formula-card">
      <div class="card-label">Spread Rate from Thickness</div>
      <div class="formula-box">
        Rate (lbs/SY) = Thickness (in) &times; 110
      </div>
      <ul class="vars">
        <li><strong>Rate</strong> — target spread rate in lbs per square yard</li>
        <li><strong>Thickness</strong> — compacted lift thickness in inches</li>
        <li><strong>110</strong> — empirical factor (lbs/SY per inch)</li>
      </ul>
      <div class="example">Ex: 2 in. lift &rarr; 2 &times; 110 = <strong>220 lbs/SY</strong></div>
    </div>

    <!-- Spread Rate Placed (Reality Check) -->
    <div class="formula-card">
      <div class="card-label">Spread Rate Placed (Reality Check)</div>
      <div class="formula-box">
        Rate = (Tons &minus; Retention) &times; 2000 &divide; (L &times; W &divide; 9)
      </div>
      <ul class="vars">
        <li><strong>Tons</strong> — tons delivered (from tickets)</li>
        <li><strong>Retention</strong> — material held in paver/shuttle (tons)</li>
        <li><strong>L &times; W &divide; 9</strong> — area in square yards</li>
        <li><strong>2000</strong> — lbs per ton</li>
      </ul>
      <div class="example">Ex: 22 tons, 14 T retention, 500 ft &times; 12 ft &rarr; (22&minus;14)&times;2000 / (500&times;12/9) = <strong>24 lbs/SY</strong></div>
    </div>

    <!-- Tonnage to Order -->
    <div class="formula-card">
      <div class="card-label">Tonnage to Order</div>
      <div class="formula-box">
        Tons = (L &times; W &divide; 9) &times; Rate &divide; 2000 &times; (1 + Waste%)
      </div>
      <ul class="vars">
        <li><strong>L, W</strong> — length and width in feet</li>
        <li><strong>Rate</strong> — spread rate in lbs/SY</li>
        <li><strong>2000</strong> — lbs per ton</li>
        <li><strong>Waste%</strong> — overage factor (e.g. 0.05 for 5%)</li>
      </ul>
      <div class="example">Ex: 1000 ft &times; 12 ft @ 220 lbs/SY, 5% waste &rarr; (1000&times;12/9)&times;220/2000&times;1.05 = <strong>153.8 tons</strong></div>
    </div>

    <!-- Stick Check -->
    <div class="formula-card">
      <div class="card-label">Stick Check (Screed Reading)</div>
      <div class="formula-box">
        Loose Height = Compacted Thickness &times; 1.20
      </div>
      <ul class="vars">
        <li><strong>Loose Height</strong> — what the screed reads (inches)</li>
        <li><strong>Compacted Thickness</strong> — target after rolling (inches)</li>
        <li><strong>1.20</strong> — compaction factor (20% oversize)</li>
      </ul>
      <div class="example">Ex: 2 in. compacted &rarr; 2 &times; 1.20 = <strong>2.4 in.</strong> screed reading</div>
    </div>

    <!-- Tack Coat Gallons -->
    <div class="formula-card">
      <div class="card-label">Tack Coat Gallons</div>
      <div class="formula-box">
        Gallons = (L &times; W &divide; 9) &times; Shot Rate (gal/SY)
      </div>
      <ul class="vars">
        <li><strong>L, W</strong> — length and width in feet</li>
        <li><strong>Shot Rate</strong> — application rate in gal/SY</li>
      </ul>
      <div class="example">Ex: 500 ft &times; 12 ft @ 0.07 gal/SY &rarr; (500&times;12/9)&times;0.07 = <strong>46.7 gal</strong></div>
    </div>

    <!-- Feet Remaining -->
    <div class="formula-card">
      <div class="card-label">Feet Remaining from Tons</div>
      <div class="formula-box">
        Feet = Tons &times; 2000 &times; 9 &divide; (Width &times; Rate)
      </div>
      <ul class="vars">
        <li><strong>Tons</strong> — tons available (ordered minus placed)</li>
        <li><strong>Width</strong> — paving width in feet</li>
        <li><strong>Rate</strong> — spread rate in lbs/SY</li>
        <li><strong>2000 &times; 9</strong> — converts tons to lbs then to SY-feet</li>
      </ul>
      <div class="example">Ex: 10 tons left, 12 ft wide @ 220 lbs/SY &rarr; 10&times;2000&times;9/(12&times;220) = <strong>68.2 ft</strong></div>
    </div>

    <!-- Area in Square Yards -->
    <div class="formula-card">
      <div class="card-label">Area in Square Yards</div>
      <div class="formula-box">
        SY = (Length ft &times; Width ft) &divide; 9
      </div>
      <ul class="vars">
        <li><strong>Length, Width</strong> — dimensions in feet</li>
        <li><strong>9</strong> — square feet per square yard</li>
      </ul>
      <div class="example">Ex: 500 ft &times; 12 ft &divide; 9 = <strong>666.7 SY</strong></div>
    </div>

    <!-- Intersection Area -->
    <div class="formula-card">
      <div class="card-label">Intersection Area (Two Roads)</div>
      <div class="formula-box">
        Total SY = Road1 SY + Road2 SY &minus; Overlap SY
      </div>
      <ul class="vars">
        <li><strong>Road1 SY</strong> = L1 &times; W1 &divide; 9</li>
        <li><strong>Road2 SY</strong> = L2 &times; W2 &divide; 9</li>
        <li><strong>Overlap SY</strong> = W1 &times; W2 &divide; 9 (box in center, counted once)</li>
      </ul>
      <div class="example">Ex: 200&times;12 + 200&times;12 &minus; 12&times;12 (all /9) = <strong>517.3 SY</strong></div>
    </div>

  </div>

  <!-- Quick Constants -->
  <div class="constants-section">
    <div class="constants-title">Quick Constants</div>
    <div class="constants-grid">
      <div class="const-item">
        <span class="const-label">1 SY</span>
        <span class="const-eq">=</span>
        <span class="const-val">9 sq ft</span>
      </div>
      <div class="const-item">
        <span class="const-label">1 Ton</span>
        <span class="const-eq">=</span>
        <span class="const-val">2,000 lbs</span>
      </div>
      <div class="const-item">
        <span class="const-label">Thickness factor</span>
        <span class="const-eq">=</span>
        <span class="const-val">110 lbs/SY/in</span>
      </div>
      <div class="const-item">
        <span class="const-label">Stick factor</span>
        <span class="const-eq">=</span>
        <span class="const-val">1.20&times; (screed reads 20% high)</span>
      </div>
      <div class="const-item">
        <span class="const-label">Tack — New AC to New AC</span>
        <span class="const-eq">=</span>
        <span class="const-val">0.05&ndash;0.08 gal/SY</span>
      </div>
      <div class="const-item">
        <span class="const-label">Tack — New AC to Milled/Aged</span>
        <span class="const-eq">=</span>
        <span class="const-val">0.06&ndash;0.12 gal/SY</span>
      </div>
      <div class="const-item">
        <span class="const-label">Paver retention</span>
        <span class="const-eq">=</span>
        <span class="const-val">14 tons (first pass)</span>
      </div>
      <div class="const-item">
        <span class="const-label">Shuttle Buggy retention</span>
        <span class="const-eq">=</span>
        <span class="const-val">24 tons (first pass)</span>
      </div>
    </div>
  </div>

  <div class="ref-footer no-print">
    <p>
      <strong>Source:</strong> Formulas derived from GDOT specifications and industry practice.
      Use <a href="/reference">Reference Tables</a> for official DOT thickness and tack tables.
    </p>
  </div>

  <div class="print-footer print-only">
    <p>Formulas sourced from GDOT specifications &amp; industry practice. Verify with project engineer.</p>
  </div>
</div>

<style>
  .ref-formulas {
    max-width: 960px;
  }

  /* ---- Page Header ---- */
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 28px;
  }

  .header-text h1 {
    margin: 0 0 6px;
    font-size: 1.8rem;
  }

  .subtitle {
    color: var(--text-muted);
    margin: 0;
    font-size: 0.95rem;
  }

  .print-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 20px;
    height: 48px;
    background: var(--accent);
    color: var(--accent-text, #fff);
    border: none;
    border-radius: var(--radius, 8px);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .print-btn:hover {
    opacity: 0.9;
  }

  /* ---- Cards Grid ---- */
  .cards-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    margin-bottom: 28px;
  }

  @media (min-width: 640px) {
    .cards-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .formula-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius, 8px);
    padding: 18px 20px;
  }

  .card-label {
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin-bottom: 10px;
  }

  .formula-box {
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px 14px;
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.92rem;
    line-height: 1.5;
    margin-bottom: 12px;
    color: var(--text);
  }

  .vars {
    list-style: none;
    padding: 0;
    margin: 0 0 10px;
    font-size: 0.83rem;
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .vars li strong {
    color: var(--text);
  }

  .example {
    font-size: 0.82rem;
    color: var(--text-muted);
    font-style: italic;
    border-top: 1px solid var(--border);
    padding-top: 8px;
    margin-top: 4px;
  }

  .example strong {
    color: var(--accent);
    font-style: normal;
  }

  /* ---- Constants Section ---- */
  .constants-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius, 8px);
    padding: 20px 24px;
    margin-bottom: 28px;
  }

  .constants-title {
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
    margin-bottom: 14px;
  }

  .constants-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }

  @media (min-width: 640px) {
    .constants-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .const-item {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 0.88rem;
  }

  .const-label {
    font-weight: 600;
    color: var(--text);
  }

  .const-eq {
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .const-val {
    color: var(--text-muted);
  }

  /* ---- Footer ---- */
  .ref-footer {
    padding: 14px 16px;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: var(--radius, 8px);
    font-size: 0.84rem;
    color: var(--text-muted);
  }

  .ref-footer p {
    margin: 0;
  }

  .ref-footer a {
    color: var(--accent);
    text-decoration: none;
  }

  .ref-footer a:hover {
    text-decoration: underline;
  }

  /* ---- Print-only elements (hidden on screen) ---- */
  .print-only {
    display: none;
  }

  /* ---- Print Styles ---- */
  @media print {
    .no-print {
      display: none !important;
    }

    .print-only {
      display: block;
    }

    .ref-formulas {
      max-width: 100%;
      color: #000;
    }

    .print-header {
      text-align: center;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #000;
    }

    .print-header h1 {
      margin: 0 0 2px;
      font-size: 1.4rem;
    }

    .print-header p {
      margin: 0;
      font-size: 0.8rem;
      color: #555;
    }

    .cards-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .formula-card {
      background: #fff;
      border: 1px solid #ccc;
      padding: 10px 12px;
      break-inside: avoid;
    }

    .card-label {
      color: #000;
    }

    .formula-box {
      background: #f5f5f5;
      border: 1px solid #ccc;
      padding: 8px 10px;
      font-size: 0.82rem;
      color: #000;
    }

    .vars {
      color: #444;
    }

    .vars li strong {
      color: #000;
    }

    .example {
      color: #555;
    }

    .example strong {
      color: #000;
    }

    .constants-section {
      background: #fff;
      border: 1px solid #ccc;
      padding: 12px 16px;
      margin-bottom: 12px;
    }

    .constants-title {
      color: #000;
    }

    .const-label {
      color: #000;
    }

    .const-eq,
    .const-val {
      color: #444;
    }

    .print-footer {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid #ccc;
      font-size: 0.75rem;
      color: #666;
      text-align: center;
    }
  }
</style>
