import React from 'react';

interface PageHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({ icon, title, subtitle }) => {
  return (
    <div>
      <div className="flex items-center space-x-3">
        <div className="p-3 rounded-xl bg-gradient-to-br from-red-500 to-red-700 text-white shadow-md">
          {icon}
        </div>
        <h1 className="text-3xl font-extrabold bg-gradient-to-r from-red-600 to-red-700 bg-clip-text text-transparent">
          {title}
        </h1>
      </div>
      {subtitle && <p className="mt-1 text-gray-600">{subtitle}</p>}
    </div>
  );
};

export default PageHeader;
