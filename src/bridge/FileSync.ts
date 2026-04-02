/**
 * File Sync - File system event synchronization between Claude Code and VS Code
 *
 * Watches for file changes and propagates them via the bridge to keep
 * VS Code's file tree in sync with Claude Code's view.
 */

import { watch, FSWatcher } from 'fs';
import { join, relative, extname } from 'path';
import { FileEvent } from './Protocol.js';
import { logger } from '../utils/logger.js';

export interface FileSyncConfig {
  project_path: string;
  watch_paths?: string[];
  watch_extensions?: string[];
  debounce_ms?: number;
  exclude_patterns?: string[];
}

/**
 * File Sync for synchronizing file system events
 */
export class FileSync {
  private config: Required<FileSyncConfig>;
  private watchers: FSWatcher[] = [];
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private lastEvents: Map<string, number> = new Map();
  private onFileEvent?: (event: FileEvent) => void;

  constructor(config: FileSyncConfig) {
    this.config = {
      project_path: config.project_path,
      watch_paths: config.watch_paths ?? [config.project_path],
      watch_extensions: config.watch_extensions ?? [
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.py',
        '.go',
        '.rs',
        '.java',
        '.json',
        '.md',
      ],
      debounce_ms: config.debounce_ms ?? 100,
      exclude_patterns: config.exclude_patterns ?? [
        'node_modules',
        '.git',
        'dist',
        'build',
        '.next',
        '.nuxt',
        'coverage',
        '.cache',
      ],
    };
  }

  /**
   * Start file watching
   */
  start(): void {
    for (const watchPath of this.config.watch_paths) {
      this.watchDirectory(watchPath);
    }
    logger.info({ paths: this.config.watch_paths }, 'File sync started');
  }

  /**
   * Stop file watching
   */
  stop(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    logger.info('File sync stopped');
  }

  /**
   * Set file event handler
   */
  onFileEventHandler(handler: (event: FileEvent) => void): void {
    this.onFileEvent = handler;
  }

  /**
   * Watch a directory recursively
   */
  private watchDirectory(dirPath: string): void {
    try {
      const watcher = watch(dirPath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        const fullPath = join(dirPath, filename);
        if (this.shouldIgnore(fullPath)) return;

        // Debounce events
        const existingTimer = this.debounceTimers.get(fullPath);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
          this.handleFileEvent(eventType, fullPath);
          this.debounceTimers.delete(fullPath);
        }, this.config.debounce_ms);

        this.debounceTimers.set(fullPath, timer);
      });

      watcher.on('error', (error) => {
        logger.error({ path: dirPath, error: error.message }, 'File watcher error');
      });

      this.watchers.push(watcher);
    } catch (error: any) {
      logger.error({ path: dirPath, error: error.message }, 'Failed to watch directory');
    }
  }

  /**
   * Handle file event
   */
  private handleFileEvent(eventType: string, filePath: string): void {
    // Check if already handled recently
    const lastEvent = this.lastEvents.get(filePath);
    const now = Date.now();
    if (lastEvent && now - lastEvent < 100) return;
    this.lastEvents.set(filePath, now);

    const relativePath = relative(this.config.project_path, filePath);

    // Determine event type
    let type: 'changed' | 'created' | 'deleted';
    if (eventType === 'rename') {
      // Check if file exists to determine if created or deleted
      try {
        const fs = require('fs');
        fs.accessSync(filePath);
        type = 'created';
      } catch {
        type = 'deleted';
      }
    } else {
      type = 'changed';
    }

    // Get content for text files on create/change
    let content = '';
    if (type !== 'deleted' && this.isTextFile(filePath)) {
      try {
        content = require('fs').readFileSync(filePath, 'utf-8');
      } catch {
        // Binary or unreadable file - leave empty
      }
    }

    const event: FileEvent = {
      type,
      path: relativePath,
      content,
    };

    logger.debug({ eventType: type, path: relativePath }, 'File event');

    if (this.onFileEvent) {
      this.onFileEvent(event);
    }
  }

  /**
   * Check if file should be ignored
   */
  private shouldIgnore(filePath: string): boolean {
    const relativePath = relative(this.config.project_path, filePath);
    const pathParts = relativePath.split('/');

    // Check exclude patterns
    for (const part of pathParts) {
      if (this.config.exclude_patterns.includes(part)) {
        return true;
      }
    }

    // Check file extensions
    const ext = extname(filePath);
    if (ext && !this.config.watch_extensions.includes(ext)) {
      // Allow files without extensions
      return extname(filePath) !== '';
    }

    return false;
  }

  /**
   * Check if file is a text file
   */
  private isTextFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return this.config.watch_extensions.includes(ext);
  }
}

export default FileSync;