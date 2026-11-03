// Thin transport; the logic lives in src/server/remote/handlers.ts.
import { handlePair } from "@/src/server";

export const POST = (req: Request) => handlePair(req);
