
export type SupportedLanguage = 'de' | 'uz' | 'en' | 'ru';

export enum LanguageDirection {
  DE_TO_UZ = 'DE_TO_UZ',
  UZ_TO_DE = 'UZ_TO_DE'
}

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
  termPhonetic?: string;
  mainTranslation: string;
  translationPhonetic?: string;
  alternatives: string[];
  sourceSynonyms?: string[];
  level?: string;
  grammar?: {
    partOfSpeech: string;
    gender?: 'm' | 'f' | 'n';
    plural?: string;
    conjugation?: string;
    notes?: string;
  };
  examples: ExampleSource[];
  etymology?: string;
}

export interface HistoryItem {
  id: string;
  term: string;
  category: string;
  sourceLang: SupportedLanguage;
  targetLang: SupportedLanguage;
  timestamp: number;
}

export interface TranslationCache {
  [key: string]: TranslationResult;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  wordId: string; // The word this question is based on
}

export interface QuizSession {
  questions: QuizQuestion[];
  currentIdx: number;
  score: number;
  isFinished: boolean;
}
