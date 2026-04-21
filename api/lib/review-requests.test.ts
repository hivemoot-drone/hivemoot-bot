import { describe, it, expect, vi } from "vitest";
import { requestTrustedReviewers } from "./review-requests.js";
import type { RequestReviewersParams } from "./review-requests.js";
import type { PROperations } from "./pr-operations.js";
import type { PRConfig } from "./repo-config.js";

const testRef = { owner: "org", repo: "repo", prNumber: 42 };
const testHeadSha = "abc123";

function makePR(overrides: Partial<RequestReviewersParams["pr"]> = {}): RequestReviewersParams["pr"] {
  return {
    author: "dev",
    headSha: testHeadSha,
    draft: false,
    state: "open",
    labels: ["hivemoot:candidate"],
    ...overrides,
  };
}

function makeConfig(count: number | null, trusted: string[] = ["alice", "bob"]): PRConfig {
  return {
    staleDays: null,
    maxPRsPerIssue: 3,
    trustedReviewers: trusted,
    intake: [],
    mergeReady: null,
    automerge: null,
    reviewRequests: count !== null ? { count } : null,
  } as PRConfig;
}

function makePRSpy(overrides: Partial<Record<keyof PROperations, unknown>> = {}): PROperations {
  return {
    getCheckRunsForRef: vi.fn().mockResolvedValue({
      totalCount: 1,
      checkRuns: [{ id: 1, status: "completed", conclusion: "success" }],
    }),
    getCombinedStatus: vi.fn().mockResolvedValue({
      state: "success",
      totalCount: 0,
      statuses: [],
    }),
    getReviewersAtCurrentHead: vi.fn().mockResolvedValue(new Set<string>()),
    getRequestedReviewers: vi.fn().mockResolvedValue(new Set<string>()),
    isCollaborator: vi.fn().mockResolvedValue(true),
    requestReviewers: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as PROperations;
}

describe("requestTrustedReviewers", () => {
  it("no-ops when reviewRequests is null", async () => {
    const prs = makePRSpy();
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR(),
      prConfig: makeConfig(null),
    });
    expect(prs.getCheckRunsForRef).not.toHaveBeenCalled();
    expect(prs.requestReviewers).not.toHaveBeenCalled();
  });

  it("no-ops when trustedReviewers is empty", async () => {
    const prs = makePRSpy();
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR(),
      prConfig: makeConfig(2, []),
    });
    expect(prs.getCheckRunsForRef).not.toHaveBeenCalled();
    expect(prs.requestReviewers).not.toHaveBeenCalled();
  });

  it("no-ops when PR is a draft", async () => {
    const prs = makePRSpy();
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR({ draft: true }),
      prConfig: makeConfig(2),
    });
    expect(prs.getCheckRunsForRef).not.toHaveBeenCalled();
    expect(prs.requestReviewers).not.toHaveBeenCalled();
  });

  it("no-ops when PR is not open", async () => {
    const prs = makePRSpy();
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR({ state: "closed" }),
      prConfig: makeConfig(2),
    });
    expect(prs.getCheckRunsForRef).not.toHaveBeenCalled();
    expect(prs.requestReviewers).not.toHaveBeenCalled();
  });

  it("no-ops when PR does not have candidate label", async () => {
    const prs = makePRSpy();
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR({ labels: [] }),
      prConfig: makeConfig(2),
    });
    expect(prs.getCheckRunsForRef).not.toHaveBeenCalled();
    expect(prs.requestReviewers).not.toHaveBeenCalled();
  });

  it("no-ops when CI is not passing", async () => {
    const prs = makePRSpy({
      getCheckRunsForRef: vi.fn().mockResolvedValue({
        totalCount: 1,
        checkRuns: [{ id: 1, status: "completed", conclusion: "failure" }],
      }),
    });
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR(),
      prConfig: makeConfig(2),
    });
    expect(prs.getReviewersAtCurrentHead).not.toHaveBeenCalled();
    expect(prs.requestReviewers).not.toHaveBeenCalled();
  });

  it("requests up to count reviewers in alphabetical order", async () => {
    const prs = makePRSpy({
      isCollaborator: vi.fn().mockResolvedValue(true),
    });
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR(),
      prConfig: makeConfig(1, ["bob", "alice", "carol"]),
    });
    expect(prs.requestReviewers).toHaveBeenCalledWith(testRef, ["alice"]);
  });

  it("requests all eligible when count exceeds available reviewers", async () => {
    const prs = makePRSpy();
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR(),
      prConfig: makeConfig(10, ["alice", "bob"]),
    });
    expect(prs.requestReviewers).toHaveBeenCalledWith(testRef, ["alice", "bob"]);
  });

  it("excludes the PR author", async () => {
    const prs = makePRSpy();
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR({ author: "alice" }),
      prConfig: makeConfig(2, ["alice", "bob"]),
    });
    expect(prs.requestReviewers).toHaveBeenCalledWith(testRef, ["bob"]);
  });

  it("excludes reviewers who already reviewed at current head", async () => {
    const prs = makePRSpy({
      getReviewersAtCurrentHead: vi.fn().mockResolvedValue(new Set(["alice"])),
    });
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR(),
      prConfig: makeConfig(2, ["alice", "bob"]),
    });
    expect(prs.requestReviewers).toHaveBeenCalledWith(testRef, ["bob"]);
  });

  it("excludes reviewers with pending review requests", async () => {
    const prs = makePRSpy({
      getRequestedReviewers: vi.fn().mockResolvedValue(new Set(["alice"])),
    });
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR(),
      prConfig: makeConfig(2, ["alice", "bob"]),
    });
    expect(prs.requestReviewers).toHaveBeenCalledWith(testRef, ["bob"]);
  });

  it("no-ops when all eligible reviewers are filtered out", async () => {
    const prs = makePRSpy({
      getReviewersAtCurrentHead: vi.fn().mockResolvedValue(new Set(["alice", "bob"])),
    });
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR(),
      prConfig: makeConfig(2, ["alice", "bob"]),
    });
    expect(prs.requestReviewers).not.toHaveBeenCalled();
  });

  it("skips non-collaborators and still requests confirmed collaborators", async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    const prs = makePRSpy({
      isCollaborator: vi.fn().mockImplementation((_ref: unknown, username: string) =>
        Promise.resolve(username !== "outsider")
      ),
    });
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR(),
      prConfig: makeConfig(2, ["alice", "outsider"]),
      log,
    });
    expect(prs.requestReviewers).toHaveBeenCalledWith(testRef, ["alice"]);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("outsider"));
  });

  it("no-ops when all selected reviewers fail the collaborator check", async () => {
    const prs = makePRSpy({
      isCollaborator: vi.fn().mockResolvedValue(false),
    });
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR(),
      prConfig: makeConfig(2),
    });
    expect(prs.requestReviewers).not.toHaveBeenCalled();
  });

  it("continues when isCollaborator throws a transient error", async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    const prs = makePRSpy({
      isCollaborator: vi.fn().mockImplementation((_ref: unknown, username: string) => {
        if (username === "alice") return Promise.reject(new Error("API timeout"));
        return Promise.resolve(true);
      }),
    });
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR(),
      prConfig: makeConfig(2, ["alice", "bob"]),
      log,
    });
    expect(prs.requestReviewers).toHaveBeenCalledWith(testRef, ["bob"]);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("alice"));
  });

  it("logs a warning and does not throw when requestReviewers fails", async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    const prs = makePRSpy({
      requestReviewers: vi.fn().mockRejectedValue(new Error("422 Unprocessable Entity")),
    });
    await expect(
      requestTrustedReviewers({
        prs,
        ref: testRef,
        pr: makePR(),
        prConfig: makeConfig(2),
        log,
      })
    ).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("Failed to request reviewers"));
  });

  it("is case-insensitive for author and reviewer names", async () => {
    // getReviewersAtCurrentHead always returns lowercase logins; trustedReviewers
    // may have any case; author may be any case
    const prs = makePRSpy({
      getReviewersAtCurrentHead: vi.fn().mockResolvedValue(new Set(["alice"])),
    });
    await requestTrustedReviewers({
      prs,
      ref: testRef,
      pr: makePR({ author: "BOB" }),
      prConfig: makeConfig(2, ["Alice", "Bob", "carol"]),
    });
    // alice reviewed current head → excluded; bob is author → excluded; carol remains
    expect(prs.requestReviewers).toHaveBeenCalledWith(testRef, ["carol"]);
  });
});
