
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { SupportedLanguage, LANGUAGE_NAMES, TranslationResult, QuizQuestion, HistoryItem } from "../types";

const getApiKey = (): string => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "API Key is missing. Please set GEMINI_API_KEY or VITE_GEMINI_API_KEY in your .env file. " +
      "See README.md for instructions."
    );
  }
  return apiKey;
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

export const translateWithGemini = async (
  query: string,
  sourceLang: SupportedLanguage,
  targetLang: SupportedLanguage
): Promise<TranslationResult> => {
  const sName = LANGUAGE_NAMES[sourceLang];
  const tName = LANGUAGE_NAMES[targetLang];

  const prompt = `Act as a master philologist. Translate the word or phrase "${query}" from ${sName} to ${tName}. 
  Requirements:
  1. If German is involved, include gender (der/die/das), plural forms, and the CEFR level (A1-C2).
  2. For Uzbek, use modern Latin script.
  3. Provide a 'notes' field in grammar explaining the etymology or specific cultural usage of the source term.
  4. Provide 3 high-quality examples from literature or cinema.
  Return JSON only.`;

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
          targetLevel: { type: Type.STRING },
          alternatives: { type: Type.ARRAY, items: { type: Type.STRING } },
          sourceSynonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
          grammar: {
            type: Type.OBJECT,
            properties: {
              partOfSpeech: { type: Type.STRING },
              gender: { type: Type.STRING, nullable: true },
              plural: { type: Type.STRING, nullable: true },
              notes: { type: Type.STRING }
            },
            required: ["partOfSpeech", "notes"]
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
              }
            }
          }
        },
        required: ["term", "mainTranslation", "grammar", "examples"]
      }
    }
  });

  return JSON.parse(response.text || '{}') as TranslationResult;
};

export const generateQuizFromHistory = async (history: HistoryItem[]): Promise<QuizQuestion[]> => {
  const words = history.map(h => h.term).join(', ');
  const prompt = `Create a challenging 5-question multiple choice quiz based on these words: [${words}]. Focus on meaning and context. Return JSON array.`;

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

  return JSON.parse(response.text || '[]') as QuizQuestion[];
};

export const generateSpeech = async (text: string, lang: SupportedLanguage): Promise<string> => {
  const voiceMap: Record<string, string> = { de: 'Kore', uz: 'Zephyr', en: 'Puck', ru: 'Charon' };
  const voiceName = voiceMap[lang] || 'Zephyr';
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Pronounce clearly: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
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

export const playBase64Audio = async (base64: string): Promise<void> => {
  const audioContext = new AudioContext();
  const audioData = decode(base64);
  
  // Assuming standard audio format - adjust sampleRate and numChannels as needed
  const sampleRate = 24000; // Common TTS sample rate
  const numChannels = 1; // Mono audio
  
  const audioBuffer = await decodeAudioData(audioData, audioContext, sampleRate, numChannels);
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
  
  return new Promise((resolve) => {
    source.onended = () => {
      audioContext.close();
      resolve();
    };
  });
};