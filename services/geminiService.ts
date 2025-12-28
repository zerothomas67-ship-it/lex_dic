
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { SupportedLanguage, LANGUAGE_NAMES, TranslationResult } from "../types";

// Always initialize with process.env.API_KEY directly.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const translateWithGemini = async (
  query: string,
  sourceLang: SupportedLanguage,
  targetLang: SupportedLanguage
): Promise<TranslationResult> => {
  const sName = LANGUAGE_NAMES[sourceLang];
  const tName = LANGUAGE_NAMES[targetLang];

  const prompt = `Advanced Polyglot Dictionary: Translate the word or phrase "${query}" from ${sName} to ${tName}.
  Provide detailed linguistic metadata including IPA phonetic transcripts for both the source word and the primary translation.
  Return JSON:
  {
    "term": "${query}",
    "termPhonetic": "IPA transcript for source",
    "mainTranslation": "primary translation",
    "translationPhonetic": "IPA transcript for target",
    "alternatives": ["synonyms in ${tName}"],
    "sourceSynonyms": ["synonyms in ${sName}"],
    "level": "A1-C2 if applicable",
    "grammar": {"partOfSpeech": "Noun/Verb/etc", "gender": "m/f/n", "plural": "form", "conjugation": "hint", "notes": "notes"},
    "examples": [{"text": "sentence in ${sName}", "translation": "translation in ${tName}", "sourceTitle": "source", "sourceType": "book/movie"}],
    "etymology": "brief history"
  }`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          termPhonetic: { type: Type.STRING },
          mainTranslation: { type: Type.STRING },
          translationPhonetic: { type: Type.STRING },
          alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
          sourceSynonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
          level: { type: Type.STRING },
          grammar: {
            type: Type.OBJECT,
            properties: {
              partOfSpeech: { type: Type.STRING },
              gender: { type: Type.STRING },
              plural: { type: Type.STRING },
              conjugation: { type: Type.STRING },
              notes: { type: Type.STRING }
            },
            required: ["partOfSpeech"]
          },
          examples: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                translation: { type: Type.STRING },
                sourceTitle: { type: Type.STRING },
                sourceType: { type: Type.STRING }
              },
              required: ["text", "translation", "sourceTitle"]
            }
          },
          etymology: { type: Type.STRING }
        },
        required: ["term", "mainTranslation", "examples", "grammar"]
      }
    }
  });

  try {
    // Correctly using the .text property as defined in guidelines.
    const text = response.text || '{}';
    return JSON.parse(text);
  } catch (error) {
    console.error("Failed to parse Gemini response", error);
    throw new Error("Invalid translation response");
  }
};

export const generateSpeech = async (text: string, lang: SupportedLanguage): Promise<string> => {
  // Map our internal lang codes to supported voices
  const voiceMap: Record<string, string> = {
    de: 'Kore',
    uz: 'Zephyr', // Approximation
    en: 'Puck',
    ru: 'Charon' // Approximation
  };
  
  const voiceName = voiceMap[lang] || 'Zephyr';
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Say this clearly: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Audio generation failed");
  return base64Audio;
};

export const playBase64Audio = async (base64: string) => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const dataInt16 = new Int16Array(bytes.buffer);
  const frameCount = dataInt16.length;
  const buffer = audioContext.createBuffer(1, frameCount, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();
};