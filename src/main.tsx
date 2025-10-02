import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';
import { setupEncryptedFetch } from './utils/payloadEncryption.ts';
import { NotificationProvider } from './components/NotificationProvider.tsx';

setupEncryptedFetch();

createRoot(document.getElementById('root')!).render(
  <NotificationProvider>
    <App />
  </NotificationProvider>
);
