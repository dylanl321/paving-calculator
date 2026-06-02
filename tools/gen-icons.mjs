// One-shot PWA icon generator. Run with: node tools/gen-icons.mjs
// Generates icons into static/icons from the chosen Paverate logo.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const SOURCE = resolve(
	root,
	'branding/a-clean-minimalist-logo-design-featuring_2G_sFtYtUDS5g4iasgXAYA_NxG4h_u4QGSwqBP3IyJzZQ_sd_small.jpg'
);
const OUT = resolve(root, 'static/icons');

const SLATE = { r: 46, g: 59, b: 70, alpha: 1 }; // #2e3b46
const PAPER = { r: 242, g: 243, b: 244, alpha: 1 }; // logo's light background

async function makeIcon(size, { maskable = false } = {}) {
	// Trim the flat border around the logo art, then place on the logo's own
	// light background so it reads as one clean tile (no awkward inner square).
	// Maskable icons need a larger safe zone, so inset more.
	const inset = maskable ? Math.round(size * 0.16) : Math.round(size * 0.06);
	const logoSize = size - inset * 2;

	const logo = await sharp(SOURCE)
		.trim({ threshold: 10 })
		.resize(logoSize, logoSize, { fit: 'contain', background: PAPER })
		.toBuffer();

	return sharp({
		create: { width: size, height: size, channels: 4, background: PAPER }
	})
		.composite([{ input: logo, top: inset, left: inset }])
		.png()
		.toBuffer();
}

async function main() {
	await mkdir(OUT, { recursive: true });

	const jobs = [
		{ name: 'icon-192.png', size: 192 },
		{ name: 'icon-512.png', size: 512 },
		{ name: 'icon-512-maskable.png', size: 512, maskable: true },
		{ name: 'apple-touch-icon.png', size: 180 }
	];

	for (const job of jobs) {
		const buf = await makeIcon(job.size, { maskable: job.maskable });
		await sharp(buf).toFile(resolve(OUT, job.name));
		console.log(`wrote ${job.name} (${job.size}px${job.maskable ? ', maskable' : ''})`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
