import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// The AI SDK's generateText, stubbed so the tests never reach Gemini. Mocked before ai.ts is imported.
const generateText = mock();
mock.module("ai", () => ({ generateText }));
const { isPolishConfigured, polishReply } = await import("./ai.ts");

const input = { draft: "ur refund is on its way", subject: "Refund please", customerName: "Jane Doe", agentName: "Alan Agent" };

beforeEach(() => {
  generateText.mockReset().mockResolvedValue({ text: "  Your refund is on its way.  \n" });
});

describe("polishReply", () => {
  test("addresses the customer by first name and signs the trimmed polished reply with the agent's name", async () => {
    expect(await polishReply(input)).toBe("Hi Jane,\n\nYour refund is on its way.\n\nBest regards,\nAlan Agent");
  });

  test.each([
    ["no sender name", null],
    ["a blank sender name", "  "],
  ])("greets the customer generically when the email had %s", async (_, customerName) => {
    expect(await polishReply({ ...input, customerName })).toStartWith("Hi there,\n\n");
  });

  test("sends the draft with the ticket's context and asks the model to leave out the greeting and sign-off", async () => {
    await polishReply(input);

    const { prompt, instructions } = generateText.mock.calls[0]?.[0] as { prompt: string; instructions: string };
    expect(prompt).toContain("Ticket subject: Refund please");
    expect(prompt).toContain("Customer name: Jane Doe");
    expect(prompt).toContain("Agent name: Alan Agent");
    expect(prompt).toEndWith("Draft reply:\nur refund is on its way");
    expect(instructions).toContain("Leave out any\ngreeting");
    expect(instructions).toContain("any sign-off");
  });

  test.each([
    ["extra whitespace", "  Jane   Doe  "],
    ["a single name", "Jane"],
  ])("greets the customer by first name given %s", async (_, customerName) => {
    expect(await polishReply({ ...input, customerName })).toStartWith("Hi Jane,\n\n");
  });

  test("tells the model when the customer's name is unknown", async () => {
    await polishReply({ ...input, customerName: null });

    const { prompt } = generateText.mock.calls[0]?.[0] as { prompt: string };
    expect(prompt).toContain("Customer name: unknown");
  });

  test("calls Gemini's free-tier model with a timeout and one retry", async () => {
    await polishReply(input);

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0]?.[0]).toMatchObject({
      model: { modelId: "gemini-3.5-flash-lite" },
      timeout: 30_000,
      maxRetries: 1,
    });
  });

  test("passes on the AI SDK's error when the call fails", async () => {
    generateText.mockRejectedValue(new Error("quota exceeded"));

    await expect(polishReply(input)).rejects.toThrow("quota exceeded");
  });

  test("throws when the model returns nothing", async () => {
    generateText.mockResolvedValue({ text: "  \n " });

    await expect(polishReply(input)).rejects.toThrow("The model returned an empty reply");
  });
});

describe("isPolishConfigured", () => {
  const savedKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  afterEach(() => {
    if (savedKey === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = savedKey;
  });

  test("is true when a Gemini API key is set", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    expect(isPolishConfigured()).toBe(true);
  });

  test.each([
    ["unset", undefined],
    ["empty", ""],
  ])("is false when the key is %s", (_, key) => {
    if (key === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = key;

    expect(isPolishConfigured()).toBe(false);
  });
});
