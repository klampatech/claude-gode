import { logger } from '../utils/logger.js';
import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import { watch as fsWatch } from 'fs';
import { EventEmitter } from 'events';

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  size?: number;
  mtime?: string;
}

export interface FileTreeOptions {
  /** Maximum depth to traverse */
  maxDepth?: number;
  /** Glob patterns to include */
  include?: string[];
  /** Glob patterns to exclude */
  exclude?: string[];
  /** Whether to include file sizes and modification times */
  detailed?: boolean;
}

const DEFAULT_EXCLUDE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.cache',
  '.next',
  'coverage',
  '.nyc_output',
  '*.log',
  '.DS_Store',
  'Thumbs.db',
];

/**
 * FileTreeIndexer - Indexes project file trees with change detection
 */
export class FileTreeIndexer extends EventEmitter {
  private cache: Map<string, FileNode> = new Map();
  private watchers: Map<string, ReturnType<typeof fsWatch>> = new Map();
  private projectPath: string;
  private options: Required<FileTreeOptions>;

  constructor(projectPath: string, options: FileTreeOptions = {}) {
    super();
    this.projectPath = projectPath;
    this.options = {
      maxDepth: options.maxDepth ?? 5,
      include: options.include ?? ['*'],
      exclude: options.exclude ?? DEFAULT_EXCLUDE,
      detailed: options.detailed ?? false,
    };
    logger.info({ projectPath, options: this.options }, 'FileTreeIndexer initialized');
  }

  /**
   * Build a complete file tree for the project
   */
  async buildTree(): Promise<FileNode> {
    const cacheKey = `tree:${this.projectPath}:${JSON.stringify(this.options)}`;
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const tree = await this.scanDirectory(this.projectPath, 0);

    this.cache.set(cacheKey, tree);
    return tree;
  }

  /**
   * Get a flat list of all files in the project
   */
  async getFileList(): Promise<string[]> {
    const files: string[] = [];
    await this.collectFiles(this.projectPath, 0, files);
    return files;
  }

  /**
   * Start watching for file system changes
   */
  startWatching(): void {
    if (this.watchers.has(this.projectPath)) {
      return;
    }

    const watcher = fsWatch(this.projectPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      logger.debug({ eventType, filename }, 'File system change detected');

      // Clear cache on any change
      this.cache.clear();

      this.emit('change', {
        type: eventType,
        path: join(this.projectPath, filename),
        relative: filename,
      });
    });

    this.watchers.set(this.projectPath, watcher);
    logger.info({ projectPath: this.projectPath }, 'FileTreeIndexer watching for changes');
  }

  /**
   * Stop watching for file system changes
   */
  stopWatching(): void {
    const watcher = this.watchers.get(this.projectPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(this.projectPath);
      logger.info({ projectPath: this.projectPath }, 'FileTreeIndexer stopped watching');
    }
  }

  /**
   * Clear the file tree cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug({ projectPath: this.projectPath }, 'FileTreeIndexer cache cleared');
  }

  /**
   * Get statistics about the file tree
   */
  async getStats(): Promise<{
    totalFiles: number;
    totalDirs: number;
    totalSize: number;
    extensions: Record<string, number>;
  }> {
    const files = await this.getFileList();
    let totalSize = 0;
    const extensions: Record<string, number> = {};

    for (const file of files) {
      try {
        const stats = await stat(file);
        totalSize += stats.size;

        const ext = file.split('.').pop() || 'no-ext';
        extensions[ext] = (extensions[ext] || 0) + 1;
      } catch {
        // Skip files we can't stat
      }
    }

    const dirs = files.filter(f => f.endsWith('/'));

    return {
      totalFiles: files.length,
      totalDirs: dirs.length,
      totalSize,
      extensions,
    };
  }

  private async scanDirectory(dirPath: string, depth: number): Promise<FileNode> {
    const name = dirPath.split('/').pop() || dirPath;
    const relativePath = relative(this.projectPath, dirPath);

    // Check depth limit
    if (depth >= this.options.maxDepth) {
      return {
        name,
        path: dirPath,
        isDirectory: true,
        children: [],
      };
    }

    // Check exclusions
    if (this.shouldExclude(relativePath)) {
      return {
        name,
        path: dirPath,
        isDirectory: true,
        children: [],
      };
    }

    let entries: string[];
    try {
      entries = await readdir(dirPath);
    } catch {
      return {
        name,
        path: dirPath,
        isDirectory: true,
        children: [],
      };
    }

    const children: FileNode[] = [];

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const entryRelative = relative(this.projectPath, fullPath);

      if (this.shouldExclude(entryRelative)) {
        continue;
      }

      try {
        const stats = await stat(fullPath);

        if (stats.isDirectory()) {
          const child = await this.scanDirectory(fullPath, depth + 1);
          // Only include non-empty directories
          if (child.children && child.children.length > 0) {
            children.push(child);
          }
        } else {
          const node: FileNode = {
            name: entry,
            path: fullPath,
            isDirectory: false,
          };

          if (this.options.detailed) {
            node.size = stats.size;
            node.mtime = stats.mtime.toISOString();
          }

          children.push(node);
        }
      } catch {
        // Skip files we can't stat
      }
    }

    // Sort: directories first, then alphabetically
    children.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      name,
      path: dirPath,
      isDirectory: true,
      children,
    };
  }

  private async collectFiles(dirPath: string, depth: number, files: string[]): Promise<void> {
    if (depth >= this.options.maxDepth) return;

    const relativePath = relative(this.projectPath, dirPath);
    if (this.shouldExclude(relativePath)) return;

    let entries: string[];
    try {
      entries = await readdir(dirPath);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const entryRelative = relative(this.projectPath, fullPath);

      if (this.shouldExclude(entryRelative)) continue;

      try {
        const stats = await stat(fullPath);
        if (stats.isDirectory()) {
          await this.collectFiles(fullPath, depth + 1, files);
        } else {
          files.push(fullPath);
        }
      } catch {
        // Skip
      }
    }
  }

  private shouldExclude(path: string): boolean {
    const parts = path.split('/');
    return parts.some(part => this.options.exclude.includes(part));
  }
}

/**
 * Get a simplified file tree string (for context injection)
 */
export async function getFileTreeString(projectPath: string, maxDepth: number = 3): Promise<string> {
  const indexer = new FileTreeIndexer(projectPath, { maxDepth });
  const tree = await indexer.buildTree();
  return formatTree(tree, 0);
}

function formatTree(node: FileNode, depth: number): string {
  const prefix = '  '.repeat(depth);
  const lines: string[] = [];

  if (node.isDirectory) {
    lines.push(`${prefix}${node.name}/`);
    if (node.children) {
      for (const child of node.children) {
        lines.push(formatTree(child, depth + 1));
      }
    }
  } else {
    lines.push(`${prefix}${node.name}`);
  }

  return lines.join('\n');
}
