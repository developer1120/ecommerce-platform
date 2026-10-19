import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource-variable/manrope';
import './styles/global.css';
import { configureApiFromSearch } from './api/client';
import { App } from './App';
import { AppErrorBoundary } from './app/AppErrorBoundary';

// In development, ?latency=1500 or ?fail=0.5 slows down or breaks the pretend API.
if (import.meta.env.DEV) configureApiFromSearch(window.location.search);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
