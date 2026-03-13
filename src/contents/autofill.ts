import { getResumeRecord } from "~src/lib/storage"
import { isSupportedJobApplicationUrl } from "~src/lib/page-eligibility"
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

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")

const includesAny = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword))

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

const inferValue = (
  descriptor: string,
  parsed: ResumeData
): string | null => {
  const key = normalize(descriptor)

  if (includesAny(key, ["firstname", "givenname", "名"])) {
    return parsed?.name?.split(" ")[0] ?? null
  }

  if (includesAny(key, ["lastname", "familyname", "姓"])) {
    const parts = parsed?.name?.split(" ") ?? []
    return parts.length > 1 ? parts[parts.length - 1] : null
  }

  if (
    includesAny(key, ["fullname", "name", "姓名", "联系人"]) &&
    !includesAny(key, ["company", "公司"])
  ) {
    return parsed?.name ?? null
  }

  if (includesAny(key, ["email", "邮箱", "电子邮件"])) {
    return parsed?.email ?? null
  }

  if (includesAny(key, ["phone", "mobile", "tel", "手机号", "电话"])) {
    return parsed?.phone ?? null
  }

  if (includesAny(key, ["gender", "sex", "性别"])) {
    return parsed?.gender ?? null
  }

  if (includesAny(key, ["school", "university", "college", "学校", "院校"])) {
    return parsed?.school ?? null
  }

  if (includesAny(key, ["major", "专业"])) {
    return parsed?.major ?? null
  }

  if (includesAny(key, ["degree", "学历", "学位"])) {
    return parsed?.degree ?? null
  }

  if (includesAny(key, ["graduation", "毕业", "graduationyear"])) {
    return parsed?.graduation_year ?? null
  }

  if (includesAny(key, ["target", "position", "求职方向", "应聘职位"])) {
    return parsed?.job_target ?? null
  }

  if (includesAny(key, ["city", "location", "意向城市", "工作地点"])) {
    return parsed?.city_preference ?? null
  }

  if (includesAny(key, ["linkedin"])) {
    return parsed?.linkedin ?? null
  }

  if (includesAny(key, ["portfolio", "website", "作品集", "个人网站"])) {
    return parsed?.portfolio ?? null
  }

  if (includesAny(key, ["summary", "about", "coverletter", "自我评价", "个人总结"])) {
    return parsed?.personal_summary ?? null
  }

  return null
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
