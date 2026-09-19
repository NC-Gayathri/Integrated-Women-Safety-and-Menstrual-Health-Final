import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ChatSession } from '../services/ChatSessionService';

interface ChatHistoryModalProps {
  visible: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onClose: () => void;
  onSelectSession: (session: ChatSession) => void;
  onNewChat: () => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onDeleteSession: (id: string) => void;
}

export function ChatHistoryModal({
  visible,
  sessions,
  activeSessionId,
  onClose,
  onSelectSession,
  onNewChat,
  onRenameSession,
  onDeleteSession,
}: ChatHistoryModalProps) {
  const [editingSession, setEditingSession] = useState<ChatSession | null>(null);
  const [renameInput, setRenameInput] = useState('');

  const groupSessionsByDate = (allSessions: ChatSession[]) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOfSevenDaysAgo = startOfToday - 6 * 86400000;

    const today: ChatSession[] = [];
    const yesterday: ChatSession[] = [];
    const last7Days: ChatSession[] = [];
    const older: ChatSession[] = [];

    for (const session of allSessions) {
      if (session.updatedAt >= startOfToday) {
        today.push(session);
      } else if (session.updatedAt >= startOfYesterday) {
        yesterday.push(session);
      } else if (session.updatedAt >= startOfSevenDaysAgo) {
        last7Days.push(session);
      } else {
        older.push(session);
      }
    }

    const sections = [];
    if (today.length > 0) sections.push({ title: 'Today', data: today });
    if (yesterday.length > 0) sections.push({ title: 'Yesterday', data: yesterday });
    if (last7Days.length > 0) sections.push({ title: 'Last 7 Days', data: last7Days });
    if (older.length > 0) sections.push({ title: 'Older', data: older });

    return sections;
  };

  const handleStartRename = (session: ChatSession) => {
    setEditingSession(session);
    setRenameInput(session.title);
  };

  const handleSaveRename = () => {
    if (editingSession) {
      if (renameInput.trim()) {
        onRenameSession(editingSession.id, renameInput.trim());
      }
      setEditingSession(null);
      setRenameInput('');
    }
  };

  const handleDeleteConfirm = (session: ChatSession) => {
    Alert.alert(
      'Delete Conversation',
      `Are you sure you want to delete "${session.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDeleteSession(session.id),
        },
      ]
    );
  };

  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const sections = groupSessionsByDate(sessions);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Chat History</Text>
          <TouchableOpacity
            style={styles.newChatBtn}
            onPress={() => {
              onClose();
              onNewChat();
            }}
          >
            <Ionicons name="add" size={20} color="#FFF" />
            <Text style={styles.newChatText}>New Chat</Text>
          </TouchableOpacity>
        </View>

        {/* Sessions List */}
        {sessions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color="#CCC" />
            <Text style={styles.emptyText}>No saved chat history yet.</Text>
            <Text style={styles.emptySubtext}>Start a conversation to see your history here.</Text>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderSectionHeader={({ section: { title } }) => (
              <Text style={styles.sectionHeader}>{title}</Text>
            )}
            renderItem={({ item }) => {
              const isActive = item.id === activeSessionId;
              return (
                <View style={[styles.sessionCard, isActive && styles.activeSessionCard]}>
                  <TouchableOpacity
                    style={styles.sessionMainInfo}
                    onPress={() => {
                      onSelectSession(item);
                      onClose();
                    }}
                  >
                    <View style={styles.titleRow}>
                      <Ionicons
                        name={isActive ? 'chatbubble-ellipses' : 'chatbubble-outline'}
                        size={18}
                        color={isActive ? '#e91e63' : '#666'}
                        style={styles.chatIcon}
                      />
                      <Text style={[styles.sessionTitle, isActive && styles.activeTitle]} numberOfLines={1}>
                        {item.title}
                      </Text>
                    </View>
                    <Text style={styles.sessionSubtitle}>
                      {item.messages.length} message{item.messages.length !== 1 ? 's' : ''} • {formatTime(item.updatedAt)}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleStartRename(item)}>
                      <Ionicons name="create-outline" size={18} color="#666" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleDeleteConfirm(item)}>
                      <Ionicons name="trash-outline" size={18} color="#e91e63" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Inline Rename Dialog Modal */}
        <Modal
          visible={!!editingSession}
          transparent
          animationType="fade"
          onRequestClose={() => setEditingSession(null)}
        >
          <KeyboardAvoidingView
            style={styles.renameOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.renameBox}>
              <Text style={styles.renameHeading}>Rename Conversation</Text>
              <TextInput
                style={styles.renameInput}
                value={renameInput}
                onChangeText={setRenameInput}
                placeholder="Enter new title..."
                autoFocus
                maxLength={50}
              />
              <View style={styles.renameButtons}>
                <TouchableOpacity
                  style={[styles.renameBtn, styles.renameCancelBtn]}
                  onPress={() => setEditingSession(null)}
                >
                  <Text style={styles.renameCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.renameBtn, styles.renameSaveBtn]}
                  onPress={handleSaveRename}
                >
                  <Text style={styles.renameSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcf8fd',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(142, 36, 170, 0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 3,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#f3e8f7',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#2a0845',
    letterSpacing: 0.3,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8e24aa',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#8e24aa',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  newChatText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8e24aa',
    marginTop: 18,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(142, 36, 170, 0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  activeSessionCard: {
    borderColor: '#8e24aa',
    backgroundColor: '#f8effc',
  },
  sessionMainInfo: {
    flex: 1,
    marginRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatIcon: {
    marginRight: 8,
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2a0845',
    flex: 1,
  },
  activeTitle: {
    color: '#8e24aa',
    fontWeight: '800',
  },
  sessionSubtitle: {
    fontSize: 12,
    color: '#7b688b',
    marginTop: 4,
    marginLeft: 26,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 8,
    marginLeft: 4,
    borderRadius: 12,
    backgroundColor: '#f5ebf9',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#4a148c',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#7b688b',
    marginTop: 6,
    textAlign: 'center',
  },
  renameOverlay: {
    flex: 1,
    backgroundColor: 'rgba(20, 5, 30, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  renameBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 22,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  renameHeading: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2a0845',
    marginBottom: 14,
  },
  renameInput: {
    backgroundColor: '#f7f2fa',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#2a0845',
    borderWidth: 1,
    borderColor: 'rgba(142, 36, 170, 0.2)',
    marginBottom: 18,
  },
  renameButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  renameBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginLeft: 10,
  },
  renameCancelBtn: {
    backgroundColor: '#eee5f3',
  },
  renameCancelText: {
    color: '#6b5b7b',
    fontWeight: '700',
  },
  renameSaveBtn: {
    backgroundColor: '#8e24aa',
  },
  renameSaveText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});

