// api/services/templatedClient.js
//
// Minimal, focused client for the Templated.io render API
// (https://templated.io/docs/). Its only job is: send a render request for
// a configured template + set of text layers, and return normalized render
// metadata. No filesystem, no Buffer, no storage, no retries/queues.
//
// NOTE: this environment has no network access to templated.io while this
// module was written, so the request/response shape below follows
// Templated's documented v1 REST API (POST /v1/render, Bearer auth,
// `{ template, layers }` body, response containing `id`/`url`/`status`).
// Re-verify field names against the live docs / an actual API key before
// relying on this in production, and adjust `parseRenderResponse` if the
// live response shape differs.

import axios from 'axios';
import botConfig from '#bot/config.js';

const DEFAULT_BASE_URL = 'https://api.templated.io/v1';
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Resolves and validates the Templated configuration from env vars.
 * Throws a descriptive error if required config is missing so callers
 * fail fast instead of sending a doomed request.
 */
function getTemplatedConfig () {
  const apiKey = botConfig.TEMPLATED_API_KEY || botConfig.api?.templatedApiKey;
  const templateId = botConfig.TEMPLATED_TEMPLATE_ID || botConfig.api?.templatedTemplateId;
  const baseUrl = botConfig.TEMPLATED_API_BASE_URL || botConfig.api?.templatedApiBaseUrl || DEFAULT_BASE_URL;

  if (!apiKey || !templateId) {
    throw new Error('Templated is not configured (TEMPLATED_API_KEY / TEMPLATED_TEMPLATE_ID)');
  }

  return { apiKey, templateId, baseUrl };
}

/**
 * Normalizes a raw Templated API response into the shape the rest of the
 * app relies on. Throws if the response doesn't contain the minimum
 * usable fields, so callers can treat "malformed response" the same way
 * as any other render failure.
 *
 * @param {unknown} data - raw response body from Templated
 * @param {string} templateId
 */
function parseRenderResponse (data, templateId) {
  const renderId = data?.id;
  const mediaUrl = data?.url || data?.render_url;

  if (!renderId || typeof mediaUrl !== 'string' || mediaUrl.length === 0) {
    throw new Error('Templated render response is missing required fields (id/url)');
  }

  return {
    id: renderId,
    url: mediaUrl,
    status: data.status || 'completed',
    template: templateId
  };
}

/**
 * Requests a render from Templated.io for the configured template.
 *
 * @param {Record<string, { text: string }>} layers - Templated layer
 *   overrides, keyed by layer name (e.g. `{ title: { text: 'Lofi — 18h' } }`).
 * @returns {Promise<{ id: string, url: string, status: string, template: string }>}
 */
export async function requestRender (layers) {
  const { apiKey, templateId, baseUrl } = getTemplatedConfig();

  const response = await axios.post(
    `${baseUrl}/render`,
    { template: templateId, layers },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: REQUEST_TIMEOUT_MS
    }
  );

  return parseRenderResponse(response?.data, templateId);
}
