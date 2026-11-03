// Thin transport; the logic lives in src/server/remote/draft-handlers.ts.
import { handleDraft } from "@/src/server";

type Ctx = { params: Promise<{ id: string }> };
const handle = async (req: Request, ctx: Ctx): Promise<Response> => handleDraft(req, (await ctx.params).id);

export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
