export const SUPPORTED_HOST_KEYWORDS = [
  "jobs.bytedance.com",
  "careers.bytedance.com",
  "zhipin.com",
  "lagou.com",
  "zhaopin.com",
  "51job.com",
  "liepin.com",
  "linkedin.com",
  "smartrecruiters.com",
  "greenhouse.io",
  "lever.co",
  "workday.com",
  "myworkdayjobs.com"
]

export const SUPPORTED_PATH_KEYWORDS = [
  "job",
  "jobs",
  "career",
  "careers",
  "position",
  "positions",
  "apply",
  "application",
  "recruit",
  "campus"
]

export const BLOCKED_HOST_KEYWORDS = [
  "google.",
  "accounts.google.",
  "platform.openai.com",
  "chatgpt.com",
  "bing.com",
  "baidu.com"
]

export const BLOCKED_PATH_KEYWORDS = ["login", "signin", "sso", "oauth", "auth", "api-keys", "settings"]

export const isSupportedJobApplicationUrl = (
  rawUrl: string | undefined
): { supported: boolean; reason: string } => {
  if (!rawUrl) {
    return { supported: false, reason: "活动标签页 URL 为空" }
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { supported: false, reason: "活动标签页 URL 无效" }
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { supported: false, reason: "当前页面协议不支持自动填写" }
  }

  const host = parsed.hostname.toLowerCase()
  const path = parsed.pathname.toLowerCase()
  const query = parsed.search.toLowerCase()
  const full = `${host}${path}${query}`

  if (BLOCKED_HOST_KEYWORDS.some((k) => host.includes(k)) || BLOCKED_PATH_KEYWORDS.some((k) => full.includes(k))) {
    return { supported: false, reason: "当前页面为非目标页面（搜索/设置/登录/SSO）" }
  }

  const hostSupported = SUPPORTED_HOST_KEYWORDS.some((k) => host.includes(k))
  const pathSupported = SUPPORTED_PATH_KEYWORDS.some((k) => full.includes(k))

  if (!hostSupported && !pathSupported) {
    return { supported: false, reason: "当前页面不是受支持的职位申请页面" }
  }

  return { supported: true, reason: "受支持的职位申请页面" }
}
