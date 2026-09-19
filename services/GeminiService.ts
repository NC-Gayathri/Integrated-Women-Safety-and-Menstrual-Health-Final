import { GoogleGenAI } from '@google/genai';
import { AIServiceInterface, ChatMessage } from './AIServiceInterface';
import { CHATBOT_SYSTEM_INSTRUCTIONS } from '../constants/ChatbotSystemInstructions';

// Note: For development only. In production, requests should go through a secure backend.
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey: API_KEY });

// List of preferred, active Google Gemini models in order of priority
const PREFERRED_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
];

// Models known to be deprecated or unavailable to new users
const DEPRECATED_MODEL_PATTERNS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

export class GeminiService implements AIServiceInterface {
  private isProcessing = false;
  private readonly MAX_CONTEXT_MESSAGES = 15;
  private cachedModelName: string | null = null;

  private isDeprecated(modelName: string): boolean {
    return DEPRECATED_MODEL_PATTERNS.some((pattern) => modelName.includes(pattern));
  }

  private async getCandidateModels(): Promise<string[]> {
    const candidates: string[] = [...PREFERRED_MODELS];

    try {
      if (API_KEY) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.models)) {
            const fetchedModels = data.models
              .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
              .map((m: any) => m.name.replace('models/', ''))
              .filter((name: string) => !this.isDeprecated(name));

            for (const m of fetchedModels) {
              if (!candidates.includes(m)) {
                candidates.push(m);
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Could not fetch remote Gemini model list, using fallback candidate list:', error);
    }

    return candidates;
  }

  async sendMessage(message: string, history: ChatMessage[]): Promise<string> {
    if (this.isProcessing) {
      throw new Error('Please wait for the current response to finish.');
    }

    if (!API_KEY) {
      return "I'm sorry, I'm currently unavailable. (API Key missing)";
    }

    this.isProcessing = true;

    try {
      // Prepare context window: keep only the latest messages
      const contextMessages = history
        .slice(-this.MAX_CONTEXT_MESSAGES)
        .map((msg) => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }],
        }));

      // Append the new message
      contextMessages.push({
        role: 'user',
        parts: [{ text: message }],
      });

      // Try cached model first if available
      if (this.cachedModelName) {
        try {
          const response = await ai.models.generateContent({
            model: this.cachedModelName,
            contents: contextMessages as any,
            config: {
              systemInstruction: CHATBOT_SYSTEM_INSTRUCTIONS,
            },
          });
          if (response.text) {
            return response.text;
          }
        } catch (err) {
          console.warn(`Cached model ${this.cachedModelName} failed, clearing cache:`, err);
          this.cachedModelName = null;
        }
      }

      // Try candidates in order
      const candidates = await this.getCandidateModels();
      let lastError: any = null;

      for (const modelName of candidates) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: contextMessages as any,
            config: {
              systemInstruction: CHATBOT_SYSTEM_INSTRUCTIONS,
            },
          });

          if (response.text) {
            this.cachedModelName = modelName;
            console.log('GeminiService using model:', modelName);
            return response.text;
          }
        } catch (err: any) {
          lastError = err;
          console.warn(`Model ${modelName} failed, trying next candidate. Error:`, err?.message || err);
        }
      }

      console.error('All Gemini model candidates failed. Last error:', lastError);
      return "I'm sorry, I couldn't connect right now. Please check your internet connection and try again.";
    } finally {
      this.isProcessing = false;
    }
  }

  async generateTitle(firstMessage: string): Promise<string> {
    if (!API_KEY) return 'New Conversation';

    const prompt = `Generate a very short, concise title (max 4 words) summarizing this user's query: "${firstMessage}". Output only the title, no quotes or extra text.`;

    if (this.cachedModelName) {
      try {
        const response = await ai.models.generateContent({
          model: this.cachedModelName,
          contents: prompt,
        });
        return (response.text || 'New Conversation').trim();
      } catch (err) {
        // Fall back to candidates loop below
      }
    }

    const candidates = await this.getCandidateModels();
    for (const modelName of candidates) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
        });
        if (response.text) {
          this.cachedModelName = modelName;
          return response.text.trim();
        }
      } catch (err) {
        // try next
      }
    }

    return 'New Conversation';
  }
}

