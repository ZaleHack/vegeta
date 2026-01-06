import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  Activity,
  AlertTriangle,
  BellRing,
  ClipboardList,
  MapPin,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import CdrMap from '../../components/CdrMap';
import { useNotifications } from '../../components/NotificationProvider';

type CdrPoint = ComponentProps<typeof CdrMap>['points'][number];
type CdrContactSummary = NonNullable<ComponentProps<typeof CdrMap>['contactSummaries']>[number];

const REFRESH_INTERVAL_MS = 10_000;

const GeofencingPage = () => {
  const { notifyInfo, notifyWarning } = useNotifications();
  const [phoneInput, setPhoneInput] = useState('');
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [points, setPoints] = useState<CdrPoint[]>([]);
  const [contactSummaries, setContactSummaries] = useState<CdrContactSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [liveTracking, setLiveTracking] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [zoneMode, setZoneMode] = useState(false);

  const formattedLastUpdate = useMemo(() => {
    if (!lastUpdatedAt) return null;
    try {
      return new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(lastUpdatedAt));
    } catch (error) {
      return lastUpdatedAt;
    }
  }, [lastUpdatedAt]);

  const fetchRealtimeCdr = useCallback(
    async (identifier: string, options: { silent?: boolean } = {}) => {
      const trimmed = identifier.trim();
      if (!trimmed) return;

      const { silent = false } = options;
      if (!silent) {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams({ phone: trimmed });
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const response = await fetch(`/api/cdr/realtime/search?${params.toString()}`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' }
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'Erreur lors de la recherche');
        }

        setPoints(Array.isArray(data.path) ? data.path : []);
        setContactSummaries(Array.isArray(data.contacts) ? data.contacts : []);
        setLastUpdatedAt(new Date().toISOString());
        setErrorMessage('');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erreur lors du chargement temps réel.';
        setErrorMessage(message);
        notifyWarning(message);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [notifyWarning]
  );

  const handleStartTracking = () => {
    const trimmed = phoneInput.trim();
    if (!trimmed) {
      notifyInfo('Veuillez saisir un numéro de téléphone à surveiller.');
      return;
    }
    setTrackingNumber(trimmed);
  };

  useEffect(() => {
    if (!trackingNumber) return;
    fetchRealtimeCdr(trackingNumber);
  }, [fetchRealtimeCdr, trackingNumber]);

  useEffect(() => {
    if (!trackingNumber || !liveTracking) return;

    const interval = window.setInterval(() => {
      fetchRealtimeCdr(trackingNumber, { silent: true });
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [fetchRealtimeCdr, liveTracking, trackingNumber]);

  const hasResults = points.length > 0;

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl shadow-blue-500/10 backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/70">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Geofencing</p>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
              Surveillez les zones sensibles en temps réel
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-300">
              Saisissez un numéro, dessinez une zone personnalisée et déclenchez des alertes dès qu’un appareil entre
              ou reste dans l’aire surveillée.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-blue-50/70 px-4 py-2 text-xs font-semibold text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-100">
              <Activity className="h-4 w-4" />
              {liveTracking ? 'Suivi temps réel actif' : 'Suivi temps réel en pause'}
            </span>
            {formattedLastUpdate && (
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/80 px-4 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200">
                <RefreshCw className="h-4 w-4" />
                Mise à jour {formattedLastUpdate}
              </span>
            )}
          </div>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6 rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-lg dark:border-slate-700/60 dark:bg-slate-900/70">
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 text-xs text-slate-600 shadow-inner dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-200">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-blue-500/10 p-2 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                <ClipboardList className="h-4 w-4" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Plan de surveillance</p>
                <p>
                  Configurez une zone (polygone, cercle ou rectangle), nommez-la, puis activez les alertes en temps
                  réel pour chaque numéro suivi.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Étape 1</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Numéro à surveiller</p>
            </div>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                value={phoneInput}
                onChange={(event) => setPhoneInput(event.target.value)}
                placeholder="Ex : 221771234567"
                className="w-full rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-3 text-sm font-medium text-slate-700 shadow-inner focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={handleStartTracking}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                <BellRing className="h-4 w-4" />
                Lancer le suivi
              </button>
            </div>
            {trackingNumber && (
              <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/80 px-4 py-3 text-xs text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-200">
                Numéro suivi : <span className="font-semibold">{trackingNumber}</span>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Étape 2</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Dessiner la zone</p>
            </div>
            <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 text-xs text-slate-600 shadow-inner dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-200">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-blue-500/10 p-2 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Tracer sur la carte</p>
                  <p>
                    Sélectionnez le type de zone dans le panneau de la carte puis dessinez-la directement sur la
                    carte.
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setZoneMode(true)}
              disabled={!trackingNumber}
              className="inline-flex items-center justify-center rounded-full border border-slate-200/70 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200"
            >
              {zoneMode ? 'Mode dessin actif' : 'Activer le mode dessin'}
            </button>
            {!trackingNumber && (
              <p className="text-xs text-slate-500 dark:text-slate-300">
                Le mode dessin s’active après avoir lancé le suivi d’un numéro.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Étape 3</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Nommer &amp; enregistrer</p>
            </div>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-200">
              <li>Ajoutez un nom clair (Maison, Bureau, Plateau Dakar).</li>
              <li>Choisissez le type d’alerte (entrée ou présence continue).</li>
              <li>Définissez la fréquence de notification et les canaux souhaités.</li>
            </ul>
            <p className="text-xs text-slate-500 dark:text-slate-300">
              Les surveillances enregistrées apparaissent automatiquement dans le tableau de la carte.
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Étape 4</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Détection &amp; alertes</p>
            </div>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-200">
              <li>Détection automatique des entrées dans la zone.</li>
              <li>Alertes si le numéro reste dans la zone définie.</li>
              <li>Historique et états actifs accessibles depuis la carte.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={liveTracking}
                onChange={(event) => setLiveTracking(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Activer le suivi temps réel
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-300">
              Les données proviennent de la table <span className="font-semibold">cdr_temps_reel</span> et se mettent à
              jour automatiquement.
            </p>
          </div>

          <div className="rounded-2xl border border-blue-200/70 bg-blue-50/80 p-4 text-xs text-blue-700 shadow-inner dark:border-blue-400/40 dark:bg-blue-500/10 dark:text-blue-100">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-blue-500/10 p-2 text-blue-600 dark:bg-blue-500/20 dark:text-blue-200">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-semibold">Confidentialité</p>
                <p>
                  Chaque zone est visible et modifiable uniquement par l’utilisateur qui l’a créée. Les autres comptes
                  ne peuvent ni consulter ni éditer vos surveillances.
                </p>
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-2xl border border-rose-300/60 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <span>{errorMessage}</span>
              </div>
            </div>
          )}
        </div>

        <div className="relative min-h-[480px] overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-xl dark:border-slate-700/60 dark:bg-slate-900">
          {trackingNumber && hasResults && (
            <CdrMap
              points={points}
              contactSummaries={contactSummaries}
              showRoute={false}
              mapVariant="geofencing"
              zoneMode={zoneMode}
              onZoneModeChange={setZoneMode}
              onZoneCreated={() => setZoneMode(false)}
              monitoredNumbers={[trackingNumber]}
            />
          )}
          {trackingNumber && !hasResults && !loading && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-600 dark:text-slate-300">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-100">Aucune localisation trouvée</p>
              <p>
                Les enregistrements temps réel ne contiennent pas encore de points pour ce numéro. Réessayez dans
                quelques instants.
              </p>
            </div>
          )}
          {!trackingNumber && (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-sm text-slate-600 dark:text-slate-300">
              <BellRing className="h-8 w-8 text-blue-500" />
              <p className="font-semibold text-slate-800 dark:text-slate-100">Lancez un suivi</p>
              <p>
                Entrez un numéro puis démarrez le suivi pour afficher la carte et configurer vos zones de geofencing.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default GeofencingPage;
