import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { toast } from "sonner"
import { type ToastSink, createNotifier } from "../components/mobile/toast/toast.ts"
import { toastIdFor } from "../components/mobile/toast/toast-policy.ts"

interface Op {
	readonly op: "show" | "dismiss"
	readonly id: string
	readonly message?: string
	readonly duration?: number
}

function harness(start = 10_000) {
	const ops: Op[] = []
	let t = start
	const sink: ToastSink = {
		show: (id, message, options) => ops.push({ op: "show", id, message, duration: options.duration }),
		dismiss: (id) => ops.push({ op: "dismiss", id }),
	}
	const notify = createNotifier({ sink, now: () => t })
	return { ops, notify, advance: (ms: number) => (t += ms) }
}

describe("mobile toast notifier", () => {
	it("copy strings match exactly", () => {
		const { ops, notify, advance } = harness()
		notify.answeredElsewhere()
		advance(2000)
		notify.draftRestored("desktop")
		advance(2000)
		notify.draftRestored("phone")
		advance(2000)
		notify.hostOffline()
		advance(2000)
		notify.hostOnline()
		assert.deepEqual(
			ops.filter((o) => o.op === "show").map((o) => o.message),
			["Answered on Desktop", "Draft from Desktop", "Draft from phone", "Host offline. Reconnecting...", "Back online"],
		)
	})

	it("repeated answeredElsewhere reuses one id and the second inside 1500 ms is dropped", () => {
		const { ops, notify, advance } = harness()
		notify.answeredElsewhere()
		advance(1000)
		notify.answeredElsewhere()
		assert.equal(ops.length, 1)
		advance(600)
		notify.answeredElsewhere()
		assert.equal(ops.length, 2)
		assert.equal(ops[0]?.id, ops[1]?.id)
		assert.equal(ops[0]?.id, toastIdFor("answeredElsewhere"))
	})

	it("hostOffline is persistent until hostOnline dismisses it, then Back online shows for 2000 ms", () => {
		const { ops, notify, advance } = harness()
		notify.hostOffline()
		assert.equal(ops[0]?.duration, Number.POSITIVE_INFINITY)
		advance(5000)
		notify.hostOnline()
		const id = toastIdFor("hostOffline")
		assert.deepEqual(ops[1], { op: "dismiss", id })
		assert.deepEqual(ops[2], { op: "show", id, message: "Back online", duration: 2000 })
	})

	it("hostOnline without a prior hostOffline does nothing", () => {
		const { ops, notify } = harness()
		notify.hostOnline()
		assert.equal(ops.length, 0)
	})

	it("hostOffline can show again after coming back online", () => {
		const { ops, notify, advance } = harness()
		notify.hostOffline()
		advance(100)
		notify.hostOnline()
		advance(100)
		notify.hostOffline()
		assert.equal(ops.filter((o) => o.op === "show" && o.duration === Number.POSITIVE_INFINITY).length, 2)
	})

	it("error toasts use the default duration and trim and cap the message", () => {
		const { ops, notify, advance } = harness()
		notify.error("  Could not send  ")
		assert.equal(ops[0]?.message, "Could not send")
		assert.equal(ops[0]?.duration, undefined)
		advance(2000)
		notify.error("x".repeat(500))
		assert.equal(ops[1]?.message?.length, 120)
	})

	it("error falls back to a generic message for empty or non-string input", () => {
		const { ops, notify, advance } = harness()
		notify.error("   ")
		advance(2000)
		notify.error(undefined as unknown as string)
		assert.deepEqual(
			ops.map((o) => o.message),
			["Something went wrong", "Something went wrong"],
		)
	})

	it("different error messages are not suppressed by each other", () => {
		const { ops, notify } = harness()
		notify.error("one")
		notify.error("two")
		assert.equal(ops.length, 2)
	})

	it("draftRestored rejects an unknown device without showing anything", () => {
		const { ops, notify } = harness()
		notify.draftRestored("tablet" as unknown as "phone")
		assert.equal(ops.length, 0)
	})

	it("the default sink creates real Sonner toasts with a fixed id", () => {
		const notify = createNotifier({ now: () => 1 })
		notify.hostOffline()
		const found = toast.getToasts().find((t) => t.id === toastIdFor("hostOffline"))
		assert.ok(found && !("dismiss" in found), "toast reached sonner")
		assert.equal(found.title, "Host offline. Reconnecting...")
		assert.equal(found.duration, Number.POSITIVE_INFINITY)
	})
})
