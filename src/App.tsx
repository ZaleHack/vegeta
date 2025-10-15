import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './app/layout/AppLayout';
import DashboardPage from './views/DashboardPage';
import SearchPage from './views/search/SearchPage';
import CdrPage from './views/cdr/CdrPage';
import DirectoryPage from './views/directory/DirectoryPage';
import AdminPage from './views/admin/AdminPage';
import LoginPage from './views/LoginPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="recherche" element={<SearchPage />} />
        <Route path="cdr" element={<CdrPage />} />
        <Route path="annuaire" element={<DirectoryPage />} />
        <Route path="administration" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
