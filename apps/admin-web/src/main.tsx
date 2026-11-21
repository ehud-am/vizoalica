import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// The terminal's `open` command asks an already-open tab to reload instead of opening another one.
if (typeof EventSource !== 'undefined')
  new EventSource('/api/console/live').addEventListener('reload', () => window.location.reload());
