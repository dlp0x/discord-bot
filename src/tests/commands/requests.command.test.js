import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteraction, lastReplyContent } from '../helpers/discordFactory.js';

vi.mock('#api/services/radioDjApi.js', () => ({
  addRequest: vi.fn(),
  listRequests: vi.fn(),
  searchSongs: vi.fn()
}));

const radioDjApi = await import('#api/services/radioDjApi.js');
const requestsCommand = (await import('#bot/commands/requests/index.js')).default;
const listSubcommand = (await import('#bot/commands/requests/requests-list.js')).default;

describe('requests command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuse les membres sans role de requests', async () => {
    const interaction = createInteraction({
      optionValues: { subcommand: 'add' },
      roleIds: []
    });

    await requestsCommand.execute(interaction);

    expect(radioDjApi.addRequest).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('autorisation'),
      ephemeral: true
    }));
  });

  it('ajoute une request RadioDJ pour un membre autorise', async () => {
    radioDjApi.addRequest.mockResolvedValue({ id: 1 });
    const interaction = createInteraction({
      optionValues: {
        subcommand: 'add',
        artiste: 'Le Groupe',
        titre: 'La Chanson'
      },
      roleIds: [process.env.REQ_ROLE_ID]
    });

    await requestsCommand.execute(interaction);

    expect(radioDjApi.addRequest).toHaveBeenCalledWith({
      artist: 'Le Groupe',
      title: 'La Chanson',
      requestedBy: 'tester#0001'
    });
    expect(lastReplyContent(interaction)).toContain('ajoutee');
  });

  it('explique quand RadioDJ ne trouve pas le morceau', async () => {
    radioDjApi.addRequest.mockRejectedValue({ response: { status: 404 } });
    const interaction = createInteraction({
      optionValues: { subcommand: 'add', artiste: 'X', titre: 'Y' },
      roleIds: [process.env.REQ_ROLE_ID]
    });

    await requestsCommand.execute(interaction);

    expect(lastReplyContent(interaction)).toContain('introuvable');
  });

  it('affiche les resultats de recherche et respecte la limite demandee', async () => {
    radioDjApi.searchSongs.mockResolvedValue([
      { artist: 'Artist A', title: 'Title A' },
      { artist: 'Artist B', title: 'Title B' }
    ]);
    const interaction = createInteraction({
      optionValues: { subcommand: 'search', query: 'artist', limit: 2 },
      roleIds: [process.env.REQ_ROLE_ID]
    });

    await requestsCommand.execute(interaction);

    expect(radioDjApi.searchSongs).toHaveBeenCalledWith('artist', 2);
    expect(lastReplyContent(interaction)).toContain('Artist A - Title A');
    expect(lastReplyContent(interaction)).toContain('Artist B - Title B');
  });

  it('retourne un message vide lisible quand la recherche ne trouve rien', async () => {
    radioDjApi.searchSongs.mockResolvedValue([]);
    const interaction = createInteraction({
      optionValues: { subcommand: 'search', query: 'missing' },
      roleIds: [process.env.REQ_ROLE_ID]
    });

    await requestsCommand.execute(interaction);

    expect(lastReplyContent(interaction)).toContain('Aucun resultat');
  });

  it('liste les requests en attente via le sous-module dedie', async () => {
    radioDjApi.listRequests.mockResolvedValue([
      { artist: 'Artist', title: 'Song', requests: 3 }
    ]);
    const interaction = createInteraction();

    await listSubcommand.execute(interaction);

    expect(lastReplyContent(interaction)).toContain('Song - Artist (3 requests)');
  });
});
