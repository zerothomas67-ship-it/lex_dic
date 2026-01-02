
import React from 'react';
import { LanguageDirection } from '../types';

interface LanguageToggleProps {
  direction: LanguageDirection;
  onToggle: () => void;
}

const LanguageToggle: React.FC<LanguageToggleProps> = ({ direction, onToggle }) => {
  const isDeToUz = direction === LanguageDirection.DE_TO_UZ;

  return (
    <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-none border border-slate-100">
      <button 
        onClick={!isDeToUz ? onToggle : undefined}
        className={`px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-all ${isDeToUz ? 'bg-white text-red-900 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
      >
        German
      </button>
      <div className="text-slate-200 px-1">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </div>
      <button 
        onClick={isDeToUz ? onToggle : undefined}
        className={`px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-all ${!isDeToUz ? 'bg-white text-red-900 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
      >
        Uzbek
      </button>
    </div>
  );
};

export default LanguageToggle;
