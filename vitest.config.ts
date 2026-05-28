import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    // vault/agent 테스트는 Node 환경, provider registry 테스트는 happy-dom(localStorage 필요)
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/providers/registry.test.ts', 'happy-dom'],
      ['tests/harness/**/*.test.ts', 'happy-dom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**', 'agent-core/**'],
      exclude: ['**/*.d.ts', '**/index.ts'],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
