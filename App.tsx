
import React, { useState, useEffect, useRef } from 'react';
import { SupportedLanguage, TranslationResult, HistoryItem, TranslationCache, LANGUAGE_NAMES, QuizQuestion, QuizSession } from './types';
import { translateWithGemini, generateSpeech, playBase64Audio, generateQuizFromHistory } from './services/geminiService';
import { syncUserWithBackend, saveSearchToBackend, fetchUserHistory, addXpToUser, fetchUserProfile } from './services/userService';
import LanguageSelector from './components/LanguageSelector';
import ExampleCard from './components/ExampleCard';

const HISTORY_CATEGORIES = ["All", "Noun", "Verb", "Adjective", "Phrase"];

const App: React.FC = () => {
  const [view, setView] = useState<'dictionary' | 'arena'>('dictionary');
  const [query, setQuery] = useState('');
  const [sourceLang, setSourceLang] = useState<SupportedLanguage>('de');
  const [targetLang, setTargetLang] = useState<SupportedLanguage>('uz');
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeFilter, setActiveFilter] = useState("All");
  const [tgUser, setTgUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [quiz, setQuiz] = useState<QuizSession | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const cacheRef = useRef<TranslationCache>({});

  useEffect(() => {
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
    const savedCache = sessionStorage.getItem('uzger_cache_v2');
    if (savedCache) cacheRef.current = JSON.parse(savedCache);
  }, []);

  const initUserData = async (user: any) => {
    await syncUserWithBackend({
      telegramId: user.id.toString(),
      name: `${user.first_name} ${user.last_name || ''}`.trim(),
      username: user.username
    });
    const profile = await fetchUserProfile(user.id.toString());
    setUserProfile(profile);
    const serverHistory = await fetchUserHistory(user.id.toString());
    if (serverHistory) {
      const mapped = serverHistory.map(h => ({
        id: h.id.toString(),
        term: h.term,
        category: h.category || "Other",
        sourceLang: h.sourceLang as SupportedLanguage,
        targetLang: h.targetLang as SupportedLanguage,
        timestamp: new Date(h.timestamp).getTime()
      }));
      setHistory(mapped);
    }
  };

  const startQuiz = async () => {
    setIsLoading(true);
    setView('arena');
    try {
      const questions = await generateQuizFromHistory(history);
      setQuiz({ questions, currentIdx: 0, score: 0, isFinished: false });
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswer = (option: string) => {
    if (selectedOption || !quiz) return;
    setSelectedOption(option);
    setShowExplanation(true);
    
    const isCorrect = option === quiz.questions[quiz.currentIdx].correctAnswer;
    if (isCorrect) {
      setQuiz({ ...quiz, score: quiz.score + 20 });
    }
    
    const tg = (window as any).Telegram?.WebApp;
    if (tg && tg.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred(isCorrect ? 'success' : 'error');
    }
  };

  const nextQuestion = async () => {
    if (!quiz) return;
    const isLast = quiz.currentIdx === quiz.questions.length - 1;
    if (isLast) {
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

  const handleTranslate = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault();
    const finalQuery = (overrideQuery || query).trim();
    if (!finalQuery) return;

    const cacheKey = `${sourceLang}_${targetLang}_${finalQuery.toLowerCase()}`;
    if (cacheRef.current[cacheKey]) {
      setResult(cacheRef.current[cacheKey]);
      return;
    }

    setIsLoading(true);
    try {
      const translation = await translateWithGemini(finalQuery, sourceLang, targetLang);
      setResult(translation);
      cacheRef.current[cacheKey] = translation;
      sessionStorage.setItem('uzger_cache_v2', JSON.stringify(cacheRef.current));

      if (tgUser) {
        saveSearchToBackend({
          telegramId: tgUser.id.toString(),
          term: finalQuery,
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

  const handleSpeak = async (text: string, lang: SupportedLanguage) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    try {
      const audio = await generateSpeech(text, lang);
      await playBase64Audio(audio);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSpeaking(false);
    }
  };

  const renderDictionary = () => (
    <>
      <section className="mb-8 relative">
        <form onSubmit={handleTranslate} className="relative group">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Translate from ${LANGUAGE_NAMES[sourceLang]}...`}
            className="w-full bg-white border border-slate-200 pl-4 pr-12 sm:pl-6 sm:pr-16 py-3.5 sm:py-6 rounded-none focus:border-red-900 transition-all text-lg sm:text-2xl serif outline-none shadow-sm group-hover:shadow-md"
          />
          <button type="submit" disabled={isLoading || !query.trim()} className="absolute right-1 sm:right-3 top-1/2 -translate-y-1/2 text-red-900 p-2">
            {isLoading ? <div className="w-5 h-5 border-2 border-red-900/20 border-t-red-900 rounded-full animate-spin" /> : <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>}
          </button>
        </form>
      </section>

      {result && !isLoading && (
        <div className="bg-white border border-slate-100 p-5 sm:p-10 mb-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-6 mb-10">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-3xl sm:text-5xl font-bold serif text-slate-900 break-words">{result.term}</h2>
                <button onClick={() => handleSpeak(result.term, sourceLang)} className="p-1.5 text-slate-300 hover:text-red-900">
                  <svg xmlns="http://www.w3.org/2000/svg" className={`h-6 w-6 ${isSpeaking ? 'animate-pulse text-red-900' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="bg-slate-100 px-2 py-0.5 text-[10px] uppercase font-bold text-slate-500 rounded-sm">
                  {result.grammar?.partOfSpeech}
                </span>
                {result.termPhonetic && (
                  <span className="text-slate-400 text-sm font-medium serif italic">[{result.termPhonetic}]</span>
                )}
              </div>
              
              {/* Source Language Synonyms */}
              {result.sourceSynonyms && result.sourceSynonyms.length > 0 && (
                <div className="mt-4">
                  <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold block mb-1">Synonyms ({LANGUAGE_NAMES[sourceLang]})</span>
                  <p className="text-slate-600 text-sm italic serif">
                    {result.sourceSynonyms.join(', ')}
                  </p>
                </div>
              )}
            </div>
            <div className="md:text-right border-t md:border-t-0 pt-6 md:pt-0">
              <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold block mb-2">Translation</span>
              <h3 className="text-3xl sm:text-5xl font-bold serif text-red-900 mb-2">{result.mainTranslation}</h3>
              
              {/* Target Language Alternatives */}
              {result.alternatives && result.alternatives.length > 0 && (
                <div className="mt-2">
                  <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold block mb-1">Alternatives ({LANGUAGE_NAMES[targetLang]})</span>
                  <p className="text-slate-600 text-sm italic serif md:text-right">
                    {result.alternatives.join(', ')}
                  </p>
                </div>
              )}
            </div>
          </div>
          
          <div className="space-y-6">
            <h4 className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-50 pb-1 tracking-widest">Contextual Examples</h4>
            <div className="space-y-2">
              {result.examples.map((ex, i) => <ExampleCard key={i} example={ex} />)}
            </div>
          </div>
        </div>
      )}

      <section>
        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-2">
          <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
            <svg className="h-4 w-4 text-red-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Recent Records
          </h3>
          <button onClick={startQuiz} className="bg-red-900 text-white px-4 py-1 text-[10px] font-bold uppercase tracking-widest hover:bg-black transition-all shadow-sm">Enter Arena</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-100">
          {history.length > 0 ? history.map(item => (
            <button key={item.id} onClick={() => { setQuery(item.term); handleTranslate(undefined, item.term); }} className="bg-white p-4 text-left hover:bg-slate-50 transition-colors">
              <span className="text-slate-800 font-medium serif block truncate">{item.term}</span>
              <span className="text-[8px] uppercase tracking-widest text-slate-300">{item.sourceLang.toUpperCase()} → {item.targetLang.toUpperCase()}</span>
            </button>
          )) : (
            <div className="col-span-full bg-white py-12 text-center">
              <p className="text-slate-300 text-[10px] font-bold uppercase tracking-widest">No searches recorded yet</p>
            </div>
          )}
        </div>
      </section>
    </>
  );

  const renderArena = () => {
    if (isLoading) return <div className="py-24 text-center text-slate-400 uppercase tracking-[0.5em] animate-pulse">Generating Arena...</div>;
    if (!quiz) return null;

    if (quiz.isFinished) {
      return (
        <div className="bg-white border border-slate-100 p-10 text-center animate-in zoom-in duration-300">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-3xl font-bold serif mb-2">Arena Conquered!</h2>
          <p className="text-slate-500 mb-8">You earned <span className="text-red-900 font-bold">{quiz.score} XP</span></p>
          <button onClick={() => setView('dictionary')} className="bg-red-900 text-white px-8 py-3 font-bold uppercase tracking-widest hover:bg-black transition-colors">Return to Archive</button>
        </div>
      );
    }

    const q = quiz.questions[quiz.currentIdx];
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <button onClick={() => setView('dictionary')} className="text-slate-400 hover:text-red-900 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg> Leave Arena
          </button>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Question {quiz.currentIdx + 1} / {quiz.questions.length}</div>
        </div>
        
        <div className="bg-white border border-slate-100 p-8 sm:p-12 mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold serif text-slate-900 mb-8 leading-tight">{q.question}</h2>
          <div className="grid grid-cols-1 gap-3">
            {q.options.map((opt, i) => {
              const isCorrect = opt === q.correctAnswer;
              const isSelected = selectedOption === opt;
              let btnClass = "w-full text-left p-4 border transition-all serif text-lg ";
              if (!selectedOption) btnClass += "border-slate-100 hover:border-red-900 hover:bg-slate-50";
              else if (isCorrect) btnClass += "border-green-500 bg-green-50 text-green-700";
              else if (isSelected) btnClass += "border-red-500 bg-red-50 text-red-700";
              else btnClass += "border-slate-50 opacity-40";

              return (
                <button key={i} onClick={() => handleAnswer(opt)} disabled={!!selectedOption} className={btnClass}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        {showExplanation && (
          <div className="bg-slate-900 text-white p-6 mb-6 animate-in slide-in-from-bottom-2">
            <div className="text-[9px] uppercase font-bold tracking-widest text-slate-500 mb-2">Wisdom from Lexicon</div>
            <p className="serif text-slate-300">{q.explanation}</p>
            <button onClick={nextQuestion} className="mt-6 w-full bg-red-900 py-3 font-bold uppercase tracking-widest text-[11px] hover:bg-red-800 transition-colors">
              {quiz.currentIdx === quiz.questions.length - 1 ? 'Finish Challenge' : 'Next Question'}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 flex flex-col">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-red-900 font-bold text-xl sm:text-2xl tracking-tighter serif">LEX.</div>
            {userProfile && (
              <div className="bg-slate-50 px-3 py-1 rounded-full border border-slate-100 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-900"></div>
                <span className="text-[10px] font-bold text-red-900 uppercase">{userProfile.xp} XP</span>
              </div>
            )}
          </div>
          <LanguageSelector sourceLang={sourceLang} targetLang={targetLang} onSourceChange={setSourceLang} onTargetChange={setTargetLang} onSwap={() => { setSourceLang(targetLang); setTargetLang(sourceLang); }} />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-8 pb-24 w-full">
        {view === 'dictionary' ? renderDictionary() : renderArena()}
      </main>

      <footer className="mt-auto bg-white border-t border-slate-100 py-5 px-8 flex justify-between items-center">
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Polyglot Linguistic System</div>
        <div className="flex gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-900"></div><div className="w-1.5 h-1.5 rounded-full bg-slate-100"></div></div>
      </footer>
    </div>
  );
};

export default App;
