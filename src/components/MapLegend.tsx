import React from 'react';
import { PhoneIncoming, PhoneOutgoing, MessageSquare, MapPin } from 'lucide-react';

const MapLegend: React.FC = () => {
  const legendItems = [
    { icon: PhoneIncoming, label: 'Appel entrant', color: 'bg-green-600' },
    { icon: PhoneOutgoing, label: 'Appel sortant', color: 'bg-blue-600' },
    { icon: MessageSquare, label: 'SMS', color: 'bg-green-600' },
    { icon: MapPin, label: 'Position web', color: 'bg-red-600' }
  ];

  return (
    <div className="absolute bottom-4 right-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md px-4 py-2 rounded-lg shadow-lg flex items-center space-x-4 text-gray-800 dark:text-gray-200 text-sm md:text-base">
      {legendItems.map(({ icon: Icon, label, color }) => (
        <div key={label} className="flex items-center space-x-2">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${color} text-white`}>
            <Icon size={14} />
          </div>
          <span className="whitespace-nowrap font-medium">{label}</span>
        </div>
      ))}
    </div>
  );
};

export default MapLegend;
