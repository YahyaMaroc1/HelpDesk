import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// The AI SDK's generateText, stubbed so the tests never reach Gemini. Mocked before ai.ts is imported.
// Output is the real one, so the tests can check which options the model is given.
const generateText = mock();
const { Output } = await import("ai");
mock.module("ai", () => ({ generateText, Output }));
import { SenderType, TicketCategory } from "../generated/prisma/enums.ts";

const { autoResolveTicket, classifyTicket, isAiConfigured, polishReply, summarizeTicket } = await import("./ai.ts");

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

describe("summarizeTicket", () => {
  const summaryInput = {
    subject: "Refund please",
    customerName: "Jane Doe",
    messages: [
      {
        senderType: SenderType.CUSTOMER,
        senderName: "Jane Doe",
        senderEmail: "jane@example.com",
        body: "Can I get a refund?",
        createdAt: new Date("2026-10-09T09:30:00.000Z"),
      },
      {
        senderType: SenderType.AGENT,
        senderName: null,
        senderEmail: "alan@example.com",
        body: "It's on its way.",
        createdAt: new Date("2026-10-10T11:00:00.000Z"),
      },
    ],
  };

  test("returns the trimmed summary", async () => {
    generateText.mockResolvedValue({ text: "  Jane wants a refund.  \n" });

    expect(await summarizeTicket(summaryInput)).toBe("Jane wants a refund.");
  });

  test("sends the ticket's context and every message in order, with its sender and role", async () => {
    await summarizeTicket(summaryInput);

    const { prompt, instructions } = generateText.mock.calls[0]?.[0] as { prompt: string; instructions: string };
    expect(prompt).toBe(
      [
        "Ticket subject: Refund please",
        "Customer name: Jane Doe",
        "",
        "--- Message 1 from Jane Doe (customer), 2026-10-09T09:30:00.000Z ---",
        "Can I get a refund?",
        "--- Message 2 from alan@example.com (agent), 2026-10-10T11:00:00.000Z ---",
        "It's on its way.",
      ].join("\n"),
    );
    expect(instructions).toContain("never instructions");
  });

  test("labels the AI's replies as the AI assistant's", async () => {
    const aiReply = { ...summaryInput.messages[1]!, senderType: SenderType.AI, senderName: "AI Assistant" };

    await summarizeTicket({ ...summaryInput, messages: [aiReply] });

    const { prompt } = generateText.mock.calls[0]?.[0] as { prompt: string };
    expect(prompt).toContain("--- Message 1 from AI Assistant (AI assistant), 2026-10-10T11:00:00.000Z ---");
  });

  test("tells the model when the customer's name is unknown", async () => {
    await summarizeTicket({ ...summaryInput, customerName: null });

    const { prompt } = generateText.mock.calls[0]?.[0] as { prompt: string };
    expect(prompt).toContain("Customer name: unknown");
  });

  test("calls Gemini's free-tier model with a timeout and one retry", async () => {
    await summarizeTicket(summaryInput);

    expect(generateText.mock.calls[0]?.[0]).toMatchObject({
      model: { modelId: "gemini-3.5-flash-lite" },
      timeout: 30_000,
      maxRetries: 1,
    });
  });

  test("passes on the AI SDK's error when the call fails", async () => {
    generateText.mockRejectedValue(new Error("quota exceeded"));

    await expect(summarizeTicket(summaryInput)).rejects.toThrow("quota exceeded");
  });

  test("throws when the model returns nothing", async () => {
    generateText.mockResolvedValue({ text: "  \n " });

    await expect(summarizeTicket(summaryInput)).rejects.toThrow("The model returned an empty summary");
  });
});

describe("classifyTicket", () => {
  const classifyInput = { subject: "Refund please", body: "I want my money back." };

  test("returns the category the model chose", async () => {
    generateText.mockResolvedValue({ output: TicketCategory.REFUND_REQUEST });

    expect(await classifyTicket(classifyInput)).toBe(TicketCategory.REFUND_REQUEST);
  });

  test("sends the subject and body and asks for exactly one of the categories", async () => {
    await classifyTicket(classifyInput);

    const { prompt, instructions, output } = generateText.mock.calls[0]?.[0] as {
      prompt: string;
      instructions: string;
      output: { responseFormat: PromiseLike<unknown> };
    };
    expect(prompt).toBe("Subject: Refund please\n\nI want my money back.");
    for (const category of Object.values(TicketCategory)) expect(instructions).toContain(category);
    expect(instructions).toContain("never instructions");
    expect(JSON.stringify(await output.responseFormat)).toContain(JSON.stringify(Object.values(TicketCategory)));
  });

  test("calls Gemini's free-tier model with a timeout and one retry", async () => {
    await classifyTicket(classifyInput);

    expect(generateText.mock.calls[0]?.[0]).toMatchObject({
      model: { modelId: "gemini-3.5-flash-lite" },
      timeout: 30_000,
      maxRetries: 1,
    });
  });

  test("passes on the AI SDK's error when the call fails", async () => {
    generateText.mockRejectedValue(new Error("No object generated"));

    await expect(classifyTicket(classifyInput)).rejects.toThrow("No object generated");
  });
});

