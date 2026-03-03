import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import * as os from 'os';
import * as path from 'path';

let ptyProcess: pty.IPty | null = null;
let mainWindow: BrowserWindow | null = null;
let outputBuffer: string = '';
let readySignalSent: boolean = false;

// Prompt patterns to detect (from PTY output, stripped of ANSI codes)
const PROMPT_PATTERNS = [
  // Plan mode ready prompt (numbered options)
  { pattern: /Would you like to proceed\?[\s\S]*?1\.\s*Yes/i, type: 'plan-execute', options: ['1', '2', '3', '4'] },
  { pattern: /Ready to code\?[\s\S]*?1\.\s*Yes/i, type: 'plan-execute', options: ['1', '2', '3', '4'] },
  // AskUserQuestion - Submit confirmation
  // Flexible pattern that matches structure (submit + numbered options), not exact text
  { pattern: /submit.*answers\?[\s\S]*?(?:1\.|❯\s*1\.)\s*Submit/i, type: 'ask-user-submit', options: ['1', '2'] },
  // Trust folder prompt is now handled by early detection in detectPrompt() with lastChunk (1500 chars)
  // to ensure both "Accessing workspace" and "trust this folder" are within the detection window
  // Simple prompts
  { pattern: /Do you want to proceed\?/i, type: 'confirm', options: ['y', 'n'] },
  { pattern: /Execute this plan\?/i, type: 'plan-execute', options: ['y', 'n'] },
  { pattern: /Allow this action\?/i, type: 'permission', options: ['y', 'n', 'a'] },
  { pattern: /Do you want to run/i, type: 'run-confirm', options: ['y', 'n'] },
  { pattern: /Press Enter to continue/i, type: 'continue', options: ['enter'] },
  { pattern: /\(y\/n\)/i, type: 'yes-no', options: ['y', 'n'] },
  { pattern: /\(y\/n\/a\)/i, type: 'yes-no-always', options: ['y', 'n', 'a'] },
];

// Types for PTY-parsed AskUserQuestion
interface PtyOption {
  label: string;
  description: string;
  selected: boolean;
}

interface ProgressStep {
  header: string;
  completed: boolean;
  active: boolean;
}

interface ParsedAskUser {
  progress: ProgressStep[];
  questionText: string;
  options: PtyOption[];
  requiresTerminal: boolean;  // True when multi-step wizard needs keyboard navigation
}

/**
 * Strip ANSI escape codes from string
 */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Parse AskUserQuestion entirely from PTY output
 * Extracts progress bar (checkbox characters), question text, and options with descriptions
 * This is the single-source-of-truth approach that avoids transcript/PTY race conditions
 */
