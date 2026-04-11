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

/**
 * Extract issue numbers that appear in same-repo closing keyword references
 * outside code blocks or inline code spans.
 *
 * Handles all three reference forms:
 *   - #N
 *   - owner/repo#N
 *   - https://github.com/owner/repo/issues/N
 *
 * Returns an empty set if body is null/undefined or contains no qualifying refs.
 */
export function extractConfirmedClosingRefNumbers(
  body: string | null | undefined,
  repository: RepositoryRef
): Set<number> {
  const result = new Set<number>();
  if (!body) return result;

  const searchableBody = stripMarkdownCode(body);
  const normalizedOwner = repository.owner.toLowerCase();
  const normalizedRepo = repository.repo.toLowerCase();

  for (const match of searchableBody.matchAll(CLOSING_KEYWORD_PATTERN)) {
    const rawTarget = match[1];
    if (!rawTarget) continue;

    const target = stripTrailingPunctuation(rawTarget);

    // Form 1: #N
    const shortMatch = target.match(/^#(\d+)$/);
    if (shortMatch) {
      result.add(parseInt(shortMatch[1], 10));
      continue;
    }

    // Form 2: owner/repo#N (capture group for the number)
    const qualifiedMatch = target.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(\d+)$/);
    if (qualifiedMatch) {
      const [, owner, repo, numStr] = qualifiedMatch;
      if (owner.toLowerCase() === normalizedOwner && repo.toLowerCase() === normalizedRepo) {
        result.add(parseInt(numStr, 10));
      }
      continue;
    }

    // Form 3: https://github.com/owner/repo/issues/N (capture group for the number)
    const urlMatch = target.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)$/i);
    if (urlMatch) {
      const [, owner, repo, numStr] = urlMatch;
      if (owner.toLowerCase() === normalizedOwner && repo.toLowerCase() === normalizedRepo) {
        result.add(parseInt(numStr, 10));
      }
    }
  }

  return result;
}

/**
 * Filter a list of linked issues to those confirmed by actual closing-keyword
 * references in the PR body (outside code blocks and inline code spans).
 *
 * Fail-safe: if `prBody` is null/undefined or no confirmed refs are found
 * (e.g. all keywords are inside code spans), the original list is returned
 * unchanged — prefer false-positive over false-negative for intake.
 */
export function filterToConfirmedClosingRefs<T extends { number: number }>(
  linkedIssues: T[],
  prBody: string | null | undefined,
  repository: RepositoryRef
): T[] {
  if (!linkedIssues.length || !prBody) return linkedIssues;

  const confirmed = extractConfirmedClosingRefNumbers(prBody, repository);
  if (!confirmed.size) return linkedIssues;

  return linkedIssues.filter((issue) => confirmed.has(issue.number));
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
