import { getParserSettings, getResumeRecord, saveResumeRecord } from "~src/lib/storage"
import { isSupportedJobApplicationUrl } from "~src/lib/page-eligibility"
import { parseResumeWithAi } from "~src/services/ai-parser"
import type { ResumeRecord } from "~src/lib/types"

const CONTEXT_INVALID_MESSAGE = "当前页面插件上下文已失效，请刷新页面后重试"
const tabRuntimeCache = new Map<number, { url: string; lastSeenAt: number }>()

const isContextInvalidError = (message: string): boolean => {
  const normalized = message.toLowerCase()
  return (
    normalized.includes("extension context invalidated") ||
    normalized.includes("receiving end does not exist") ||
    normalized.includes("message port closed") ||
    normalized.includes("back/forward cache") ||
    normalized.includes("bfcache")
  )
}

const resolveActiveTab = async (): Promise<{ tabId: number | null; url: string; supported: boolean; reason: string }> => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tab = tabs[0]
  const tabId = tab?.id ?? null
  const url = tab?.url ?? ""
  const support = isSupportedJobApplicationUrl(url)

  console.debug("[background] active tab", {
    tabId,
    url,
    supported: support.supported,
    reason: support.reason
  })

  if (tabId) {
    tabRuntimeCache.set(tabId, { url, lastSeenAt: Date.now() })
  }

  return { tabId, url, supported: support.supported, reason: support.reason }
}

const sendMessageToTab = <T,>(tabId: number, message: unknown): Promise<T> =>
  new Promise((resolve, reject) => {
    console.debug("[background] -> content sendMessage", {
      tabId,
      type: (message as { type?: string })?.type,
      cache: tabRuntimeCache.get(tabId) ?? null
    })
    chrome.tabs.sendMessage(tabId, message, (response: T) => {
      const lastError = chrome.runtime.lastError
      if (lastError) {
        reject(new Error(lastError.message))
        return
      }
      resolve(response)
    })
  })

const runStatusFallback = async (tabId: number, parsed: ResumeRecord["parsed"] | null) => {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: (resume: any) => {
      const normalize = (value: string) =>
        value
          .toLowerCase()
          .replace(/\s+/g, "")
          .replace(/[^\p{L}\p{N}]/gu, "")

      const includesAny = (text: string, keywords: string[]) => keywords.some((k: string) => text.includes(k))
      const inferValue = (descriptor: string, parsedData: any): string | null => {
        const key = normalize(descriptor)
        if (includesAny(key, ["firstname", "givenname", "名"])) return parsedData?.name?.split(" ")[0] ?? null
        if (includesAny(key, ["lastname", "familyname", "姓"])) {
          const parts = parsedData?.name?.split(" ") ?? []
          return parts.length > 1 ? parts[parts.length - 1] : null
        }
        if (includesAny(key, ["fullname", "name", "姓名", "联系人"]) && !includesAny(key, ["company", "公司"])) return parsedData?.name ?? null
        if (includesAny(key, ["email", "邮箱", "电子邮件"])) return parsedData?.email ?? null
        if (includesAny(key, ["phone", "mobile", "tel", "手机号", "电话"])) return parsedData?.phone ?? null
        if (includesAny(key, ["gender", "sex", "性别"])) return parsedData?.gender ?? null
        if (includesAny(key, ["school", "university", "college", "学校", "院校"])) return parsedData?.school ?? null
        if (includesAny(key, ["major", "专业"])) return parsedData?.major ?? null
        if (includesAny(key, ["degree", "学历", "学位"])) return parsedData?.degree ?? null
        if (includesAny(key, ["graduation", "毕业", "graduationyear"])) return parsedData?.graduation_year ?? null
        if (includesAny(key, ["target", "position", "求职方向", "应聘职位"])) return parsedData?.job_target ?? null
        if (includesAny(key, ["city", "location", "意向城市", "工作地点"])) return parsedData?.city_preference ?? null
        if (includesAny(key, ["linkedin"])) return parsedData?.linkedin ?? null
        if (includesAny(key, ["portfolio", "website", "作品集", "个人网站"])) return parsedData?.portfolio ?? null
        if (includesAny(key, ["summary", "about", "coverletter", "自我评价", "个人总结"])) return parsedData?.personal_summary ?? null
        return null
      }

      const supported = ["http:", "https:"].includes(window.location.protocol)
      const reason = supported ? "页面支持自动填写（已恢复）" : "当前页面协议不支持自动填写"
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([type="file"]):not([disabled]), textarea:not([disabled]), select:not([disabled])')
      ).filter((el) => {
        if (!(el instanceof HTMLInputElement)) return true
        const type = el.type
        return type !== "checkbox" && type !== "radio" && type !== "submit" && type !== "button"
      })
      const totalFields = nodes.length
      const matchableFields = resume
        ? nodes.reduce((count, el) => {
            const node = el as any
            const label = node.labels?.[0]?.textContent ?? ""
            const placeholder = "placeholder" in el ? el.placeholder : ""
            const descriptor = [node.getAttribute("name") ?? "", node.getAttribute("id") ?? "", placeholder, node.getAttribute("aria-label") ?? "", label]
              .join(" ")
              .toLowerCase()
            return inferValue(descriptor, resume) ? count + 1 : count
          }, 0)
        : 0
      return { ok: true, supported, reason, totalFields, matchableFields }
    },
    args: [parsed]
  })

  return result[0]?.result as {
    ok: boolean
    supported: boolean
    reason: string
    totalFields: number
    matchableFields: number
  }
}

