import type { ParserSettings, ResumeData } from "~src/lib/types"

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8787/parse-resume"

export const parseResumeWithAi = async (
  resumeText: string,
  settings: ParserSettings
): Promise<ResumeData> => {
  const backendUrl = settings.backendUrl?.trim() || DEFAULT_BACKEND_URL

  let response: Response
  try {
    response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        resumeText,
        model: settings.model ?? "gpt-4.1-mini"
      })
    })
  } catch {
    throw new Error("无法连接本地解析服务。请先启动 backend 服务。")
  }

  if (!response.ok) {
    const reasonText = await response.text()
    let parsedError = ""
    try {
      const parsed = JSON.parse(reasonText) as { error?: string }
      parsedError = parsed?.error?.trim() ?? ""
    } catch {
      // Ignore parse failure and use raw text fallback.
    }
    if (parsedError) {
      throw new Error(parsedError)
    }
    throw new Error(`本地解析服务异常: ${response.status} ${reasonText}`)
  }

  const payload = (await response.json()) as { ok?: boolean; data?: ResumeData; error?: string }

  if (!payload.ok || !payload.data) {
    throw new Error(payload.error ?? "解析失败：未返回有效结构化数据")
  }

  return payload.data
}
