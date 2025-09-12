import React from 'react';

interface ToggleSwitchProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /**
   * Tailwind classes applied when the toggle is checked. Should include
   * `peer-checked:bg-*` (and dark variant if needed).
   */
  activeColor?: string;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  label,
  checked,
  onChange,
  activeColor = 'peer-checked:bg-blue-600 dark:peer-checked:bg-blue-500'
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="flex items-center gap-2 mr-3">{label}</span>
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        onChange={handleChange}
      />
      <div
        className={`relative w-11 h-6 rounded-full bg-gray-200 dark:bg-gray-700 transition-colors peer peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 ${activeColor}`}
      >
        <div className="absolute top-[2px] left-[2px] h-5 w-5 rounded-full border border-gray-300 bg-white transition-transform duration-300 peer-checked:translate-x-full peer-checked:border-white"></div>
      </div>
    </label>
  );
};

export default ToggleSwitch;