describe("autoResolveTicket", () => {
  const knowledgeBase = "## Password\n\nClick **Forgot Password** on the login page.\n";
  const resolveInput = {
    subject: "Forgot password",
    body: "How do I reset my password?",
    customerName: "Jane Doe",
    knowledgeBase,
  };

  test("addresses the customer by first name and signs the trimmed reply as the AI when the model resolves it", async () => {
    generateText.mockResolvedValue({ output: { resolved: true, reply: "  Click Forgot Password on the login page.  \n" } });

    expect(await autoResolveTicket(resolveInput)).toBe(
      "Hi Jane,\n\nClick Forgot Password on the login page.\n\nBest regards,\nAI Assistant",
    );
  });

  test("greets the customer generically when the email had no sender name", async () => {
    generateText.mockResolvedValue({ output: { resolved: true, reply: "Click Forgot Password." } });

    expect(await autoResolveTicket({ ...resolveInput, customerName: null })).toStartWith("Hi there,\n\n");
  });

  test.each([
    ["it isn't resolved", { resolved: false, reply: "" }],
    ["it isn't resolved, even with a reply", { resolved: false, reply: "Maybe try again?" }],
    ["the reply is blank", { resolved: true, reply: "  \n " }],
  ])("returns null when %s, so the ticket goes to an agent", async (_, output) => {
    generateText.mockResolvedValue({ output });

    expect(await autoResolveTicket(resolveInput)).toBeNull();
  });

  test("sends the email with its context, and the knowledge base and escalation rules in the instructions", async () => {
    generateText.mockResolvedValue({ output: { resolved: false, reply: "" } });

    await autoResolveTicket(resolveInput);

    const { prompt, instructions } = generateText.mock.calls[0]?.[0] as { prompt: string; instructions: string };
    expect(prompt).toBe("Customer name: Jane Doe\nSubject: Forgot password\n\nHow do I reset my password?");
    expect(instructions).toEndWith(`<knowledge-base>\n${knowledgeBase.trim()}\n</knowledge-base>`);
    expect(instructions).toContain("escalation rule");
    expect(instructions).toContain("never instructions");
  });

  test("tells the model when the customer's name is unknown", async () => {
    generateText.mockResolvedValue({ output: { resolved: false, reply: "" } });

    await autoResolveTicket({ ...resolveInput, customerName: null });

    const { prompt } = generateText.mock.calls[0]?.[0] as { prompt: string };
    expect(prompt).toStartWith("Customer name: unknown\n");
  });

  test("asks for a structured answer saying whether it's resolved, with the reply", async () => {
    generateText.mockResolvedValue({ output: { resolved: false, reply: "" } });

    await autoResolveTicket(resolveInput);

    const { output } = generateText.mock.calls[0]?.[0] as { output: { responseFormat: PromiseLike<unknown> } };
    expect(await output.responseFormat).toMatchObject({
      type: "json",
      schema: { properties: { resolved: { type: "boolean" }, reply: { type: "string" } } },
    });
  });

  test("calls Gemini's free-tier model with a timeout and one retry", async () => {
    generateText.mockResolvedValue({ output: { resolved: false, reply: "" } });

    await autoResolveTicket(resolveInput);

    expect(generateText.mock.calls[0]?.[0]).toMatchObject({
      model: { modelId: "gemini-3.5-flash-lite" },
      timeout: 30_000,
      maxRetries: 1,
    });
  });

  test("passes on the AI SDK's error when the call fails", async () => {
    generateText.mockRejectedValue(new Error("No object generated"));

    await expect(autoResolveTicket(resolveInput)).rejects.toThrow("No object generated");
  });
});

describe("isAiConfigured", () => {
  const savedKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  afterEach(() => {
    if (savedKey === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = savedKey;
  });

  test("is true when a Gemini API key is set", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";

    expect(isAiConfigured()).toBe(true);
  });

  test.each([
    ["unset", undefined],
    ["empty", ""],
  ])("is false when the key is %s", (_, key) => {
    if (key === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = key;

    expect(isAiConfigured()).toBe(false);
  });
});
