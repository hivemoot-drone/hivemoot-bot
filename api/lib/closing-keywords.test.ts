import { describe, expect, it } from "vitest";
import { hasSameRepoClosingKeywordRef, filterToConfirmedClosingRefs } from "./closing-keywords.js";

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

describe("filterToConfirmedClosingRefs", () => {
  const repository = { owner: "hivemoot", repo: "hivemoot-bot" };

  function issue(number: number) {
    return { number };
  }

  it("keeps a linked issue when a real prose closing ref exists", () => {
    expect(
      filterToConfirmedClosingRefs([issue(321)], "Fixes #321", repository)
    ).toEqual([issue(321)]);
  });

  it("removes a linked issue when the only closing ref is in a fenced code block", () => {
    expect(
      filterToConfirmedClosingRefs(
        [issue(321)],
        "Use `Closes #321` syntax.\n```\nFixes #321\n```",
        repository
      )
    ).toEqual([]);
  });

  it("removes a linked issue when the only closing ref is in inline code", () => {
    expect(
      filterToConfirmedClosingRefs([issue(321)], "Template: `Fixes #321`", repository)
    ).toEqual([]);
  });

  it("keeps a linked issue confirmed by qualified same-repo reference", () => {
    expect(
      filterToConfirmedClosingRefs(
        [issue(42)],
        "Resolves hivemoot/hivemoot-bot#42",
        repository
      )
    ).toEqual([issue(42)]);
  });

  it("removes a linked issue that is only confirmed by a cross-repo reference", () => {
    expect(
      filterToConfirmedClosingRefs(
        [issue(42)],
        "Fixes someone/else#42",
        repository
      )
    ).toEqual([]);
  });

  it("keeps a linked issue confirmed by a full GitHub URL", () => {
    expect(
      filterToConfirmedClosingRefs(
        [issue(123)],
        "Fixes https://github.com/hivemoot/hivemoot-bot/issues/123",
        repository
      )
    ).toEqual([issue(123)]);
  });

  it("mixed: keeps prose ref, removes code-block ref", () => {
    const linkedIssues = [issue(321), issue(99)];
    const body = "Fixes #321\n```\nFixes #99\n```";
    expect(filterToConfirmedClosingRefs(linkedIssues, body, repository)).toEqual([issue(321)]);
  });

  it("mixed: keeps prose ref, removes inline-code ref", () => {
    const linkedIssues = [issue(321), issue(99)];
    const body = "Fixes #321 (not `Fixes #99`)";
    expect(filterToConfirmedClosingRefs(linkedIssues, body, repository)).toEqual([issue(321)]);
  });

  it("fail-safe: returns original list when body is null", () => {
    expect(
      filterToConfirmedClosingRefs([issue(321)], null, repository)
    ).toEqual([issue(321)]);
  });

  it("fail-safe: returns original list when no confirmed closing refs are found", () => {
    expect(
      filterToConfirmedClosingRefs([issue(321)], "This PR does not contain any keywords.", repository)
    ).toEqual([issue(321)]);
  });

  it("returns original list when linkedIssues is empty", () => {
    expect(filterToConfirmedClosingRefs([], "Fixes #321", repository)).toEqual([]);
  });
});
