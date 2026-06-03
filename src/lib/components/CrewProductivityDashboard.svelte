<script lang="ts">
  import { onMount } from 'svelte';

  interface CrewProductivity {
    id: string;
    name: string;
    color: string;
    total_tons: number;
    total_loads: number;
    total_days: number;
    total_distance_ft: number;
    hours_worked: number;
    avg_tons_per_day: number;
    avg_crew_count: number;
    best_day_tons: number;
    member_count: number;
  }

  interface ProductivityResponse {
    crews: CrewProductivity[];
    date_range: { start: string; end: string };
    fetched_at: number;
  }

  type DateRangePreset = '7d' | '30d' | '90d' | 'custom';

  let data = $state<ProductivityResponse | null>(null);
  let loading = $state(true);
  let error = $state('');
  let selectedRange = $state<DateRangePreset>('7d');
  let customStartDate = $state('');
  let customEndDate = $state('');

  const COLOR_MAP: Record<string, string> = {
    slate: '#64748b',
    red: '#ef4444',
    orange: '#f97316',
    amber: '#f59e0b',
    green: '#22c55e',
    teal: '#14b8a6',
    blue: '#3b82f6',
    violet: '#8b5cf6',
    pink: '#ec4899',
  };

  function crewColor(color: string): string {
    return COLOR_MAP[color] ?? COLOR_MAP['slate'];
  }

  function getRankEmoji(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '';
  }

  function getDateRange(preset: DateRangePreset): { start: string; end: string } {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];

    if (preset === 'custom') {
      return { start: customStartDate, end: customEndDate };
    }

    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
    const startDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    return { start: startDate, end: endDate };
  }

  async function fetchData() {
    try {
      error = '';
      loading = true;

      const range = getDateRange(selectedRange);
      if (selectedRange === 'custom' && (!range.start || !range.end)) {
        error = 'Please select both start and end dates';
        loading = false;
        return;
      }

      const params = new URLSearchParams({
        start_date: range.start,
        end_date: range.end,
      });

      const res = await fetch(`/api/org/crew-productivity?${params}`);
      if (!res.ok) {
        if (res.status === 403) {
          error = 'Admin access required to view crew productivity.';
          return;
        }
        error = 'Failed to load crew productivity data';
        return;
      }

      data = await res.json();
    } catch (e) {
      error = 'Network error — check your connection';
    } finally {
      loading = false;
    }
  }

  function handleRangeChange(range: DateRangePreset) {
    selectedRange = range;
    if (range !== 'custom') {
      fetchData();
    }
  }

  function handleCustomDateApply() {
    if (customStartDate && customEndDate) {
      fetchData();
    }
  }

  const maxTons = $derived(
    data?.crews && data.crews.length > 0 ? Math.max(...data.crews.map((c) => c.total_tons)) : 0
  );

  const totalStats = $derived({
    tons: data?.crews.reduce((sum, c) => sum + c.total_tons, 0) ?? 0,
    loads: data?.crews.reduce((sum, c) => sum + c.total_loads, 0) ?? 0,
    hours: data?.crews.reduce((sum, c) => sum + c.hours_worked, 0) ?? 0,
  });

  onMount(() => {
    fetchData();
  });
</script>

