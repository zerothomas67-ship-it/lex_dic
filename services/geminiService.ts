
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
  Return JSON with IPA transcripts, grammar, alternatives, and 3 example sentences from books or movies.
  {
    "term": "${query}",
    "termPhonetic": "IPA",
    "mainTranslation": "primary",
    "translationPhonetic": "IPA",
    "alternatives": ["synonyms in ${tName}"],
    "sourceSynonyms": ["synonyms in ${sName}"],
    "level": "A1-C2",
    "grammar": {"partOfSpeech": "Noun/Verb/etc", "gender": "m/f/n", "plural": "form", "conjugation": "hint", "notes": "notes"},
    "examples": [{"text": "sentence in ${sName}", "translation": "translation in ${tName}", "sourceTitle": "source", "sourceType": "book/movie"}],
    "etymology": "history"
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

  return JSON.parse(response.text || '{}');
};

export const generateQuizFromHistory = async (history: HistoryItem[]): Promise<QuizQuestion[]> => {
  const terms = history.slice(0, 15).map(h => `${h.term} (${LANGUAGE_NAMES[h.sourceLang]} to ${LANGUAGE_NAMES[h.targetLang]})`).join(', ');
  
  const prompt = `Create a 5-question multiple choice quiz based on these words: ${terms}. 
  If the list is too short, add relevant common academic words. 
  Each question should test either translation, grammar (gender/plural), or usage in a sentence.
  Return a JSON array of objects with: question, options (4 items), correctAnswer, explanation, and wordId.`;

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

// Internal audio decoding helpers following @google/genai guidelines
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
  
  // Fix: Standardize decoding of base64 raw PCM audio data
  const audioData = decode(base64);
  const audioBuffer = await decodeAudioData(audioData, audioContext, 24000, 1);
  
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
};
