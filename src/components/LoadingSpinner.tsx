import React from 'react';
import { Bot } from 'lucide-react';

const LoadingSpinner: React.FC = () => (
  <div className="flex flex-col justify-center items-center py-10">
    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    <div className="flex items-center mt-4 text-blue-600">
      <Bot className="w-5 h-5 mr-2" />
      <span className="text-lg font-medium">Thinking...</span>
    </div>
  </div>
);

export default LoadingSpinner;
