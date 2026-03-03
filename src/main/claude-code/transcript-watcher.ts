import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { GameMoveEvent } from '../../shared/types';

let watcher: chokidar.FSWatcher | null = null;
let mainWindow: BrowserWindow | null = null;
let bytePosition: number = 0;  // Track bytes, not lines
let lineBuffer: string = '';   // Buffer for incomplete lines
let sessionFile: string | null = null;
let currentPlanFile: string | null = null;  // Track the current plan file path

// Fallback mechanism for trust flow timing race
let watcherStartTime: number = 0;
let fallbackCheckScheduled = false;
let projectDir: string = '';
let fallbackRetryCount = 0;
const MAX_FALLBACK_RETRIES = 10;

// Map tool names to game destinations (must match Godot game's destination names)
// Valid destinations: desk, terminal, cabinet, bookshelf, door, center, corner_office
const TOOL_LOCATIONS: Record<string, string> = {
  Read: 'cabinet',
  Glob: 'cabinet',
  Grep: 'cabinet',
  Edit: 'desk',
  Write: 'desk',
  Bash: 'terminal',
  WebSearch: 'bookshelf',
  WebFetch: 'bookshelf',
  Task: 'center',
  AskUserQuestion: 'center',
};

// Map tool names to status bubble text
const TOOL_STATUS: Record<string, string> = {
  Read: 'Reading...',
  Glob: 'Searching...',
  Grep: 'Searching...',
  Edit: 'Editing...',
  Write: 'Writing...',
  Bash: 'Running...',
  WebSearch: 'Searching web...',
  WebFetch: 'Fetching...',
  Task: 'Spawning agent...',
  AskUserQuestion: 'Asking...',
};

// Track state for smart game events
let claudeState: 'idle' | 'thinking' | 'tool_use' = 'idle';
let activeAgents: Map<string, string> = new Map(); // taskId -> agentName
let taskToolIds: Set<string> = new Set(); // Track which tool_use IDs are Task calls

/**
 * Convert a cwd path to Claude's project directory name
 */
function cwdToClaudeProjectDir(cwd: string): string {
  const sanitized = cwd.replace(/\//g, '-');
  return path.join(os.homedir(), '.claude', 'projects', sanitized);
}

/**
 * Reinitialize chokidar to watch a now-existing directory
 * Called when fallback detects directory was created after initial watch attempt
 */
function reinitializeWatcher(): void {
  if (!watcher) return;

  const globPattern = path.join(projectDir, '*.jsonl');
  console.log('[TranscriptWatcher] Reinitializing watcher for:', globPattern);

  // Close existing watcher
  watcher.close();

  // Create new watcher for the now-existing directory
  watcher = chokidar.watch(globPattern, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 },
    usePolling: true,
    interval: 100,
    ignorePermissionErrors: true,
  });

  // Re-attach event handlers
  watcher.on('add', (filePath) => {
    console.log('[TranscriptWatcher] New file detected:', path.basename(filePath));
    if (!sessionFile) {
      sessionFile = filePath;
      bytePosition = 0;
      lineBuffer = '';
      console.log('[TranscriptWatcher] Locked to NEW session:', path.basename(filePath));
    }
  });

  watcher.on('change', (filePath) => {
    if (sessionFile && filePath === sessionFile) {
      processNewLines(filePath);
    }
  });

  watcher.on('error', (error) => {
    console.error('[TranscriptWatcher] Error:', error);
  });
}

/**
 * Fallback: scan for files created after watcher start if we miss the 'add' event
 * This handles the race condition when Claude creates the JSONL file during trust flow
 */
