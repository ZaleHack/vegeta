import React from 'react';
import { PhoneIncoming, PhoneOutgoing, MessageSquare, MapPin } from 'lucide-react';

const MapLegend: React.FC = () => {
  return (
    <div className="absolute bottom-4 right-4 bg-white/90 dark:bg-gray-800/90 p-3 rounded shadow space-y-2 text-gray-800 dark:text-gray-200 text-xs md:text-sm">
      <div className="flex items-center space-x-2">
        <div className="w-4 h-4 rounded-full flex items-center justify-center bg-green-600 text-white">
          <PhoneIncoming size={12} />
        </div>
        <span>Appel entrant</span>
      </div>
      <div className="flex items-center space-x-2">
        <div className="w-4 h-4 rounded-full flex items-center justify-center bg-blue-600 text-white">
          <PhoneOutgoing size={12} />
        </div>
        <span>Appel sortant</span>
      </div>
      <div className="flex items-center space-x-2">
        <div className="w-4 h-4 rounded-full flex items-center justify-center bg-green-600 text-white">
          <MessageSquare size={12} />
        </div>
        <span>SMS</span>
      </div>
      <div className="flex items-center space-x-2">
        <div className="w-4 h-4 rounded-full flex items-center justify-center bg-red-600 text-white">
          <MapPin size={12} />
        </div>
        <span>Position web</span>
      </div>
    </div>
  );
};

export default MapLegend;
