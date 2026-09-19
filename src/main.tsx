import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import './index.css';
import { ServicesProvider } from './app/ServicesProvider';
import { ReloadPrompt } from './app/ReloadPrompt';
import { createAppRouter } from './app/routes';
import { getContainer, initialiseStorage } from './app/container';
import { applyTheme } from './app/theme';

const root = document.getElementById('root');
if (!root) throw new Error('Het element #root ontbreekt in index.html.');

const services = getContainer();

// Apply the stored theme before the first paint, so the app does not flash the
// wrong palette on a cold start.
void services.settings.theme().then(applyTheme);
void initialiseStorage();

createRoot(root).render(
  <StrictMode>
    <ServicesProvider services={services}>
      <RouterProvider router={createAppRouter()} />
      <ReloadPrompt />
    </ServicesProvider>
  </StrictMode>,
);
