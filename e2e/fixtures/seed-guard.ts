import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

// Resolve symlinks of the deepest existing ancestor so a link out of tmp cannot pass.
function real(p: string): string {
	let cur = path.resolve(p)
	const rest: string[] = []
	while (!fs.existsSync(cur) && path.dirname(cur) !== cur) {
		rest.unshift(path.basename(cur))
		cur = path.dirname(cur)
	}
	return path.join(fs.realpathSync(cur), ...rest)
}

/** True only for a path strictly inside the OS temp dir; the seed must never touch real learner data. */
export function insideTmp(p: string): boolean {
	if (!p) return false
	const rel = path.relative(real(os.tmpdir()), real(p))
	return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)
}
