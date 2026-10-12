// The AGENT user that new tickets are assigned to while the AI tries to resolve them (lib/auto-resolve-ticket.ts),
// created by prisma/seed-ai-agent.ts. It has no password, so nobody can sign in as it, and its .invalid address
// can't receive mail. The AI's messages are sent from the same address.
export const aiAgentEmail = "ai-assistant@helpdesk.invalid";
export const aiAgentName = "AI";
