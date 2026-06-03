<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface SiteStatus {
    id: string;
    name: string;
    status: string;
    today_log_open: boolean;
    today_tons: number;
    today_loads: number;
    log_id: string | null;
    location_description?: string | null;
  }

  interface CrewStatus {
    id: string;
    name: string;
    color: string;
    member_count: number;
    members: { user_id: string; name: string; email: string }[];
    site_count: number;
    active_site_count: number;
    sites: SiteStatus[];
    today_tons_total: number;
    today_loads_total: number;
  }

  interface CrewStatusResponse {
    crews: CrewStatus[];
    unassigned_active_sites: SiteStatus[];
    fetched_at: number;
  }

  let data = $state<CrewStatusResponse | null>(null);
  let loading = $state(true);
  let error = $state('');
  let lastUpdated = $state<Date | null>(null);
  let interval: ReturnType<typeof setInterval> | null = null;

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

  async function refresh() {
    try {
      error = '';
      const res = await fetch('/api/org/crew-status');
      if (!res.ok) {
        if (res.status === 403) {
          error = 'Admin access required to view crew status.';
          return;
        }
        error = 'Failed to load crew status';
        return;
      }
      data = await res.json();
      lastUpdated = new Date();
    } catch (e) {
      error = 'Network error — check your connection';
    } finally {
      loading = false;
    }
  }

  function formatTime(d: Date): string {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  onMount(() => {
    refresh();
    interval = setInterval(refresh, 30_000);
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
</script>

<div class="crew-dashboard">
  <div class="dashboard-header">
    <h3 class="dashboard-title">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      Live Crew Status
      {#if !loading && !error}
        <span class="live-badge">LIVE</span>
      {/if}
    </h3>
    <div class="header-right">
      {#if lastUpdated}
        <span class="last-updated">Updated {formatTime(lastUpdated)}</span>
      {/if}
      <button class="refresh-btn" onclick={refresh} disabled={loading} aria-label="Refresh crew status">
        <svg class:spinning={loading} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
      </button>
    </div>
  </div>

  {#if loading && !data}
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Loading crew status...</span>
    </div>
  {:else if error}
    <div class="error-state">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {error}
    </div>
  {:else if data}
    {#if data.crews.length === 0}
      <div class="empty-state">
        <p>No crews configured yet.</p>
        <a href="/dashboard/team" class="link">Set up crews in Team settings</a>
      </div>
    {:else}
      <div class="crews-grid">
        {#each data.crews as crew}
          <div class="crew-card" class:crew-active={crew.active_site_count > 0}>
            <div class="crew-header">
              <div class="crew-identity">
                <span class="crew-dot" style="background:{crewColor(crew.color)}"></span>
                <span class="crew-name">{crew.name}</span>
                {#if crew.active_site_count > 0}
                  <span class="active-indicator" aria-label="Active now">
                    <span class="pulse-dot"></span>
                    Active
                  </span>
                {/if}
              </div>
              <span class="member-count">{crew.member_count} member{crew.member_count !== 1 ? 's' : ''}</span>
            </div>

            <div class="crew-stats">
              <div class="stat">
                <span class="stat-val">{crew.today_tons_total > 0 ? crew.today_tons_total.toFixed(1) : '—'}</span>
                <span class="stat-lbl">Tons Today</span>
              </div>
              <div class="stat">
                <span class="stat-val">{crew.today_loads_total > 0 ? crew.today_loads_total : '—'}</span>
                <span class="stat-lbl">Loads Today</span>
              </div>
              <div class="stat">
                <span class="stat-val">{crew.active_site_count}/{crew.site_count}</span>
                <span class="stat-lbl">Sites Active</span>
              </div>
            </div>

            {#if crew.sites.length > 0}
              <div class="site-list">
                {#each crew.sites as site}
                  <a href="/dashboard/job-sites/{site.id}" class="site-row" class:site-open={site.today_log_open}>
                    <span class="site-status-dot" class:dot-open={site.today_log_open} class:dot-closed={!site.today_log_open}></span>
                    <span class="site-name">{site.name}</span>
                    {#if site.today_log_open}
                      <span class="site-metric">{site.today_tons > 0 ? site.today_tons.toFixed(1) + 't' : 'no data'}</span>
                    {/if}
                  </a>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#if data.unassigned_active_sites.length > 0}
      <div class="unassigned-section">
        <h4 class="unassigned-title">Active Sites (Unassigned)</h4>
        <div class="unassigned-list">
          {#each data.unassigned_active_sites as site}
            <a href="/dashboard/job-sites/{site.id}" class="unassigned-site">
              <span class="pulse-dot small"></span>
              <span>{site.name}</span>
              {#if site.today_tons > 0}
                <span class="site-metric">{site.today_tons.toFixed(1)}t</span>
              {/if}
            </a>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .crew-dashboard {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .dashboard-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }

  .live-badge {
    font-size: 0.65rem;
    font-weight: 800;
    background: var(--good, #22c55e);
    color: #fff;
    padding: 2px 6px;
    border-radius: 999px;
    letter-spacing: 0.5px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .last-updated {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .refresh-btn {
    background: none;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-muted);
    cursor: pointer;
    padding: 6px;
    min-width: 32px;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--surface-hover, rgba(255,255,255,0.05));
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
    to { transform: rotate(360deg); }
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 32px 16px;
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
    width: 20px;
    height: 20px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .link {
    color: var(--accent);
    text-decoration: underline;
  }

  .crews-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }

  .crew-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
    transition: border-color 0.2s;
  }

  .crew-card.crew-active {
    border-color: var(--good, #22c55e);
    border-color: color-mix(in srgb, var(--good, #22c55e) 60%, var(--border));
  }

  .crew-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
    gap: 8px;
  }

  .crew-identity {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    flex: 1;
    min-width: 0;
  }

  .crew-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .crew-name {
    font-weight: 700;
    font-size: 0.95rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .active-indicator {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    color: var(--good, #22c55e);
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .pulse-dot {
    width: 8px;
    height: 8px;
    background: var(--good, #22c55e);
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
    flex-shrink: 0;
  }

  .pulse-dot.small {
    width: 6px;
    height: 6px;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }

  .member-count {
    font-size: 0.75rem;
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .crew-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--surface);
    border-radius: 6px;
    padding: 8px 4px;
    gap: 2px;
  }

  .stat-val {
    font-size: 1.1rem;
    font-weight: 800;
    color: var(--accent);
    line-height: 1;
  }

  .stat-lbl {
    font-size: 0.65rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    text-align: center;
  }

  .site-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-top: 1px solid var(--border);
    padding-top: 10px;
  }

  .site-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    text-decoration: none;
    color: var(--text);
    font-size: 0.82rem;
    transition: background 0.15s;
    min-height: 36px;
  }

  .site-row:hover {
    background: var(--surface-hover, rgba(255,255,255,0.05));
  }

  .site-status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-open {
    background: var(--good, #22c55e);
  }

  .dot-closed {
    background: var(--text-muted);
    opacity: 0.5;
  }

  .site-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .site-metric {
    font-size: 0.75rem;
    color: var(--accent);
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .unassigned-section {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }

  .unassigned-title {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 10px;
  }

  .unassigned-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .unassigned-site {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    text-decoration: none;
    color: var(--text);
    font-size: 0.82rem;
    transition: background 0.15s;
    min-height: 36px;
  }

  .unassigned-site:hover {
    background: var(--surface-hover, rgba(255,255,255,0.05));
  }
</style>
