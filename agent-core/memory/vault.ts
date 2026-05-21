import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import type { VaultNote, VaultSearchResult } from '../types/index.js';

export class VaultAPI {
  private root: string;

  constructor(vaultRoot: string) {
    this.root = vaultRoot;
  }

  private abs(relativePath: string): string {
    return path.join(this.root, relativePath);
  }

  async readNote(relativePath: string): Promise<VaultNote | null> {
    try {
      const raw = await fs.readFile(this.abs(relativePath), 'utf-8');
      return this.parseNote(relativePath, raw);
    } catch {
      return null;
    }
  }

  async listNotes(folder: string): Promise<VaultNote[]> {
    const dir = this.abs(folder);
    let entries: string[];
    try {
      entries = await this.walkDir(dir);
    } catch {
      return [];
    }
    const notes: VaultNote[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const rel = path.relative(this.root, entry).replace(/\\/g, '/');
      const raw = await fs.readFile(entry, 'utf-8').catch(() => null);
      if (raw) notes.push(this.parseNote(rel, raw));
    }
    return notes;
  }

  async searchNotes(query: string, folder?: string): Promise<VaultSearchResult[]> {
    const notes = await this.listNotes(folder ?? '');
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const results: VaultSearchResult[] = [];
    for (const note of notes) {
      const text = (note.title + ' ' + note.content).toLowerCase();
      let score = 0;
      let snippet = '';
      for (const kw of keywords) {
        const idx = text.indexOf(kw);
        if (idx !== -1) {
          score += 1;
          if (!snippet) {
            const start = Math.max(0, idx - 60);
            const end = Math.min(text.length, idx + kw.length + 60);
            snippet = note.content.slice(start, end).replace(/\n/g, ' ').trim();
          }
        }
      }
      if (score > 0) results.push({ note, score, snippet });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  async getRecentNotes(limit: number, folder?: string): Promise<VaultNote[]> {
    const notes = await this.listNotes(folder ?? '');
    return notes
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  async noteExists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.abs(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  async writeNote(
    relativePath: string,
    content: string,
    frontmatter?: Record<string, unknown>
  ): Promise<void> {
    const filePath = this.abs(relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const now = new Date().toISOString();
    const fm: Record<string, unknown> = {
      title: path.basename(relativePath, '.md'),
      createdAt: now,
      updatedAt: now,
      tags: [],
      ...frontmatter,
    };
    const raw = matter.stringify(content, fm);
    await fs.writeFile(filePath, raw, 'utf-8');
  }

  async appendToNote(relativePath: string, content: string): Promise<void> {
    const filePath = this.abs(relativePath);
    const existing = await fs.readFile(filePath, 'utf-8').catch(() => null);
    if (!existing) {
      await this.writeNote(relativePath, content);
      return;
    }
    const parsed = matter(existing);
    parsed.data.updatedAt = new Date().toISOString();
    const updated = matter.stringify(
      parsed.content + '\n\n' + content,
      parsed.data
    );
    await fs.writeFile(filePath, updated, 'utf-8');
  }

  sanitizePath(name: string): string {
    return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim();
  }

  private parseNote(relativePath: string, raw: string): VaultNote {
    const parsed = matter(raw);
    const fm = parsed.data as Record<string, unknown>;
    const stat = { ctime: '', mtime: '' };
    return {
      path: relativePath,
      title: (fm.title as string) ?? path.basename(relativePath, '.md'),
      content: parsed.content.trim(),
      frontmatter: fm,
      createdAt: (fm.createdAt as string) ?? stat.ctime,
      updatedAt: (fm.updatedAt as string) ?? stat.mtime,
      tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
    };
  }

  private async walkDir(dir: string): Promise<string[]> {
    const results: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await this.walkDir(full)));
      } else {
        results.push(full);
      }
    }
    return results;
  }
}
