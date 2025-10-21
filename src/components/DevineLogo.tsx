import React from 'react';

interface DevineLogoProps {
  className?: string;
}

const DevineLogo: React.FC<DevineLogoProps> = ({ className }) => (
  <svg
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M16 24 L44 12"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <path
      d="M16 24 L48 48"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <path
      d="M44 12 L48 48"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <circle cx="16" cy="24" r="6" fill="currentColor" />
    <circle cx="44" cy="12" r="6" fill="currentColor" />
    <circle cx="48" cy="48" r="6" fill="currentColor" />
  </svg>
);

export default DevineLogo;
