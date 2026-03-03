import { useState, useEffect, useCallback } from 'react';
import { ChatMessage, ToolEvent } from '../../shared/types';

interface StatusInfo {
  status: 'thinking' | 'tool' | null;
  text?: string;
  tool?: string;
}

interface QuestionOption {
  label: string;
  description: string;
}

interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

// PTY-parsed option with full details
interface PtyOption {
  label: string;
  description: string;
  selected: boolean;
}

// Progress step from PTY checkboxes (☐/✔)
interface ProgressStep {
  header: string;
  completed: boolean;
  active: boolean;
}

interface PromptInfo {
  type: string;
  options?: string[];
  questions?: Question[];          // From transcript (backup/legacy)
  question?: string;               // For PTY-detected questions
  questionText?: string;           // Actual question text from PTY
  ptyOptions?: PtyOption[];        // From PTY - full options with descriptions
  progress?: ProgressStep[];       // From PTY - progress bar state
}

interface UseTranscriptReturn {
  messages: ChatMessage[];
  activeTool: string | null;
  statusInfo: StatusInfo | null;
  permissionMode: string | null;
  pendingPrompt: PromptInfo | null;
  isLoading: boolean; // New: true when waiting for response
  clearMessages: () => void;
  clearPrompt: () => void;
}

export function useTranscript(): UseTranscriptReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [statusInfo, setStatusInfo] = useState<StatusInfo | null>(null);
  const [permissionMode, setPermissionMode] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PromptInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Subscribe to chat messages
    const unsubMessage = window.electronAPI.onChatMessage((msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);

      // User message starts loading, assistant/plan message ends it
      if (msg.role === 'user') {
        setIsLoading(true);
      } else if (msg.role === 'assistant' || msg.role === 'plan') {
        setIsLoading(false);
      }
    });

    // Subscribe to tool events
    const unsubToolStart = window.electronAPI.onChatToolStart((data: ToolEvent) => {
      setActiveTool(data.tool);
    });

    const unsubToolEnd = window.electronAPI.onChatToolEnd(() => {
      setActiveTool(null);
    });

    // Subscribe to status events
    const unsubStatus = window.electronAPI.onChatStatus((data: StatusInfo) => {
      if (data.status === null) {
        setStatusInfo(null);
      } else {
        setStatusInfo(data);
        // Thinking status means loading
        if (data.status === 'thinking') {
          setIsLoading(true);
        }
      }
    });

    // Subscribe to mode changes
    const unsubMode = window.electronAPI.onChatMode((data: { mode: string }) => {
      setPermissionMode(data.mode);
    });

    // Subscribe to prompt events
    // PTY-only approach: all data comes from PTY output parsing
    const unsubPrompt = window.electronAPI.onChatPrompt((data: PromptInfo) => {
      console.log('[useTranscript] Received prompt:', data.type, 'ptyOptions:', data.ptyOptions?.length, 'progress:', data.progress?.length);
      setPendingPrompt(data);
      // Prompt means we're no longer loading
      setIsLoading(false);
    });

    return () => {
      unsubMessage();
      unsubToolStart();
      unsubToolEnd();
      unsubStatus();
      unsubMode();
      unsubPrompt();
    };
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const clearPrompt = useCallback(() => {
    setPendingPrompt(null);
  }, []);

  return { messages, activeTool, statusInfo, permissionMode, pendingPrompt, isLoading, clearMessages, clearPrompt };
}
