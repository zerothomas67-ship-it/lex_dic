
import React, { useState, useEffect, useRef } from 'react';
import { SupportedLanguage, TranslationResult, HistoryItem, TranslationCache, LANGUAGE_NAMES } from './types';
import { translateWithGemini, generateSpeech, playBase64Audio } from './services/geminiService';
import LanguageSelector from './components/LanguageSelector';
import ExampleCard from './components/ExampleCard';

const COMMON_WORDS = [
  "Hallo", "Danke", "Bitte", "Haus", "Wasser", "Salom", "Rahmat", "Iltimos", "Uy", "Suv",
  "Hello", "Thank you", "Please", "House", "Water", "Привет", "Спасибо", "Пожалуйста", "Дом", "Вода",
  "Lernen", "Maktab", "Work", "Работа", "Zeit", "Vaqt", "Time", "Время"
];

const HISTORY_CATEGORIES = ["All", "Noun", "Verb", "Adjective", "Phrase"];
const SUGGESTION_LIMIT = 5;

const App: React.FC = () => {
  const [query, setQuery] = useState('');
  const [sourceLang, setSourceLang] = useState<SupportedLanguage>('de');
  const [targetLang, setTargetLang] = useState<SupportedLanguage>('uz');
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeFilter, setActiveFilter] = useState("All");
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showMoreSuggestions, setShowMoreSuggestions] = useState(false);
  
  const cacheRef = useRef<TranslationCache>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedHistory = localStorage.getItem('uzger_history_v2');
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    
    const savedCache = sessionStorage.getItem('uzger_cache_v2');
    if (savedCache) cacheRef.current = JSON.parse(savedCache);
  }, []);

  const getFilteredSuggestions = () => {
    if (!query.trim()) return { history: [], common: [] };
    
    const q = query.toLowerCase();
    const historySuggestions = Array.from(new Set<string>(history.map(h => h.term)))
      .filter(term => term.toLowerCase().includes(q));
    
    const commonSuggestions = COMMON_WORDS
      .filter(word => word.toLowerCase().includes(q))
      .filter(word => !historySuggestions.includes(word));

    return {
      history: historySuggestions,
      common: commonSuggestions
    };
  };

  const { history: histSugg, common: commSugg } = getFilteredSuggestions();
  const totalSuggestions = histSugg.length + commSugg.length;
  const visibleHistory = showMoreSuggestions ? histSugg : histSugg.slice(0, SUGGESTION_LIMIT);
  const visibleCommon = showMoreSuggestions ? commSugg : commSugg.slice(0, SUGGESTION_LIMIT - visibleHistory.length);

  const handleTranslate = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const finalQuery = (overrideQuery || query).trim();
    if (!finalQuery) return;

    setShowSuggestions(false);
    setShowMoreSuggestions(false);
    
    const cacheKey = `${sourceLang}_${targetLang}_${finalQuery.toLowerCase()}`;
    if (cacheRef.current[cacheKey]) {
      setResult(cacheRef.current[cacheKey]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const translation = await translateWithGemini(finalQuery, sourceLang, targetLang);
      setResult(translation);
      
      cacheRef.current[cacheKey] = translation;
      sessionStorage.setItem('uzger_cache_v2', JSON.stringify(cacheRef.current));

      const newHistoryItem: HistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        term: finalQuery,
        category: translation.grammar?.partOfSpeech || "Other",
        sourceLang: sourceLang,
        targetLang: targetLang,
        timestamp: Date.now()
      };
      const filteredHistory = history.filter(h => h.term.toLowerCase() !== finalQuery.toLowerCase());
      const updatedHistory = [newHistoryItem, ...filteredHistory.slice(0, 50)];
      setHistory(updatedHistory);
      localStorage.setItem('uzger_history_v2', JSON.stringify(updatedHistory));
    } catch (err) {
      setError("Consultation failed. The library might be temporarily closed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwap = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    if (result) {
      setQuery(result.mainTranslation);
      setResult(null);
    }
  };

  const handleSpeak = async (text: string, lang: SupportedLanguage) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    try {
      const audio = await generateSpeech(text, lang);
      await playBase64Audio(audio);
    } catch (err) {
      console.error("Speech error", err);
    } finally {
      setIsSpeaking(false);
    }
  };

  const filteredHistory = history.filter(item => 
    activeFilter === "All" || item.category === activeFilter
  );

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 selection:bg-red-100 flex flex-col">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-red-900 font-bold text-lg sm:text-2xl tracking-tighter serif">
              LEX<span className="text-slate-300">.</span>
            </div>
            <div className="h-4 w-[1px] bg-slate-200 hidden sm:block"></div>
            <h1 className="text-[9px] sm:text-xs font-bold tracking-[0.2em] text-slate-400 uppercase hidden sm:block">Archive</h1>
          </div>
          <LanguageSelector 
            sourceLang={sourceLang} 
            targetLang={targetLang} 
            onSourceChange={setSourceLang}
            onTargetChange={setTargetLang}
            onSwap={handleSwap}
          />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-12 pb-24 w-full">
        <section className="mb-8 sm:mb-12 relative">
          <form onSubmit={handleTranslate} className="relative group">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => query && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder={`Search in ${LANGUAGE_NAMES[sourceLang]}...`}
              className="w-full bg-white border border-slate-200 pl-4 pr-12 sm:pl-6 sm:pr-16 py-3.5 sm:py-6 rounded-none focus:border-red-900 transition-all text-lg sm:text-2xl serif outline-none shadow-sm group-hover:shadow-md"
            />
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="absolute right-1 sm:right-3 top-1/2 -translate-y-1/2 text-red-900 p-2 hover:bg-red-50 transition-colors disabled:opacity-30"
            >
              {isLoading ? (
                <div className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-red-900/20 border-t-red-900 rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 sm:h-7 sm:w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              )}
            </button>
          </form>

          {showSuggestions && totalSuggestions > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border-x border-b border-slate-100 shadow-2xl z-50 overflow-hidden divide-y divide-slate-50">
              {visibleHistory.length > 0 && (
                <div className="bg-slate-50/50">
                  <div className="px-4 sm:px-6 py-1.5 text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">History</div>
                  {visibleHistory.map((s, i) => (
                    <button
                      key={`hist-${i}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setQuery(s); handleTranslate(undefined, s); }}
                      className="w-full text-left px-4 sm:px-6 py-2.5 sm:py-3 hover:bg-white transition-colors flex items-center gap-3"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-slate-600 serif text-sm sm:text-base truncate">{s}</span>
                    </button>
                  ))}
                </div>
              )}
              {visibleCommon.length > 0 && (
                <div>
                  <div className="px-4 sm:px-6 py-1.5 text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">Common</div>
                  {visibleCommon.map((s, i) => (
                    <button
                      key={`comm-${i}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setQuery(s); handleTranslate(undefined, s); }}
                      className="w-full text-left px-4 sm:px-6 py-2.5 sm:py-3 hover:bg-slate-50 transition-colors flex items-center gap-3"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-slate-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                      </svg>
                      <span className="text-slate-600 serif text-sm sm:text-base truncate">{s}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {result && !isLoading && (
          <div className="animate-in fade-in duration-500 slide-in-from-bottom-2">
            <div className="bg-white border border-slate-100 p-5 sm:p-10 md:p-12 mb-8 shadow-sm relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-8 mb-10">
                <div className="flex-1 w-full">
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold serif text-slate-900 tracking-tight leading-tight break-words">{result.term}</h2>
                    <button 
                      onClick={() => handleSpeak(result.term, sourceLang)}
                      className="p-1.5 text-slate-300 hover:text-red-900 transition-colors flex-shrink-0"
                      disabled={isSpeaking}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 sm:h-6 sm:w-6 ${isSpeaking ? 'animate-pulse text-red-900' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    </button>
                  </div>
                  {result.termPhonetic && (
                    <div className="text-slate-400 text-[11px] sm:text-sm font-medium mb-3 font-mono tracking-tight break-all">[{result.termPhonetic}]</div>
                  )}
                  {result.grammar && (
                    <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.15em] text-slate-400 font-bold flex flex-wrap gap-x-2 sm:gap-x-4 gap-y-1.5 mt-2">
                      <span className="bg-slate-100 px-2 py-0.5 text-slate-600 rounded-sm">{result.grammar.partOfSpeech}</span>
                      {result.grammar.gender && <span className="text-red-900 border-l border-slate-100 pl-2">G: {result.grammar.gender}</span>}
                      {result.grammar.plural && <span className="border-l border-slate-100 pl-2">Pl: {result.grammar.plural}</span>}
                      {result.level && <span className="text-red-900 border-l border-slate-100 pl-2">CEFR: {result.level}</span>}
                    </div>
                  )}
                </div>
                
                <div className="md:text-right border-t md:border-t-0 pt-6 md:pt-0 w-full md:w-auto">
                  <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-2">Translation</div>
                  <div className="flex flex-row md:flex-col items-center md:items-end gap-3 md:gap-1">
                    <div className="text-2xl sm:text-4xl md:text-5xl font-bold serif text-red-900 leading-tight break-words">{result.mainTranslation}</div>
                    <div className="flex flex-col items-start md:items-end">
                      {result.translationPhonetic && (
                        <div className="text-slate-400 text-[11px] sm:text-sm font-medium font-mono break-all">[{result.translationPhonetic}]</div>
                      )}
                      <button 
                        onClick={() => handleSpeak(result.mainTranslation, targetLang)}
                        className="p-1.5 text-slate-300 hover:text-red-900 transition-colors"
                        disabled={isSpeaking}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 mb-10 border-t border-slate-50 pt-8">
                <div>
                  <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-3">{LANGUAGE_NAMES[sourceLang]} Synonyms</div>
                  <div className="flex flex-wrap gap-x-2.5 sm:gap-x-4 gap-y-2">
                    {result.sourceSynonyms?.map((alt, i) => (
                      <span key={i} className="text-slate-600 serif text-lg sm:text-xl">{alt}{i < result.sourceSynonyms!.length - 1 ? ',' : ''}</span>
                    )) || <span className="text-slate-300 italic text-[10px] uppercase tracking-widest">None identified</span>}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-3">{LANGUAGE_NAMES[targetLang]} Alternatives</div>
                  <div className="flex flex-wrap gap-x-2.5 sm:gap-x-4 gap-y-2">
                    {result.alternatives.map((alt, i) => (
                      <span key={i} className="text-slate-600 serif text-lg sm:text-xl">{alt}{i < result.alternatives.length - 1 ? ',' : ''}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-4 border-b border-slate-50 pb-2">Contextual Examples</div>
                <div className="grid grid-cols-1 gap-4">
                  {result.examples.map((ex, idx) => (
                    <ExampleCard key={idx} example={ex} />
                  ))}
                </div>
              </div>

              {result.etymology && (
                <div className="mt-10 pt-6 border-t border-slate-50">
                  <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-3">Origin & Etymology</div>
                  <p className="text-slate-500 serif italic leading-relaxed text-sm sm:text-base">
                    {result.etymology}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="py-16 flex flex-col items-center gap-5">
            <div className="w-8 h-8 sm:w-10 sm:h-10 border-2 border-red-900/10 border-t-red-900 rounded-full animate-spin"></div>
            <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.4em] text-slate-300 font-bold animate-pulse text-center">Consulting Archive...</div>
          </div>
        )}

        <section className="mt-12 sm:mt-16">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 border-b border-slate-100 pb-3 gap-3">
            <h3 className="text-[11px] sm:text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-red-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Recent Records
            </h3>
            
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 sm:pb-0 no-scrollbar scroll-smooth">
              {HISTORY_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveFilter(cat)}
                  className={`flex-shrink-0 px-2.5 py-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all ${activeFilter === cat ? 'bg-red-900 text-white' : 'bg-slate-100 text-slate-400 hover:text-slate-600'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {filteredHistory.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-100 border border-slate-100 shadow-sm">
              {filteredHistory.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { 
                    setQuery(item.term); 
                    setSourceLang(item.sourceLang); 
                    setTargetLang(item.targetLang); 
                    handleTranslate(undefined, item.term); 
                  }}
                  className="bg-white p-4 sm:p-5 text-left hover:bg-slate-50 transition-colors flex items-center justify-between group"
                >
                  <div className="truncate pr-3">
                    <span className="text-slate-800 font-medium serif block truncate text-base">{item.term}</span>
                    <span className="text-[8px] uppercase tracking-[0.15em] text-red-900/50 font-bold">{item.category}</span>
                  </div>
                  <span className="text-[8px] uppercase tracking-widest text-slate-300 group-hover:text-red-900 font-bold whitespace-nowrap border border-slate-50 px-1 rounded-sm">
                    {item.sourceLang.toUpperCase()} → {item.targetLang.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-slate-200">
              <p className="text-slate-300 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em] italic">No archive records found</p>
            </div>
          )}
        </section>
      </main>

      <footer className="mt-auto bg-white border-t border-slate-100 py-5 px-6 sm:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] sm:tracking-[0.3em] text-center sm:text-left">
          Lexicon Archive <span className="text-slate-200">|</span> Polyglot Linguistic System
        </div>
        <div className="flex gap-4 sm:gap-6 items-center flex-shrink-0">
           <div className="text-[9px] text-slate-300 font-medium uppercase tracking-widest hidden md:block">Engineered with Gemini</div>
           <div className="flex gap-1.5">
             <div className="w-1.5 h-1.5 rounded-full bg-red-900"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-slate-100"></div>
             <div className="w-1.5 h-1.5 rounded-full bg-slate-100"></div>
           </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
