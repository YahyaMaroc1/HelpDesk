import { beforeEach, describe, expect, mock, test } from "bun:test";

// The AI SDK's generateText, stubbed so the tests never reach Gemini. Mocked before ai.ts is imported.
const generateText = mock();
mock.module("ai", () => ({ generateText }));
const { polishReply } = await import("./ai.ts");

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

  test("throws when the model returns nothing", async () => {
    generateText.mockResolvedValue({ text: "  \n " });

    await expect(polishReply(input)).rejects.toThrow("The model returned an empty reply");
  });
});
