import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios');

const radioDjApi = await import('#api/services/radioDjApi.js');

describe('RadioDJ API service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('liste les requests avec la cle API configuree', async () => {
    axios.get.mockResolvedValue({ data: { requests: [{ title: 'Song' }] } });

    await expect(radioDjApi.listRequests()).resolves.toEqual([{ title: 'Song' }]);

    expect(axios.get).toHaveBeenCalledWith('https://radiodj.example.test/api/requests', {
      headers: { 'x-api-key': 'radiodj-key' },
      timeout: 10000
    });
  });

  it('retourne une liste vide si la reponse ne contient pas de requests', async () => {
    axios.get.mockResolvedValue({ data: {} });

    await expect(radioDjApi.listRequests()).resolves.toEqual([]);
  });

  it('cree une request avec artiste et titre', async () => {
    axios.post.mockResolvedValue({ data: { request: { id: 10 } } });

    await expect(radioDjApi.addRequest({ artist: 'A', title: 'T' }))
      .resolves.toEqual({ id: 10 });

    expect(axios.post).toHaveBeenCalledWith(
      'https://radiodj.example.test/api/requests',
      { artist: 'A', title: 'T' },
      { headers: { 'x-api-key': 'radiodj-key' }, timeout: 10000 }
    );
  });

  it('recherche les morceaux avec query et limit', async () => {
    axios.get.mockResolvedValue({ data: { songs: [{ artist: 'A', title: 'T' }] } });

    await expect(radioDjApi.searchSongs('abc', 3))
      .resolves.toEqual([{ artist: 'A', title: 'T' }]);

    expect(axios.get).toHaveBeenCalledWith('https://radiodj.example.test/api/search', {
      headers: { 'x-api-key': 'radiodj-key' },
      params: { q: 'abc', limit: 3 },
      timeout: 10000
    });
  });
});
