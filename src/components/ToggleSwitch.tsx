import React from 'react';

interface ToggleSwitchProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ label, checked, onChange }) => {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="flex items-center gap-2 mr-3">{label}</span>
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="relative w-11 h-6 bg-gray-200 rounded-full peer peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 dark:bg-gray-700 peer-checked:bg-blue-600">
        <div className="absolute top-[2px] left-[2px] h-5 w-5 bg-white rounded-full border border-gray-300 transition peer-checked:translate-x-full peer-checked:border-white"></div>
      </div>
    </label>
  );
};

export default ToggleSwitch;