function checkForMissedFiles(): void {
  if (sessionFile) return; // Already locked

  // Check if directory exists (it won't for untrusted folders until after trust)
  if (!fs.existsSync(projectDir)) {
    console.log('[TranscriptWatcher] Fallback: directory not yet created, will retry');
    if (fallbackRetryCount < MAX_FALLBACK_RETRIES) {
      fallbackRetryCount++;
      setTimeout(checkForMissedFiles, 1000); // Retry every 1 second
    }
    return;
  }

  try {
    const files = fs.readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const fullPath = path.join(projectDir, f);
        return { name: f, path: fullPath, mtime: fs.statSync(fullPath).mtimeMs };
      })
      .filter(f => f.mtime > watcherStartTime)
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > 0) {
      console.log('[TranscriptWatcher] Fallback: locking to', files[0].name);
      sessionFile = files[0].path;
      bytePosition = 0;
      lineBuffer = '';

      // Reinitialize chokidar now that directory exists
      reinitializeWatcher();

      processNewLines(sessionFile);
    } else if (fallbackRetryCount < MAX_FALLBACK_RETRIES) {
      // Directory exists but no new files yet, retry
      fallbackRetryCount++;
      console.log('[TranscriptWatcher] Fallback: no new files yet, retry', fallbackRetryCount);
      setTimeout(checkForMissedFiles, 1000);
    }
  } catch (error) {
    console.error('[TranscriptWatcher] Fallback scan error:', error);
  }
}

/**
 * Start watching for transcript changes - only for OUR session
 *
 * Key insight: We only lock to NEW files created after the watcher starts.
 * This prevents locking to external Claude sessions (like Claude Code) that
 * were started before Emu.
 *
 * - ignoreInitial: true means existing files don't trigger 'add' events
 * - We only lock via the 'add' event (truly new files)
 * - 'change' events on pre-existing files are ignored until we have a session
 */
export function startTranscriptWatcher(window: BrowserWindow, cwd?: string): void {
  mainWindow = window;

  projectDir = cwd ? cwdToClaudeProjectDir(cwd) : path.join(os.homedir(), '.claude', 'projects');
  const globPattern = path.join(projectDir, '*.jsonl');

  console.log('[TranscriptWatcher] Watching:', globPattern);

  // Clear any previous state
  sessionFile = null;
  bytePosition = 0;
  lineBuffer = '';
  currentPlanFile = null;

  // Record start time for fallback file detection
  watcherStartTime = Date.now();
  fallbackCheckScheduled = false;
  fallbackRetryCount = 0;

  watcher = chokidar.watch(globPattern, {
    persistent: true,
    ignoreInitial: true,  // Don't fire 'add' for existing files
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 },
    usePolling: true,
    interval: 100,
    ignorePermissionErrors: true,
  });

  // Schedule fallback check 2 seconds after start to catch files created during trust flow
  setTimeout(checkForMissedFiles, 2000);

  // Only lock to NEW files (created after watcher starts)
  watcher.on('add', (filePath) => {
    console.log('[TranscriptWatcher] New file detected:', path.basename(filePath));

    if (!sessionFile) {
      sessionFile = filePath;
      bytePosition = 0;
      lineBuffer = '';
      console.log('[TranscriptWatcher] Locked to NEW session:', path.basename(filePath));
    } else {
      console.log('[TranscriptWatcher] Ignoring (already locked):', path.basename(filePath));
    }
  });

  // Only process changes for OUR session file
  watcher.on('change', (filePath) => {
    if (sessionFile && filePath === sessionFile) {
      processNewLines(filePath);
    } else if (!sessionFile && !fallbackCheckScheduled) {
      // If we get a change but have no session file, run fallback check
      fallbackCheckScheduled = true;
      setTimeout(checkForMissedFiles, 100);
    }
    // Ignore changes to other files (including pre-existing external sessions)
  });

  watcher.on('error', (error) => {
    console.error('[TranscriptWatcher] Error:', error);
  });
}

/**
 * Process new lines from the transcript file
 */
