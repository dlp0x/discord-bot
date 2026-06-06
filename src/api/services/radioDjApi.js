import axios from 'axios';
import config from '../../bot/config.js';

function getApiConfig () {
  const baseUrl = config.RADIODJ_API_URL || config.api?.radioDjUrl;
  const apiKey = config.RADIODJ_API_KEY || config.api?.radioDjKey;

  if (!baseUrl || !apiKey) {
    throw new Error('RadioDJ API is not configured (RADIODJ_API_URL / RADIODJ_API_KEY)');
  }

  return { baseUrl, apiKey };
}

export async function listRequests () {
  const { baseUrl, apiKey } = getApiConfig();
  const { data } = await axios.get(`${baseUrl}/requests`, {
    headers: { 'x-api-key': apiKey },
    timeout: 10000
  });

  return data?.requests || [];
}

export async function addRequest ({ artist, title }) {
  const { baseUrl, apiKey } = getApiConfig();
  const { data } = await axios.post(
    `${baseUrl}/requests`,
    { artist, title },
    {
      headers: { 'x-api-key': apiKey },
      timeout: 10000
    }
  );

  return data?.request;
}

export async function searchSongs (query, limit = 10) {
  const { baseUrl, apiKey } = getApiConfig();
  const { data } = await axios.get(`${baseUrl}/search`, {
    headers: { 'x-api-key': apiKey },
    params: { q: query, limit },
    timeout: 10000
  });

  return data?.songs || [];
}
