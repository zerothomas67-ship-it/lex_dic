
export type SupportedLanguage = 'de' | 'uz' | 'en' | 'ru';

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  de: 'German',
  uz: 'Uzbek',
  en: 'English',
  ru: 'Russian'
};

export interface ExampleSource {
  text: string;
  translation: string;
  sourceTitle: string;
  sourceType: 'book' | 'movie' | 'general';
}

export interface TranslationResult {
  term: string;
  mainTranslation: string;
  sourceLevel?: string;
  targetLevel?: string;
  alternatives: string[];
  sourceSynonyms?: string[];
  grammar?: {
    partOfSpeech: string;
    gender?: 'm' | 'f' | 'n';
    plural?: string;
    notes?: string;
  };
  examples: ExampleSource[];
}

export interface HistoryItem {
  id: string;
  term: string;
  translation: string;
  category: string;
  sourceLang: SupportedLanguage;
  targetLang: SupportedLanguage;
  timestamp: number;
}

export interface TranslationCache {
  [key: string]: TranslationResult;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  wordId: string;
}

export interface QuizSession {
  questions: QuizQuestion[];
  currentIdx: number;
  score: number;
  isFinished: boolean;
}
