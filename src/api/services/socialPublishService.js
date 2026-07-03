// api/services/socialPublishService.js
//
// Social orchestration entry point for playlist updates. Builds a small
// "programming announcement" (e.g. "Lofi — 18h") from the fields already
// available on a playlist update, requests a rendered visual from
// Templated.io, and returns normalized render metadata.
//
// This module intentionally does NOT download, store, publish, or schedule
// the rendered image — it only requests the render and hands back its URL.
// Actually publishing it somewhere is future-sprint work behind this same
// boundary.

import logger from '#shared/logging/logger.js';
import { requestRender } from '#api/services/templatedClient.js';

// Layer names on the configured Templated template that receive the
// programming title ("Lofi — 18h") and the playlist name. Adjust these to
// match the actual template's layer names in the Templated dashboard.
const TITLE_LAYER = 'title';
const SUBTITLE_LAYER = 'subtitle';

const ANNOUNCEMENT_TIMEZONE = 'America/Toronto';

/**
 * Builds the programming announcement text, e.g. "Lofi — 18h", from the
 * topic/program title and the current hour in the station's timezone.
 * Deliberately does not use any "now playing" artist/title data.
 *
 * @param {string} topic
 * @param {Date} [now]
 */
export function formatProgramAnnouncement (topic, now = new Date()) {
  const hour = new Intl.DateTimeFormat('en-CA', {
    timeZone: ANNOUNCEMENT_TIMEZONE,
    hour: '2-digit',
    hour12: false
  }).format(now).replace(/\D/g, '');

  return `${topic} — ${hour}h`;
}

/**
 * Social orchestration entry point for a playlist update. Requests a
 * Templated render representing the programming announcement.
 *
 * @param {{ playlist: string, topic: string }} payload
 * @returns {Promise<
 *   { status: 'rendered', id: string, url: string, template: string, renderStatus: string } |
 *   { status: 'failed', error: string }
 * >}
 */
export async function publishPlaylistUpdate ({ playlist, topic }) {
  const announcement = formatProgramAnnouncement(topic);

  try {
    const render = await requestRender({
      [TITLE_LAYER]: { text: announcement },
      [SUBTITLE_LAYER]: { text: playlist }
    });

    await logger.info(
      `📣 [social] Templated render requested for "${announcement}" (playlist="${playlist}") → ${render.url}`
    );

    return {
      status: 'rendered',
      id: render.id,
      url: render.url,
      template: render.template,
      renderStatus: render.status
    };
  } catch (err) {
    await logger.error(
      `⚠️ [social] Templated render failed for "${announcement}" (playlist="${playlist}"): ${err.message}`
    );

    return { status: 'failed', error: err.message };
  }
}
