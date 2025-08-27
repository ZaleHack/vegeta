import React from 'react';

const LoadingSpinner: React.FC = () => (
  <div className="flex justify-center items-center py-10">
    <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

export default LoadingSpinner;
