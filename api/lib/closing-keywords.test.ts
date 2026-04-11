import { describe, expect, it } from "vitest";
import {
  hasSameRepoClosingKeywordRef,
  extractConfirmedClosingRefNumbers,
  filterToConfirmedClosingRefs,
} from "./closing-keywords.js";

describe("hasSameRepoClosingKeywordRef", () => {
  const repository = { owner: "hivemoot", repo: "hivemoot-bot" };
  const allClosingKeywords = [
    "close",
    "closed",
    "closes",
    "fix",
    "fixed",
    "fixes",
    "resolve",
    "resolved",
    "resolves",
  ] as const;

  it("matches all GitHub closing keyword variants for local issue references", () => {
    for (const keyword of allClosingKeywords) {
      expect(hasSameRepoClosingKeywordRef(`${keyword} #21`, repository)).toBe(true);
      expect(hasSameRepoClosingKeywordRef(`${keyword}: #21`, repository)).toBe(true);
    }
  });

  it("matches fully-qualified same-repo references", () => {
    expect(
      hasSameRepoClosingKeywordRef("Resolves hivemoot/hivemoot-bot#42", repository)
    ).toBe(true);
  });

  it("matches same-repo issue URLs", () => {
    expect(
      hasSameRepoClosingKeywordRef(
        "Fixes https://github.com/hivemoot/hivemoot-bot/issues/123",
        repository
      )
    ).toBe(true);
  });

  it("does not match cross-repo references", () => {
    expect(
      hasSameRepoClosingKeywordRef("Fixes someone/else#21", repository)
    ).toBe(false);
    expect(
      hasSameRepoClosingKeywordRef(
        "Resolves https://github.com/someone/else/issues/33",
        repository
      )
    ).toBe(false);
  });

  it("does not match plain mentions without closing keywords", () => {
    expect(hasSameRepoClosingKeywordRef("Related to #21", repository)).toBe(false);
  });

  it("ignores closing keywords inside inline code", () => {
    expect(
      hasSameRepoClosingKeywordRef("Template example: `Fixes #21`", repository)
    ).toBe(false);
  });

  it("ignores closing keywords inside fenced code blocks", () => {
    expect(
      hasSameRepoClosingKeywordRef(
        "```md\nFixes #21\n```\nThis PR updates docs only.",
        repository
      )
    ).toBe(false);
  });
});

describe("extractConfirmedClosingRefNumbers", () => {
  const repository = { owner: "hivemoot", repo: "hivemoot-bot" };

  it("returns empty set for null/undefined body", () => {
    expect(extractConfirmedClosingRefNumbers(null, repository).size).toBe(0);
    expect(extractConfirmedClosingRefNumbers(undefined, repository).size).toBe(0);
  });

  it("extracts issue number from short form (#N)", () => {
    const result = extractConfirmedClosingRefNumbers("Fixes #42", repository);
    expect(result).toEqual(new Set([42]));
  });

  it("extracts issue number from qualified form (owner/repo#N)", () => {
    const result = extractConfirmedClosingRefNumbers(
      "Closes hivemoot/hivemoot-bot#321",
      repository
    );
    expect(result).toEqual(new Set([321]));
  });

  it("extracts issue number from URL form", () => {
    const result = extractConfirmedClosingRefNumbers(
      "Resolves https://github.com/hivemoot/hivemoot-bot/issues/99",
      repository
    );
    expect(result).toEqual(new Set([99]));
  });

  it("ignores cross-repo qualified references", () => {
    const result = extractConfirmedClosingRefNumbers("Fixes other/repo#42", repository);
    expect(result.size).toBe(0);
  });

  it("ignores cross-repo URL references", () => {
    const result = extractConfirmedClosingRefNumbers(
      "Fixes https://github.com/other/repo/issues/42",
      repository
    );
    expect(result.size).toBe(0);
  });

  it("ignores keywords inside fenced code blocks (the #321 false-positive case)", () => {
    const body = "Use `Fixes #321` not `Part of #321`\n\n```\nFixes #321\n```";
    const result = extractConfirmedClosingRefNumbers(body, repository);
    expect(result.size).toBe(0);
  });

  it("ignores keywords inside inline code spans", () => {
    const body = "Template says: `Fixes #321` to close the issue.";
    const result = extractConfirmedClosingRefNumbers(body, repository);
    expect(result.size).toBe(0);
  });

  it("collects multiple issue numbers from a single body", () => {
    const body = "Fixes #10\n\nAlso closes #20";
    const result = extractConfirmedClosingRefNumbers(body, repository);
    expect(result).toEqual(new Set([10, 20]));
  });

  it("keeps prose refs when mixed with code-block refs", () => {
    const body = "Fixes #42\n\n```\nFixes #99\n```";
    const result = extractConfirmedClosingRefNumbers(body, repository);
    expect(result).toEqual(new Set([42]));
  });
});

describe("filterToConfirmedClosingRefs", () => {
  const repository = { owner: "hivemoot", repo: "hivemoot-bot" };
  const makeIssue = (number: number) => ({ number, title: `Issue ${number}`, state: "OPEN" as const, labels: { nodes: [] } });

  it("returns original list when body is null (fail-safe)", () => {
    const issues = [makeIssue(42)];
    expect(filterToConfirmedClosingRefs(issues, null, repository)).toEqual(issues);
  });

  it("returns original list when no confirmed refs found (fail-safe)", () => {
    const issues = [makeIssue(42)];
    const body = "No closing keywords here";
    expect(filterToConfirmedClosingRefs(issues, body, repository)).toEqual(issues);
  });

  it("returns original list when all keywords are in code blocks (fail-safe)", () => {
    const issues = [makeIssue(42)];
    const body = "```\nFixes #42\n```";
    expect(filterToConfirmedClosingRefs(issues, body, repository)).toEqual(issues);
  });

  it("filters out issues not confirmed by local parser", () => {
    const issues = [makeIssue(42), makeIssue(99)];
    const body = "Fixes #42";
    const result = filterToConfirmedClosingRefs(issues, body, repository);
    expect(result).toEqual([makeIssue(42)]);
  });

  it("keeps issues confirmed by local parser", () => {
    const issues = [makeIssue(321)];
    const body = "Closes #321\n\nImplements the post-filter for intake false positives.";
    const result = filterToConfirmedClosingRefs(issues, body, repository);
    expect(result).toEqual([makeIssue(321)]);
  });

  it("returns empty array when no linked issues match", () => {
    const issues = [makeIssue(99)];
    const body = "Fixes #42";
    const result = filterToConfirmedClosingRefs(issues, body, repository);
    expect(result).toEqual([]);
  });

  it("returns original list when linkedIssues is empty", () => {
    expect(filterToConfirmedClosingRefs([], "Fixes #42", repository)).toEqual([]);
  });
});
