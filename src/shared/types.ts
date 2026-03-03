export interface PtyOptions {
  cols: number;
  rows: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface CommandBlock {
  id: string;
  command: string;
  output: string;
  startTime: number;
  endTime?: number;
  exitCode?: number;
  isRunning: boolean;
  isCollapsed: boolean;
}

export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface SearchResult {
  resultIndex: number;
  totalResults: number;
}

// Claude message types from transcript
export interface ClaudeMessage {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'system';
  content: string;
  timestamp: number;
  toolName?: string;
}

// Chat message for UI display
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'plan';
  content: string;
  timestamp: number;
  toolName?: string;
  toolInput?: string;  // e.g., file path, command, pattern
}

// Game move event for Godot - full message format
export type GameMoveEvent = UiInstructionEvent | AgentEvent | PlanningEvent;

export interface UiInstructionEvent {
  type: 'ui_instruction';
  payload: UiInstructionPayload;
}

export interface AgentEvent {
  type: 'agent_event';
  payload: AgentEventPayload;
}

export interface PlanningEvent {
  type: 'planning';
  payload: PlanningPayload;
}

export interface UiInstructionPayload {
  character_action?: string;
  ui_type?: string;
  content?: string;
  emotion?: 'thinking' | 'focused' | 'happy' | 'worried' | 'neutral';
  custom_status?: string;
  hide_status?: boolean;
}

export interface AgentEventPayload {
  agent_type: 'spawn' | 'complete' | 'update';
  agent_id: string;
  agent_name?: string;
  status?: string;
}

export interface PlanningPayload {
  status: 'started' | 'progress' | 'complete';
  progress?: number;
}

// Tool event for UI indicator
export interface ToolEvent {
  tool: string;
}