function processNewLines(filePath: string): void {
  try {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    if (fileSize <= bytePosition) {
      return; // No new data
    }

    // Read only the new bytes
    const fd = fs.openSync(filePath, 'r');
    const bytesToRead = fileSize - bytePosition;
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(fd, buffer, 0, bytesToRead, bytePosition);
    fs.closeSync(fd);

    const newData = buffer.toString('utf8');
    bytePosition = fileSize;

    // Combine with any leftover from previous read
    const combined = lineBuffer + newData;
    const lines = combined.split('\n');

    // Keep the last part if it's incomplete (no trailing newline)
    if (!combined.endsWith('\n')) {
      lineBuffer = lines.pop() || '';
    } else {
      lineBuffer = '';
    }

    console.log('[TranscriptWatcher] Processing', lines.filter(l => l.trim()).length, 'new lines');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const entry = JSON.parse(trimmed);
        console.log('[TranscriptWatcher] Entry type:', entry.type);
        handleTranscriptEntry(entry);
      } catch (parseError) {
        // Skip malformed lines
      }
    }
  } catch (error) {
    console.error('[TranscriptWatcher] Error reading file:', error);
  }
}

/**
 * Handle a single transcript entry
 */
function handleTranscriptEntry(entry: any): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const entryType = entry.type;

  // Handle permission mode changes
  if (entry.permissionMode) {
    mainWindow.webContents.send(IPC_CHANNELS.CHAT_MODE, {
      mode: entry.permissionMode,
    });
  }

  // Handle tool_result - tool has completed, return to desk
  if (entryType === 'tool_result') {
    console.log('[TranscriptWatcher] Tool result received, returning to desk');
    mainWindow.webContents.send(IPC_CHANNELS.CHAT_TOOL_END);
    sendReturnToDesk();
  }

  // Handle user messages
  if (entryType === 'user' && entry.message?.content) {
    const content = typeof entry.message.content === 'string'
      ? entry.message.content
      : '';
    // Skip internal CLI messages
    if (content && !isInternalMessage(content)) {
      console.log('[TranscriptWatcher] User:', content.substring(0, 50));
      mainWindow.webContents.send(IPC_CHANNELS.CHAT_MESSAGE, {
        id: entry.uuid || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      });
    }
  }

  // Handle assistant messages
  if (entryType === 'assistant') {
    console.log('[TranscriptWatcher] Got assistant entry, has message:', !!entry.message, 'has content:', !!entry.message?.content);
    if (entry.message?.content) {
      console.log('[TranscriptWatcher] Content type:', typeof entry.message.content, 'isArray:', Array.isArray(entry.message.content));
      if (Array.isArray(entry.message.content)) {
        console.log('[TranscriptWatcher] Content items:', entry.message.content.map((c: any) => c.type).join(', '));
      }
    }
    const content = extractTextContent(entry.message?.content);
    if (content) {
      console.log('[TranscriptWatcher] Assistant:', content.substring(0, 50));
      mainWindow.webContents.send(IPC_CHANNELS.CHAT_MESSAGE, {
        id: entry.uuid || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content,
        timestamp: Date.now(),
      });
    }

    // Handle status and tool events
    if (Array.isArray(entry.message?.content)) {
      for (const item of entry.message.content) {
        // Thinking status
        if (item.type === 'thinking') {
          mainWindow.webContents.send(IPC_CHANNELS.CHAT_STATUS, {
            status: 'thinking',
            text: 'Thinking...',
          });
          // Send thinking state to game (only if not already thinking)
          if (claudeState !== 'thinking') {
            sendGameEvent({
              type: 'ui_instruction',
              payload: {
                character_action: 'idle',
                emotion: 'thinking',
              },
            });
            claudeState = 'thinking';
          }
        }

        // Tool use - send as inline chat message
        if (item.type === 'tool_use') {
          const toolName = item.name;

          // Track Write calls to plan files
          if (toolName === 'Write' && item.input?.file_path) {
            const filePath = item.input.file_path;
            // Check if this is a plan file (in ~/.claude/plans/ directory)
            if (filePath.includes('/.claude/plans/') || filePath.includes('\\.claude\\plans\\')) {
              currentPlanFile = filePath;
              console.log('[TranscriptWatcher] Tracked plan file:', currentPlanFile);
            }
          }

          // Special handling for ExitPlanMode - show the plan content AND prompt
          if (toolName === 'ExitPlanMode') {
            // Try to read the plan content from the tracked file
            if (currentPlanFile) {
              try {
                const planContent = fs.readFileSync(currentPlanFile, 'utf-8');
                console.log('[TranscriptWatcher] Read plan content from:', currentPlanFile, 'length:', planContent.length);
                mainWindow.webContents.send(IPC_CHANNELS.CHAT_MESSAGE, {
                  id: item.id || `plan-${Date.now()}`,
                  role: 'plan',
                  content: planContent,
                  timestamp: Date.now(),
                });
              } catch (e) {
                console.error('[TranscriptWatcher] Failed to read plan file:', e);
              }
            } else {
              console.log('[TranscriptWatcher] No plan file tracked for ExitPlanMode');
            }

            // Send the plan-execute prompt (the CLI shows this after ExitPlanMode)
            mainWindow.webContents.send(IPC_CHANNELS.CHAT_PROMPT, {
              type: 'plan-execute',
              options: ['1', '2', '3', '4'],
            });

            continue;
          }

          // Special handling for AskUserQuestion - send structured prompt
          if (toolName === 'AskUserQuestion' && item.input?.questions) {
            mainWindow.webContents.send(IPC_CHANNELS.CHAT_PROMPT, {
              type: 'ask-user',
              questions: item.input.questions,
            });
          }

          // Skip internal tools that aren't useful to show
          if (['EnterPlanMode', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'].includes(toolName)) {
            continue;
          }

          const location = TOOL_LOCATIONS[toolName] || 'desk';
          const toolInput = extractToolInput(toolName, item.input);

          // Send tool as a chat message (inline indicator)
          mainWindow.webContents.send(IPC_CHANNELS.CHAT_MESSAGE, {
            id: item.id || `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            role: 'tool',
            content: getToolStatusText(toolName),
            toolName,
            toolInput,
            timestamp: Date.now(),
          });

          // Clear thinking status
          mainWindow.webContents.send(IPC_CHANNELS.CHAT_STATUS, {
            status: null,
          });

          // Special handling for Task tool - spawn agent in game
          if (toolName === 'Task') {
            const agentId = item.id || `agent-${Date.now()}`;
            const agentName = item.input?.subagent_type || item.input?.description?.substring(0, 20) || 'Agent';
            activeAgents.set(agentId, agentName);
            taskToolIds.add(agentId);

            // Spawn agent in game
            sendGameEvent({
              type: 'agent_event',
              payload: {
                agent_type: 'spawn',
                agent_id: agentId,
                agent_name: agentName,
              },
            });
          }

          // Send enhanced game move event with emotion and status
          sendGameEvent({
            type: 'ui_instruction',
            payload: {
              character_action: `walk_to_${location}`,
              emotion: 'focused',
              custom_status: TOOL_STATUS[toolName] || toolName,
            },
          });
          claudeState = 'tool_use';

          mainWindow.webContents.send(IPC_CHANNELS.CHAT_TOOL_START, {
            tool: toolName,
          });
        }

        // Text response clears status and triggers completion
        if (item.type === 'text') {
          mainWindow.webContents.send(IPC_CHANNELS.CHAT_STATUS, {
            status: null,
          });
          // Send completion animation when we get text (end of response)
          sendCompletionAnimation();
        }

        if (item.type === 'tool_result') {
          mainWindow.webContents.send(IPC_CHANNELS.CHAT_TOOL_END);
          // Return to desk after tool completes
          sendReturnToDesk();
        }
      }
    }
  }
}

/**
 * Get human-readable status text for a tool
 */
function getToolStatusText(toolName: string): string {
  const toolTexts: Record<string, string> = {
    Read: 'Reading',
    Glob: 'Searching',
    Grep: 'Searching',
    Edit: 'Editing',
    Write: 'Writing',
    Bash: 'Running',
    WebSearch: 'Searching web',
    WebFetch: 'Fetching',
    Task: 'Running task',
    AskUserQuestion: 'Asking',
  };
  return toolTexts[toolName] || toolName;
}

/**
 * Extract the most relevant input from a tool call
 */
function extractToolInput(toolName: string, input: any): string {
  if (!input) return '';

  switch (toolName) {
    case 'Read':
    case 'Edit':
    case 'Write':
      // Show just the filename, not full path
      if (input.file_path) {
        const parts = input.file_path.split('/');
        return parts[parts.length - 1];
      }
      return '';
    case 'Glob':
      return input.pattern || '';
    case 'Grep':
      return input.pattern || '';
    case 'Bash':
      // Truncate long commands
      const cmd = input.command || '';
      return cmd.length > 40 ? cmd.substring(0, 40) + '...' : cmd;
    case 'WebSearch':
      return input.query || '';
    case 'WebFetch':
      // Show just the domain
      if (input.url) {
        try {
          const url = new URL(input.url);
          return url.hostname;
        } catch {
          return input.url.substring(0, 30);
        }
      }
      return '';
    case 'Task':
      return input.description || '';
    default:
      return '';
  }
}

/**
 * Extract text content from message content array
 */
function extractTextContent(content: any): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
  }

  return '';
}

/**
 * Check if a message is an internal CLI command (should not be displayed)
 */
function isInternalMessage(content: string): boolean {
  // Filter out messages with internal XML tags from Claude CLI
  const internalPatterns = [
    /<local-command-caveat>/,
    /<command-name>/,
    /<command-message>/,
    /<command-args>/,
    /<local-command-stdout>/,
    /<\/local-command-caveat>/,
    /<\/command-name>/,
    /<\/command-message>/,
    /<\/command-args>/,
    /<\/local-command-stdout>/,
    /^\/\w+$/,  // Bare slash commands like /plan
  ];

  return internalPatterns.some(pattern => pattern.test(content));
}

/**
 * Send a game event to the renderer
 */
function sendGameEvent(event: GameMoveEvent): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(IPC_CHANNELS.GAME_MOVE, event);
}

/**
 * Send return to desk event
 */
function sendReturnToDesk(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  sendGameEvent({
    type: 'ui_instruction',
    payload: {
      character_action: 'walk_to_desk',
      emotion: 'neutral',
      hide_status: true,
    },
  });
  claudeState = 'idle';
}

/**
 * Send completion animation to game (celebrate + despawn agents)
 */
function sendCompletionAnimation(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // Only send completion if we were working
  if (claudeState === 'idle') return;

  sendGameEvent({
    type: 'ui_instruction',
    payload: {
      character_action: 'celebrate',
      emotion: 'happy',
      hide_status: true,
    },
  });

  // Despawn all agents
  for (const [agentId] of activeAgents) {
    sendGameEvent({
      type: 'agent_event',
      payload: {
        agent_type: 'complete',
        agent_id: agentId,
      },
    });
  }
  activeAgents.clear();
  taskToolIds.clear();
  claudeState = 'idle';
}

/**
 * Stop the transcript watcher
 */
export function stopTranscriptWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  sessionFile = null;
  bytePosition = 0;
  lineBuffer = '';
  currentPlanFile = null;
  fallbackCheckScheduled = false;
  watcherStartTime = 0;
  fallbackRetryCount = 0;
  // Reset game state
  claudeState = 'idle';
  activeAgents.clear();
  taskToolIds.clear();
  console.log('[TranscriptWatcher] Stopped');
}

/**
 * Get the current session file
 */
export function getSessionFile(): string | null {
  return sessionFile;
}
