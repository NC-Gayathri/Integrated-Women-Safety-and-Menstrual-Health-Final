import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { ChatMessage } from '../services/AIServiceInterface';

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.sender === 'user';

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      {!isUser && <Text style={styles.senderLabel}>Assistant</Text>}
      {isUser && <Text style={styles.senderLabel}>You</Text>}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        {isUser ? (
          <Text style={styles.userText}>{message.text}</Text>
        ) : (
          <Markdown style={markdownStyles}>
            {message.text}
          </Markdown>
        )}
      </View>
      {!isUser && (
        <View style={styles.feedbackContainer}>
          <TouchableOpacity style={styles.feedbackBtn}>
            <Text style={styles.feedbackEmoji}>👍</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.feedbackBtn}>
            <Text style={styles.feedbackEmoji}>👎</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    maxWidth: '85%',
  },
  userContainer: {
    alignSelf: 'flex-end',
  },
  assistantContainer: {
    alignSelf: 'flex-start',
  },
  senderLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8e24aa',
    marginBottom: 4,
    marginLeft: 6,
    letterSpacing: 0.3,
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  userBubble: {
    backgroundColor: '#8e24aa',
    borderBottomRightRadius: 4,
    shadowColor: '#8e24aa',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  assistantBubble: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(142, 36, 170, 0.12)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  userText: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  feedbackContainer: {
    flexDirection: 'row',
    marginTop: 6,
    marginLeft: 6,
  },
  feedbackBtn: {
    marginRight: 10,
    backgroundColor: '#f3e8f7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  feedbackEmoji: {
    fontSize: 13,
  }
});

const markdownStyles = {
  body: {
    color: '#2a0845',
    fontSize: 15,
    lineHeight: 23,
  },
  heading3: {
    fontSize: 17,
    fontWeight: '700' as const,
    marginTop: 10,
    marginBottom: 6,
    color: '#4a148c',
  }
};

