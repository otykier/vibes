import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Strip tracking params (e.g. ?fbclid=...) from the URL
if (window.location.search) {
  window.history.replaceState(null, '', window.location.pathname + window.location.hash);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
