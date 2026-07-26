import { describe, expect, it } from "vitest"
import { formatPhone, formatWhileTyping, phoneDigits, toE164 } from "@/lib/phone"

describe("formatPhone", () => {
  it("renders stored E.164 in the local form", () => {
    expect(formatPhone("+12063996403")).toBe("(206) 399-6403")
    expect(formatPhone("+18778889265")).toBe("(877) 888-9265")
  })

  it("keeps a foreign number recognisably foreign", () => {
    // Rendering these as if they were local would be actively misleading.
    expect(formatPhone("+442079460958")).toBe("+44 20 7946 0958")
    expect(formatPhone("+526643283828")).toBe("+52 664 328 3828")
  })

  it("accepts unnormalised input too, so legacy rows still render", () => {
    expect(formatPhone("2063996403")).toBe("(206) 399-6403")
    expect(formatPhone("(206) 399-6403")).toBe("(206) 399-6403")
  })

  it("returns anything it cannot parse unchanged", () => {
    expect(formatPhone("206-399")).toBe("206-399")
    expect(formatPhone("call the desk")).toBe("call the desk")
    expect(formatPhone("")).toBe("")
    expect(formatPhone(null)).toBe("")
  })

  it("is idempotent — it runs on render, so this has to hold", () => {
    for (const n of ["+12063996403", "+442079460958", "206-399"]) {
      expect(formatPhone(formatPhone(n))).toBe(formatPhone(n))
    }
  })
})

describe("toE164", () => {
  it("matches what the API will store, so the UI needn't wait for the round-trip", () => {
    expect(toE164("2063996403")).toBe("+12063996403")
    expect(toE164("(206) 399-6403")).toBe("+12063996403")
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958")
  })

  it("never invents a number it cannot parse", () => {
    expect(toE164("206-399")).toBe("206-399")
    expect(toE164("")).toBe("")
  })
})

describe("formatWhileTyping", () => {
  it("formats progressively as the number is typed", () => {
    let text = ""
    const seen: string[] = []
    for (const ch of "2063996403") {
      const next = text + ch
      text = formatWhileTyping(next, text)
      seen.push(text)
    }
    expect(seen.at(-1)).toBe("(206) 399-6403")
    expect(seen).toContain("(206) 399-6")
  })

  it("formats an international number once the + is there", () => {
    expect(formatWhileTyping("+4420794", "+442079")).toBe("+44 20 794")
  })

  it("does not fight a backspace", () => {
    // Reformatting on delete would re-add the ")" and trap the caret.
    expect(formatWhileTyping("(206", "(206)")).toBe("(206")
    expect(formatWhileTyping("", "2")).toBe("")
  })
})

describe("phoneDigits", () => {
  it("reduces any format to comparable digits, for search", () => {
    expect(phoneDigits("(206) 399-6403")).toBe("2063996403")
    expect(phoneDigits("+1 206-399-6403")).toBe("12063996403")
    expect(phoneDigits(null)).toBe("")
  })
})
