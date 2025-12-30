
import React, { useState, useEffect, useRef } from 'react';
import { SupportedLanguage, TranslationResult, HistoryItem, TranslationCache, LANGUAGE_NAMES, QuizQuestion, QuizSession } from './types';
import { translateWithGemini, generateSpeech, playBase64Audio, generateQuizFromHistory } from './services/geminiService';
import { syncUserWithBackend, saveSearchToBackend, fetchUserHistory, addXpToUser, fetchUserProfile } from './services/userService';
import LanguageSelector from './components/LanguageSelector';
import ExampleCard from './components/ExampleCard';

const STORAGE_KEY_HISTORY = 'uzger_history_v4';
const STORAGE_KEY_CACHE = 'uzger_cache_v4';
const STORAGE_KEY_AUTO_AUDIO = 'uzger_auto_audio';

const App: React.FC = () => {
  const [view, setView] = useState<'dictionary' | 'arena'>('dictionary');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<HistoryItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sourceLang, setSourceLang] = useState<SupportedLanguage>('de');
  const [targetLang, setTargetLang] = useState<SupportedLanguage>('uz');
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [tgUser, setTgUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [quiz, setQuiz] = useState<QuizSession | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [arenaError, setArenaError] = useState<string | null>(null);
  const [autoAudioEnabled, setAutoAudioEnabled] = useState(true);

  const cacheRef = useRef<TranslationCache>({});
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const localHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (localHistory) setHistory(JSON.parse(localHistory));

    const savedCache = sessionStorage.getItem(STORAGE_KEY_CACHE);
    if (savedCache) cacheRef.current = JSON.parse(savedCache);

    const savedAutoAudio = localStorage.getItem(STORAGE_KEY_AUTO_AUDIO);
    if (savedAutoAudio !== null) setAutoAudioEnabled(savedAutoAudio === 'true');

    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      const user = tg.initDataUnsafe?.user;
      if (user) {
        setTgUser(user);
        initUserData(user);
      }
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_AUTO_AUDIO, String(autoAudioEnabled));
  }, [autoAudioEnabled]);

  useEffect(() => {
    if (query.trim().length > 0) {
      const filtered = history.filter(item => 
        item.term.toLowerCase().startsWith(query.toLowerCase())
      ).slice(0, 5);
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [query, history]);

  const initUserData = async (user: any) => {
    try {
      await syncUserWithBackend({
        telegramId: user.id.toString(),
        name: `${user.first_name} ${user.last_name || ''}`.trim(),
        username: user.username
      });
      const profile = await fetchUserProfile(user.id.toString());
      setUserProfile(profile);
      
      const serverHistory = await fetchUserHistory(user.id.toString());
      if (serverHistory && serverHistory.length > 0) {
        const mapped: HistoryItem[] = serverHistory.map(h => ({
          id: h.id.toString(),
          term: h.term,
          translation: h.translation,
          category: h.category || "Other",
          sourceLang: h.sourceLang as SupportedLanguage,
          targetLang: h.targetLang as SupportedLanguage,
          timestamp: new Date(h.timestamp).getTime()
        }));
        
        setHistory(prev => {
          const combined = [...prev, ...mapped];
          const unique = Array.from(new Map(combined.map(item => [item.term.toLowerCase(), item])).values());
          const sorted = unique.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
          localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(sorted));
          return sorted;
        });
      }
    } catch (err) {
      console.error("Failed to sync user data:", err);
    }
  };

  const handleSpeak = async (text: string, lang: SupportedLanguage, id: string) => {
    if (isSpeaking) return;
    setIsSpeaking(id);
    try {
      const audio = await generateSpeech(text, lang);
      await playBase64Audio(audio);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSpeaking(null);
    }
  };

  const handleTranslate = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const finalQuery = (overrideQuery || query).trim();
    if (!finalQuery) return;
    
    setShowSuggestions(false);
    setQuery(finalQuery);

    const cacheKey = `${sourceLang}_${targetLang}_${finalQuery.toLowerCase()}`;
    if (cacheRef.current[cacheKey]) {
      const cachedResult = cacheRef.current[cacheKey];
      setResult(cachedResult);
      updateHistoryLocally(finalQuery, cachedResult);
      if (autoAudioEnabled) handleSpeak(cachedResult.term, sourceLang, 'term-auto');
      return;
    }

    setIsLoading(true);
    try {
      const translation = await translateWithGemini(finalQuery, sourceLang, targetLang);
      setResult(translation);
      cacheRef.current[cacheKey] = translation;
      sessionStorage.setItem(STORAGE_KEY_CACHE, JSON.stringify(cacheRef.current));
      
      updateHistoryLocally(finalQuery, translation);
      if (autoAudioEnabled) handleSpeak(translation.term, sourceLang, 'term-auto');

      if (tgUser) {
        saveSearchToBackend({
          telegramId: tgUser.id.toString(),
          term: finalQuery,
          translation: translation.mainTranslation,
          sourceLang,
          targetLang,
          category: translation.grammar?.partOfSpeech || "Other"
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateHistoryLocally = (term: string, translation: TranslationResult) => {
    const newEntry: HistoryItem = {
      id: Date.now().toString(),
      term: term,
      translation: translation.mainTranslation,
      category: translation.grammar?.partOfSpeech || "Other",
      sourceLang,
      targetLang,
      timestamp: Date.now()
    };

    setHistory(prev => {
      const filtered = prev.filter(h => h.term.toLowerCase() !== term.toLowerCase());
      const updated = [newEntry, ...filtered].slice(0, 50);
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
      return updated;
    });
  };

  const startQuiz = async () => {
    if (history.length === 0) {
      const tg = (window as any).Telegram?.WebApp;
      const msg = "Please search for some words first to populate the Arena!";
      if (tg) tg.showAlert(msg); else alert(msg);
      return;
    }
    setIsLoading(true);
    setArenaError(null);
    setView('arena');
    try {
      const questions = await generateQuizFromHistory(history);
      setQuiz({ questions, currentIdx: 0, score: 0, isFinished: false });
    } catch (err) {
      setArenaError(err instanceof Error ? err.message : "Failed to generate arena.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswer = (option: string) => {
    if (selectedOption || !quiz) return;
    setSelectedOption(option);
    setShowExplanation(true);
    const isCorrect = option === quiz.questions[quiz.currentIdx].correctAnswer;
    if (isCorrect) setQuiz({ ...quiz, score: quiz.score + 20 });
    const tg = (window as any).Telegram?.WebApp;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred(isCorrect ? 'success' : 'error');
  };

  const nextQuestion = async () => {
    if (!quiz) return;
    if (quiz.currentIdx === quiz.questions.length - 1) {
      setQuiz({ ...quiz, isFinished: true });
      if (tgUser) {
        await addXpToUser(tgUser.id.toString(), quiz.score);
        const profile = await fetchUserProfile(tgUser.id.toString());
        setUserProfile(profile);
      }
    } else {
      setQuiz({ ...quiz, currentIdx: quiz.currentIdx + 1 });
      setSelectedOption(null);
      setShowExplanation(false);
    }
  };

  const renderDictionary = () => (
    <>
      {userProfile && (
        <section className="mb-8 bg-slate-900 text-white p-8 shadow-2xl border-l-8 border-red-900 animate-in fade-in slide-in-from-left-4 duration-700">
          <div className="flex justify-between items-center">
            <div className="space-y-1">
              <p className="text-[11px] uppercase font-bold tracking-[0.3em] text-slate-500">Linguistic Master</p>
              <h2 className="text-3xl font-bold serif tracking-tight">{userProfile.name}</h2>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase font-bold tracking-[0.3em] text-slate-500 mb-1">Lexical Progress</p>
              <div className="flex items-baseline gap-2 justify-end">
                <span className="text-5xl font-bold serif text-red-500 tabular-nums">{userProfile.xp}</span>
                <span className="text-xs font-bold text-slate-400">XP</span>
              </div>
            </div>
          </div>
          <div className="mt-6 w-full bg-slate-800 h-2 rounded-full overflow-hidden shadow-inner">
             <div className="bg-red-900 h-full transition-all duration-1000 ease-out" style={{ width: `${Math.min(100, (userProfile.xp % 1000) / 10)}%` }}></div>
          </div>
        </section>
      )}

      <div className="flex justify-end mb-4 items-center gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Auto-Pronounce</span>
        <button 
          onClick={() => setAutoAudioEnabled(!autoAudioEnabled)}
          className={`relative w-10 h-5 transition-colors rounded-full ${autoAudioEnabled ? 'bg-red-900' : 'bg-slate-200'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${autoAudioEnabled ? 'left-5.5' : 'left-0.5'}`} style={{ left: autoAudioEnabled ? 'calc(100% - 1.25rem)' : '0.125rem' }}></div>
        </button>
      </div>

      <section className="mb-10 relative" ref={searchRef}>
        <form onSubmit={handleTranslate} className="relative group z-30">
          <input
            type="text"
            value={query}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && setShowSuggestions(suggestions.length > 0)}
            placeholder={`Enter term to translate...`}
            className="w-full bg-white border border-slate-200 pl-4 pr-12 sm:pl-8 sm:pr-20 py-5 sm:py-7 rounded-none focus:border-red-900 transition-all text-xl sm:text-3xl serif outline-none shadow-sm group-hover:shadow-lg placeholder:text-slate-300"
          />
          <button type="submit" disabled={isLoading || !query.trim()} className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 text-red-900 p-3 hover:scale-110 transition-transform">
            {isLoading ? <div className="w-6 h-6 border-3 border-red-900/20 border-t-red-900 rounded-full animate-spin" /> : <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>}
          </button>
        </form>

        {showSuggestions && (
          <div className="absolute top-full left-0 w-full bg-white border-x border-b border-slate-100 shadow-2xl z-20 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
            {suggestions.map((s) => (
              <button 
                key={s.id}
                onClick={() => handleTranslate(undefined, s.term)}
                className="w-full text-left p-4 hover:bg-slate-50 flex items-center justify-between group transition-colors border-b border-slate-50 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-4 h-4 text-slate-300 group-hover:text-red-900" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span className="serif text-lg text-slate-700 group-hover:text-black">{s.term}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{s.sourceLang} → {s.targetLang}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {result && !isLoading && (
        <div className="bg-white border border-slate-100 p-6 sm:p-12 mb-10 shadow-xl animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex flex-col md:flex-row md:justify-between items-baseline gap-6 mb-6">
            <div className="flex items-center gap-4 flex-wrap">
              <h2 className="text-5xl sm:text-7xl font-bold serif text-slate-900 break-words tracking-tight">{result.term}</h2>
              <div className="flex gap-2 self-start mt-3">
                {sourceLang !== 'uz' && result.sourceLevel && (
                  <span className="bg-slate-900 text-white px-2 py-0.5 text-[10px] font-bold rounded-sm uppercase tracking-widest whitespace-nowrap">
                    {sourceLang.toUpperCase()}: {result.sourceLevel}
                  </span>
                )}
                <button 
                  onClick={() => handleSpeak(result.term, sourceLang, 'source-main')} 
                  className={`transition-all p-1.5 rounded-full hover:bg-slate-50 ${isSpeaking === 'source-main' ? 'text-red-900 scale-110' : 'text-slate-200 hover:text-red-900'}`}
                >
                  <svg className={`h-6 w-6 ${isSpeaking === 'source-main' ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="md:text-right w-full md:w-auto flex flex-col md:items-end">
              <span className="text-[11px] uppercase tracking-[0.4em] text-slate-300 font-bold block mb-2">Lexical Result</span>
              <div className="flex items-center gap-4 justify-end flex-wrap">
                <div className="flex gap-2 items-center">
                  <button 
                    onClick={() => handleSpeak(result.mainTranslation, targetLang, 'target-main')} 
                    className={`transition-all p-1.5 rounded-full hover:bg-slate-50 ${isSpeaking === 'target-main' ? 'text-red-900 scale-110' : 'text-slate-200 hover:text-red-900'}`}
                  >
                    <svg className={`h-6 w-6 ${isSpeaking === 'target-main' ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  </button>
                  {targetLang !== 'uz' && result.targetLevel && (
                    <span className="bg-red-900 text-white px-2 py-0.5 text-[10px] font-bold rounded-sm uppercase tracking-widest whitespace-nowrap">
                      {targetLang.toUpperCase()}: {result.targetLevel}
                    </span>
                  )}
                </div>
                <h3 className="text-5xl sm:text-7xl font-bold serif text-red-900 tracking-tight">{result.mainTranslation}</h3>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-8 gap-y-3 mb-6 border-b border-slate-50 pb-6">
            <span className="bg-slate-50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600 border border-slate-100">
              {result.grammar?.partOfSpeech}
            </span>
            {result.grammar?.gender && (
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-900 self-center">
                GENDER: {result.grammar.gender.toUpperCase()}
              </span>
            )}
            {result.grammar?.plural && (
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 self-center">
                PLURAL: {result.grammar.plural.toUpperCase()}
              </span>
            )}
          </div>

          {result.grammar?.notes && (
            <div className="mb-10 bg-slate-50/50 p-4 border-l-2 border-red-100">
              <p className="text-[12px] italic serif text-slate-500 leading-relaxed">
                <span className="font-bold text-red-900 not-italic mr-2">ANNOTATION:</span> {result.grammar.notes}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 mb-16">
            {result.sourceSynonyms && result.sourceSynonyms.length > 0 && (
              <div>
                <span className="text-[11px] uppercase tracking-[0.3em] text-slate-300 font-bold block mb-6">{LANGUAGE_NAMES[sourceLang].toUpperCase()} ALTERNATIVES</span>
                <p className="text-2xl serif text-slate-700 leading-relaxed italic">
                  {result.sourceSynonyms.join(', ')}
                </p>
              </div>
            )}
            {result.alternatives && result.alternatives.length > 0 && (
              <div>
                <span className="text-[11px] uppercase tracking-[0.3em] text-slate-300 font-bold block mb-6">{LANGUAGE_NAMES[targetLang].toUpperCase()} ALTERNATIVES</span>
                <p className="text-2xl serif text-slate-700 leading-relaxed italic">
                  {result.alternatives.join(', ')}
                </p>
              </div>
            )}
          </div>
          
          <div className="space-y-10">
            <h4 className="text-[11px] uppercase font-bold text-slate-300 border-b border-slate-100 pb-3 tracking-[0.5em]">LITERARY & CONTEXTUAL USAGE</h4>
            <div className="space-y-8">
              {result.examples.map((ex, i) => <ExampleCard key={i} example={ex} />)}
            </div>
          </div>
        </div>
      )}

      <section>
        <div className="flex justify-between items-center mb-8 border-b border-slate-200 pb-4">
          <h3 className="text-sm font-bold uppercase tracking-[0.3em] flex items-center gap-3 text-slate-500">
            <svg className="h-5 w-5 text-red-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            LINGUISTIC HISTORY
          </h3>
          <button 
            onClick={startQuiz} 
            className="bg-red-900 text-white px-8 py-3 text-[11px] font-bold uppercase tracking-[0.2em] hover:bg-black transition-all shadow-xl flex items-center gap-3 active:scale-95"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
            START ARENA
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {history.length > 0 ? history.map(item => (
            <button key={item.id} onClick={() => handleTranslate(undefined, item.term)} className="bg-white p-6 text-left border border-slate-100 hover:border-red-900 hover:shadow-lg transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <svg className="w-4 h-4 text-red-900" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M9 5l7 7-7 7" strokeWidth={2}/></svg>
              </div>
              <span className="text-slate-800 font-bold serif block truncate text-xl mb-1 group-hover:text-red-900 transition-colors">{item.term}</span>
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">{item.sourceLang.toUpperCase()} → {item.targetLang.toUpperCase()}</span>
                <span className="text-[10px] italic text-slate-300 font-serif truncate max-w-[50%]">{item.translation}</span>
              </div>
            </button>
          )) : (
            <div className="col-span-full bg-white py-24 text-center border-2 border-dashed border-slate-100">
              <p className="text-slate-300 text-[11px] font-bold uppercase tracking-[0.4em] italic">The linguistic archive is currently empty.</p>
            </div>
          )}
        </div>
      </section>
    </>
  );

  const renderArena = () => {
    if (isLoading) return (
      <div className="py-32 flex flex-col items-center justify-center space-y-8">
        <div className="w-16 h-16 border-4 border-red-900/20 border-t-red-900 rounded-full animate-spin" />
        <div className="text-center text-slate-400 uppercase tracking-[0.6em] animate-pulse font-bold text-sm">Summoning the Lexical Arena...</div>
      </div>
    );
    
    if (arenaError) {
      return (
        <div className="bg-white border border-slate-100 p-16 text-center animate-in zoom-in duration-300 shadow-2xl">
          <div className="text-7xl mb-6">🏛️</div>
          <h2 className="text-4xl font-bold serif mb-4 text-slate-900">Arena Error</h2>
          <p className="text-slate-500 mb-10 text-lg leading-relaxed">{arenaError}</p>
          <button onClick={() => setView('dictionary')} className="bg-red-900 text-white px-12 py-4 font-bold uppercase tracking-widest hover:bg-black transition-all shadow-xl active:scale-95">Return to Archive</button>
        </div>
      );
    }

    if (!quiz) return null;

    if (quiz.isFinished) {
      return (
        <div className="bg-white border border-slate-100 p-16 text-center animate-in zoom-in duration-300 shadow-2xl max-w-2xl mx-auto">
          <div className="text-8xl mb-8">🏆</div>
          <h2 className="text-5xl font-bold serif mb-4 tracking-tight">Challenge Conquered</h2>
          <p className="text-slate-500 mb-12 text-xl">Your mastery has increased by <span className="text-red-900 font-bold text-3xl tabular-nums">{quiz.score} XP</span></p>
          <button onClick={() => { setView('dictionary'); setQuiz(null); }} className="bg-red-900 text-white px-12 py-5 font-bold uppercase tracking-widest hover:bg-black transition-all shadow-2xl active:scale-95 text-sm">Return to the Lexicon</button>
        </div>
      );
    }

    const q = quiz.questions[quiz.currentIdx];
    return (
      <div className="max-w-4xl mx-auto py-6">
        <div className="flex justify-between items-center mb-12">
          <button onClick={() => { setView('dictionary'); setQuiz(null); }} className="text-slate-400 hover:text-red-900 font-bold text-[11px] uppercase tracking-[0.3em] flex items-center gap-3 transition-colors active:scale-95">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg> EXIT ARENA
          </button>
          <div className="flex flex-col items-end">
            <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400 mb-2">PROGRESS: {quiz.currentIdx + 1} / {quiz.questions.length}</div>
            <div className="w-32 h-1 bg-slate-100 rounded-full overflow-hidden">
               <div className="bg-red-900 h-full transition-all duration-500" style={{ width: `${((quiz.currentIdx + 1) / quiz.questions.length) * 100}%` }}></div>
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-100 p-12 sm:p-20 mb-10 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-500">
          <div className="absolute top-0 left-0 w-2 h-full bg-red-900"></div>
          <div className="text-[11px] uppercase font-bold tracking-[0.5em] text-slate-300 mb-8 text-center">TRANSLATE THE CONCEPT</div>
          <h2 className="text-5xl sm:text-7xl font-bold serif text-slate-900 mb-16 leading-tight text-center tracking-tight">{q.question}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {q.options.map((opt, i) => {
              const isCorrect = opt === q.correctAnswer;
              const isSelected = selectedOption === opt;
              let btnClass = "w-full text-left p-8 border transition-all serif text-2xl group relative ";
              if (!selectedOption) btnClass += "border-slate-100 hover:border-red-900 hover:bg-slate-50 hover:-translate-y-1 shadow-sm hover:shadow-md";
              else if (isCorrect) btnClass += "border-green-500 bg-green-50 text-green-700 ring-4 ring-green-100";
              else if (isSelected) btnClass += "border-red-500 bg-red-50 text-red-700 ring-4 ring-red-100";
              else btnClass += "border-slate-50 opacity-40";
              
              return (
                <button key={i} onClick={() => handleAnswer(opt)} disabled={!!selectedOption} className={btnClass}>
                  <span className="absolute top-3 right-5 text-slate-200 font-sans text-sm font-bold uppercase tracking-widest">{String.fromCharCode(97 + i)}</span>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
        {showExplanation && (
          <div className="bg-slate-900 text-white p-10 mb-10 animate-in slide-in-from-bottom-10 duration-700 shadow-2xl border-t-8 border-red-900">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-3 h-3 rounded-full bg-red-900 animate-pulse"></div>
              <div className="text-[11px] uppercase font-bold tracking-[0.4em] text-slate-500">LEXICON REVELATION</div>
            </div>
            <p className="serif text-slate-200 text-xl leading-relaxed italic border-l-2 border-slate-800 pl-8">"{q.explanation}"</p>
            <button onClick={nextQuestion} className="mt-12 w-full bg-red-900 py-5 font-bold uppercase tracking-[0.4em] text-[13px] hover:bg-red-800 transition-all shadow-2xl active:scale-[0.98]">
              {quiz.currentIdx === quiz.questions.length - 1 ? 'CONCLUDE CHALLENGE' : 'PROCEED TO NEXT'}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#fcfcfc] text-slate-900 flex flex-col">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40 backdrop-blur-md bg-white/95 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 sm:h-24 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <button onClick={() => {setView('dictionary'); setQuiz(null);}} className="text-red-900 font-bold text-3xl sm:text-4xl tracking-tighter serif hover:scale-105 transition-transform">LEX.</button>
            <div className="hidden md:block h-8 w-px bg-slate-100 mx-2"></div>
            <div className="hidden md:flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-red-900"></div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.4em]">Polyglot Insight Engine</span>
            </div>
          </div>
          <LanguageSelector sourceLang={sourceLang} targetLang={targetLang} onSourceChange={setSourceLang} onTargetChange={setTargetLang} onSwap={() => { setSourceLang(targetLang); setTargetLang(sourceLang); }} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-10 pb-32 w-full flex-grow">
        {view === 'dictionary' ? renderDictionary() : renderArena()}
      </main>

      <footer className="mt-auto bg-white border-t border-slate-100 py-8 px-10 flex flex-col sm:flex-row justify-between items-center gap-4 text-slate-400">
        <div className="text-[10px] font-bold uppercase tracking-[0.5em]">UzGer Lexicon &copy; MMXXV</div>
        <div className="flex gap-4">
          <div className="w-2 h-2 rounded-full bg-red-900"></div>
          <div className="w-2 h-2 rounded-full bg-slate-200"></div>
          <div className="w-2 h-2 rounded-full bg-slate-100"></div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-300">Advanced Linguistic System</div>
      </footer>
    </div>
  );
};

export default App;
