// Generates a styled QR code SVG: rounded data dots, rounded finder "eyes",
// and the site favicon embedded in the middle. High error correction (H) keeps
// it scannable despite the logo covering the center.
//
// Regenerate with: yarn gen-qr

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import QRCode from 'qrcode';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const URL = 'https://joe-eager.github.io/MTB-openings/';
const OUT = resolve(root, 'public/site-qr.svg');
const LOGO = resolve(root, 'public/favicon.png');

const CELL = 10; // px per module
const MARGIN = 4; // quiet-zone modules
const DARK = '#282a36'; // module color (Dracula foreground-ish, high contrast on white)
const LOGO_RATIO = 0.24; // fraction of the QR the logo (with its padding) covers

const qr = QRCode.create(URL, { errorCorrectionLevel: 'H' });
const size = qr.modules.size;
const data = qr.modules.data;
const at = (r, c) => r >= 0 && c >= 0 && r < size && c < size && !!data[r * size + c];

// The three 7x7 finder patterns sit at these top-left corners.
const finders = [
	[0, 0],
	[0, size - 7],
	[size - 7, 0]
];
const inFinder = (r, c) => finders.some(([fr, fc]) => r >= fr && r < fr + 7 && c >= fc && c < fc + 7);

// Clear a square in the middle for the logo so dots don't render behind it.
const dim = size + MARGIN * 2;
const logoModules = Math.round(size * LOGO_RATIO);
const clearHalf = Math.ceil(logoModules / 2) + 1;
const center = (size - 1) / 2;
const inLogo = (r, c) => Math.abs(r - center) <= clearHalf && Math.abs(c - center) <= clearHalf;

const px = (m) => (m + MARGIN) * CELL;
const dots = [];
for (let r = 0; r < size; r++) {
	for (let c = 0; c < size; c++) {
		if (!at(r, c) || inFinder(r, c) || inLogo(r, c)) continue;
		const cx = px(c) + CELL / 2;
		const cy = px(r) + CELL / 2;
		dots.push(`<circle cx="${cx}" cy="${cy}" r="${CELL * 0.42}"/>`);
	}
}

// Rounded finder "eyes": outer rounded ring + inner rounded square.
const eyes = finders
	.map(([fr, fc]) => {
		const x = px(fc);
		const y = px(fr);
		const s = 7 * CELL;
		const outerR = CELL * 2;
		const innerX = px(fc + 2);
		const innerY = px(fr + 2);
		const innerS = 3 * CELL;
		const innerR = CELL * 1;
		const t = CELL; // ring thickness
		return `
		<path fill-rule="evenodd" d="
			M${x + outerR} ${y} h${s - 2 * outerR} a${outerR} ${outerR} 0 0 1 ${outerR} ${outerR} v${s - 2 * outerR} a${outerR} ${outerR} 0 0 1 -${outerR} ${outerR} h-${s - 2 * outerR} a${outerR} ${outerR} 0 0 1 -${outerR} -${outerR} v-${s - 2 * outerR} a${outerR} ${outerR} 0 0 1 ${outerR} -${outerR} Z
			M${x + t + (outerR - t)} ${y + t} a${outerR - t} ${outerR - t} 0 0 0 -${outerR - t} ${outerR - t} v${s - 2 * outerR} a${outerR - t} ${outerR - t} 0 0 0 ${outerR - t} ${outerR - t} h${s - 2 * outerR} a${outerR - t} ${outerR - t} 0 0 0 ${outerR - t} -${outerR - t} v-${s - 2 * outerR} a${outerR - t} ${outerR - t} 0 0 0 -${outerR - t} -${outerR - t} Z
		"/>
		<rect x="${innerX}" y="${innerY}" width="${innerS}" height="${innerS}" rx="${innerR}" ry="${innerR}"/>`;
	})
	.join('');

// Embed the favicon as a base64 data URI, on a rounded white plate.
const logoB64 = readFileSync(LOGO).toString('base64');
const plate = (logoModules + 2) * CELL;
const plateX = px(center) + CELL / 2 - plate / 2;
const logoInset = plate * 0.12;
const logoImg = `
	<rect x="${plateX}" y="${plateX}" width="${plate}" height="${plate}" rx="${plate * 0.22}" ry="${plate * 0.22}" fill="#ffffff"/>
	<image x="${plateX + logoInset}" y="${plateX + logoInset}" width="${plate - 2 * logoInset}" height="${plate - 2 * logoInset}" href="data:image/png;base64,${logoB64}" preserveAspectRatio="xMidYMid meet"/>`;

const dimPx = dim * CELL;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dimPx}" height="${dimPx}" viewBox="0 0 ${dimPx} ${dimPx}" shape-rendering="geometricPrecision">
	<rect width="${dimPx}" height="${dimPx}" rx="${CELL * 3}" ry="${CELL * 3}" fill="#ffffff"/>
	<g fill="${DARK}">
		${dots.join('\n\t\t')}
		${eyes}
	</g>
	${logoImg}
</svg>
`;

writeFileSync(OUT, svg);
console.log(`Wrote ${OUT} (${size}x${size} modules, logo ~${logoModules} modules)`);
