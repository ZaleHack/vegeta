import React from 'react';
import { Bot, Loader2 } from 'lucide-react';

const LoadingSpinner: React.FC = () => (
  <div className="flex flex-col justify-center items-center py-10">
    <Loader2 className="w-12 h-12 animate-spin text-red-600" />
    <div className="flex items-center mt-4 text-red-600">
      <Bot className="w-5 h-5 mr-2" />
      <span className="text-lg font-medium">Recherche parmi des millions de données...</span>
    </div>
  </div>
);

export default LoadingSpinner;