function parseAskUserFromPTY(cleanOutput: string): ParsedAskUser | null {
  // Skip non-AskUserQuestion prompts
  if (/Would you like to proceed\?|Ready to code\?/i.test(cleanOutput)) {
    console.log('[parseAskUserFromPTY] Skipping: plan confirmation prompt');
    return null;
  }

  // Skip submit confirmation (handled separately)
  if (/ready to submit|submit.*answers/i.test(cleanOutput)) {
    console.log('[parseAskUserFromPTY] Skipping: submit confirmation');
    return null;
  }

  // Skip trust folder prompt (handled by PROMPT_PATTERNS as trust-folder type)
  if (/trust this folder|Accessing workspace/i.test(cleanOutput)) {
    console.log('[parseAskUserFromPTY] Skipping: trust folder prompt');
    return null;
  }

  const lines = cleanOutput.split('\n');

  // 1. Parse progress bar: ☐ Header or ✔ Header or ☒ Header
  // Progress line looks like: "☐ Structure  ☐ Delivery  ☐ Tone  ✔ Submit  →"
  // Match various Unicode checkbox/bullet characters used in CLI progress bars:
  // Empty: ☐ (U+2610) ○ (U+25CB) ◯ (U+25EF) ▢ (U+25A2) □ (U+25A1)
  // Filled/checked: ☑ (U+2611) ☒ (U+2612) ✔ (U+2714) ✓ (U+2713) ● (U+25CF) ◉ (U+25C9) ▣ (U+25A3) ■ (U+25A0)
  const checkboxPattern = '[☐☑☒✔✓○●◯◉▢▣□■]';
  const progress: ProgressStep[] = [];

  // Match any line containing checkbox characters (entire progress bar line)
  // This captures the full "☒ Project  ☐ Style  ☐ Tone" line instead of just one step
  const progressLineRegex = new RegExp(`^.*${checkboxPattern}.*$`, 'gm');
  const progressLines = cleanOutput.match(progressLineRegex);

  // Find the line with the most checkbox characters (the actual progress bar)
  const progressMatch = progressLines?.reduce((best, line) => {
    const checkboxCount = (line.match(new RegExp(checkboxPattern, 'g')) || []).length;
    const bestCount = best ? (best.match(new RegExp(checkboxPattern, 'g')) || []).length : 0;
    return checkboxCount > bestCount ? line : best;
  }, '' as string);

  if (progressMatch && progressMatch.length > 0) {
    console.log('[parseAskUserFromPTY] Progress bar found:', progressMatch);
    const stepRegex = new RegExp(`(${checkboxPattern})\\s+(\\w+)`, 'g');
    const progressParts = progressMatch.matchAll(stepRegex);
    // Filled/checked characters indicate completed steps
    const completedChars = '☑☒✔✓●◉▣■';
    let foundActive = false;
    for (const match of progressParts) {
      const [, checkbox, header] = match;
      const completed = completedChars.includes(checkbox);
      // First uncompleted item is active
      const active = !completed && !foundActive;
      if (active) foundActive = true;
      progress.push({ header, completed, active });
    }
  }

  // 2. Parse question text - line ending with ? (not an option or progress element)
  let questionText = '';
  // Regex to exclude lines starting with checkbox characters (same as checkboxPattern)
  const checkboxStartRegex = new RegExp(`^[❯${checkboxPattern.slice(1, -1)}]`);
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.endsWith('?') &&
      !trimmed.match(/^\d+\./) &&
      !checkboxStartRegex.test(trimmed) &&
      trimmed.length > 10
    ) {
      questionText = trimmed;
      break;
    }
  }

  // 3. Parse options with descriptions
  // Format: "❯ 1. Label" or "  2. Label" followed by indented description
  const options: PtyOption[] = [];
  const optionRegex = /^(\s*)(❯\s*)?(\d+)\.\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(optionRegex);
    if (match) {
      const [, , cursor, , label] = match;
      const selected = !!cursor;

      // Look for description on next line (more indented, not another option)
      let description = '';
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        // Description is indented more than option number and not another option
        if (nextLine.match(/^\s{5,}/) && !nextLine.match(/^\s*[❯]?\s*\d+\./)) {
          description = nextLine.trim();
        }
      }

      options.push({ label: label.trim(), description, selected });
    }
  }

  // Log parsed values for debugging
  console.log('[parseAskUserFromPTY] Parsed questionText:', questionText || '(none)');
  console.log('[parseAskUserFromPTY] Parsed options:', options.length, options.map(o => o.label));

  // Multi-step wizards (progress.length > 1) should trigger Terminal navigation
  // even if we can't parse question/options yet (they may not be fully rendered)
  if (progress.length > 1) {
    console.log('[parseAskUserFromPTY] Multi-step wizard detected via progress bar');
    return {
      progress,
      questionText: questionText || 'Complete this multi-step selection',
      options,
      requiresTerminal: true
    };
  }

  // For single-step questions, need question + 2 options to show in ChatPanel
  if (!questionText || options.length < 2) {
    console.log('[parseAskUserFromPTY] Invalid: questionText=', !!questionText, 'options=', options.length);
    return null;
  }

  // Multi-step wizards (progress.length > 1) require Terminal for horizontal navigation
  const requiresTerminal = progress.length > 1;

  console.log('[parseAskUserFromPTY] SUCCESS - detected AskUserQuestion:', questionText);
  return { progress, questionText, options, requiresTerminal };
}

/**
 * Detect when Claude CLI is ready (shows input prompt)
 */
function detectReady(data: string): void {
  if (readySignalSent) return;

  outputBuffer += data;
  const cleanOutput = stripAnsi(outputBuffer);

  // Claude CLI shows ">" prompt when ready for input, or has substantial output
  if (cleanOutput.includes('>') || cleanOutput.length > 100) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.CLAUDE_READY);
    }
    readySignalSent = true;
  }
}

// Debug logging throttle - only log every N calls to avoid spam
let detectPromptCallCount = 0;
const DETECT_PROMPT_LOG_INTERVAL = 50;

/**
 * Detect if output contains a prompt waiting for input
 */
