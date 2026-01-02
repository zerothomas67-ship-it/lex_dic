
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
  - 'grammar': Include gender (m/f/n), plural form, and usage 'notes'.
  - 'examples': 3 contextual sentences from literature/film.
  
  Format:
  {
    "term": "${query}",
    "mainTranslation": "primary",
    "sourceLevel": "A1-C2",
    "alternatives": ["syn1", "syn2"],
    "sourceSynonyms": ["syn1", "syn2"],
    "grammar": {
      "partOfSpeech": "NOUN",
      "gender": "m",
      "plural": "form",
      "notes": "Linguistic note"
    },
    "examples": [{"text": "...", "translation": "...", "sourceTitle": "..."}]
  }`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          mainTranslation: { type: Type.STRING },
          sourceLevel: { type: Type.STRING },
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
                sourceTitle: { type: Type.STRING }
              }
            }
          }
        },
        required: ["term", "mainTranslation", "grammar", "examples"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const generateQuizFromHistory = async (history: HistoryItem[]): Promise<QuizQuestion[]> => {
  const uniqueHistory = Array.from(new Map(history.map(item => [item.term.toLowerCase(), item])).values());
  const selectedEntries = uniqueHistory.slice(0, 15);
  const termsData = selectedEntries.map(h => 
    `{ "word": "${h.term}", "translation": "${h.translation || '?'}", "id": "${h.id}" }`
  ).join(', ');
  
  const prompt = `ARENA GENERATOR: Create exactly 5 quiz questions from this list: [${termsData}].
  
  CRITICAL DIVERSITY RULES:
  1. MAX 2 QUESTIONS PER WORD: Never ask more than 2 questions about the same word ID.
  2. MIN 3 UNIQUE WORDS: You MUST use at least 3 different words from the list to construct these 5 questions.
  3. Format: Multiple choice with 4 options.
  
  Return JSON array:
  [{ "question": "...", "options": ["...", "...", "...", "..."], "correctAnswer": "...", "explanation": "...", "wordId": "..." }]`;

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
          }
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
    contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
};

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
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
