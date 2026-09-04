import { describe, expect, it } from "vitest"

import {
  isAllowedExtensionOrigin,
  isRequestOriginAllowed,
  parseAllowedExtensionOrigins
} from "./cors-policy.mjs"

const extensionA = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const extensionB = "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

describe("local backend origin policy", () => {
  it("allows command-line and same-machine requests without an Origin header", () => {
    expect(isRequestOriginAllowed(undefined)).toBe(true)
  })

  it("allows a valid Chrome extension origin in local development", () => {
    expect(isRequestOriginAllowed(extensionA)).toBe(true)
  })

  it.each([
    "https://evil.example",
    "http://localhost:3000",
    "chrome-extension://too-short",
    `${extensionA}.evil.example`
  ])("rejects untrusted origin %s", (origin) => {
    expect(isRequestOriginAllowed(origin)).toBe(false)
  })

  it("restricts production access to explicitly configured extension origins", () => {
    const allowed = parseAllowedExtensionOrigins(`${extensionA}, ${extensionB}`)
    expect(isAllowedExtensionOrigin(extensionA, allowed)).toBe(true)
    expect(isAllowedExtensionOrigin(extensionB, allowed)).toBe(true)
    expect(isAllowedExtensionOrigin("chrome-extension://cccccccccccccccccccccccccccccccc", allowed)).toBe(false)
  })
})
