import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage } from '../../../shared/types';
import './MessageBubble.css';

interface MessageBubbleProps {
  message: ChatMessage;
  isActive?: boolean;  // true if this tool is currently running
}

// Tool icons (simple text-based for now)
const TOOL_ICONS: Record<string, string> = {
  Read: '📄',
  Glob: '🔍',
  Grep: '🔎',
  Edit: '✏️',
  Write: '📝',
  Bash: '⚡',
  WebSearch: '🌐',
  WebFetch: '🌐',
  Task: '🤖',
  AskUserQuestion: '❓',
};

function MessageBubble({ message, isActive = false }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  const isPlan = message.role === 'plan';

  // Tool indicator - inline, compact
  if (isTool) {
    const icon = TOOL_ICONS[message.toolName || ''] || '⚙️';
    return (
      <div className={`tool-indicator ${isActive ? 'active' : ''}`}>
        <span className="tool-icon">{icon}</span>
        <span className="tool-action">{message.content}</span>
        {message.toolInput && (
          <span className="tool-target">{message.toolInput}</span>
        )}
      </div>
    );
  }

  // Plan display - collapsible with full markdown
  if (isPlan) {
    return (
      <div className="plan-bubble">
        <div className="plan-header">
          <span className="plan-icon">📋</span>
          <span className="plan-title">Plan Ready</span>
        </div>
        <div className="plan-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-role">
        {isUser ? '> YOU' : '< CLAUDE'}
      </div>
      <div className="message-content">
        {isUser ? (
          message.content
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
