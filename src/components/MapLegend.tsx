import React from 'react';
import { PhoneIncoming, PhoneOutgoing, MessageSquare, MapPin } from 'lucide-react';

type NumberLegendItem = {
  label: string;
  color: string;
};

interface MapLegendProps {
  numberItems?: NumberLegendItem[];
}

const eventLegendItems = [
  { icon: PhoneIncoming, label: 'Appel entrant', color: '#16a34a' },
  { icon: PhoneOutgoing, label: 'Appel sortant', color: '#2563eb' },
  { icon: MessageSquare, label: 'SMS', color: '#16a34a' },
  { icon: MapPin, label: 'Position', color: '#dc2626' },
  { icon: MapPin, label: 'Localisation approximative', color: '#f87171' }
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
              <li key={`${item.label}-${item.color}`} className="flex items-center gap-2">
                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden
                />
                <span className="text-sm font-medium">{item.label}</span>
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
