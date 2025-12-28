
import React from 'react';
import { SupportedLanguage, LANGUAGE_NAMES } from '../types';

interface LanguageSelectorProps {
  sourceLang: SupportedLanguage;
  targetLang: SupportedLanguage;
  onSourceChange: (lang: SupportedLanguage) => void;
  onTargetChange: (lang: SupportedLanguage) => void;
  onSwap: () => void;
}

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ 
  sourceLang, 
  targetLang, 
  onSourceChange, 
  onTargetChange, 
  onSwap 
}) => {
  const langs: SupportedLanguage[] = ['de', 'uz', 'en', 'ru'];

  return (
    <div className="flex items-center gap-1 sm:gap-2 bg-white border border-slate-200 p-0.5 sm:p-1 rounded-none shadow-sm">
      <select 
        value={sourceLang}
        onChange={(e) => onSourceChange(e.target.value as SupportedLanguage)}
        className="bg-transparent text-[10px] sm:text-[11px] font-bold uppercase tracking-wider sm:tracking-widest px-1 sm:px-3 py-1.5 outline-none cursor-pointer hover:text-red-900 transition-colors max-w-[80px] sm:max-w-none"
      >
        {langs.map(l => (
          <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>
        ))}
      </select>
      
      <button 
        onClick={onSwap}
        className="p-1 sm:p-1.5 hover:bg-slate-50 rounded-full transition-colors text-slate-400 hover:text-red-900"
        title="Swap languages"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 sm:h-4 sm:w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </button>

      <select 
        value={targetLang}
        onChange={(e) => onTargetChange(e.target.value as SupportedLanguage)}
        className="bg-transparent text-[10px] sm:text-[11px] font-bold uppercase tracking-wider sm:tracking-widest px-1 sm:px-3 py-1.5 outline-none cursor-pointer hover:text-red-900 transition-colors max-w-[80px] sm:max-w-none"
      >
        {langs.map(l => (
          <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>
        ))}
      </select>
    </div>
  );
};

export default LanguageSelector;
