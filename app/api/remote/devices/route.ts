// Thin transport; the logic lives in src/server/remote/handlers.ts.
import { handleListDevices } from "@/src/server";

export const GET = (req: Request) => handleListDevices(req);
