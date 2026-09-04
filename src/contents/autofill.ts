import { getResumeRecord } from "~src/lib/storage"
import { isSupportedJobApplicationUrl } from "~src/lib/page-eligibility"
import { inferValue, normalizeDescriptor as normalize } from "~src/lib/field-matching"
import type { ResumeData } from "~src/lib/types"

export const config = {
  matches: [
    "https://jobs.bytedance.com/*",
    "https://careers.bytedance.com/*",
    "https://*.zhipin.com/*",
    "https://*.lagou.com/*",
    "https://*.zhaopin.com/*",
    "https://*.51job.com/*",
    "https://*.liepin.com/*",
    "https://*.linkedin.com/*",
    "https://*.smartrecruiters.com/*",
    "https://*.greenhouse.io/*",
    "https://*.lever.co/*",
    "https://*.workday.com/*",
    "https://*.myworkdayjobs.com/*"
  ]
} as const

const setInputValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  el.focus()
  el.value = value
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

const setSelectValue = (el: HTMLSelectElement, value: string): boolean => {
  const normalizedTarget = normalize(value)
  const options = Array.from(el.options)
  const exact = options.find((opt) => normalize(opt.value) === normalizedTarget || normalize(opt.text) === normalizedTarget)
  const fuzzy = options.find(
    (opt) => normalize(opt.value).includes(normalizedTarget) || normalize(opt.text).includes(normalizedTarget)
  )
  const matched = exact ?? fuzzy
  if (!matched) return false
  el.value = matched.value
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
  return true
}

const getDescriptor = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string => {
  const label = el.labels?.[0]?.textContent ?? ""
  const placeholder = "placeholder" in el ? el.placeholder : ""
  return [el.name, el.id, placeholder, el.getAttribute("aria-label") ?? "", label]
    .join(" ")
    .toLowerCase()
}

const isSupportedPage = (): { supported: boolean; reason: string } => {
  return isSupportedJobApplicationUrl(window.location.href)
}

const getFillableElements = (): Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> => {
  const inputAndTextarea = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input:not([type="hidden"]):not([type="file"]):not([disabled]), textarea:not([disabled])'
    )
  ).filter((node) => {
    const type = (node as HTMLInputElement).type
    return type !== "checkbox" && type !== "radio" && type !== "submit" && type !== "button"
  })

  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>("select:not([disabled])"))
  return [...inputAndTextarea, ...selects]
}

const getMatchableCount = (
  parsed: ResumeData | null,
  fillables: Array<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
): number => {
  if (!parsed) return 0
  return fillables.reduce((count, el) => {
    const descriptor = getDescriptor(el)
    const value = inferValue(descriptor, parsed)
    return value ? count + 1 : count
  }, 0)
}

const getAutofillStatus = (parsed: ResumeData | null) => {
  const support = isSupportedPage()
  const fillables = getFillableElements()
  const matchableFields = getMatchableCount(parsed, fillables)

  const status = {
    ok: true,
    supported: support.supported,
    reason: support.reason,
    totalFields: fillables.length,
    matchableFields,
    url: window.location.href
  }
  console.debug("[content] autofill status", status)
  return status
}

const fillForm = async () => {
  const support = isSupportedPage()
  if (!support.supported) {
    return { filled: 0, total: 0, error: support.reason }
  }

  const record = await getResumeRecord()

  if (!record?.parsed) {
    return { filled: 0, total: 0, error: "No parsed resume found." }
  }

  let filled = 0
  const fillables = getFillableElements()
  console.debug("[content] start fill", { totalFillables: fillables.length })

  fillables.forEach((el) => {
    if ("value" in el && typeof el.value === "string" && el.value.trim()) return
    const descriptor = getDescriptor(el)
    const value = inferValue(descriptor, record.parsed)
    if (!value) return

    if (el instanceof HTMLSelectElement) {
      if (setSelectValue(el, value)) {
        filled += 1
      }
      return
    }

    setInputValue(el, value)
    filled += 1
  })

  console.debug("[content] fill done", { filled, total: fillables.length })
  return { filled, total: fillables.length }
}

const boot = () => {
  const support = isSupportedPage()
  console.debug("[content] boot", {
    url: window.location.href,
    supported: support.supported,
    reason: support.reason
  })

  if (!support.supported) {
    return
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "FILL_FORM") {
      fillForm()
        .then((result) => sendResponse({ ok: true, ...result }))
        .catch((error: Error) => sendResponse({ ok: false, error: error.message }))
      return true
    }

    if (message?.type === "GET_FIELD_COUNT") {
      sendResponse({ ok: true, count: getFillableElements().length })
      return true
    }

    if (message?.type === "GET_AUTOFILL_STATUS") {
      const parsed = (message?.payload?.parsed ?? null) as ResumeData | null
      sendResponse(getAutofillStatus(parsed))
      return true
    }

    if (message?.type === "PING_AUTOFILL") {
      sendResponse({ ok: true })
      return true
    }

    return false
  })
}

const initialSupport = isSupportedPage()
if (!initialSupport.supported) {
  console.debug("[content] early exit on unsupported page", {
    url: window.location.href,
    reason: initialSupport.reason
  })
} else if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot)
} else {
  boot()
}
