import React, { useState, useRef, useEffect } from 'react';
import './ChatInput.css';

interface ChatInputProps {
  onSend: (text: string) => void;
  isVisible: boolean;
  isPlanMode?: boolean;
  onEnablePlanMode?: () => void;
}

function ChatInput({ onSend, isVisible, isPlanMode = false, onEnablePlanMode }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus input when tab becomes visible
  useEffect(() => {
    if (isVisible && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isVisible]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends (Shift+Enter for newline)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (trimmed) {
      onSend(trimmed);
      setText('');
    }
  };

  const handleModeClick = () => {
    // Only allow clicking to enable plan mode when it's off
    if (!isPlanMode && onEnablePlanMode) {
      onEnablePlanMode();
    }
  };

  return (
    <div className="chat-input-container">
      <textarea
        ref={textareaRef}
        className="chat-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        rows={3}
      />
      <div className="chat-input-actions">
        {/* Plan mode status - clickable only when OFF */}
        <div
          className={`mode-status ${isPlanMode ? 'active' : 'clickable'}`}
          onClick={handleModeClick}
          title={isPlanMode ? 'Plan mode is active' : 'Click to enable plan mode'}
        >
          <span className="mode-dot"></span>
          <span className="mode-label">
            {isPlanMode ? 'Plan Mode ON' : 'Plan Mode OFF'}
          </span>
        </div>

        <button
          className="chat-send-button"
          onClick={handleSend}
          disabled={!text.trim()}
        >
          SEND
        </button>
      </div>
    </div>
  );
}

export default ChatInput;
