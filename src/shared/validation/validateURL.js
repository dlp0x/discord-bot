// bot/utils/validateURL.js
export function validateURL (url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const urlObj = new URL(url);
    return (
      urlObj.hostname === 'youtu.be'
      || urlObj.hostname === 'www.youtube.com'
      || urlObj.hostname === 'youtube.com'
      || urlObj.hostname === 'open.spotify.com'
    );
  } catch {
    // Intentionally empty: error handled silently
  }
}
