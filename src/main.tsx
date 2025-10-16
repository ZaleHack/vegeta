import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';
import { setupEncryptedFetch } from './utils/payloadEncryption.ts';
import { NotificationProvider } from './components/NotificationProvider.tsx';
import { QueryClient, QueryClientProvider } from './app/query';

setupEncryptedFetch();

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <NotificationProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </NotificationProvider>
);
