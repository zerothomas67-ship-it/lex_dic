
import React, { useState, useEffect, useRef } from 'react';
import { SupportedLanguage, LANGUAGE_NAMES, TranslationResult, HistoryItem, TranslationCache, QuizSession } from './types';
import { translateWithGemini, generateSpeech, playBase64Audio, generateQuizFromHistory } from './services/geminiService';
import { syncUserWithBackend, saveSearchToBackend, fetchUserHistory, addXpToUser, fetchUserProfile, lookupGlobalTranslation, saveGlobalTranslation } from './services/userService';
import LanguageSelector from './components/LanguageSelector';
import ExampleCard from './components/ExampleCard';

const STORAGE_KEY_HISTORY = 'uzger_history_v8';
const STORAGE_KEY_CACHE = 'uzger_cache_v5';
const STORAGE_KEY_AUTO_AUDIO = 'uzger_auto_audio';

const App: React.FC = () => {
  const [view, setView] = useState<'dictionary' | 'arena'>('dictionary');
  const [query, setQuery] = useState('');
  const [sourceLang, setSourceLang] = useState<SupportedLanguage>('de');
  const [targetLang, setTargetLang] = useState<SupportedLanguage>('uz');
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isArenaLoading, setIsLoadingArena] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [tgUser, setTgUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>({ xp: 0, name: 'Scholar' });
  const [quiz, setQuiz] = useState<QuizSession | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [autoAudioEnabled, setAutoAudioEnabled] = useState(true);
  
  const audioCache = useRef<Map<string, string>>(new Map());
  const cacheRef = useRef<TranslationCache>({});

  useEffect(() => {
    const localHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (localHistory) setHistory(JSON.parse(localHistory) as HistoryItem[]);

    const savedCache = localStorage.getItem(STORAGE_KEY_CACHE);
    if (savedCache) cacheRef.current = JSON.parse(savedCache) as TranslationCache;

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
  }, []);

  useEffect(() => {
    if (result) {
      Promise.all([
        preFetchAudio(result.term, sourceLang),
        preFetchAudio(result.mainTranslation, targetLang)
      ]);
    }
  }, [result, sourceLang, targetLang]);

  const preFetchAudio = async (text: string, lang: SupportedLanguage) => {
    const key = `${lang}_${text.toLowerCase()}`;
    if (audioCache.current.has(key)) return;
    try {
      const audio = await generateSpeech(text, lang);
      audioCache.current.set(key, audio);
    } catch (e) { }
  };

  const initUserData = async (user: any) => {
    const telegramId = user.id.toString();
    try {
      const [syncRes, profile, serverHistory] = await Promise.all([
        syncUserWithBackend({
          telegramId,
          name: `${user.first_name} ${user.last_name || ''}`.trim(),
          username: user.username
        }),
        fetchUserProfile(telegramId),
        fetchUserHistory(telegramId)
      ]);

      if (profile) setUserProfile(profile);
      if (serverHistory && serverHistory.length > 0) {
        const mapped: HistoryItem[] = serverHistory.map((h: any) => ({
          id: h.id.toString(),
          term: h.term,
          translation: h.translation,
          category: h.category || "Other",
          sourceLang: h.sourceLang as SupportedLanguage,
          targetLang: h.targetLang as SupportedLanguage,
          timestamp: new Date(h.timestamp).getTime()
        }));
        setHistory(mapped);
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(mapped));
      }
    } catch (err) {
      console.error("Initialization error", err);
    }
  };

  const handleSwap = () => {
    const oldS = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(oldS);
    setResult(null);
  };

  const onSourceChange = (lang: SupportedLanguage) => {
    if (lang === targetLang) {
      handleSwap();
    } else {
      setSourceLang(lang);
      setResult(null);
    }
  };

  const onTargetChange = (lang: SupportedLanguage) => {
    if (lang === sourceLang) {
      handleSwap();
    } else {
      setTargetLang(lang);
      setResult(null);
    }
  };

  const handleSpeak = async (text: string, lang: SupportedLanguage, id: string) => {
    if (isSpeaking) return;
    const key = `${lang}_${text.toLowerCase()}`;
    
    if (audioCache.current.has(key)) {
      setIsSpeaking(id);
      await playBase64Audio(audioCache.current.get(key)!);
      setIsSpeaking(null);
      return;
    }

    setIsSpeaking(id);
    try {
      const audio = await generateSpeech(text, lang);
      audioCache.current.set(key, audio);
      await playBase64Audio(audio);
    } finally {
      setIsSpeaking(null);
    }
  };

  const handleTranslate = async (e?: React.FormEvent, overrideQuery?: string, overrideSource?: SupportedLanguage, overrideTarget?: SupportedLanguage) => {
    if (e) e.preventDefault();
    const finalQuery = (overrideQuery || query).trim();
    if (!finalQuery) return;
    
    const sLang = overrideSource || sourceLang;
    const tLang = overrideTarget || targetLang;

    setQuery(finalQuery);
    const cacheKey = `${sLang}_${tLang}_${finalQuery.toLowerCase()}`;
    
    if (cacheRef.current[cacheKey]) {
      const cachedResult = cacheRef.current[cacheKey];
      setResult(cachedResult);
      updateLocalHistory(finalQuery, cachedResult.mainTranslation, cachedResult.grammar?.partOfSpeech || "Other", sLang, tLang);
      if (autoAudioEnabled) handleSpeak(finalQuery, sLang, 'auto');
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const dbResult = await lookupGlobalTranslation(finalQuery, sLang, tLang);
      if (dbResult) {
        setResult(dbResult);
        cacheRef.current[cacheKey] = dbResult;
        updateLocalHistory(finalQuery, dbResult.mainTranslation, dbResult.grammar?.partOfSpeech || "Other", sLang, tLang);
        if (autoAudioEnabled) handleSpeak(finalQuery, sLang, 'auto');
        setIsLoading(false);
        return;
      }

      const translation = await translateWithGemini(finalQuery, sLang, tLang);
      setResult(translation);
      cacheRef.current[cacheKey] = translation;
      localStorage.setItem(STORAGE_KEY_CACHE, JSON.stringify(cacheRef.current));
      
      saveGlobalTranslation(finalQuery, sLang, tLang, translation);
      updateLocalHistory(finalQuery, translation.mainTranslation, translation.grammar?.partOfSpeech || "Other", sLang, tLang);
      
      if (autoAudioEnabled) handleSpeak(finalQuery, sLang, 'auto');

      if (tgUser) {
        saveSearchToBackend({
          telegramId: tgUser.id.toString(),
          term: finalQuery,
          translation: translation.mainTranslation,
          sourceLang: sLang,
          targetLang: tLang,
          category: translation.grammar?.partOfSpeech || "Other"
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const updateLocalHistory = (term: string, translation: string, category: string, sLang: SupportedLanguage, tLang: SupportedLanguage) => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      term,
      translation,
      category,
      sourceLang: sLang,
      targetLang: tLang,
      timestamp: Date.now()
    };
    
    setHistory(prev => {
      const filtered = prev.filter(h => h.term.toLowerCase() !== term.toLowerCase() || h.sourceLang !== sLang);
      const updated = [newItem, ...filtered].slice(0, 50);
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
      return updated;
    });
  };

  const startQuiz = async () => {
    if (history.length < 1 || isArenaLoading) return;
    setIsLoadingArena(true);
    try {
      const uniqueHistory: HistoryItem[] = Array.from(new Map<string, HistoryItem>(history.map(item => [item.term.toLowerCase(), item])).values());
      const limitedHistory = uniqueHistory.slice(0, 10);
      const totalQuestions = limitedHistory.length * 2;

      const questions = await generateQuizFromHistory(limitedHistory, totalQuestions);
      if (questions && questions.length > 0) {
        setQuiz({ questions, currentIdx: 0, score: 0, isFinished: false });
        setView('arena');
      }
    } catch (err) {
      console.error("Arena generation failed", err);
    } finally {
      setIsLoadingArena(false);
    }
  };

  const handleAnswer = async (option: string) => {
    if (!quiz || selectedOption) return;
    setSelectedOption(option);
    setShowExplanation(true);
    
    const currentQ = quiz.questions[quiz.currentIdx];
    if (option === currentQ.correctAnswer) {
      setQuiz(prev => prev ? { ...prev, score: prev.score + 20 } : null);
      if (tgUser) {
        await addXpToUser(tgUser.id.toString(), 20);
        fetchUserProfile(tgUser.id.toString()).then(p => p && setUserProfile(p));
      }
    }
  };

  const nextQuestion = () => {
    if (!quiz) return;
    const isLast = quiz.currentIdx === quiz.questions.length - 1;
    if (isLast) {
      setQuiz(prev => prev ? { ...prev, isFinished: true } : null);
    } else {
      setQuiz(prev => prev ? { ...prev, currentIdx: prev.currentIdx + 1 } : null);
      setSelectedOption(null);
      setShowExplanation(false);
    }
  };

  // Logic to determine which level to show (prioritize non-Uzbek)
  const getDisplayLevel = (res: TranslationResult) => {
    if (sourceLang === 'uz') return res.targetLevel;
    return res.sourceLevel;
  };

  const renderDictionary = () => (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex justify-between items-end mb-4 px-2">
        <div className="flex flex-col">
          <span className="text-[8px] font-black uppercase tracking-[0.3em] text-stone-300">Lexical Ranking</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold serif text-[#7c1a1a] leading-none">{userProfile.xp}</span>
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">XP</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-300">Auto-Pronounce</span>
          <button 
            onClick={() => setAutoAudioEnabled(!autoAudioEnabled)}
            className={`relative w-8 h-4 rounded-full transition-all duration-300 ${autoAudioEnabled ? 'bg-[#7c1a1a]' : 'bg-stone-200'}`}
          >
            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all duration-300 shadow-sm ${autoAudioEnabled ? 'left-[calc(100%-0.875rem)]' : 'left-0.5'}`}></div>
          </button>
        </div>
      </div>

      <section className="relative z-10">
        <form onSubmit={(e) => handleTranslate(e)} className="relative group">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Explore the archives..."
            className="w-full bg-white border border-stone-200 px-8 py-6 text-2xl sm:text-3xl serif outline-none focus:border-[#7c1a1a] shadow-sm transition-all placeholder:text-stone-300"
          />
          <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-4">
             <button 
                type="submit" 
                disabled={isLoading || !query.trim()}
                className="text-[#7c1a1a] p-2 transition-all hover:translate-x-1 disabled:opacity-20"
              >
                {isLoading ? (
                  <div className="w-8 h-8 border-3 border-[#7c1a1a]/10 border-t-[#7c1a1a] rounded-full animate-spin" />
                ) : (
                  <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                )}
              </button>
          </div>
        </form>
      </section>

      {result && (
        <div className="bg-white border border-stone-100 p-10 sm:p-20 shadow-sm animate-in fade-in slide-in-from-bottom-6 duration-700">
          <div className="flex flex-col sm:flex-row justify-between items-start mb-12 relative border-b border-stone-50 pb-16">
            <div className="space-y-6">
              <div className="flex items-center gap-6 flex-wrap">
                <h2 className="text-6xl sm:text-8xl font-bold serif text-stone-900 tracking-tighter leading-none">{result.term}</h2>
                <div className="flex items-center gap-2">
                  {getDisplayLevel(result) && (
                    <span className="bg-stone-900 text-white px-2 py-0.5 text-[9px] font-black rounded-sm uppercase tracking-[0.2em]">
                      LEVEL: {getDisplayLevel(result)}
                    </span>
                  )}
                  <button 
                    onClick={() => handleSpeak(result.term, sourceLang, 'src')} 
                    className={`transition-all ${isSpeaking === 'src' ? 'text-[#7c1a1a] scale-125' : 'text-stone-200 hover:text-[#7c1a1a]'}`}
                  >
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                  </button>
                </div>
              </div>
              <div className="flex gap-4">
                <span className="bg-stone-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400 border border-stone-100">{result.grammar?.partOfSpeech}</span>
                {result.grammar?.gender && <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400 mt-1.5">GENDER: {result.grammar.gender.toUpperCase()}</span>}
                {result.grammar?.plural && <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400 mt-1.5">PLURAL: {result.grammar.plural.toUpperCase()}</span>}
              </div>
            </div>

            <div className="sm:text-right mt-12 sm:mt-0">
               <span className="text-[9px] font-bold uppercase tracking-[0.5em] text-stone-300 block mb-4">LEXICAL RESULT</span>
               <div className="flex items-center sm:justify-end gap-6">
                  <button 
                    onClick={() => handleSpeak(result.mainTranslation, targetLang, 'trg')} 
                    className={`transition-all ${isSpeaking === 'trg' ? 'text-[#7c1a1a] scale-125' : 'text-stone-200 hover:text-[#7c1a1a]'}`}
                  >
                    <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                  </button>
                  <h3 className="text-6xl sm:text-8xl font-bold serif text-[#7c1a1a] tracking-tighter leading-none">{result.mainTranslation}</h3>
               </div>
            </div>
          </div>

          <div className="mt-12 p-10 border-l-[1px] border-[#7c1a1a] bg-[#7c1a1a]/[0.02] space-y-4">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#7c1a1a]">Linguistic Analysis of "{result.term}":</span>
            <p className="serif italic text-lg text-stone-600 leading-relaxed">
              {result.grammar?.notes || "No contextual nuances recorded."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 mt-20">
            <div className="space-y-6">
              <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-stone-300 block pb-3 border-b border-stone-50">{LANGUAGE_NAMES[sourceLang].toUpperCase()} ALTERNATIVES</span>
              <p className="text-xl serif italic text-stone-400 leading-relaxed">
                {(result.sourceSynonyms || []).join(', ') || 'N/A'}
              </p>
            </div>
            <div className="space-y-6">
              <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-stone-300 block pb-3 border-b border-stone-50">{LANGUAGE_NAMES[targetLang].toUpperCase()} ALTERNATIVES</span>
              <p className="text-xl serif italic text-stone-400 leading-relaxed">
                {(result.alternatives || []).join(', ') || 'N/A'}
              </p>
            </div>
          </div>

          <div className="mt-28 space-y-12">
            <div className="flex items-center gap-6 pb-6 border-b border-stone-50">
               <span className="text-[10px] font-black uppercase tracking-[0.6em] text-stone-300">LITERARY & CONTEXTUAL USAGE</span>
               <div className="flex-grow h-px bg-stone-50"></div>
            </div>
            <div className="space-y-4">
              {result.examples.map((ex, i) => <ExampleCard key={i} example={ex} />)}
            </div>
          </div>
        </div>
      )}

      <section className="pt-24">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-6 mb-16 border-b border-stone-50 pb-10">
          <div className="flex items-center gap-5">
            <div className="w-[1px] h-6 bg-[#7c1a1a]"></div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.5em] text-stone-400">LINGUISTIC HISTORY</h3>
          </div>
          {history.length > 0 && (
            <button 
              onClick={startQuiz}
              disabled={isArenaLoading}
              className="bg-[#7c1a1a] text-white px-10 py-5 text-[9px] font-bold uppercase tracking-[0.4em] flex items-center gap-4 transition-all hover:bg-black active:scale-95 disabled:opacity-30 shadow-lg"
            >
              {isArenaLoading ? (
                 <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
              )}
              {isArenaLoading ? 'SYNTHESIZING...' : 'START ARENA'}
            </button>
          )}
        </div>
        
        {history.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {history.map(item => (
              <button 
                key={item.id} 
                onClick={() => handleTranslate(undefined, item.term, item.sourceLang, item.targetLang)}
                className="bg-white p-10 border border-stone-100 text-left hover:border-[#7c1a1a] transition-all group shadow-sm"
              >
                <div className="flex justify-between items-start mb-4">
                   <span className="text-xl font-bold serif text-stone-900 group-hover:text-[#7c1a1a] transition-colors">{item.term}</span>
                   <div className="flex flex-col items-end">
                      <span className="text-[8px] font-black text-stone-200 group-hover:text-[#7c1a1a]/20 transition-colors uppercase">ARCHIVED</span>
                      <span className="text-[7px] text-stone-300 font-bold uppercase mt-1">{item.sourceLang} → {item.targetLang}</span>
                   </div>
                </div>
                <div className="flex justify-between items-center text-[8px] uppercase tracking-[0.2em] text-stone-300 font-bold">
                  <span className="italic truncate max-w-[90%] text-stone-400">{item.translation}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-32 text-center border border-dashed border-stone-100 bg-white/30 rounded-sm">
            <p className="text-stone-300 text-[9px] font-bold uppercase tracking-[0.8em] italic">Archive silent.</p>
          </div>
        )}
      </section>
    </div>
  );

  const renderArena = () => {
    if (!quiz) return null;
    if (quiz.isFinished) {
      return (
        <div className="text-center py-24 max-w-lg mx-auto bg-white border border-stone-50 p-20 shadow-sm animate-in zoom-in-95 duration-500">
          <div className="text-6xl mb-10">🌟</div>
          <h2 className="text-3xl font-bold serif text-[#7c1a1a] mb-6 uppercase tracking-tighter">Ritual Complete</h2>
          <p className="text-[10px] text-stone-400 mb-16 uppercase tracking-[0.5em] leading-relaxed">
            Lexical Threshold Increased:<br/>
            <span className="text-[#7c1a1a] font-black text-lg">+{quiz.score} XP</span>
          </p>
          <button 
            onClick={() => { setView('dictionary'); setQuiz(null); }} 
            className="w-full bg-black text-white py-5 font-bold uppercase tracking-[0.6em] hover:bg-[#7c1a1a] transition-all text-[9px] shadow-sm"
          >
            Return to Study
          </button>
        </div>
      );
    }
    const q = quiz.questions[quiz.currentIdx];
    return (
      <div className="max-w-3xl mx-auto bg-white p-12 sm:p-24 shadow-sm border border-stone-50 animate-in fade-in zoom-in-95 duration-700">
        <div className="flex justify-between items-center mb-16 border-b border-stone-50 pb-8">
          <div className="flex items-baseline gap-2">
             <span className="text-[10px] font-black uppercase tracking-[0.4em] text-stone-200">Phase</span>
             <span className="text-xl font-bold serif text-[#7c1a1a]">{quiz.currentIdx + 1}/{quiz.questions.length}</span>
          </div>
          <div className="text-[9px] font-black text-[#7c1a1a] uppercase tracking-[0.3em] bg-[#7c1a1a]/5 px-5 py-2 rounded-full border border-[#7c1a1a]/10">
            Gain: {quiz.score} XP
          </div>
        </div>
        
        <h2 className="text-4xl sm:text-6xl font-bold serif mb-20 text-center leading-tight tracking-tighter text-stone-900">
          {q.question}
        </h2>

        <div className="grid grid-cols-1 gap-4 mb-16">
          {q.options.map((opt, i) => (
            <button 
              key={i} 
              onClick={() => handleAnswer(opt)} 
              disabled={!!selectedOption} 
              className={`group p-6 border-l-[1px] text-xl serif text-left transition-all flex items-center gap-8 ${
                selectedOption === opt 
                  ? (opt === q.correctAnswer ? 'border-green-600 bg-green-50/20 text-green-900' : 'border-red-600 bg-red-50/20 text-red-900') 
                  : 'border-stone-100 hover:border-[#7c1a1a] hover:bg-stone-50/50'
              } ${selectedOption && opt === q.correctAnswer && selectedOption !== opt ? 'border-green-600 bg-green-50/20' : ''}`}
            >
              <span className="text-stone-200 font-sans text-[10px] font-black uppercase tracking-[0.4em] group-hover:text-[#7c1a1a] transition-colors">{String.fromCharCode(65 + i)}</span>
              <span className="flex-grow">{opt}</span>
            </button>
          ))}
        </div>

        {showExplanation && (
          <div className="mt-16 p-10 bg-[#1a1817] text-stone-100 animate-in slide-in-from-bottom-8 duration-700 shadow-xl">
             <div className="flex items-center gap-4 mb-6">
                <span className="text-[9px] font-black uppercase tracking-[0.6em] text-stone-500">EXEGESIS</span>
             </div>
             <p className="serif italic text-xl text-stone-200 mb-10 leading-relaxed">"{q.explanation}"</p>
             <button 
               onClick={nextQuestion} 
               className="w-full bg-[#7c1a1a] py-5 font-bold uppercase tracking-[0.6em] text-[9px] hover:bg-white hover:text-black transition-all shadow-lg active:scale-95"
             >
               {quiz.currentIdx === quiz.questions.length - 1 ? 'Conclude Ritual' : 'Advance Phase'}
             </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#fdfbf9] text-stone-900 flex flex-col selection:bg-[#7c1a1a]/10 overflow-x-hidden">
      <header className="bg-white/95 backdrop-blur-md border-b border-stone-100 sticky top-0 z-50 py-5">
        <div className="max-w-6xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-6 cursor-pointer group" onClick={() => { setView('dictionary'); setQuiz(null); setQuery(''); setResult(null); }}>
            <h1 className="text-4xl font-bold serif tracking-tighter text-[#7c1a1a] group-hover:scale-105 transition-transform duration-500 leading-none">LEX.</h1>
            <div className="hidden md:flex items-center gap-3 ml-2 border-l border-stone-100 pl-6">
              <div className="w-1.5 h-1.5 rounded-full bg-[#7c1a1a]"></div>
              <span className="text-[10px] font-black text-stone-300 uppercase tracking-[0.6em] leading-none">POLYGLOT INSIGHT ENGINE</span>
            </div>
          </div>
          <LanguageSelector 
            sourceLang={sourceLang} 
            targetLang={targetLang} 
            onSourceChange={onSourceChange}
            onTargetChange={onTargetChange}
            onSwap={handleSwap} 
          />
        </div>
      </header>

      <main className="flex-grow max-w-6xl mx-auto px-6 py-12 w-full">
        {view === 'dictionary' ? renderDictionary() : renderArena()}
      </main>

      <footer className="py-20 px-6 max-w-6xl mx-auto w-full border-t border-stone-100 flex flex-col sm:flex-row justify-between items-center gap-10 opacity-30 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-1000">
        <div className="flex flex-col items-center sm:items-start gap-2">
          <span className="text-[9px] font-black uppercase tracking-[1em] text-[#7c1a1a]">LEXICON ARCHIVE</span>
          <span className="text-[8px] font-bold uppercase tracking-[0.5em] text-stone-400">MMXXV &bull; INTELLECTUAL PROPERTY</span>
        </div>
        <div className="flex flex-col items-center sm:items-end gap-2 text-right">
          <span className="text-[8px] font-black uppercase tracking-[0.5em] text-stone-400 underline decoration-[#7c1a1a] decoration-2">MULTI-TIERED CACHE ARCHITECTURE</span>
          <span className="text-[8px] font-bold uppercase tracking-[0.4em] text-stone-300">GEMINI AI &bull; PRO CORE</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
