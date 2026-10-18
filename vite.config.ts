import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Version is 5.<commit count>, skipping commits that only touched public/trails.json.
const MAJOR = 5;
let build = 0;
try {
	const command = 'git rev-list --count HEAD -- . :!public/trails.json';
	build = parseInt(execSync(command, { encoding: 'utf8' }).trim(), 10) || 0;
} catch {
	// no git / no commits
}
const version = `${MAJOR}.${build}`;

// GitHub Pages serves a project site from /<repo>/; everywhere else stays at the root.
const base = process.env.GITHUB_PAGES === 'true' ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''}/` : '/';

// The share address and repository come from package.json, so the QR code, dialog and footer agree.
const { homepage: siteUrl, repository } = JSON.parse(
	readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { homepage: string; repository: { url: string } };
const repoUrl = repository.url.replace(/\.git$/, '');

export default defineConfig({
	base,
	define: {
		__APP_VERSION__: JSON.stringify(version),
		__REPO_URL__: JSON.stringify(repoUrl),
		__SITE_URL__: JSON.stringify(siteUrl)
	},
	plugins: [
		react(),
		// Installable and offline on the last conditions seen; trails.json is network-first and kept out of the precache.
		VitePWA({
			manifest: {
				background_color: '#282a36',
				description:
					'Is the trail open? Two dozen mountain bike trails around Cleveland on one page, with conditions, weather and directions.',
				display: 'standalone',
				icons: [
					{ sizes: '192x192', src: 'pwa-192.png', type: 'image/png' },
					{ sizes: '512x512', src: 'pwa-512.png', type: 'image/png' },
					{ purpose: 'maskable', sizes: '512x512', src: 'pwa-maskable-512.png', type: 'image/png' }
				],
				name: 'CLE MTB Trails',
				short_name: 'CLE MTB',
				theme_color: '#282a36'
			},
			registerType: 'autoUpdate',
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png}'],
				runtimeCaching: [
					{
						handler: 'NetworkFirst',
						options: {
							cacheName: 'trail-conditions',
							expiration: { maxEntries: 2 },
							networkTimeoutSeconds: 10
						},
						urlPattern: /\/trails\.json$/
					}
				]
			}
		})
	],
	server: {
		// Proxy trails.json to the scraper so yarn dev shows live conditions.
		proxy: {
			'/api': 'http://localhost:3000',
			'/trails.json': 'http://localhost:3000'
		}
	}
});
