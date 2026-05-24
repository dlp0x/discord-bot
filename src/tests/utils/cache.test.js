import cache from "../../utils/bot/cache.js";

describe("cache helper", () => {
  beforeEach(() => {
    cache.clear();
  });

  it("set et get une valeur", () => {
    cache.set("foo", 42);
    expect(cache.get("foo")).toBe(42);
  });

  it("expire après TTL", async () => {
    cache.set("bar", "baz", 10); // 10ms
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.get("bar")).toBeNull();
  });

  it("clear vide le cache", () => {
    cache.set("x", 1);
    cache.clear();
    expect(cache.get("x")).toBeNull();
  });
});

