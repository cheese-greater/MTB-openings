/* eslint-disable check-file/filename-naming-convention */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import App from './App.tsx';

import './index.css';

// The service worker built by vite.config.ts, registered at once. When a
// deploy has changed it, the new one takes over and the page reloads itself.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>
);
