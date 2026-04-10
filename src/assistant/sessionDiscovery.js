// Assistant session discovery.
//
// discoverAssistantSessions() queries the Sessions API for active assistant
// sessions (running/idle sessions with an active environment) so that
// `gc assistant` can present a chooser when no sessionId is specified.

import {
  fetchCodeSessionsFromSessionsAPI,
  fetchSession,
} from '../utils/teleport/api.js';

/**
 * @typedef {Object} AssistantSession
 * @property {string} id - The session ID
 * @property {string} [title] - Display title (may be null from API)
 * @property {string} [repo] - Associated repository name
 * @property {string} [status] - Session status (running/idle/etc.)
 * @property {string} [environmentId] - Active environment ID
 */

/**
 * Discover active assistant sessions available for attachment.
 *
 * Fetches code sessions from the API and filters for those that are
 * running or idle (i.e. have an active environment and could accept
 * a REPL bridge connection).
 *
 * @returns {Promise<AssistantSession[]>}
 */
export async function discoverAssistantSessions() {
  const sessions = await fetchCodeSessionsFromSessionsAPI();

  // Filter for sessions that could accept a bridge connection.
  // "idle" and "working" sessions have active environments;
  // archived/completed/cancelled/rejected sessions do not.
  const activeStatuses = new Set(['idle', 'working', 'requires_action']);

  return sessions
    .filter(s => activeStatuses.has(s.status))
    .map(s => ({
      id: s.id,
      title: s.title || 'Untitled',
      repo: s.repo ? `${s.repo.owner.login}/${s.repo.name}` : undefined,
      status: s.status,
      environmentId: s.updated_at, // placeholder; real env ID comes from detailed fetch
    }));
}
