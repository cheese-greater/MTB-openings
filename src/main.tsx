/* eslint-disable unicorn/filename-case */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import App from './App.tsx';
import { dropStaleDialogEntry } from './closeOnBack';

import './index.css';

// Register the service worker; a changed one takes over and reloads the page.
registerSW({ immediate: true });

// Settle a stale dialog history entry before anything renders; see closeOnBack.ts.
dropStaleDialogEntry();

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>
);
