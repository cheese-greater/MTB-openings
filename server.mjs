// The self-hosted server: scrapes on demand (cached for an hour) and serves the
// built frontend. GitHub Pages runs the same app without this file, from a
// trails.json written at build time by scripts/build-data.mjs, so both paths
// answer the same URL with the same shape and the frontend needs no branch.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { getTrailsPayload } from './lib/trails.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 3000;

const app = express();

// /trails.json is what the frontend asks for, and answering it here shadows the
// static file of the same name that the build copies into dist, so a self-hosted
// copy serves live conditions instead of whatever was current at build time.
// /api/trails is the older address for the same payload, kept for anything
// pointed at it.
const sendTrails = async (_req, res) => {
	try {
		res.json(await getTrailsPayload());
	} catch (err) {
		console.error('Fetch failed:', err.message);
		res.status(503).json({ error: 'Could not fetch trail conditions' });
	}
};

app.get('/trails.json', sendTrails);
app.get('/api/trails', sendTrails);

app.use(express.static(path.join(__dirname, 'dist')));

app.use((_req, res) => {
	res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = app.listen(PORT, () => {
	console.log(`CLE MTB -> http://localhost:${PORT}`);
});

// Don't crash with a raw stack trace when the page is already running elsewhere
// (another window, PM2, a service). Explain it and exit cleanly.
server.on('error', (err) => {
	if (err.code === 'EADDRINUSE') {
		console.error(
			`\n⚠️  Port ${PORT} is already in use. The page is probably already running elsewhere.\n` +
				`   Stop that copy first, or start this one on a different port: PORT=3001 yarn start\n`
		);
		process.exit(1);
	}
	throw err;
});
