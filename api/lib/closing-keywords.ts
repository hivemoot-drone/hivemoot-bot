/**
 * Detect whether a PR body contains same-repository closing keyword syntax.
 *
 * Supported forms:
 * - Fixes #123
 * - Closes owner/repo#123
 * - Resolves https://github.com/owner/repo/issues/123
 */

interface RepositoryRef {
  owner: string;
  repo: string;
}

const CLOSING_KEYWORD_PATTERN =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s*:?\s+([^\s]+)/gi;

const ISSUE_NUMBER_PATTERN = /^#\d+$/;
const QUALIFIED_REFERENCE_PATTERN = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#\d+$/;
const ISSUE_URL_PATTERN = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/\d+$/i;

function stripTrailingPunctuation(token: string): string {
  return token.replace(/[),.;:!?]+$/, "");
}

function stripMarkdownCode(body: string): string {
  return body
    // Remove fenced code blocks (```...``` and ~~~...~~~)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    // Remove inline code spans (`...`)
    .replace(/`[^`]*`/g, " ");
}

const QUALIFIED_REFERENCE_WITH_NUMBER_PATTERN = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/;
const ISSUE_URL_WITH_NUMBER_PATTERN = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)$/i;

// Non-global version used for presence check only (avoids lastIndex side effects)
const CLOSING_KEYWORD_PRESENCE_PATTERN = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s*:?\s+\S/i;

/**
 * Extract the set of issue numbers that appear in same-repo closing keyword
 * references outside of fenced code blocks and inline code spans.
 *
 * Handles all three reference forms:
 *   - #N
 *   - owner/repo#N
 *   - https://github.com/owner/repo/issues/N
 *
 * Returns an empty set if body is null, empty, or contains no valid references.
 */
function extractClosingIssueNumbers(body: string, repository: RepositoryRef): Set<number> {
  const searchableBody = stripMarkdownCode(body);
  const normalizedOwner = repository.owner.toLowerCase();
  const normalizedRepo = repository.repo.toLowerCase();
  const issueNumbers = new Set<number>();

  for (const match of searchableBody.matchAll(CLOSING_KEYWORD_PATTERN)) {
    const rawTarget = match[1];
    if (!rawTarget) continue;

    const target = stripTrailingPunctuation(rawTarget);

    const shortMatch = target.match(/^#(\d+)$/);
    if (shortMatch) {
      issueNumbers.add(parseInt(shortMatch[1], 10));
      continue;
    }

    const qualifiedMatch = target.match(QUALIFIED_REFERENCE_WITH_NUMBER_PATTERN);
    if (qualifiedMatch) {
      const [, owner, repo, issueNum] = qualifiedMatch;
      if (owner.toLowerCase() === normalizedOwner && repo.toLowerCase() === normalizedRepo) {
        issueNumbers.add(parseInt(issueNum, 10));
      }
      continue;
    }

    const urlMatch = target.match(ISSUE_URL_WITH_NUMBER_PATTERN);
    if (urlMatch) {
      const [, owner, repo, issueNum] = urlMatch;
      if (owner.toLowerCase() === normalizedOwner && repo.toLowerCase() === normalizedRepo) {
        issueNumbers.add(parseInt(issueNum, 10));
      }
    }
  }

  return issueNumbers;
}

/**
 * Filter linked issues returned by `closingIssuesReferences` to only those
 * whose issue numbers actually appear in a same-repo closing keyword reference
 * outside of fenced code blocks and inline code spans.
 *
 * Fail-safe: if prBody is absent or no confirmed references are found, returns
 * the original linkedIssues list unchanged — prefer false-positive over
 * false-negative (a missed enrollment is worse than a spurious one).
 */
export function filterToConfirmedClosingRefs<T extends { number: number }>(
  linkedIssues: T[],
  prBody: string | null | undefined,
  repository: RepositoryRef
): T[] {
  if (!prBody || linkedIssues.length === 0) {
    return linkedIssues;
  }

  const confirmedNumbers = extractClosingIssueNumbers(prBody, repository);
  if (confirmedNumbers.size === 0) {
    // Distinguish two cases:
    //   1. Body has no closing keywords at all — PR was linked via the GitHub UI,
    //      not by keywords. Fail-safe: trust GitHub's result and pass through.
    //   2. Body has closing keywords but all are inside code blocks/spans — this is
    //      the false-positive pattern. Filter: return empty.
    if (!CLOSING_KEYWORD_PRESENCE_PATTERN.test(prBody)) {
      return linkedIssues;
    }
    return [];
  }

  return linkedIssues.filter((issue) => confirmedNumbers.has(issue.number));
}

export function hasSameRepoClosingKeywordRef(body: string | null | undefined, repository: RepositoryRef): boolean {
  if (!body) {
    return false;
  }

  const searchableBody = stripMarkdownCode(body);
  const normalizedOwner = repository.owner.toLowerCase();
  const normalizedRepo = repository.repo.toLowerCase();

  for (const match of searchableBody.matchAll(CLOSING_KEYWORD_PATTERN)) {
    const rawTarget = match[1];
    if (!rawTarget) continue;

    const target = stripTrailingPunctuation(rawTarget);
    if (ISSUE_NUMBER_PATTERN.test(target)) {
      return true;
    }

    const qualifiedMatch = target.match(QUALIFIED_REFERENCE_PATTERN);
    if (qualifiedMatch) {
      const [, owner, repo] = qualifiedMatch;
      if (
        owner.toLowerCase() === normalizedOwner &&
        repo.toLowerCase() === normalizedRepo
      ) {
        return true;
      }
      continue;
    }

    const urlMatch = target.match(ISSUE_URL_PATTERN);
    if (urlMatch) {
      const [, owner, repo] = urlMatch;
      if (
        owner.toLowerCase() === normalizedOwner &&
        repo.toLowerCase() === normalizedRepo
      ) {
        return true;
      }
    }
  }

  return false;
}
