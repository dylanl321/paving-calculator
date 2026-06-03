<script lang="ts">
	let {
		onSignatureChange = () => {},
		width = 400,
		height = 200
	}: {
		onSignatureChange?: (dataUrl: string | null) => void;
		width?: number;
		height?: number;
	} = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let ctx: CanvasRenderingContext2D | null = $state(null);
	let isDrawing = $state(false);
	let hasSignature = $state(false);

	let lastX = 0;
	let lastY = 0;

	function initCanvas() {
		if (!canvas) return;
		ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Handle device pixel ratio for crisp rendering
		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();

		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;

		ctx.scale(dpr, dpr);

		// Dark background
		ctx.fillStyle = '#1a1a2e';
		ctx.fillRect(0, 0, rect.width, rect.height);

		// Signature line styling
		ctx.strokeStyle = '#f2c037';
		ctx.lineWidth = 2;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
	}

	$effect(() => {
		if (canvas) {
			initCanvas();
		}
	});

	function getCoordinates(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();

		if ('touches' in e) {
			const touch = e.touches[0];
			return {
				x: touch.clientX - rect.left,
				y: touch.clientY - rect.top
			};
		} else {
			return {
				x: e.clientX - rect.left,
				y: e.clientY - rect.top
			};
		}
	}

	function startDrawing(e: MouseEvent | TouchEvent) {
		e.preventDefault();
		const coords = getCoordinates(e);
		if (!coords || !ctx) return;

		isDrawing = true;
		hasSignature = true;
		lastX = coords.x;
		lastY = coords.y;

		ctx.beginPath();
		ctx.moveTo(coords.x, coords.y);
	}

	function draw(e: MouseEvent | TouchEvent) {
		e.preventDefault();
		if (!isDrawing || !ctx) return;

		const coords = getCoordinates(e);
		if (!coords) return;

		ctx.lineTo(coords.x, coords.y);
		ctx.stroke();

		lastX = coords.x;
		lastY = coords.y;
	}

	function stopDrawing() {
		if (!isDrawing) return;
		isDrawing = false;

		if (hasSignature) {
			emitSignature();
		}
	}

	function emitSignature() {
		if (!canvas) return;
		const dataUrl = canvas.toDataURL('image/png');
		onSignatureChange(dataUrl);
	}

	export function clear() {
		if (!canvas) return;
		hasSignature = false;
		initCanvas();
		onSignatureChange(null);
	}

	export function isEmpty(): boolean {
		return !hasSignature;
	}
</script>

<div class="signature-pad-wrapper">
	<canvas
		bind:this={canvas}
		class="signature-canvas"
		class:has-placeholder={!hasSignature}
		style="width: {width}px; height: {height}px;"
		onmousedown={startDrawing}
		onmousemove={draw}
		onmouseup={stopDrawing}
		onmouseleave={stopDrawing}
		ontouchstart={startDrawing}
		ontouchmove={draw}
		ontouchend={stopDrawing}
		ontouchcancel={stopDrawing}
	></canvas>
	{#if !hasSignature}
		<div class="placeholder">Sign here</div>
	{/if}
</div>

<style>
	.signature-pad-wrapper {
		position: relative;
		width: 100%;
		max-width: 400px;
		margin: 0 auto;
	}

	.signature-canvas {
		display: block;
		width: 100%;
		background: #1a1a2e;
		border: 2px solid var(--border);
		border-radius: var(--radius);
		touch-action: none;
		cursor: crosshair;
	}

	.placeholder {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: var(--text-muted);
		font-size: 1.1rem;
		pointer-events: none;
		opacity: 0.5;
		font-style: italic;
	}

	.signature-canvas.has-placeholder ~ .placeholder {
		display: none;
	}
</style>
