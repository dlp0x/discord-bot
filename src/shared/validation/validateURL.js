export function validateURL (url) {
  if (!url || typeof url !== 'string') return false;

  const lower = url.toLowerCase();

  const isYouTube = /https?:\/\/(www\.|m\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/.test(lower);
  const isSpotify = /https?:\/\/open\.spotify\.com\/(track|playlist|album)\/[\w-]+/.test(lower);
  const isTwitch = /https?:\/\/(www\.)?twitch\.tv\/[\w-]+/.test(lower);

  return isYouTube || isSpotify || isTwitch;
}

export default validateURL;