<div class="productivity-dashboard">
  <div class="dashboard-header">
    <h2 class="dashboard-title">Crew Productivity Comparison</h2>
    <button class="refresh-btn" onclick={fetchData} disabled={loading} aria-label="Refresh">
      <svg
        class:spinning={loading}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    </button>
  </div>

  <div class="date-range-selector">
    <button
      class="range-btn"
      class:active={selectedRange === '7d'}
      onclick={() => handleRangeChange('7d')}
    >
      7 Days
    </button>
    <button
      class="range-btn"
      class:active={selectedRange === '30d'}
      onclick={() => handleRangeChange('30d')}
    >
      30 Days
    </button>
    <button
      class="range-btn"
      class:active={selectedRange === '90d'}
      onclick={() => handleRangeChange('90d')}
    >
      90 Days
    </button>
    <button
      class="range-btn"
      class:active={selectedRange === 'custom'}
      onclick={() => handleRangeChange('custom')}
    >
      Custom
    </button>
  </div>

  {#if selectedRange === 'custom'}
    <div class="custom-date-inputs">
      <div class="date-input-group">
        <label for="start-date">Start Date</label>
        <input type="date" id="start-date" bind:value={customStartDate} />
      </div>
      <div class="date-input-group">
        <label for="end-date">End Date</label>
        <input type="date" id="end-date" bind:value={customEndDate} />
      </div>
      <button class="apply-btn" onclick={handleCustomDateApply}>Apply</button>
    </div>
  {/if}

  {#if data?.date_range}
    <div class="date-range-display">
      Showing data from <strong>{data.date_range.start}</strong> to <strong
        >{data.date_range.end}</strong
      >
    </div>
  {/if}

  {#if loading && !data}
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Loading productivity data...</span>
    </div>
  {:else if error}
    <div class="error-state">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {error}
    </div>
  {:else if data}
    {#if data.crews.length === 0}
      <div class="empty-state">
        <p>No crew productivity data for this period</p>
      </div>
    {:else}
      <div class="crew-rankings">
        {#each data.crews as crew, idx}
          {@const rank = idx + 1}
          {@const barWidth = maxTons > 0 ? (crew.total_tons / maxTons) * 100 : 0}
          <div class="crew-rank-card">
            <div class="rank-header">
              <div class="rank-info">
                <span class="rank-badge">
                  {#if rank <= 3}
                    <span class="medal">{getRankEmoji(rank)}</span>
                  {/if}
                  #{rank}
                </span>
                <span class="crew-dot" style="background:{crewColor(crew.color)}"></span>
                <span class="crew-name">{crew.name}</span>
                {#if crew.member_count > 0}
                  <span class="member-count">{crew.member_count} members</span>
                {/if}
              </div>
              <div class="total-tons">{crew.total_tons.toFixed(1)} tons</div>
            </div>

            <div class="performance-bar-wrapper">
              <div class="performance-bar" style="width: {barWidth}%"></div>
            </div>

            <div class="crew-metrics">
              <div class="metric">
                <span class="metric-val">{crew.total_loads}</span>
                <span class="metric-lbl">Loads</span>
              </div>
              <div class="metric">
                <span class="metric-val">{crew.total_days}</span>
                <span class="metric-lbl">Days Active</span>
              </div>
              <div class="metric">
                <span class="metric-val"
                  >{crew.avg_tons_per_day > 0 ? crew.avg_tons_per_day.toFixed(1) : '—'}</span
                >
                <span class="metric-lbl">Avg Tons/Day</span>
              </div>
              <div class="metric">
                <span class="metric-val"
                  >{crew.hours_worked > 0 ? crew.hours_worked.toFixed(1) : '—'}</span
                >
                <span class="metric-lbl">Hours</span>
              </div>
              <div class="metric">
                <span class="metric-val"
                  >{crew.best_day_tons > 0 ? crew.best_day_tons.toFixed(1) : '—'}</span
                >
                <span class="metric-lbl">Best Day</span>
              </div>
            </div>
          </div>
        {/each}
      </div>

      <div class="summary-row">
        <div class="summary-label">Total (All Crews)</div>
        <div class="summary-stats">
          <div class="summary-stat">
            <span class="summary-val">{totalStats.tons.toFixed(1)}</span>
            <span class="summary-lbl">Tons</span>
          </div>
          <div class="summary-stat">
            <span class="summary-val">{totalStats.loads}</span>
            <span class="summary-lbl">Loads</span>
          </div>
          <div class="summary-stat">
            <span class="summary-val">{totalStats.hours.toFixed(1)}</span>
            <span class="summary-lbl">Hours</span>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .productivity-dashboard {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .dashboard-title {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 700;
  }

  .refresh-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-muted);
    cursor: pointer;
    padding: 8px;
    min-width: 36px;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--surface-hover, rgba(255, 255, 255, 0.05));
    color: var(--text);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .spinning {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .date-range-selector {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .range-btn {
    padding: 10px 18px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    min-height: 48px;
  }

  .range-btn:hover {
    background: var(--surface-hover, rgba(255, 255, 255, 0.05));
  }

  .range-btn.active {
    background: var(--accent);
    color: var(--accent-text);
    border-color: var(--accent);
  }

  .custom-date-inputs {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
    align-items: flex-end;
  }

  .date-input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-width: 140px;
  }

  .date-input-group label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .date-input-group input {
    padding: 10px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 0.9rem;
    min-height: 48px;
  }

  .date-input-group input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .apply-btn {
    padding: 10px 20px;
    background: var(--accent);
    color: var(--accent-text);
    border: none;
    border-radius: var(--radius);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
    min-height: 48px;
  }

  .apply-btn:hover {
    opacity: 0.9;
  }

  .date-range-display {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 20px;
    padding: 10px 14px;
    background: var(--bg);
    border-radius: var(--radius);
  }

  .date-range-display strong {
    color: var(--text);
    font-weight: 600;
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 48px 16px;
    color: var(--text-muted);
    font-size: 0.9rem;
    flex-direction: column;
    text-align: center;
  }

  .error-state {
    color: var(--bad, #ef4444);
    flex-direction: row;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .crew-rankings {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 24px;
  }

  .crew-rank-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    transition: border-color 0.2s;
  }

  .crew-rank-card:hover {
    border-color: var(--accent);
  }

  .rank-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    gap: 12px;
    flex-wrap: wrap;
  }

  .rank-info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .rank-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 1rem;
    font-weight: 800;
    color: var(--text-muted);
    min-width: 40px;
  }

  .medal {
    font-size: 1.2rem;
  }

  .crew-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .crew-name {
    font-weight: 700;
    font-size: 1.05rem;
  }

  .member-count {
    font-size: 0.75rem;
    color: var(--text-muted);
    padding: 3px 8px;
    background: var(--surface);
    border-radius: 999px;
  }

  .total-tons {
    font-size: 1.3rem;
    font-weight: 800;
    color: var(--accent);
  }

  .performance-bar-wrapper {
    width: 100%;
    height: 8px;
    background: var(--surface);
    border-radius: 999px;
    margin-bottom: 16px;
    overflow: hidden;
  }

  .performance-bar {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--accent),
      color-mix(in srgb, var(--accent) 70%, white)
    );
    border-radius: 999px;
    transition: width 0.4s ease-out;
  }

  .crew-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: 12px;
  }

  .metric {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--surface);
    border-radius: 8px;
    padding: 10px 6px;
    gap: 4px;
  }

  .metric-val {
    font-size: 1rem;
    font-weight: 800;
    color: var(--text);
    line-height: 1;
  }

  .metric-lbl {
    font-size: 0.65rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    text-align: center;
  }

  .summary-row {
    background: var(--bg);
    border: 2px solid var(--border);
    border-radius: var(--radius);
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
  }

  .summary-label {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text);
  }

  .summary-stats {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }

  .summary-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .summary-val {
    font-size: 1.2rem;
    font-weight: 800;
    color: var(--accent);
    line-height: 1;
  }

  .summary-lbl {
    font-size: 0.7rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  @media (min-width: 768px) {
    .crew-metrics {
      grid-template-columns: repeat(5, 1fr);
    }
  }
</style>
