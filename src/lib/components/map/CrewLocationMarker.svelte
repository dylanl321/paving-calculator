<script lang="ts">
	import MapMarker from './MapMarker.svelte';

	interface Props {
		name: string;
		role: string;
		lat: number;
		lng: number;
		heading?: number;
		status: 'active' | 'idle' | 'offline';
		isMe: boolean;
		updatedAt: number; // unix timestamp seconds
	}

	let { name, role, lat, lng, heading, status, isMe, updatedAt }: Props = $props();

	const STATUS_COLORS = {
		active: '#22c55e',
		idle: '#f59e0b',
		offline: '#64748b'
	};

	function getInitials(name: string): string {
		const parts = name.trim().split(/\s+/);
		if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
		return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	}

	function buildCrewIcon(
		name: string,
		status: 'active' | 'idle' | 'offline',
		isMe: boolean,
		heading?: number
	): string {
		const initials = getInitials(name);
		const color = STATUS_COLORS[status];
		const rotation = heading != null ? `rotate(${heading}deg)` : '';

		return `
      <div class="crew-marker ${isMe ? 'is-me' : ''}" style="transform: ${rotation}">
        <svg width="40" height="40" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" fill="${color}" stroke="white" stroke-width="2"/>
          <text x="20" y="20" font-size="12" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${initials}</text>
        </svg>
      </div>
    `;
	}

	function formatRelativeTime(timestamp: number): string {
		const now = Math.floor(Date.now() / 1000);
		const diff = now - timestamp;

		if (diff < 60) return 'just now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return `${Math.floor(diff / 86400)}d ago`;
	}

	const iconHtml = $derived(buildCrewIcon(name, status, isMe, heading));
	const popupContent = $derived(`
    <div class="crew-popup">
      <div class="crew-name">${name}</div>
      <div class="crew-role">${role}</div>
      <div class="crew-time">${formatRelativeTime(updatedAt)}</div>
    </div>
  `);
</script>

<MapMarker {lat} {lng} {iconHtml} iconSize={[40, 40]} iconAnchor={[20, 20]} popupAnchor={[0, -20]} popupHtml={popupContent} popupMinWidth={150} />

<style>
	:global(.crew-marker) {
		display: inline-block;
	}

	@keyframes pulse {
		0%, 100% {
			box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7);
		}
		50% {
			box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
		}
	}

	:global(.crew-marker.is-me) {
		animation: pulse 2s infinite;
	}

	:global(.crew-popup) {
		padding: 8px;
		text-align: center;
	}

	:global(.crew-name) {
		font-weight: 600;
		font-size: 14px;
		margin-bottom: 4px;
		color: #1e293b;
	}

	:global(.crew-role) {
		font-size: 12px;
		color: #64748b;
		margin-bottom: 4px;
	}

	:global(.crew-time) {
		font-size: 11px;
		color: #94a3b8;
	}
</style>