const runFillFallback = async (tabId: number, parsed: ResumeRecord["parsed"]) => {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: (resume: any) => {
      const normalize = (value: string) =>
        value
          .toLowerCase()
          .replace(/\s+/g, "")
          .replace(/[^\p{L}\p{N}]/gu, "")

      const includesAny = (text: string, keywords: string[]) => keywords.some((k: string) => text.includes(k))
      const inferValue = (descriptor: string, parsedData: any): string | null => {
        const key = normalize(descriptor)
        if (includesAny(key, ["firstname", "givenname", "名"])) return parsedData?.name?.split(" ")[0] ?? null
        if (includesAny(key, ["lastname", "familyname", "姓"])) {
          const parts = parsedData?.name?.split(" ") ?? []
          return parts.length > 1 ? parts[parts.length - 1] : null
        }
        if (includesAny(key, ["fullname", "name", "姓名", "联系人"]) && !includesAny(key, ["company", "公司"])) return parsedData?.name ?? null
        if (includesAny(key, ["email", "邮箱", "电子邮件"])) return parsedData?.email ?? null
        if (includesAny(key, ["phone", "mobile", "tel", "手机号", "电话"])) return parsedData?.phone ?? null
        if (includesAny(key, ["gender", "sex", "性别"])) return parsedData?.gender ?? null
        if (includesAny(key, ["school", "university", "college", "学校", "院校"])) return parsedData?.school ?? null
        if (includesAny(key, ["major", "专业"])) return parsedData?.major ?? null
        if (includesAny(key, ["degree", "学历", "学位"])) return parsedData?.degree ?? null
        if (includesAny(key, ["graduation", "毕业", "graduationyear"])) return parsedData?.graduation_year ?? null
        if (includesAny(key, ["target", "position", "求职方向", "应聘职位"])) return parsedData?.job_target ?? null
        if (includesAny(key, ["city", "location", "意向城市", "工作地点"])) return parsedData?.city_preference ?? null
        if (includesAny(key, ["linkedin"])) return parsedData?.linkedin ?? null
        if (includesAny(key, ["portfolio", "website", "作品集", "个人网站"])) return parsedData?.portfolio ?? null
        if (includesAny(key, ["summary", "about", "coverletter", "自我评价", "个人总结"])) return parsedData?.personal_summary ?? null
        return null
      }

      const setInputValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
        el.focus()
        el.value = value
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.dispatchEvent(new Event("change", { bubbles: true }))
      }

      const setSelectValue = (el: HTMLSelectElement, value: string): boolean => {
        const target = normalize(value)
        const options: HTMLOptionElement[] = Array.from(el.options)
        const exact = options.find((opt: HTMLOptionElement) => normalize(opt.value) === target || normalize(opt.text) === target)
        const fuzzy = options.find(
          (opt: HTMLOptionElement) => normalize(opt.value).includes(target) || normalize(opt.text).includes(target)
        )
        const matched = exact ?? fuzzy
        if (!matched) return false
        el.value = matched.value
        el.dispatchEvent(new Event("input", { bubbles: true }))
        el.dispatchEvent(new Event("change", { bubbles: true }))
        return true
      }

      if (!["http:", "https:"].includes(window.location.protocol)) {
        return { ok: false, error: "当前页面协议不支持自动填写", filled: 0, total: 0 }
      }

      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([type="file"]):not([disabled]), textarea:not([disabled]), select:not([disabled])')
      ).filter((el) => {
        if (!(el instanceof HTMLInputElement)) return true
        const type = el.type
        return type !== "checkbox" && type !== "radio" && type !== "submit" && type !== "button"
      })

      let filled = 0
      nodes.forEach((el) => {
        const node = el as any
        if ("value" in node && typeof node.value === "string" && node.value.trim()) return
        const label = node.labels?.[0]?.textContent ?? ""
        const placeholder = "placeholder" in node ? node.placeholder : ""
        const descriptor = [node.getAttribute("name") ?? "", node.getAttribute("id") ?? "", placeholder, node.getAttribute("aria-label") ?? "", label]
          .join(" ")
          .toLowerCase()
        const value = inferValue(descriptor, resume)
        if (!value) return

        if (node instanceof HTMLSelectElement) {
          if (setSelectValue(node, value)) filled += 1
          return
        }

        setInputValue(node as HTMLInputElement | HTMLTextAreaElement, value)
        filled += 1
      })

      return { ok: true, filled, total: nodes.length }
    },
    args: [parsed]
  })

  return result[0]?.result as { ok: boolean; filled: number; total: number; error?: string }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const run = async () => {
    console.debug("[background] <- popup", (message as { type?: string })?.type)
    if (message?.type === "PARSE_RESUME_TEXT") {
      console.debug("[background] PARSE_RESUME_TEXT received")
      const settings = await getParserSettings()
      const parsed = await parseResumeWithAi(message.payload.rawText, settings)

      const record: ResumeRecord = {
        rawText: message.payload.rawText,
        parsed,
        sourceFileName: message.payload.sourceFileName,
        updatedAt: new Date().toISOString()
      }

      await saveResumeRecord(record)
      console.debug("[background] resume parsed and saved", {
        sourceFileName: record.sourceFileName,
        updatedAt: record.updatedAt
      })
      sendResponse({ ok: true, record })
      return
    }

    if (message?.type === "GET_AUTOFILL_RUNTIME_STATUS") {
      const active = await resolveActiveTab()
      const tabId = active.tabId
      if (!tabId) {
        sendResponse({
          ok: true,
          supported: false,
          reason: "未找到活动标签页",
          totalFields: 0,
          matchableFields: 0
        })
        return
      }

      if (!active.supported) {
        sendResponse({
          ok: true,
          supported: false,
          reason: active.reason,
          totalFields: 0,
          matchableFields: 0
        })
        return
      }

      const record = await getResumeRecord()
      const parsed = record?.parsed ?? null

      try {
        const status = await sendMessageToTab<{
          ok: boolean
          supported: boolean
          reason: string
          totalFields: number
          matchableFields: number
        }>(tabId, {
          type: "GET_AUTOFILL_STATUS",
          payload: { parsed }
        })
        sendResponse(status)
        return
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "unknown error"
        console.debug("[background] content status check failed", { tabId, error: messageText })

        if (!isContextInvalidError(messageText)) {
          sendResponse({
            ok: true,
            supported: false,
            reason: "页面未注入内容脚本，请刷新页面后重试",
            totalFields: 0,
            matchableFields: 0
          })
          return
        }

        try {
          console.debug("[background] trying status fallback via executeScript", { tabId })
          const fallbackStatus = await runStatusFallback(tabId, parsed)
          sendResponse(fallbackStatus)
          return
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "fallback failed"
          console.debug("[background] status fallback failed", { tabId, error: fallbackMessage })
          sendResponse({
            ok: true,
            supported: false,
            reason: CONTEXT_INVALID_MESSAGE,
            totalFields: 0,
            matchableFields: 0
          })
          return
        }
      }
    }

    if (message?.type === "RUN_AUTOFILL") {
      const active = await resolveActiveTab()
      const tabId = active.tabId
      if (!tabId) {
        sendResponse({ ok: false, error: "未找到活动标签页" })
        return
      }

      if (!active.supported) {
        sendResponse({ ok: false, error: active.reason })
        return
      }

      const record = await getResumeRecord()
      if (!record?.parsed) {
        sendResponse({ ok: false, error: "未检测到已解析简历数据" })
        return
      }

      try {
        const ping = await sendMessageToTab<{ ok: boolean }>(tabId, { type: "PING_AUTOFILL" })
        console.debug("[background] content alive before fill", { tabId, alive: Boolean(ping?.ok) })
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "unknown error"
        console.debug("[background] content alive check failed", { tabId, error: messageText })
      }

      try {
        const result = await sendMessageToTab<{ ok: boolean; filled?: number; total?: number; error?: string }>(
          tabId,
          { type: "FILL_FORM" }
        )
        console.debug("[background] fill target tab confirmed", { tabId, url: active.url, result })
        sendResponse(result)
        return
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "unknown error"
        console.debug("[background] fill via content failed", { tabId, error: messageText })

        if (!isContextInvalidError(messageText)) {
          sendResponse({ ok: false, error: `自动填写失败: ${messageText}` })
          return
        }

        try {
          console.debug("[background] trying fill fallback via executeScript", { tabId })
          const fallback = await runFillFallback(tabId, record.parsed)
          if (!fallback.ok) {
            sendResponse({ ok: false, error: fallback.error ?? CONTEXT_INVALID_MESSAGE })
            return
          }
          sendResponse({ ok: true, filled: fallback.filled, total: fallback.total })
          return
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "fallback failed"
          console.debug("[background] fill fallback failed", { tabId, error: fallbackMessage })
          sendResponse({ ok: false, error: CONTEXT_INVALID_MESSAGE })
          return
        }
      }
    }

    if (message?.type === "GET_RESUME_RECORD") {
      const record = await getResumeRecord()
      sendResponse({ ok: true, record })
      return
    }

    sendResponse({ ok: false, error: "Unsupported message" })
  }

  run().catch((error: Error) => {
    sendResponse({ ok: false, error: error.message })
  })

  return true
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  for (const cachedTabId of tabRuntimeCache.keys()) {
    if (cachedTabId !== tabId) {
      tabRuntimeCache.delete(cachedTabId)
    }
  }
  console.debug("[background] tab activated, cache scoped to active tab", {
    activeTabId: tabId,
    remainingCacheKeys: Array.from(tabRuntimeCache.keys())
  })
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    tabRuntimeCache.delete(tabId)
    console.debug("[background] tab loading, cleared runtime cache", { tabId })
    return
  }

  if (changeInfo.status === "complete" && tab.url) {
    tabRuntimeCache.set(tabId, { url: tab.url, lastSeenAt: Date.now() })
    console.debug("[background] tab complete, updated runtime cache", { tabId, url: tab.url })
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  tabRuntimeCache.delete(tabId)
  console.debug("[background] tab removed, cache cleared", { tabId })
})
