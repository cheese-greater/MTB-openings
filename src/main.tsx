/* eslint-disable unicorn/filename-case */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import App from './App.tsx';
import { dropStaleDialogEntry } from './closeOnBack';

import './index.css';

// The service worker built by vite.config.ts, registered at once. When a
// deploy has changed it, the new one takes over and the page reloads itself.
registerSW({ immediate: true });

// A page loaded onto a dialog's history entry (Android brings the installed
// app back from the background this way) settles that entry before anything
// renders; see closeOnBack.ts.
dropStaleDialogEntry();

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>
);
