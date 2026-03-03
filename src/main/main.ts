import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { setupIpcHandlers, cleanupIpcHandlers } from './ipc/handlers';
import { PtyManager } from './pty/PtyManager';
import { killClaude } from './claude-code/process-manager';
import { stopTranscriptWatcher } from './claude-code/transcript-watcher';

let mainWindow: BrowserWindow | null = null;
let ptyManager: PtyManager | null = null;

// Check if we're in development mode
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0D0D0F',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: true,
      sandbox: false,
    },
  });

  // Set up IPC handlers
  ptyManager = setupIpcHandlers(mainWindow);

  // Load the renderer
  if (isDev) {
    // Development: load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load built files
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    ptyManager?.kill();
    ptyManager = null;
    killClaude();
    stopTranscriptWatcher();
  });
}

// App lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  cleanupIpcHandlers();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  ptyManager?.kill();
  killClaude();
  stopTranscriptWatcher();
});
