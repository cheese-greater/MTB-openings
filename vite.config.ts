import { execSync } from 'node:child_process';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Build number = total git commits, computed fresh on every build. Version is
// `3.<build>`. Falls back to 3.0 if git isn't available (e.g. a source export).
// The hourly workflow commits scraped conditions, which are not a new version of
// the app, so commits that touched nothing but that file don't count. The
// pathspec is left unquoted deliberately: cmd.exe would pass the quotes through
// to git as part of the path.
const MAJOR = 3;
let build = 0;
try {
	const command = 'git rev-list --count HEAD -- . :!public/trails.json';
	build = parseInt(execSync(command, { encoding: 'utf8' }).trim(), 10) || 0;
} catch {
	// no git / no commits
}
const version = `${MAJOR}.${build}`;

// GitHub Pages serves a project site from /<repo>/, so assets and trails.json
// need that prefix or they 404. Read from the repo name rather than hardcoded so
// a fork publishes under its own name. Everywhere else, including a self-hosted
// copy and dev, stays at the root.
const base = process.env.GITHUB_PAGES === 'true' ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''}/` : '/';

export default defineConfig({
	base,
	define: {
		__APP_VERSION__: JSON.stringify(version)
	},
	plugins: [react()],
	server: {
		// public/trails.json exists as the file Pages publishes, and Vite would
		// happily serve that build-time copy in dev. Proxy it to the scraper
		// instead so `yarn dev` shows live conditions.
		proxy: {
			'/api': 'http://localhost:3000',
			'/trails.json': 'http://localhost:3000'
		}
	}
});
