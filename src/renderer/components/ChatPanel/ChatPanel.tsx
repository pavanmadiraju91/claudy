import React, { useRef, useEffect } from 'react';
import { useTranscript } from '../../hooks/useTranscript';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import ActionPrompt from './ActionPrompt';
import './ChatPanel.css';

interface ChatPanelProps {
  isVisible: boolean;
}

// Map PTY prompt types to ActionPrompt types
function mapPromptType(ptyType: string): 'plan-ready' | 'plan-execute' | 'permission' | 'confirm' | 'ask-user' | 'ask-user-submit' | 'ask-user-pty' | 'ask-user-terminal' | 'trust-folder' {
  switch (ptyType) {
    case 'trust-folder':
      return 'trust-folder';
    case 'ask-user':
      return 'ask-user';
    case 'ask-user-submit':
      return 'ask-user-submit';
    case 'ask-user-pty':
      return 'ask-user-pty';
    case 'ask-user-terminal':
      return 'ask-user-terminal';
    case 'plan-execute':
      return 'plan-execute';
    case 'permission':
    case 'yes-no-always':
      return 'permission';
    default:
      return 'confirm';
  }
}

function ChatPanel({ isVisible }: ChatPanelProps) {
  const { messages, activeTool, permissionMode, pendingPrompt, isLoading, clearPrompt } = useTranscript();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // PTY-only approach: no transcript merging needed
  // All question data (progress, question text, options with descriptions) comes from PTY parsing
  console.log('[ChatPanel] Render - pendingPrompt:', pendingPrompt?.type, 'ptyOptions:', pendingPrompt?.ptyOptions?.length);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, pendingPrompt, isLoading]);

  const handleSendMessage = (text: string) => {
    // Write to PTY (same session as Terminal)
    window.electronAPI.ptyWrite(text);
    setTimeout(() => {
      window.electronAPI.ptyWrite('\r');
    }, 10);
  };

  const handleActionResponse = (response: string) => {
    // Send the response to PTY - atomic write to avoid race conditions
    if (response === 'enter') {
      window.electronAPI.ptyWrite('\r');
    } else {
      // Send response + Enter together to prevent wizard step skipping
      window.electronAPI.ptyWrite(response + '\r');
    }
    // Clear the prompt after responding
    clearPrompt();
  };

  const isPlanMode = permissionMode === 'plan';

  const handleEnablePlanMode = () => {
    window.electronAPI.ptyWrite('/plan');
    setTimeout(() => {
      window.electronAPI.ptyWrite('\r');
    }, 10);
  };

  return (
    <div className="chat-panel">
      {/* Messages area */}
      <div className="chat-messages">
        {messages.length === 0 && !pendingPrompt ? (
          <div className="chat-empty">
            <div className="chat-empty-title">Chat with Claude</div>
            <p>No messages yet.</p>
            <p className="chat-hint">Type below to start a conversation.</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isActive={msg.role === 'tool' && msg.toolName === activeTool}
              />
            ))}
            {pendingPrompt && (
              <ActionPrompt
                type={mapPromptType(pendingPrompt.type)}
                message={pendingPrompt.question}
                options={pendingPrompt.options}
                questions={pendingPrompt.questions}
                questionText={pendingPrompt.questionText}
                ptyOptions={pendingPrompt.ptyOptions}
                progress={pendingPrompt.progress}
                onAction={handleActionResponse}
              />
            )}
          </>
        )}

        {/* Typing indicator */}
        {isLoading && (
          <div className="typing-indicator">
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
            <button
              className="stop-button"
              onClick={() => {
                // Send Escape to cancel (double-tap for reliability)
                window.electronAPI.ptyWrite('\x1b');
                setTimeout(() => window.electronAPI.ptyWrite('\x1b'), 50);
              }}
              title="Stop (Esc)"
            >
              ■ Stop
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <ChatInput
        onSend={handleSendMessage}
        isVisible={isVisible}
        isPlanMode={isPlanMode}
        onEnablePlanMode={handleEnablePlanMode}
      />
    </div>
  );
}

export default ChatPanel;
