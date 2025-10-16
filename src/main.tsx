import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';
import { setupEncryptedFetch } from './utils/payloadEncryption.ts';
import { NotificationProvider } from './components/NotificationProvider.tsx';

setupEncryptedFetch();

createRoot(document.getElementById('root')!).render(
  <NotificationProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </NotificationProvider>
);
