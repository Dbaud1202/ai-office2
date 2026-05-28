// @vitest-environment happy-dom

import { describe, expect, it, beforeEach } from 'vitest';
import { classifyHarnessTask, inferHarnessWorkers, shouldDebate } from '../../src/harness/router.js';
import { recordHarnessReflection, summarizeHarnessStats, loadHarnessReflections } from '../../src/harness/reflection.js';
import { recommendHarnessConnectors } from '../../src/harness/connectors.js';

describe('harness router', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('routes short tasks to the fast lane', () => {
    const decision = classifyHarnessTask('요약만');
    expect(decision.route).toBe('fast');
    expect(decision.maxRounds).toBe(1);
    expect(shouldDebate(decision)).toBe(false);
  });

  it('routes complex connector work to debate with developer involvement', () => {
    const decision = classifyHarnessTask('MCP와 GitHub를 연결해서 자동 PR 리뷰 하네스를 설계하고 구현해줘');
    expect(decision.route).toBe('debate');
    expect(decision.needsConnector).toBe(true);
    expect(decision.workerIds).toContain('developer');
  });

  it('infers worker lanes from task language', () => {
    expect(inferHarnessWorkers('시장 조사 자료를 보고서로 정리해줘')).toEqual(['researcher', 'writer']);
  });

  it('recommends connectors for browser and github tasks', () => {
    const connectors = recommendHarnessConnectors('GitHub 이슈를 보고 브라우저로 확인해줘');
    expect(connectors.map((item) => item.id)).toEqual(expect.arrayContaining(['github', 'browser']));
  });

  it('records reflections and summarizes learning stats', () => {
    const decision = classifyHarnessTask('보안 검토 후 배포 계획을 만들어줘');
    recordHarnessReflection({
      agentId: 'cto',
      prompt: '보안 검토 후 배포 계획을 만들어줘',
      output: 'Decision: run tests, review risk, then deploy.',
      decision,
    });

    const reflections = loadHarnessReflections();
    const stats = summarizeHarnessStats(reflections);
    expect(reflections).toHaveLength(1);
    expect(stats.totalRuns).toBe(1);
    expect(stats.averageScore).toBeGreaterThan(0);
  });
});
