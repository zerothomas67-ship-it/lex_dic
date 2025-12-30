
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { SupportedLanguage, LANGUAGE_NAMES, TranslationResult, QuizQuestion, HistoryItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const translateWithGemini = async (
  query: string,
  sourceLang: SupportedLanguage,
  targetLang: SupportedLanguage
): Promise<TranslationResult> => {
  const sName = LANGUAGE_NAMES[sourceLang];
  const tName = LANGUAGE_NAMES[targetLang];

  const prompt = `Advanced Polyglot Dictionary: Translate "${query}" from ${sName} to ${tName}.
  Return JSON with high-quality linguistic data.
  Specifically:
  - 'level': Provide CEFR level (e.g. A1, B2, C1).
  - 'grammar': Include gender (m/f/n) and plural form for nouns, and a 'notes' field for usage advice (e.g. "Used with dative").
  - 'sourceSynonyms': List 3-4 synonyms in ${sName}.
  - 'alternatives': List 3-4 synonyms/alternatives in ${tName}.
  - 'examples': 3 contextual sentences from literary, news, or cinematic sources.
  
  Format:
  {
    "term": "${query}",
    "termPhonetic": "IPA",
    "mainTranslation": "primary",
    "level": "B1",
    "alternatives": ["synonym1", "synonym2"],
    "sourceSynonyms": ["synonym1", "synonym2"],
    "grammar": {
      "partOfSpeech": "NOUN",
      "gender": "m",
      "plural": "plural_form",
      "notes": "Usage note here"
    },
    "examples": [{"text": "...", "translation": "...", "sourceTitle": "NEWSPAPER", "sourceType": "general"}]
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
          level: { type: Type.STRING },
          alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
          sourceSynonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
          grammar: {
            type: Type.OBJECT,
            properties: {
              partOfSpeech: { type: Type.STRING },
              gender: { type: Type.STRING },
              plural: { type: Type.STRING },
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
          }
        },
        required: ["term", "mainTranslation", "examples", "grammar"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const generateQuizFromHistory = async (history: HistoryItem[]): Promise<QuizQuestion[]> => {
  // Extract unique terms to ensure variety
  const uniqueHistory = Array.from(new Set(history.map(h => h.term))).map(term => {
    return history.find(h => h.term === term)!;
  });

  const termsData = uniqueHistory.slice(0, 15).map(h => 
    `{ Term: "${h.term}", Translation: "${h.translation || 'unknown'}", From: "${LANGUAGE_NAMES[h.sourceLang]}", To: "${LANGUAGE_NAMES[h.targetLang]}" }`
  ).join(', ');
  
  const prompt = `STRICT RULE: Create a 5-question quiz based ONLY on these entries from the user's history: [${termsData}].
  
  BI-DIRECTIONAL TESTING:
  For each question, randomly choose to either:
  1. Ask for the translation from the Source Language to the Target Language.
  2. Ask for the translation from the Target Language back to the Source Language.
  
  Example Bi-directional:
  Search: "Guten" (DE) -> "Yaxshi" (UZ)
  Possible Question 1: "Guten" (Options: a) Yaxshi, b) Yomon, c) Xunuk)
  Possible Question 2: "Yaxshi" (Options: a) Guten, b) Tag, c) Das)
  
  DO NOT use words outside of this history unless as incorrect distractors.
  Return a JSON array of objects with:
  - question: string (The word to translate)
  - options: string[] (Exactly 4 options)
  - correctAnswer: string (The correct translation)
  - explanation: string (A helpful note about the word's usage)
  - wordId: string (Unique ID for the word)
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.STRING },
            explanation: { type: Type.STRING },
            wordId: { type: Type.STRING }
          },
          required: ["question", "options", "correctAnswer", "explanation", "wordId"]
        }
      }
    }
  });

  return JSON.parse(response.text || '[]');
};

export const generateSpeech = async (text: string, lang: SupportedLanguage): Promise<string> => {
  const voiceMap: Record<string, string> = { de: 'Kore', uz: 'Zephyr', en: 'Puck', ru: 'Charon' };
  const voiceName = voiceMap[lang] || 'Zephyr';
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Say this clearly: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  });

  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
};

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const playBase64Audio = async (base64: string) => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const audioData = decode(base64);
  const audioBuffer = await decodeAudioData(audioData, audioContext, 24000, 1);
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
};
