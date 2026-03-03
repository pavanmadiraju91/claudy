import * as pty from 'node-pty';
import { PtyOptions } from '../../shared/types';
import * as os from 'os';

export class PtyManager {
  private ptyProcess: pty.IPty | null = null;
  private onDataCallback: ((data: string) => void) | null = null;
  private onExitCallback: ((exitCode: number) => void) | null = null;

  constructor() {}

  /**
   * Get the default shell for the current platform
   */
  private getDefaultShell(): string {
    const platform = os.platform();

    if (platform === 'win32') {
      return process.env.COMSPEC || 'powershell.exe';
    }

    // macOS and Linux
    return process.env.SHELL || '/bin/bash';
  }

  /**
   * Spawn a new PTY process
   */
  spawn(options: PtyOptions): void {
    if (this.ptyProcess) {
      this.kill();
    }

    const shell = this.getDefaultShell();
    const platform = os.platform();

    // Shell arguments
    const shellArgs = platform === 'win32' ? [] : ['--login'];

    // Environment variables
    const env = {
      ...process.env,
      ...options.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };

    try {
      this.ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: options.cols || 80,
        rows: options.rows || 24,
        cwd: options.cwd || os.homedir(),
        env: env as Record<string, string>,
      });

      // Set up data handler
      this.ptyProcess.onData((data: string) => {
        if (this.onDataCallback) {
          this.onDataCallback(data);
        }
      });

      // Set up exit handler
      this.ptyProcess.onExit(({ exitCode }) => {
        if (this.onExitCallback) {
          this.onExitCallback(exitCode);
        }
        this.ptyProcess = null;
      });

      console.log(`[PtyManager] Spawned shell: ${shell}`);
    } catch (error) {
      console.error('[PtyManager] Failed to spawn PTY:', error);
      throw error;
    }
  }

  /**
   * Write data to the PTY
   */
  write(data: string): void {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
    }
  }

  /**
   * Resize the PTY
   */
  resize(cols: number, rows: number): void {
    if (this.ptyProcess) {
      try {
        this.ptyProcess.resize(cols, rows);
      } catch (error) {
        console.error('[PtyManager] Failed to resize:', error);
      }
    }
  }

  /**
   * Kill the PTY process
   */
  kill(): void {
    if (this.ptyProcess) {
      try {
        this.ptyProcess.kill();
      } catch (error) {
        console.error('[PtyManager] Failed to kill PTY:', error);
      }
      this.ptyProcess = null;
    }
  }

  /**
   * Set callback for data events
   */
  onData(callback: (data: string) => void): void {
    this.onDataCallback = callback;
  }

  /**
   * Set callback for exit events
   */
  onExit(callback: (exitCode: number) => void): void {
    this.onExitCallback = callback;
  }

  /**
   * Check if PTY is running
   */
  isRunning(): boolean {
    return this.ptyProcess !== null;
  }
}
