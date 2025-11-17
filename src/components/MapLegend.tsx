import React from 'react';
import { PhoneIncoming, PhoneOutgoing, MessageSquare, MapPin } from 'lucide-react';
import {
  INCOMING_CALL_COLOR,
  OUTGOING_CALL_COLOR,
  SMS_COLOR,
  LOCATION_COLOR,
  APPROX_LOCATION_COLOR
} from './mapColors';

type NumberLegendItem = {
  label: string;
  color: string;
};

interface MapLegendProps {
  numberItems?: NumberLegendItem[];
}

const eventLegendItems = [
  { icon: PhoneIncoming, label: 'Appel entrant', color: INCOMING_CALL_COLOR },
  { icon: PhoneOutgoing, label: 'Appel sortant', color: OUTGOING_CALL_COLOR },
  { icon: MessageSquare, label: 'SMS', color: SMS_COLOR },
  { icon: MapPin, label: 'Position', color: LOCATION_COLOR },
  { icon: MapPin, label: 'Localisation approximative', color: APPROX_LOCATION_COLOR }
];

const MapLegend: React.FC<MapLegendProps> = ({ numberItems = [] }) => {
  return (
    <div className="pointer-events-auto max-h-full overflow-y-auto overflow-x-hidden rounded-xl border border-gray-200 bg-white/90 p-4 text-sm text-gray-700 shadow-lg backdrop-blur-md dark:border-gray-700 dark:bg-gray-900/90 dark:text-gray-100">
      <p className="mb-3 border-b border-gray-200 pb-2 text-base font-bold dark:border-gray-700">Légende</p>
      <ul className="space-y-2">
        {eventLegendItems.map(({ icon: Icon, label, color }) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: color }}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ul>
      {numberItems.length > 0 && (
        <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Numéros suivis
          </p>
          <ul className="mt-2 space-y-2 pr-1">
            {numberItems.map((item) => (
              <li
                key={`${item.label}-${item.color}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-100/80 bg-white/70 px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm backdrop-blur-sm dark:border-gray-700/70 dark:bg-gray-800/60 dark:text-gray-200"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                    aria-hidden
                  />
                  {item.label}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Carte
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export type { NumberLegendItem };
export default MapLegend;
