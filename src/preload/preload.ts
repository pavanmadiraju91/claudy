import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import { PtyOptions, ChatMessage, GameMoveEvent, ToolEvent } from '../shared/types';

// Type definitions for the exposed API
export interface TerminalAPI {
  spawn: (options: PtyOptions) => Promise<{ success: boolean; error?: string }>;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => Promise<{ success: boolean }>;
  onData: (callback: (data: string) => void) => () => void;
  onExit: (callback: (exitCode: number) => void) => () => void;
}

export interface WindowAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

export interface StatusEvent {
  status: 'thinking' | 'tool' | null;
  text?: string;
  tool?: string;
}

export interface PtyOptionData {
  label: string;
  description: string;
  selected: boolean;
}

export interface ProgressStepData {
  header: string;
  completed: boolean;
  active: boolean;
}

export interface PromptData {
  type: string;
  options?: string[];
  ptyOptions?: PtyOptionData[];
  progress?: ProgressStepData[];
  questionText?: string;
  detected?: boolean;
}

export interface ElectronAPI {
  // PTY (Claude session)
  ptyStart: (cwd: string) => Promise<{ success: boolean; error?: string }>;
  ptyWrite: (data: string) => void;
  ptyResize: (cols: number, rows: number) => void;
  onPtyData: (callback: (data: string) => void) => () => void;
  onPtyExit: (callback: (code: number) => void) => () => void;
  onClaudeReady: (callback: () => void) => () => void;

  // Chat (from transcript)
  onChatMessage: (callback: (msg: ChatMessage) => void) => () => void;
  onChatToolStart: (callback: (data: ToolEvent) => void) => () => void;
  onChatToolEnd: (callback: () => void) => () => void;
  onChatStatus: (callback: (data: StatusEvent) => void) => () => void;
  onChatMode: (callback: (data: { mode: string }) => void) => () => void;
  onChatPrompt: (callback: (data: PromptData) => void) => () => void;

  // Game
  onGameMove: (callback: (data: GameMoveEvent) => void) => () => void;

  // Dialog
  showFolderDialog: () => Promise<string | null>;

  // Utilities
  getCwd: () => string;
}

// Legacy terminal API (for backward compat)
contextBridge.exposeInMainWorld('terminalAPI', {
  spawn: (options: PtyOptions) => {
    return ipcRenderer.invoke(IPC_CHANNELS.PTY_SPAWN, options);
  },

  write: (data: string) => {
    ipcRenderer.send(IPC_CHANNELS.PTY_WRITE, data);
  },

  resize: (cols: number, rows: number) => {
    ipcRenderer.send(IPC_CHANNELS.PTY_RESIZE, cols, rows);
  },

  kill: () => {
    return ipcRenderer.invoke(IPC_CHANNELS.PTY_KILL);
  },

  onData: (callback: (data: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: string) => {
      callback(data);
    };
    ipcRenderer.on(IPC_CHANNELS.PTY_DATA, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.PTY_DATA, listener);
    };
  },

  onExit: (callback: (exitCode: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, exitCode: number) => {
      callback(exitCode);
    };
    ipcRenderer.on(IPC_CHANNELS.PTY_EXIT, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.PTY_EXIT, listener);
    };
  },
} as TerminalAPI);

// Window API
contextBridge.exposeInMainWorld('windowAPI', {
  minimize: () => {
    ipcRenderer.send(IPC_CHANNELS.WINDOW_MINIMIZE);
  },

  maximize: () => {
    ipcRenderer.send(IPC_CHANNELS.WINDOW_MAXIMIZE);
  },

  close: () => {
    ipcRenderer.send(IPC_CHANNELS.WINDOW_CLOSE);
  },
} as WindowAPI);

// New unified Electron API
contextBridge.exposeInMainWorld('electronAPI', {
  // Utilities
  getCwd: () => process.cwd(),

  // PTY (Claude session)
  ptyStart: (cwd: string) => {
    return ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_START, cwd);
  },

  ptyWrite: (data: string) => {
    ipcRenderer.send(IPC_CHANNELS.CLAUDE_WRITE, data);
  },

  ptyResize: (cols: number, rows: number) => {
    ipcRenderer.send(IPC_CHANNELS.CLAUDE_RESIZE, cols, rows);
  },

  onPtyData: (callback: (data: string) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: string) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.CLAUDE_DATA, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_DATA, handler);
  },

  onPtyExit: (callback: (code: number) => void) => {
    const handler = (_: Electron.IpcRendererEvent, code: number) => callback(code);
    ipcRenderer.on(IPC_CHANNELS.CLAUDE_EXIT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_EXIT, handler);
  },

  onClaudeReady: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.CLAUDE_READY, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_READY, handler);
  },

  // Chat (from transcript)
  onChatMessage: (callback: (msg: ChatMessage) => void) => {
    const handler = (_: Electron.IpcRendererEvent, msg: ChatMessage) => callback(msg);
    ipcRenderer.on(IPC_CHANNELS.CHAT_MESSAGE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_MESSAGE, handler);
  },

  onChatToolStart: (callback: (data: ToolEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: ToolEvent) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.CHAT_TOOL_START, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_TOOL_START, handler);
  },

  onChatToolEnd: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.CHAT_TOOL_END, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_TOOL_END, handler);
  },

  onChatStatus: (callback: (data: StatusEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: StatusEvent) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.CHAT_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STATUS, handler);
  },

  onChatMode: (callback: (data: { mode: string }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: { mode: string }) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.CHAT_MODE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_MODE, handler);
  },

  onChatPrompt: (callback: (data: PromptData) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: PromptData) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.CHAT_PROMPT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CHAT_PROMPT, handler);
  },

  // Game
  onGameMove: (callback: (data: GameMoveEvent) => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: GameMoveEvent) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.GAME_MOVE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.GAME_MOVE, handler);
  },

  // Dialog
  showFolderDialog: (): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SHOW_FOLDER_DIALOG);
  },
} as ElectronAPI);

// Type declarations for the renderer
declare global {
  interface Window {
    terminalAPI: TerminalAPI;
    windowAPI: WindowAPI;
    electronAPI: ElectronAPI;
  }
}
