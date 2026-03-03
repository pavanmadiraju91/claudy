import { ipcMain, BrowserWindow, dialog } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { PtyManager } from '../pty/PtyManager';
import { PtyOptions } from '../../shared/types';
import {
  startClaudeSession,
  writeToClaude,
  resizeClaude,
  killClaude,
} from '../claude-code/process-manager';
import {
  startTranscriptWatcher,
  stopTranscriptWatcher,
} from '../claude-code/transcript-watcher';

export function setupIpcHandlers(mainWindow: BrowserWindow): PtyManager {
  const ptyManager = new PtyManager();

  // Forward PTY data to renderer (legacy)
  ptyManager.onData((data: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PTY_DATA, data);
    }
  });

  // Forward PTY exit to renderer (legacy)
  ptyManager.onExit((exitCode: number) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PTY_EXIT, exitCode);
    }
  });

  // Legacy PTY handlers (for backward compat)
  ipcMain.handle(IPC_CHANNELS.PTY_SPAWN, (_event, options: PtyOptions) => {
    try {
      ptyManager.spawn(options);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Spawn error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.on(IPC_CHANNELS.PTY_WRITE, (_event, data: string) => {
    ptyManager.write(data);
  });

  ipcMain.on(IPC_CHANNELS.PTY_RESIZE, (_event, cols: number, rows: number) => {
    ptyManager.resize(cols, rows);
  });

  ipcMain.handle(IPC_CHANNELS.PTY_KILL, () => {
    ptyManager.kill();
    return { success: true };
  });

  // Claude CLI handlers
  ipcMain.handle(IPC_CHANNELS.CLAUDE_START, (_event, cwd: string) => {
    try {
      // Start transcript watcher FIRST to snapshot existing files BEFORE Claude creates a new one
      startTranscriptWatcher(mainWindow, cwd);
      // Then start Claude session - its new session file will be detected as NEW
      startClaudeSession(mainWindow, cwd);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Claude start error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.on(IPC_CHANNELS.CLAUDE_WRITE, (_event, data: string) => {
    writeToClaude(data);
  });

  ipcMain.on(IPC_CHANNELS.CLAUDE_RESIZE, (_event, cols: number, rows: number) => {
    resizeClaude(cols, rows);
  });

  // Transcript watcher handlers
  ipcMain.handle(IPC_CHANNELS.TRANSCRIPT_START, () => {
    try {
      startTranscriptWatcher(mainWindow);
      return { success: true };
    } catch (error) {
      console.error('[IPC] Transcript start error:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TRANSCRIPT_STOP, () => {
    stopTranscriptWatcher();
    return { success: true };
  });

  // Window controls
  ipcMain.on(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    mainWindow?.minimize();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_CLOSE, () => {
    mainWindow?.close();
  });

  // Folder dialog handler
  ipcMain.handle(IPC_CHANNELS.SHOW_FOLDER_DIALOG, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select folder for Claude',
      buttonLabel: 'Select',
    });

    if (result.canceled) return null;
    return result.filePaths[0];
  });

  return ptyManager;
}

export function cleanupIpcHandlers(): void {
  // Legacy PTY
  ipcMain.removeAllListeners(IPC_CHANNELS.PTY_SPAWN);
  ipcMain.removeAllListeners(IPC_CHANNELS.PTY_WRITE);
  ipcMain.removeAllListeners(IPC_CHANNELS.PTY_RESIZE);
  ipcMain.removeAllListeners(IPC_CHANNELS.PTY_KILL);

  // Claude CLI
  ipcMain.removeAllListeners(IPC_CHANNELS.CLAUDE_START);
  ipcMain.removeAllListeners(IPC_CHANNELS.CLAUDE_WRITE);
  ipcMain.removeAllListeners(IPC_CHANNELS.CLAUDE_RESIZE);

  // Transcript
  ipcMain.removeAllListeners(IPC_CHANNELS.TRANSCRIPT_START);
  ipcMain.removeAllListeners(IPC_CHANNELS.TRANSCRIPT_STOP);

  // Window
  ipcMain.removeAllListeners(IPC_CHANNELS.WINDOW_MINIMIZE);
  ipcMain.removeAllListeners(IPC_CHANNELS.WINDOW_MAXIMIZE);
  ipcMain.removeAllListeners(IPC_CHANNELS.WINDOW_CLOSE);

  // Dialog
  ipcMain.removeAllListeners(IPC_CHANNELS.SHOW_FOLDER_DIALOG);

  // Stop transcript watcher
  stopTranscriptWatcher();

  // Kill Claude process
  killClaude();
}
