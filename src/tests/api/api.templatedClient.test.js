import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock("#bot/config.js", () => ({
  default: {
    TEMPLATED_API_KEY: "test-templated-key",
    TEMPLATED_TEMPLATE_ID: "test-template-id",
    TEMPLATED_API_BASE_URL: undefined,
    api: {
      templatedApiKey: "test-templated-key",
      templatedTemplateId: "test-template-id",
      templatedApiBaseUrl: undefined,
    },
  },
}));

import axios from "axios";
import { requestRender } from "#api/services/templatedClient.js";

describe("templatedClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests a render and returns normalized metadata on success", async () => {
    axios.post.mockResolvedValue({
      data: {
        id: "render-123",
        url: "https://cdn.templated.io/renders/render-123.png",
        status: "completed",
      },
    });

    const result = await requestRender({ title: { text: "Lofi — 18h" } });

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body, options] = axios.post.mock.calls[0];
    expect(url).toBe("https://api.templated.io/v1/render");
    expect(body).toEqual({
      template: "test-template-id",
      layers: { title: { text: "Lofi — 18h" } },
    });
    expect(options.headers.Authorization).toBe("Bearer test-templated-key");

    expect(result).toEqual({
      id: "render-123",
      url: "https://cdn.templated.io/renders/render-123.png",
      status: "completed",
      template: "test-template-id",
    });
  });

  it("throws when Templated rejects the request (API rejection)", async () => {
    const apiError = Object.assign(new Error("Request failed with status code 401"), {
      response: { status: 401, data: { error: "Invalid API key" } },
    });
    axios.post.mockRejectedValue(apiError);

    await expect(requestRender({ title: { text: "Lofi — 18h" } })).rejects.toThrow(
      "Request failed with status code 401"
    );
  });

  it("throws on network failure", async () => {
    axios.post.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(requestRender({ title: { text: "Lofi — 18h" } })).rejects.toThrow(
      "ECONNREFUSED"
    );
  });

  it("throws on a malformed response missing id/url", async () => {
    axios.post.mockResolvedValue({ data: { status: "completed" } });

    await expect(requestRender({ title: { text: "Lofi — 18h" } })).rejects.toThrow(
      /missing required fields/i
    );
  });

  it("throws a configuration error when API key or template id is missing", async () => {
    vi.resetModules();
    vi.doMock("#bot/config.js", () => ({
      default: { TEMPLATED_API_KEY: undefined, TEMPLATED_TEMPLATE_ID: undefined, api: {} },
    }));

    const { requestRender: requestRenderUnconfigured } = await import(
      "#api/services/templatedClient.js"
    );

    await expect(requestRenderUnconfigured({ title: { text: "x" } })).rejects.toThrow(
      /not configured/i
    );
  });
});
