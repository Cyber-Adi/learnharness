export interface PointerLike {
	readonly isPrimary: boolean
	readonly button: number
}

export interface TouchLike {
	readonly identifier: number
	readonly clientY: number
}

// Only the primary pointer's main button (touch contact, left click, pen tip) may drag.
export function shouldStartPointer(p: PointerLike): boolean {
	return p.isPrimary && p.button === 0
}

// The touch that started the gesture, looked up by identifier in a touch list.
export function pickTouch(list: ArrayLike<TouchLike>, id: number | null): TouchLike | undefined {
	if (id === null) return undefined
	for (let i = 0; i < list.length; i++) {
		const t = list[i]
		if (t && t.identifier === id) return t
	}
	return undefined
}
