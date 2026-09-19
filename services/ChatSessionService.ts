import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage } from './AIServiceInterface';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

const STORAGE_KEY_SESSIONS = '@assistant_chat_sessions';
const STORAGE_KEY_ACTIVE_ID = '@assistant_active_session_id';
const LEGACY_STORAGE_KEY = '@assistant_chat_history';

export class ChatSessionService {
  /**
   * Migrate existing single-chat history into multi-session storage format automatically.
   */
  static async migrateLegacyHistoryIfNeeded(): Promise<void> {
    try {
      const existingSessions = await AsyncStorage.getItem(STORAGE_KEY_SESSIONS);
      if (!existingSessions) {
        const legacyHistory = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyHistory) {
          const parsedMessages: ChatMessage[] = JSON.parse(legacyHistory);
          if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
            const firstUserMsg = parsedMessages.find((m) => m.sender === 'user');
            const initialTitle = firstUserMsg
              ? (firstUserMsg.text.length > 25 ? firstUserMsg.text.substring(0, 25) + '...' : firstUserMsg.text)
              : 'Previous Conversation';

            const migratedSession: ChatSession = {
              id: Date.now().toString(),
              title: initialTitle,
              createdAt: parsedMessages[0]?.timestamp || Date.now(),
              updatedAt: parsedMessages[parsedMessages.length - 1]?.timestamp || Date.now(),
              messages: parsedMessages,
            };

            await AsyncStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify([migratedSession]));
            await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
          }
        }
      }
    } catch (e) {
      console.error('Error migrating legacy chat history:', e);
    }
  }

  /**
   * Create a new blank ChatSession.
   */
  static createNewSession(): ChatSession {
    const now = Date.now();
    return {
      id: now.toString(),
      title: 'New Chat',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
  }

  /**
   * Retrieve all saved chat sessions sorted by updatedAt (most recent first).
   */
  static async getAllSessions(): Promise<ChatSession[]> {
    try {
      await this.migrateLegacyHistoryIfNeeded();
      const stored = await AsyncStorage.getItem(STORAGE_KEY_SESSIONS);
      if (stored) {
        const sessions: ChatSession[] = JSON.parse(stored);
        return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      }
    } catch (e) {
      console.error('Error fetching chat sessions:', e);
    }
    return [];
  }

  /**
   * Save or update a chat session.
   */
  static async saveSession(session: ChatSession): Promise<void> {
    try {
      const sessions = await this.getAllSessions();
      const index = sessions.findIndex((s) => s.id === session.id);
      if (index !== -1) {
        sessions[index] = session;
      } else {
        sessions.push(session);
      }
      await AsyncStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    } catch (e) {
      console.error('Error saving chat session:', e);
    }
  }

  /**
   * Delete a chat session by ID.
   */
  static async deleteSession(id: string): Promise<void> {
    try {
      let sessions = await this.getAllSessions();
      sessions = sessions.filter((s) => s.id !== id);
      await AsyncStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));

      const activeId = await this.getActiveSessionId();
      if (activeId === id) {
        await AsyncStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
      }
    } catch (e) {
      console.error('Error deleting chat session:', e);
    }
  }

  /**
   * Rename a chat session.
   */
  static async renameSession(id: string, newTitle: string): Promise<void> {
    try {
      const sessions = await this.getAllSessions();
      const session = sessions.find((s) => s.id === id);
      if (session) {
        session.title = newTitle.trim() || 'Untitled Chat';
        session.updatedAt = Date.now();
        await AsyncStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
      }
    } catch (e) {
      console.error('Error renaming chat session:', e);
    }
  }

  /**
   * Get active session ID.
   */
  static async getActiveSessionId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEY_ACTIVE_ID);
    } catch (e) {
      return null;
    }
  }

  /**
   * Set active session ID.
   */
  static async setActiveSessionId(id: string | null): Promise<void> {
    try {
      if (id) {
        await AsyncStorage.setItem(STORAGE_KEY_ACTIVE_ID, id);
      } else {
        await AsyncStorage.removeItem(STORAGE_KEY_ACTIVE_ID);
      }
    } catch (e) {
      console.error('Error setting active session ID:', e);
    }
  }
}
