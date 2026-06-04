<script lang="ts">
  /**
   * TodayProgressOverlay — shows a summary card over the map with:
   *   - Estimated tonnage / length for today vs actual completed
   *   - An animated progress bar that fills as loads are logged
   *
   * This is a pure HTML overlay (not a MapLibre layer); mount it as a sibling
   * to <MapView> inside a positioned container, or inside a MapView snippet.
   *
   * Props can be wired to live stores so the overlay updates without re-mount.
   */
  interface Props {
    /** Total lengths the crew plans to pave today (ft) */
    targetLengthFt?: number | null;
    /** Actual length paved so far today (ft) */
    completedLengthFt?: number | null;
    /** Target tonnage for today */
    targetTons?: number | null;
    /** Actual tons placed today */
    placedTons?: number | null;
    /** Number of loads completed today */
    loadsCompleted?: number;
    /** Total loads planned today */
    loadsPlanned?: number | null;
  }

  let {
    targetLengthFt = null,
    completedLengthFt = null,
    targetTons = null,
    placedTons = null,
    loadsCompleted = 0,
    loadsPlanned = null,
  }: Props = $props();

  /** 0–1 progress fraction */
  const progressFraction = $derived.by(() => {
    if (loadsPlanned && loadsPlanned > 0) {
      return Math.min(1, loadsCompleted / loadsPlanned);
    }
    if (targetTons && targetTons > 0 && placedTons != null) {
      return Math.min(1, placedTons / targetTons);
    }
    if (targetLengthFt && targetLengthFt > 0 && completedLengthFt != null) {
      return Math.min(1, completedLengthFt / targetLengthFt);
    }
    return 0;
  });

  const pct = $derived(Math.round(progressFraction * 100));

  function fmt(n: number | null | undefined, decimals = 0): string {
    if (n == null) return '--';
    return n.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  const barColor = $derived(
    pct >= 100 ? '#22c55e'
    : pct >= 70 ? '#f59e0b'
    : '#f2c037'
  );
</script>

<div class="tpo-card" role="status" aria-label="Today's paving progress">
  <div class="tpo-header">
    <span class="tpo-title">Today's Progress</span>
    <span class="tpo-pct" style:color={barColor}>{pct}%</span>
  </div>

  <!-- Animated progress bar -->
  <div class="tpo-bar-track" aria-hidden="true">
    <div
      class="tpo-bar-fill"
      style:width="{pct}%"
      style:background={barColor}
    ></div>
  </div>

  <div class="tpo-stats">
    {#if targetTons != null || placedTons != null}
      <div class="tpo-stat">
        <span class="tpo-stat-label">Tons placed</span>
        <span class="tpo-stat-value">
          {fmt(placedTons, 1)}
          {#if targetTons != null}
            <span class="tpo-stat-of">/ {fmt(targetTons, 1)} t</span>
          {/if}
        </span>
      </div>
    {/if}

    {#if loadsPlanned != null || loadsCompleted > 0}
      <div class="tpo-stat">
        <span class="tpo-stat-label">Loads</span>
        <span class="tpo-stat-value">
          {loadsCompleted}
          {#if loadsPlanned != null}
            <span class="tpo-stat-of">/ {loadsPlanned}</span>
          {/if}
        </span>
      </div>
    {/if}

    {#if targetLengthFt != null || completedLengthFt != null}
      <div class="tpo-stat">
        <span class="tpo-stat-label">Length</span>
        <span class="tpo-stat-value">
          {fmt(completedLengthFt)} ft
          {#if targetLengthFt != null}
            <span class="tpo-stat-of">/ {fmt(targetLengthFt)} ft</span>
          {/if}
        </span>
      </div>
    {/if}
  </div>
</div>

<style>
  .tpo-card {
    background: rgba(15, 23, 42, 0.88);
    backdrop-filter: blur(6px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 12px 14px;
    min-width: 200px;
    max-width: 260px;
    color: #f1f5f9;
    font-size: 0.82rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }

  .tpo-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .tpo-title {
    font-weight: 700;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: rgba(241, 245, 249, 0.7);
  }

  .tpo-pct {
    font-size: 1.2rem;
    font-weight: 800;
    line-height: 1;
    transition: color 0.4s;
  }

  .tpo-bar-track {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    overflow: hidden;
    margin-bottom: 10px;
  }

  .tpo-bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s;
  }

  .tpo-stats {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tpo-stat {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .tpo-stat-label {
    color: rgba(241, 245, 249, 0.6);
    font-size: 0.75rem;
  }

  .tpo-stat-value {
    font-weight: 700;
    font-size: 0.82rem;
    font-variant-numeric: tabular-nums;
  }

  .tpo-stat-of {
    font-weight: 400;
    color: rgba(241, 245, 249, 0.5);
    margin-left: 2px;
  }
</style>
