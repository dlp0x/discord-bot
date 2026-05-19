// utils/databaseMock.js - Mock minimal pour les tests
export const database = {
  query: () => Promise.resolve([]),
  connect: () => Promise.resolve(true),
  disconnect: () => Promise.resolve(true),
};
