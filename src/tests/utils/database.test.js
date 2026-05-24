import { database } from "../../utils/database/database.js";

describe("database mock", () => {
  it("query retourne un tableau vide", async () => {
    const res = await database.query();
    expect(Array.isArray(res)).toBe(true);
    expect(res).toHaveLength(0);
  });

  it("connect retourne true", async () => {
    const res = await database.connect();
    expect(res).toBe(true);
  });

  it("disconnect retourne true", async () => {
    const res = await database.disconnect();
    expect(res).toBe(true);
  });
});
