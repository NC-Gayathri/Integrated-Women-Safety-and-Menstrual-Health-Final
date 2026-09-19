export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  timestamp: number;
  text: string;
}

export interface AIServiceInterface {
  sendMessage(message: string, history: ChatMessage[]): Promise<string>;
  generateTitle(firstMessage: string): Promise<string>;
}
