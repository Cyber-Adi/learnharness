// Thin transport; the logic lives in src/server/remote/handlers.ts.
import { handleRevokeDevice } from "@/src/server";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
	const { id } = await ctx.params;
	return handleRevokeDevice(req, id);
}
