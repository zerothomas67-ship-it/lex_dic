
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
  termPhonetic?: string; // Transcript/IPA for the source term
  mainTranslation: string;
  translationPhonetic?: string; // Transcript/IPA for the target term
  alternatives: string[]; // Synonyms in the target language
  sourceSynonyms?: string[]; // Synonyms in the source language
  level?: string; // CEFR level
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