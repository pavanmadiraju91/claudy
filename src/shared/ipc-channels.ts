export const IPC_CHANNELS = {
  // PTY operations (renderer -> main) - kept for backward compat
  PTY_SPAWN: 'pty:spawn',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_KILL: 'pty:kill',

  // PTY events (main -> renderer)
  PTY_DATA: 'pty:data',
  PTY_EXIT: 'pty:exit',

  // Claude CLI session
  CLAUDE_START: 'claude:start',
  CLAUDE_WRITE: 'claude:write',
  CLAUDE_RESIZE: 'claude:resize',
  CLAUDE_DATA: 'claude:data',
  CLAUDE_EXIT: 'claude:exit',
  CLAUDE_READY: 'claude:ready',

  // Transcript watcher
  TRANSCRIPT_START: 'transcript:start',
  TRANSCRIPT_STOP: 'transcript:stop',
  TRANSCRIPT_MESSAGE: 'transcript:message',

  // Chat (from transcript)
  CHAT_MESSAGE: 'chat:message',
  CHAT_TOOL_START: 'chat:tool-start',
  CHAT_TOOL_END: 'chat:tool-end',
  CHAT_STATUS: 'chat:status',  // For thinking, processing, etc.
  CHAT_MODE: 'chat:mode',      // Permission mode (plan, auto-edit, etc.)
  CHAT_PROMPT: 'chat:prompt',  // Interactive prompt waiting for input

  // Game
  GAME_MOVE: 'game:move',

  // Window operations
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',

  // Dialog
  SHOW_FOLDER_DIALOG: 'dialog:show-folder',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
