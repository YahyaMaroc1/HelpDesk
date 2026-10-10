import type { Response } from "express";
import type { z } from "zod";

// Parses request input (req.body, req.params, req.query) with a Zod object schema. On failure it answers
// `status` (400 by default) with the first issue's message as `{ error }` and returns undefined, so the handler
// just returns:
//   const body = validate(createUserSchema, req.body, res);
//   if (!body) return;
export function validate<T extends z.ZodType>(schema: T, input: unknown, res: Response, status = 400) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    res.status(status).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return undefined;
  }
  return parsed.data;
}
