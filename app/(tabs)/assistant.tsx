import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { ChatBubble } from '../../components/ChatBubble';
import { ChatHistoryModal } from '../../components/ChatHistoryModal';
import { GeminiService } from '../../services/GeminiService';
import { EmergencyDetectionService } from '../../services/EmergencyDetectionService';
import { ChatSessionService, ChatSession } from '../../services/ChatSessionService';
import { ChatMessage } from '../../services/AIServiceInterface';
import { ApiService } from '../../services/ApiService';

const geminiService = new GeminiService();

export default function AssistantScreen() {
  const [currentSession, setCurrentSession] = useState<ChatSession>(() => ChatSessionService.createNewSession());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    initAssistant();
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  const initAssistant = async () => {
    await ChatSessionService.migrateLegacyHistoryIfNeeded();
    let allSessions = await ChatSessionService.getAllSessions();

    // Sync from MySQL assistant_chat table if local cache is empty
    try {
      const res = await ApiService.assistant.getHistory(50);
      const rows = res?.data || (Array.isArray(res) ? res : []);
      if (Array.isArray(rows) && rows.length > 0 && allSessions.length === 0) {
        const syncedMessages: ChatMessage[] = rows.map((r: any) => ({
          id: r.id.toString(),
          sender: r.role,
          text: r.message,
          timestamp: Number(r.timestamp) || new Date(r.created_at).getTime() || Date.now(),
        }));
        const syncedSession: ChatSession = {
          id: 'synced_session',
          title: 'Previous Conversation',
          createdAt: syncedMessages[0]?.timestamp || Date.now(),
          updatedAt: syncedMessages[syncedMessages.length - 1]?.timestamp || Date.now(),
          messages: syncedMessages,
        };
        await ChatSessionService.saveSession(syncedSession);
        allSessions = await ChatSessionService.getAllSessions();
      }
    } catch (e) {
      console.log('Error syncing remote assistant history:', e);
    }

    setSessions(allSessions);

    // Requirement #8: Open a fresh blank chat by default on app start.
    const freshSession = ChatSessionService.createNewSession();
    setCurrentSession(freshSession);
    setMessages([]);
  };

  const refreshSessions = async () => {
    const all = await ChatSessionService.getAllSessions();
    setSessions(all);
  };

  const startFreshSession = () => {
    const freshSession = ChatSessionService.createNewSession();
    setCurrentSession(freshSession);
    setMessages([]);
    ChatSessionService.setActiveSessionId(freshSession.id);
  };

  const handleNewChatPress = () => {
    if (messages.length === 0) {
      startFreshSession();
      return;
    }

    Alert.alert(
      "Start a new chat?",
      "Your current conversation has already been saved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start New Chat",
          onPress: () => {
            startFreshSession();
          }
        }
      ]
    );
  };

  const handleSelectSession = (session: ChatSession) => {
    setCurrentSession(session);
    setMessages(session.messages);
    ChatSessionService.setActiveSessionId(session.id);
  };

  const handleRenameSession = async (id: string, newTitle: string) => {
    await ChatSessionService.renameSession(id, newTitle);
    if (currentSession.id === id) {
      setCurrentSession((prev) => ({ ...prev, title: newTitle }));
    }
    refreshSessions();
  };

  const handleDeleteSession = async (id: string) => {
    await ChatSessionService.deleteSession(id);
    if (currentSession.id === id) {
      startFreshSession();
    }
    refreshSessions();
  };

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isOffline) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      timestamp: Date.now(),
      text: text.trim()
    };

    const isFirstUserMessage = messages.length === 0;
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setIsTyping(true);

    // Save user message immediately to session
    const updatedSession: ChatSession = {
      ...currentSession,
      updatedAt: Date.now(),
      messages: updatedMessages,
    };
    setCurrentSession(updatedSession);
    await ChatSessionService.saveSession(updatedSession);
    await ChatSessionService.setActiveSessionId(updatedSession.id);
    refreshSessions();

    // Persist user message to MySQL database
    ApiService.assistant.saveChat({
      role: 'user',
      message: userMsg.text,
      timestamp: userMsg.timestamp,
    }).catch(err => console.warn('Could not persist user chat message to MySQL:', err));

    // Check for emergency keywords first
    if (EmergencyDetectionService.detectEmergency(userMsg.text)) {
      const emergencyMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        timestamp: Date.now() + 1,
        text: EmergencyDetectionService.getEmergencyResourceMessage()
      };
      const messagesWithEmergency = [...updatedMessages, emergencyMsg];
      setMessages(messagesWithEmergency);
      const sessionWithEmergency: ChatSession = {
        ...updatedSession,
        updatedAt: Date.now(),
        messages: messagesWithEmergency,
      };
      setCurrentSession(sessionWithEmergency);
      await ChatSessionService.saveSession(sessionWithEmergency);
      refreshSessions();
      updatedMessages.push(emergencyMsg); // include in context window

      // Persist emergency assistant response to MySQL database
      ApiService.assistant.saveChat({
        role: 'assistant',
        message: emergencyMsg.text,
        timestamp: emergencyMsg.timestamp,
      }).catch(err => console.warn('Could not persist emergency chat response to MySQL:', err));
    }

    try {
      const aiResponseText = await geminiService.sendMessage(userMsg.text, updatedMessages);
      const aiMsg: ChatMessage = {
        id: (Date.now() + 2).toString(),
        sender: 'assistant',
        timestamp: Date.now() + 2,
        text: aiResponseText
      };

      const finalMessages = [...updatedMessages, aiMsg];
      setMessages(finalMessages);

      // Persist AI assistant response to MySQL database
      ApiService.assistant.saveChat({
        role: 'assistant',
        message: aiMsg.text,
        timestamp: aiMsg.timestamp,
      }).catch(err => console.warn('Could not persist AI chat response to MySQL:', err));

      // Automatic chat title generation after first AI response
      let finalTitle = currentSession.title;
      if (isFirstUserMessage || currentSession.title === 'New Chat') {
        try {
          const generatedTitle = await geminiService.generateTitle(userMsg.text);
          if (generatedTitle && generatedTitle !== 'New Conversation') {
            finalTitle = generatedTitle;
          }
        } catch (e) {
          console.warn('Title generation error:', e);
        }
      }

      const finalSession: ChatSession = {
        ...currentSession,
        title: finalTitle,
        updatedAt: Date.now(),
        messages: finalMessages,
      };
      setCurrentSession(finalSession);
      await ChatSessionService.saveSession(finalSession);
      refreshSessions();
    } catch (e: any) {
      const errorMsg: ChatMessage = {
        id: (Date.now() + 3).toString(),
        sender: 'assistant',
        timestamp: Date.now() + 3,
        text: e.message || "I'm sorry, I couldn't connect right now. Please try again."
      };
      const errorMessages = [...updatedMessages, errorMsg];
      setMessages(errorMessages);
      const errorSession: ChatSession = {
        ...currentSession,
        updatedAt: Date.now(),
        messages: errorMessages,
      };
      setCurrentSession(errorSession);
      await ChatSessionService.saveSession(errorSession);
      refreshSessions();
    } finally {
      setIsTyping(false);
    }
  };

  const renderSuggestedQuestions = () => (
    <View style={styles.suggestedContainer}>
      <Text style={styles.welcomeText}>
        Hello! I'm your Health & Safety Assistant. I can help answer general questions about women's safety, menstrual health, and emotional wellbeing. I provide educational guidance and first-step suggestions, but I'm not a substitute for doctors, mental health professionals, lawyers, or emergency services. How can I help you today?
      </Text>
      
      <Text style={styles.categoryTitle}>Women's Safety</Text>
      <TouchableOpacity style={styles.suggestionBtn} onPress={() => handleSend("How can I stay safe while traveling?")}>
        <Text style={styles.suggestionText}>How can I stay safe while traveling?</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.suggestionBtn} onPress={() => handleSend("What should I do if someone is following me?")}>
        <Text style={styles.suggestionText}>What should I do if someone is following me?</Text>
      </TouchableOpacity>

      <Text style={styles.categoryTitle}>Menstrual Health</Text>
      <TouchableOpacity style={styles.suggestionBtn} onPress={() => handleSend("What causes period cramps?")}>
        <Text style={styles.suggestionText}>What causes period cramps?</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.suggestionBtn} onPress={() => handleSend("How often should I change sanitary pads?")}>
        <Text style={styles.suggestionText}>How often should I change sanitary pads?</Text>
      </TouchableOpacity>

      <Text style={styles.categoryTitle}>Mental Wellbeing</Text>
      <TouchableOpacity style={styles.suggestionBtn} onPress={() => handleSend("I'm feeling anxious.")}>
        <Text style={styles.suggestionText}>I'm feeling anxious.</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.suggestionBtn} onPress={() => handleSend("How can I reduce stress?")}>
        <Text style={styles.suggestionText}>How can I reduce stress?</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Assistant Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7} onPress={() => setIsHistoryVisible(true)}>
          <Ionicons name="time-outline" size={24} color="#8e24aa" />
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {currentSession.title}
        </Text>

        <TouchableOpacity style={styles.newChatHeaderBtn} activeOpacity={0.85} onPress={handleNewChatPress}>
          <Ionicons name="add" size={16} color="#FFF" />
          <Text style={styles.newChatHeaderText}>New Chat</Text>
        </TouchableOpacity>
      </View>

      {/* Educational Disclaimer */}
      <View style={styles.disclaimerBox}>
        <Ionicons name="information-circle" size={16} color="#c2185b" style={{ marginRight: 6 }} />
        <Text style={styles.disclaimerText}>
          <Text style={{fontWeight: '700'}}>Educational Info Only.</Text> Assistant is not a substitute for medical or emergency advice.
        </Text>
      </View>

      {/* Offline Alert */}
      {isOffline && (
        <View style={styles.offlineBox}>
          <Ionicons name="wifi-outline" size={16} color="#c62828" style={{ marginRight: 6 }} />
          <Text style={styles.offlineText}>
            Offline. Please reconnect to chat with the assistant.
          </Text>
        </View>
      )}

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatBubble message={item} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderSuggestedQuestions}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
      />

      {/* Typing Indicator */}
      {isTyping && (
        <View style={styles.typingIndicator}>
          <ActivityIndicator size="small" color="#8e24aa" />
          <Text style={styles.typingText}>Aura Assistant is thinking...</Text>
        </View>
      )}

      {/* Input Field */}
      <View style={styles.inputContainer}>
        <Text style={styles.privacyNotice}>
          🔒 Private & Confidential • Avoid sharing passwords or bank details.
        </Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything about health or safety..."
            placeholderTextColor="#9c88b0"
            maxLength={1000}
            multiline
            editable={!isTyping && !isOffline}
          />
          <TouchableOpacity 
            style={[styles.sendBtn, (!input.trim() || isTyping || isOffline) && styles.sendBtnDisabled]} 
            onPress={() => handleSend()}
            disabled={!input.trim() || isTyping || isOffline}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
        <Text style={styles.charCount}>{input.length}/1000</Text>
      </View>

      {/* Chat History Modal */}
      <ChatHistoryModal
        visible={isHistoryVisible}
        sessions={sessions}
        activeSessionId={currentSession.id}
        onClose={() => setIsHistoryVisible(false)}
        onSelectSession={handleSelectSession}
        onNewChat={startFreshSession}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    paddingTop: Platform.OS === 'ios' ? 56 : 18,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(142, 36, 170, 0.08)',
    shadowColor: '#0F031D',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 3,
  },
  headerIconBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#f3e8f7',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#1C0D2B',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  newChatHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8e24aa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    shadowColor: '#8e24aa',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  newChatHeaderText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 2,
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fce4ec',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(233, 30, 99, 0.15)',
  },
  disclaimerText: {
    fontSize: 11,
    color: '#c2185b',
    textAlign: 'center',
  },
  offlineBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffebee',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  offlineText: {
    color: '#c62828',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  suggestedContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  welcomeText: {
    fontSize: 14,
    color: '#4a148c',
    lineHeight: 22,
    marginBottom: 20,
    textAlign: 'center',
    backgroundColor: '#ffffff',
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(142, 36, 170, 0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#8e24aa',
    marginTop: 14,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  suggestionBtn: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(142, 36, 170, 0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  suggestionText: {
    color: '#2a0845',
    fontSize: 14,
    fontWeight: '600',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  typingText: {
    marginLeft: 8,
    color: '#8e24aa',
    fontSize: 13,
    fontWeight: '600',
  },
  inputContainer: {
    padding: 14,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: 'rgba(142, 36, 170, 0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
  },
  privacyNotice: {
    fontSize: 11,
    color: '#7b688b',
    textAlign: 'center',
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#f7f2fa',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    minHeight: 44,
    maxHeight: 120,
    fontSize: 15,
    color: '#2a0845',
    borderWidth: 1,
    borderColor: 'rgba(142, 36, 170, 0.18)',
    marginRight: 10,
  },
  sendBtn: {
    backgroundColor: '#8e24aa',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#8e24aa',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  sendBtnDisabled: {
    backgroundColor: '#d1c4e9',
    shadowOpacity: 0,
    elevation: 0,
  },
  charCount: {
    fontSize: 10,
    color: '#9c88b0',
    textAlign: 'right',
    marginTop: 4,
    marginRight: 56,
  }
});