function detectPrompt(data: string): void {
  outputBuffer += data;

  // Keep buffer size manageable
  if (outputBuffer.length > 5000) {
    outputBuffer = outputBuffer.slice(-2000);
  }

  const cleanOutput = stripAnsi(outputBuffer);
  const lastChunk = cleanOutput.slice(-1500); // Bigger chunk for multi-line parsing

  // DEBUG: Log periodically to see what's in the buffer
  detectPromptCallCount++;
  if (detectPromptCallCount % DETECT_PROMPT_LOG_INTERVAL === 0) {
    console.log('[detectPrompt] Call #', detectPromptCallCount, '- Buffer length:', cleanOutput.length);
    console.log('[detectPrompt] Last 200 chars:', lastChunk.slice(-200).replace(/\n/g, '\\n'));
  }

  // Check for submit confirmation first (has "submit" + "1. Submit answers")
  if (/ready to submit|submit.*answers/i.test(lastChunk) && /1\.\s*Submit/i.test(lastChunk)) {
    console.log('[detectPrompt] Detected submit confirmation prompt');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.CHAT_PROMPT, {
        type: 'ask-user-submit',
        detected: true,
      });
    }
    outputBuffer = '';
    return;
  }

  // Check for trust folder prompt (before parseAskUserFromPTY which can mis-parse it)
  // Uses lastChunk (1500 chars) instead of recentChunk (500 chars) since the prompt spans many lines
  // Pattern: "Accessing workspace" or "trust this folder" + option "1. Yes, I trust" or "1. I trust"
  if (/Accessing workspace|trust this folder/i.test(lastChunk) && /1\.\s*(Yes, )?I trust/i.test(lastChunk)) {
    console.log('[detectPrompt] Detected trust folder prompt');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.CHAT_PROMPT, {
        type: 'trust-folder',
        detected: true,
      });
    }
    outputBuffer = '';
    return;
  }

  // Parse full AskUserQuestion from PTY (progress, question, options with descriptions)
  const askUser = parseAskUserFromPTY(lastChunk);
  if (askUser) {
    console.log('[detectPrompt] Sending CHAT_PROMPT IPC for AskUserQuestion:', askUser.questionText);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.CHAT_PROMPT, {
        // Multi-step wizards require Terminal for Tab/Arrow navigation
        type: askUser.requiresTerminal ? 'ask-user-terminal' : 'ask-user-pty',
        progress: askUser.progress,
        questionText: askUser.questionText,
        ptyOptions: askUser.options, // Full options with descriptions
        detected: true,
      });
    }
    // Don't clear buffer - allows re-detection when question changes
    return;
  }

  // Then check standard prompt patterns
  for (const { pattern, type, options } of PROMPT_PATTERNS) {
    if (pattern.test(cleanOutput)) {
      // Check if this is recent (in the last part of output)
      const recentChunk = cleanOutput.slice(-500);
      if (pattern.test(recentChunk)) {
        console.log('[detectPrompt] Detected standard prompt pattern:', type);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.CHAT_PROMPT, {
            type,
            options,
            detected: true,
          });
        }
        // Clear buffer after detecting to avoid re-triggering
        outputBuffer = '';
        break;
      }
    }
  }
}

/**
 * Get PATH with common Claude installation locations
 */
function getEnhancedPath(): string {
  const currentPath = process.env.PATH || '';
  const homeDir = os.homedir();

  // Common locations for claude CLI
  const additionalPaths = [
    path.join(homeDir, '.local', 'bin'),
    path.join(homeDir, '.npm-global', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    path.join(homeDir, '.nvm', 'versions', 'node', 'v20.0.0', 'bin'), // Common nvm path
  ];

  return [...additionalPaths, currentPath].join(path.delimiter);
}

/**
 * Start a Claude CLI session
 */
export function startClaudeSession(window: BrowserWindow, cwd: string): void {
  mainWindow = window;

  // Kill existing process if any
  if (ptyProcess) {
    killClaude();
  }

  // Reset ready signal for new session
  readySignalSent = false;
  outputBuffer = '';

  // Enhanced environment with better PATH
  const env = {
    ...process.env,
    PATH: getEnhancedPath(),
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
  };

  try {
    ptyProcess = pty.spawn('claude', [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: env as Record<string, string>,
    });

    ptyProcess.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.CLAUDE_DATA, data);
        // Check if Claude is ready
        detectReady(data);
        // Check for prompts in the output
        detectPrompt(data);
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.CLAUDE_EXIT, exitCode);
      }
      ptyProcess = null;
    });

    console.log('[ProcessManager] Claude session started in:', cwd);
  } catch (error) {
    console.error('[ProcessManager] Failed to start Claude session:', error);

    // Send error message to terminal
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(
        IPC_CHANNELS.CLAUDE_DATA,
        '\x1b[31mError: Could not start Claude CLI.\x1b[0m\r\n' +
        '\x1b[33mMake sure Claude Code is installed: npm install -g @anthropic-ai/claude-code\x1b[0m\r\n'
      );
    }
    throw error;
  }
}

/**
 * Write data to the Claude PTY
 */
export function writeToClaude(data: string): void {
  if (ptyProcess) {
    ptyProcess.write(data);
  }
}

/**
 * Resize the Claude PTY
 */
export function resizeClaude(cols: number, rows: number): void {
  if (ptyProcess) {
    try {
      ptyProcess.resize(cols, rows);
    } catch (error) {
      console.error('[ProcessManager] Failed to resize:', error);
    }
  }
}

/**
 * Kill the Claude PTY process
 */
export function killClaude(): void {
  if (ptyProcess) {
    try {
      ptyProcess.kill();
    } catch (error) {
      console.error('[ProcessManager] Failed to kill Claude process:', error);
    }
    ptyProcess = null;
  }
}

/**
 * Check if Claude session is running
 */
export function isClaudeRunning(): boolean {
  return ptyProcess !== null;
}
