
import React, { useState } from 'react';
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
  const [activePicker, setActivePicker] = useState<'source' | 'target' | null>(null);

  const languages: SupportedLanguage[] = ['de', 'uz', 'en', 'ru'];

  const getLangCode = (lang: SupportedLanguage) => {
    const codes: Record<SupportedLanguage, string> = { de: 'GER', uz: 'UZB', en: 'ENG', ru: 'RUS' };
    return codes[lang];
  };

  const handleSelect = (lang: SupportedLanguage) => {
    if (activePicker === 'source') {
      onSourceChange(lang);
    } else if (activePicker === 'target') {
      onTargetChange(lang);
    }
    setActivePicker(null);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button 
          onClick={() => setActivePicker(activePicker === 'source' ? null : 'source')}
          className={`px-4 py-2 border border-stone-200 bg-white shadow-sm rounded-sm text-[10px] font-black uppercase tracking-widest transition-all ${activePicker === 'source' ? 'border-[#7c1a1a] ring-1 ring-[#7c1a1a]/10' : 'hover:border-stone-400'}`}
        >
          {getLangCode(sourceLang)}
        </button>
        {activePicker === 'source' && (
          <div className="absolute top-full left-0 mt-2 bg-white border border-stone-100 shadow-xl z-[100] min-w-[120px] animate-in fade-in slide-in-from-top-2 duration-200">
            {languages.map((lang) => (
              <button
                key={lang}
                onClick={() => handleSelect(lang)}
                className={`w-full text-left px-5 py-3 text-[9px] font-bold uppercase tracking-widest hover:bg-stone-50 transition-colors ${sourceLang === lang ? 'text-[#7c1a1a] bg-stone-50/50' : 'text-stone-500'}`}
              >
                {LANGUAGE_NAMES[lang]}
              </button>
            ))}
          </div>
        )}
      </div>

      <button 
        onClick={onSwap}
        className="text-stone-300 hover:text-[#7c1a1a] transition-all flex items-center justify-center hover:scale-110 active:rotate-180 duration-500 mx-1"
        title="Swap Languages"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </button>

      <div className="relative">
        <button 
          onClick={() => setActivePicker(activePicker === 'target' ? null : 'target')}
          className={`px-4 py-2 border border-stone-200 bg-white shadow-sm rounded-sm text-[10px] font-black uppercase tracking-widest transition-all ${activePicker === 'target' ? 'border-[#7c1a1a] ring-1 ring-[#7c1a1a]/10' : 'hover:border-stone-400'}`}
        >
          {getLangCode(targetLang)}
        </button>
        {activePicker === 'target' && (
          <div className="absolute top-full right-0 mt-2 bg-white border border-stone-100 shadow-xl z-[100] min-w-[120px] animate-in fade-in slide-in-from-top-2 duration-200">
            {languages.map((lang) => (
              <button
                key={lang}
                onClick={() => handleSelect(lang)}
                className={`w-full text-left px-5 py-3 text-[9px] font-bold uppercase tracking-widest hover:bg-stone-50 transition-colors ${targetLang === lang ? 'text-[#7c1a1a] bg-stone-50/50' : 'text-stone-500'}`}
              >
                {LANGUAGE_NAMES[lang]}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {activePicker && (
        <div 
          className="fixed inset-0 z-[90]" 
          onClick={() => setActivePicker(null)}
        />
      )}
    </div>
  );
};

export default LanguageSelector;
