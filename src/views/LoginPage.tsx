import React from 'react';

const LoginPage: React.FC = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-2xl">
        <h1 className="text-2xl font-semibold text-slate-900">Connexion à Sora</h1>
        <p className="mt-2 text-sm text-slate-500">Cette page fait partie de la nouvelle architecture basée sur un routeur explicite.</p>
        <form className="mt-8 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase text-slate-500">Identifiant</label>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
              placeholder="votre.identifiant"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-slate-500">Mot de passe</label>
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-slate-900 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/30"
          >
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
