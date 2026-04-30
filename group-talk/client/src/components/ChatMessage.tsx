import React from 'react';
import './ChatMessage.css';

interface ChatMessageProps {
  message: {
    id: string;
    type: 'text' | 'system' | 'ai';
    content: string;
    timestamp: string | Date;
    sender: any;
  };
  currentUserId?: string;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, currentUserId }) => {
  if (message.type === 'system') {
    return (
      <div className="system-message">
        <span>{message.content}</span>
      </div>
    );
  }

  const isCurrentUser = message.sender?.id === currentUserId;
  const isAI = message.sender?.isAI;
  const senderLabel = isAI ? (message.sender?.roleLabel || message.sender?.name) : message.sender?.name;

  return (
    <div className={`message ${isCurrentUser ? 'current-user' : ''} ${isAI ? 'ai-message' : ''}`}>
      <div className="message-header">
        <span 
          className="sender-name" 
          style={{ color: message.sender?.color }}
        >
          {senderLabel}
        </span>
        <span className="message-time">
          {new Date(message.timestamp).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
      </div>
      <div className="message-content">
        <p>{message.content}</p>
      </div>
    </div>
  );
};

export default ChatMessage;
