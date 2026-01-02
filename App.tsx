
import React, { useState, useEffect, useRef } from 'react';
import { SupportedLanguage, TranslationResult, HistoryItem, TranslationCache, LANGUAGE_NAMES, QuizQuestion, QuizSession } from './types';
import { translateWithGemini, generateSpeech, playBase64Audio, generateQuizFromHistory } from './services/geminiService';
import { syncUserWithBackend, saveSearchToBackend, fetchUserHistory, addXpToUser, fetchUserProfile, lookupGlobalTranslation, saveGlobalTranslation } from './services/userService';
import LanguageSelector from './components/LanguageSelector';
import ExampleCard from './components/ExampleCard';

const STORAGE_KEY_HISTORY = 'uzger_history_v8';
const STORAGE_KEY_CACHE = 'uzger_cache_v5';

const App: React.FC = () => {
  const [view, setView] = useState<'dictionary' | 'arena'>('dictionary');
  const [query, setQuery] = useState('');
  const [sourceLang, setSourceLang] = useState<SupportedLanguage>('de');
  const [targetLang, setTargetLang] = useState<SupportedLanguage>('uz');
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isArenaLoading, setIsArenaLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [tgUser, setTgUser] = useState<any>(null);
  
  // XP initialized at exactly 0
  const [userProfile, setUserProfile] = useState<any>({ xp: 0, name: 'Linguist' });
  const [quiz, setQuiz] = useState<QuizSession | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const cacheRef = useRef<TranslationCache>({});

  useEffect(() => {
    const localHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (localHistory) setHistory(JSON.parse(localHistory));

    const savedCache = localStorage.getItem(STORAGE_KEY_CACHE);
    if (savedCache) cacheRef.current = JSON.parse(savedCache);

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

  const initUserData = async (user: any) => {
    try {
      await syncUserWithBackend({
        telegramId: user.id.toString(),
        name: `${user.first_name} ${user.last_name || ''}`.trim(),
        username: user.username
      });
      const profile = await fetchUserProfile(user.id.toString());
      if (profile) setUserProfile(profile);
      
      const serverHistory = await fetchUserHistory(user.id.toString());
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
      console.error("Profile load failed");
    }
  };

  const updateLocalHistory = (term: string, translation: string, category: string) => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      term,
      translation,
      category,
      sourceLang,
      targetLang,
      timestamp: Date.now()
    };
    
    setHistory(prev => {
      const filtered = prev.filter(h => h.term.toLowerCase() !== term.toLowerCase());
      const updated = [newItem, ...filtered].slice(0, 20);
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updated));
      return updated;
    });
  };

  const handleSpeak = async (text: string, lang: SupportedLanguage, id: string) => {
    if (isSpeaking) return;
    setIsSpeaking(id);
    try {
      const audio = await generateSpeech(text, lang);
      await playBase64Audio(audio);
    } finally {
      setIsSpeaking(null);
    }
  };

  const handleTranslate = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const finalQuery = (overrideQuery || query).trim();
    if (!finalQuery) return;
    
    setQuery(finalQuery);
    const cacheKey = `${sourceLang}_${targetLang}_${finalQuery.toLowerCase()}`;
    
    if (cacheRef.current[cacheKey]) {
      const cachedResult = cacheRef.current[cacheKey];
      setResult(cachedResult);
      updateLocalHistory(finalQuery, cachedResult.mainTranslation, cachedResult.grammar?.partOfSpeech || "Other");
      return;
    }

    setIsLoading(true);
    try {
      const dbResult = await lookupGlobalTranslation(finalQuery, sourceLang, targetLang);
      if (dbResult) {
        setResult(dbResult);
        cacheRef.current[cacheKey] = dbResult;
        updateLocalHistory(finalQuery, dbResult.mainTranslation, dbResult.grammar?.partOfSpeech || "Other");
        setIsLoading(false);
        return;
      }

      const translation = await translateWithGemini(finalQuery, sourceLang, targetLang);
      setResult(translation);
      cacheRef.current[cacheKey] = translation;
      localStorage.setItem(STORAGE_KEY_CACHE, JSON.stringify(cacheRef.current));
      saveGlobalTranslation(finalQuery, sourceLang, targetLang, translation);
      updateLocalHistory(finalQuery, translation.mainTranslation, translation.grammar?.partOfSpeech || "Other");
      
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

  const startQuiz = async () => {
    if (history.length < 1 || isArenaLoading) {
      const tg = (window as any).Telegram?.WebApp;
      if (tg) tg.showAlert("Please search for at least 1 word before starting the Arena.");
      return;
    }
    setIsArenaLoading(true);
    try {
      const questions = await generateQuizFromHistory(history);
      if (questions && questions.length > 0) {
        setQuiz({ questions, currentIdx: 0, score: 0, isFinished: false });
        setView('arena');
      }
    } catch (err) {
      console.error("Arena generation failed:", err);
    } finally {
      setIsArenaLoading(false);
    }
  };

  const handleAnswer = (option: string) => {
    if (selectedOption || !quiz) return;
    setSelectedOption(option);
    setShowExplanation(true);
    const isCorrect = option === quiz.questions[quiz.currentIdx].correctAnswer;
    if (isCorrect) setQuiz({ ...quiz, score: quiz.score + 20 });
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred(isCorrect ? 'success' : 'error');
  };

  const nextQuestion = async () => {
    if (!quiz) return;
    if (quiz.currentIdx === quiz.questions.length - 1) {
      const earnedXp = quiz.score;
      setQuiz({ ...quiz, isFinished: true });
      if (tgUser) {
        await addXpToUser(tgUser.id.toString(), earnedXp);
        const profile = await fetchUserProfile(tgUser.id.toString());
        if (profile) setUserProfile(profile);
      }
    } else {
      setQuiz({ ...quiz, currentIdx: quiz.currentIdx + 1 });
      setSelectedOption(null);
      setShowExplanation(false);
    }
  };

  const renderSidebar = () => (
    <aside className="w-full lg:w-40 flex-shrink-0 lg:border-r border-stone-100 lg:pr-3 mb-4 lg:mb-0">
      <button 
        onClick={startQuiz}
        disabled={isArenaLoading || history.length === 0}
        className="w-full bg-[#4e342e] text-white py-2.5 font-bold uppercase tracking-widest text-[9px] shadow-sm hover:bg-[#3e2723] transition-all disabled:opacity-30 flex items-center justify-center gap-1.5 mb-4"
      >
        {isArenaLoading ? <div className="w-2.5 h-2.5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : 'START ARENA'}
      </button>
      <div className="space-y-1 max-h-[150px] lg:max-h-[60vh] overflow-y-auto no-scrollbar">
        <h3 className="text-[8px] font-bold uppercase tracking-[0.3em] text-stone-300 mb-1 px-1">Recent</h3>
        {history.length > 0 ? history.map(item => (
          <button 
            key={item.id} 
            onClick={() => handleTranslate(undefined, item.term)}
            className="w-full text-left p-1.5 px-2 border border-stone-50 hover:border-[#4e342e]/10 bg-white group"
          >
            <span className="block text-[11px] font-bold serif text-stone-900 group-hover:text-[#4e342e] truncate leading-tight">{item.term}</span>
          </button>
        )) : (
          <div className="py-4 text-center text-[8px] text-stone-300 font-bold uppercase tracking-widest">None</div>
        )}
      </div>
    </aside>
  );

  const renderDictionary = () => (
    <div className="flex flex-col lg:flex-row gap-5">
      {renderSidebar()}
      
      <div className="flex-1 max-w-2xl">
        {/* Compact User Stats */}
        <div className="mb-4 flex items-center justify-between bg-stone-50 border border-stone-100 px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#4e342e]"></div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-stone-500">{userProfile.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[8px] font-bold uppercase tracking-widest text-stone-300">Total XP</span>
            <span className="text-xl font-bold serif text-[#4e342e] tabular-nums tracking-tighter">{userProfile.xp || 0}</span>
          </div>
        </div>

        {/* Compact Search */}
        <form onSubmit={handleTranslate} className="mb-5 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Translate term..."
            className="w-full bg-white border border-stone-200 pl-6 pr-12 py-4 text-xl sm:text-2xl serif outline-none focus:border-[#4e342e] shadow-sm placeholder:text-stone-200"
          />
          <button type="submit" className="absolute right-4 top-1/2 -translate-y-1/2 text-[#4e342e] disabled:opacity-30">
            {isLoading ? <div className="w-5 h-5 border-3 border-[#4e342e]/10 border-t-[#4e342e] rounded-full animate-spin" /> : <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>}
          </button>
        </form>

        {result && !isLoading && (
          <div className="bg-white border border-stone-100 p-5 sm:p-8 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex justify-between items-start gap-4 mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl sm:text-3xl font-bold serif text-stone-900 leading-none">{result.term}</h2>
                <button onClick={() => handleSpeak(result.term, sourceLang, 'source')} className="text-stone-200 hover:text-[#4e342e] transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                </button>
              </div>
              <div className="text-right flex items-center gap-2">
                <h3 className="text-2xl sm:text-3xl font-bold serif text-[#4e342e] leading-none">{result.mainTranslation}</h3>
                <button onClick={() => handleSpeak(result.mainTranslation, targetLang, 'target')} className="text-stone-200 hover:text-[#4e342e] transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                </button>
              </div>
            </div>

            <div className="flex gap-4 mb-4 py-2 border-t border-b border-stone-50">
              <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400">{result.grammar?.partOfSpeech}</span>
              {result.grammar?.gender && <span className="text-[9px] font-bold uppercase tracking-widest text-[#4e342e]/60">G: {result.grammar.gender.toUpperCase()}</span>}
              {result.grammar?.plural && <span className="text-[9px] font-bold uppercase tracking-widest text-stone-400">P: {result.grammar.plural}</span>}
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <span className="text-[8px] uppercase tracking-widest text-stone-300 font-bold block mb-1">Synonyms</span>
                <p className="text-xs serif text-stone-700 italic">{result.sourceSynonyms?.join(', ') || result.term}</p>
              </div>
              <div>
                <span className="text-[8px] uppercase tracking-widest text-stone-300 font-bold block mb-1">Variants</span>
                <p className="text-xs serif text-stone-700 italic">{result.alternatives?.join(', ') || result.mainTranslation}</p>
              </div>
            </div>

            {result.examples.length > 0 && (
              <div className="pt-4 border-t border-stone-50 space-y-4">
                <span className="text-[8px] uppercase tracking-widest text-stone-300 font-bold block mb-3">Contextual Samples</span>
                {result.examples.slice(0, 2).map((ex, i) => <ExampleCard key={i} example={ex} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderArena = () => {
    if (!quiz) return null;
    if (quiz.isFinished) {
      return (
        <div className="text-center py-10 animate-in zoom-in max-w-sm mx-auto">
          <h2 className="text-2xl font-bold serif text-[#4e342e] mb-2 tracking-tighter uppercase">Finished</h2>
          <p className="text-xs text-stone-400 mb-6 uppercase tracking-widest">Score: <span className="text-[#4e342e] font-bold">+{quiz.score} XP</span></p>
          <button onClick={() => { setView('dictionary'); setQuiz(null); }} className="w-full bg-[#4e342e] text-white py-3 font-bold uppercase tracking-widest hover:bg-[#3e2723] active:scale-95 text-[9px]">BACK TO LEXICON</button>
        </div>
      );
    }
    const q = quiz.questions[quiz.currentIdx];
    return (
      <div className="max-w-sm mx-auto bg-white p-6 sm:p-8 shadow-xl border border-stone-100 animate-in fade-in">
        <div className="flex justify-between items-center mb-6">
          <span className="text-[8px] font-bold uppercase text-stone-300">ARENA {quiz.currentIdx + 1}/{quiz.questions.length}</span>
          <span className="text-[8px] font-bold text-[#4e342e] uppercase px-2 py-0.5 bg-stone-50 rounded-full">XP: {quiz.score}</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold serif mb-6 text-center leading-tight">{q.question}</h2>
        <div className="grid grid-cols-1 gap-1.5 mb-6">
          {q.options.map((opt, i) => (
            <button 
              key={i} 
              onClick={() => handleAnswer(opt)} 
              disabled={!!selectedOption} 
              className={`p-3 border text-sm serif text-left transition-all ${
                selectedOption === opt 
                  ? (opt === q.correctAnswer ? 'bg-green-50 border-green-500 text-green-800' : 'bg-red-50 border-red-500 text-red-800') 
                  : 'border-stone-50 hover:border-[#4e342e] hover:bg-stone-50'
              } ${selectedOption && opt === q.correctAnswer && selectedOption !== opt ? 'border-green-500 bg-green-50' : ''}`}
            >
              <span className="mr-2 text-stone-300 font-bold">{String.fromCharCode(65 + i)}</span>{opt}
            </button>
          ))}
        </div>
        {showExplanation && (
          <div className="mt-4 p-4 bg-[#2d1b18] text-stone-100 animate-in slide-in-from-top-1">
             <p className="serif italic text-[13px] text-stone-300 mb-4 leading-relaxed">"{q.explanation}"</p>
             <button onClick={nextQuestion} className="w-full bg-[#4e342e] text-white py-2.5 font-bold uppercase tracking-widest text-[9px]">
               {quiz.currentIdx === quiz.questions.length - 1 ? 'FINISH' : 'NEXT'}
             </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#fdfbf9] text-stone-900">
      <header className="bg-white/95 backdrop-blur-sm border-b border-stone-100 sticky top-0 z-50 py-2.5 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex justify-between items-center">
          <div className="flex items-center gap-2 cursor-pointer group" onClick={() => { setView('dictionary'); setQuiz(null); }}>
            <h1 className="text-lg font-bold serif tracking-tighter text-[#4e342e] group-hover:scale-105 transition-transform">LEX.</h1>
            <span className="hidden sm:block text-[7px] font-bold text-stone-300 uppercase tracking-[0.4em]">ENGINE</span>
          </div>
          <LanguageSelector 
            sourceLang={sourceLang} 
            targetLang={targetLang} 
            onSourceChange={setSourceLang} 
            onTargetChange={setTargetLang} 
            onSwap={() => { setSourceLang(targetLang); setTargetLang(sourceLang); }} 
          />
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {view === 'dictionary' ? renderDictionary() : renderArena()}
      </main>
      <footer className="max-w-4xl mx-auto px-6 py-6 border-t border-stone-100 flex justify-between items-center opacity-40">
        <span className="text-[7px] font-bold uppercase tracking-[0.5em]">LEXICON &copy; 2025</span>
        <div className="flex gap-1.5"><div className="w-1 h-1 rounded-full bg-[#4e342e]"></div><div className="w-1 h-1 rounded-full bg-stone-200"></div></div>
      </footer>
    </div>
  );
};

export default App;
