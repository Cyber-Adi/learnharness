// Thin transport; the logic lives in src/server/remote/handlers.ts.
import { handlePairingCode } from "@/src/server";

export const POST = (req: Request) => handlePairingCode(req);
