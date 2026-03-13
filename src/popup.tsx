import { useEffect, useRef, useState } from "react"

import { extractResumeText } from "~src/lib/resume-extract"
import { getParserSettings, getResumeRecord, saveParserSettings } from "~src/lib/storage"
import type { ResumeData, ResumeRecord } from "~src/lib/types"

import "./popup.css"

const ASSETS = {
  logo: "https://www.figma.com/api/mcp/asset/06ea9cdf-a99c-4e19-ba1d-efef6a33de93",
  upload: "https://www.figma.com/api/mcp/asset/388d45ef-d6b2-4ba9-bae0-0f5b279ae2d0",
  detected: "https://www.figma.com/api/mcp/asset/f3470267-c2b3-45df-93ff-de75717bf81d",
  bolt: "https://www.figma.com/api/mcp/asset/0538f3df-3466-4cad-8b62-fb803f604b22",
  settings: "https://www.figma.com/api/mcp/asset/b34698d5-267b-4600-9d7a-a2bb3cd986e0",
  help: "https://www.figma.com/api/mcp/asset/ac699424-0858-4593-b265-0fff3dfb0682",
  chevron: "https://www.figma.com/api/mcp/asset/95b360ec-c2fa-45dd-ab5c-ff0203e87f02"
}

const getActiveTabId = async (): Promise<number | null> => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0]?.id ?? null
}

const sendRuntimeMessage = async <T,>(message: unknown): Promise<T> => {
  console.debug("[popup] -> background", (message as { type?: string })?.type)
  return chrome.runtime.sendMessage(message) as Promise<T>
}

const FIELD_LABELS: Array<{ key: keyof ResumeData; label: string }> = [
  { key: "name", label: "姓名" },
  { key: "gender", label: "性别" },
  { key: "phone", label: "手机号" },
  { key: "email", label: "邮箱" },
  { key: "school", label: "学校" },
  { key: "major", label: "专业" },
  { key: "degree", label: "学历" },
  { key: "graduation_year", label: "毕业时间" },
  { key: "education", label: "教育背景" },
  { key: "internship_experience", label: "实习经历" },
  { key: "project_experience", label: "项目经历" },
  { key: "skills", label: "技能标签" },
  { key: "certificates", label: "证书" },
  { key: "awards", label: "获奖经历" },
  { key: "job_target", label: "求职方向" },
  { key: "city_preference", label: "意向城市" },
  { key: "portfolio", label: "作品集" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "personal_summary", label: "自我评价" }
]

const formatFieldValue = (value: ResumeData[keyof ResumeData]): string => {
  if (Array.isArray(value)) return value.length ? value.join("；") : "未识别"
  if (typeof value === "string" && value.trim()) return value
  return "未识别"
}

const toUserFriendlyParseError = (message: string): string => {
  const lower = message.toLowerCase()
  if (lower.includes("valid json") || message.includes("不是有效 JSON")) {
    return "AI 返回格式异常（非有效 JSON），请重试或在设置中切换模型后再试。"
  }
  if (message.includes("结构化输出失败") || message.includes("schema")) {
    return "AI 结构化输出失败，请重试；若持续失败请在设置中切换模型。"
  }
  if (message.includes("本地解析服务异常") || message.includes("无法连接本地解析服务")) {
    return "本地解析服务不可用，请确认 backend 正在运行后重试。"
  }
  return message
}

function IndexPopup() {
  const [resumeRecord, setResumeRecord] = useState<ResumeRecord | null>(null)
  const [fieldCount, setFieldCount] = useState(0)
  const [matchableCount, setMatchableCount] = useState(0)
  const [pageSupported, setPageSupported] = useState(false)
  const [pageSupportReason, setPageSupportReason] = useState("未检测页面状态")
  const [busy, setBusy] = useState(false)
  const [statusText, setStatusText] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadState = async () => {
    const saved = await getResumeRecord()
    setResumeRecord(saved)

    try {
      const response = await sendRuntimeMessage<{
        ok: boolean
        supported: boolean
        reason: string
        totalFields: number
        matchableFields: number
      }>({
        type: "GET_AUTOFILL_RUNTIME_STATUS"
      })
      if (response?.ok) {
        setPageSupported(response.supported)
        setPageSupportReason(response.reason)
        setFieldCount(response.totalFields)
        setMatchableCount(response.matchableFields)
        console.debug("[popup] status", response)
      }
    } catch (error) {
      console.debug("[popup] failed to query content script status", error)
      setFieldCount(0)
      setMatchableCount(0)
      setPageSupported(false)
      setPageSupportReason("页面未注入内容脚本，请刷新页面后重试")
    }
  }

  useEffect(() => {
    loadState().catch(() => setStatusText("加载扩展状态失败"))
  }, [])

  const onUploadClick = () => {
    fileInputRef.current?.click()
  }

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    setBusy(true)
    setStatusText("正在提取简历文本...")

    try {
      const rawText = await extractResumeText(file)
      setStatusText("正在进行 AI 解析...")

      const response = await sendRuntimeMessage<{ ok: boolean; record?: ResumeRecord; error?: string }>({
        type: "PARSE_RESUME_TEXT",
        payload: {
          rawText,
          sourceFileName: file.name
        }
      })

      if (!response.ok || !response.record) {
        throw new Error(response.error ?? "简历解析失败")
      }

      setResumeRecord(response.record)
      setStatusText("简历解析并保存成功")
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传失败"
      setStatusText(toUserFriendlyParseError(message))
    } finally {
      setBusy(false)
    }
  }

  const onAutofill = async () => {
    const tabId = await getActiveTabId()
    setBusy(true)
    setStatusText("正在尝试自动填写...")
    console.debug("[popup] start autofill", {
      hasResume: Boolean(resumeRecord),
      tabId,
      pageSupported,
      fieldCount,
      matchableCount
    })

    try {
      const result = await sendRuntimeMessage<{ ok: boolean; filled?: number; total?: number; error?: string }>({
        type: "RUN_AUTOFILL"
      })

      if (!result.ok) {
        throw new Error(result.error ?? "自动填写失败")
      }

      setStatusText(`已填写 ${result.filled}/${result.total} 个字段`)
      console.debug("[popup] autofill result", result)
      await loadState()
    } catch (error) {
      const message = error instanceof Error ? error.message : "自动填写失败"
      console.debug("[popup] autofill failed", message)
      setStatusText(message)
    } finally {
      setBusy(false)
    }
  }

  const onSettings = async () => {
    const current = await getParserSettings()
    const backendUrl = window.prompt(
      "本地解析服务地址",
      current.backendUrl ?? "http://127.0.0.1:8787/parse-resume"
    )
    if (!backendUrl) {
      return
    }

    const model = window.prompt("OpenAI 模型", current.model ?? "gpt-4.1-mini") ?? "gpt-4.1-mini"

    await saveParserSettings({
      backendUrl: backendUrl.trim(),
      model: model.trim() || "gpt-4.1-mini"
    })
    setStatusText("已保存本地解析服务配置")
  }

  const hasResume = Boolean(resumeRecord)
  const isAutofillEnabled = hasResume && fieldCount > 0 && pageSupported && !busy
  const disableReason = busy
    ? "正在处理中..."
    : !hasResume
      ? "未检测到已解析简历"
      : !pageSupported
        ? pageSupportReason
        : fieldCount <= 0
          ? "当前页面未检测到可填写字段"
          : "自动填写已就绪"

  return (
    <main className="popup-root" data-node-id="0:306">
      <header className="popup-header" data-node-id="0:307">
        <div className="brand-block">
          <img alt="好运 Logo" className="brand-logo" src={ASSETS.logo} />
          <div>
            <h1 className="brand-title">好运</h1>
            <p className="brand-subtitle">求职好运从现在开始</p>
          </div>
        </div>
        <div className="running-badge">
          <span className="dot" />运行中
        </div>
      </header>

      <section className="popup-body">
        <div className="upload-card" data-node-id="0:320">
          <div className="upload-icon-wrap">
            <img alt="Upload" className="upload-icon" src={ASSETS.upload} />
          </div>
          <h2 className="upload-title">{hasResume ? "已载入简历" : "暂无简历数据"}</h2>
          <p className="upload-text">
            {hasResume
              ? `${resumeRecord?.sourceFileName} 已解析，可开始自动填写并查看结构化字段`
              : "上传后将自动提取核心字段并展示在这里"}
          </p>
          <button className="pill-button" disabled={busy} onClick={onUploadClick} type="button">
            {busy ? "处理中..." : hasResume ? "替换简历" : "去上传"}
          </button>
          <input
            accept=".pdf,.docx,.txt"
            hidden
            onChange={onFileChange}
            ref={fileInputRef}
            type="file"
          />
        </div>

        <div className="detected-card" data-node-id="0:334">
          <div className="detected-icon-wrap">
            <img alt="Detected" className="detected-icon" src={ASSETS.detected} />
          </div>
          <div>
            <p className="detected-title">已识别到申请表单</p>
            <p className="detected-subtitle">发现 {fieldCount} 个可填入字段</p>
          </div>
        </div>

        <button className="primary-fill" disabled={!isAutofillEnabled} onClick={onAutofill} type="button">
          <img alt="Fill" src={ASSETS.bolt} />
          立即开始自动填写
        </button>
        <p className="autofill-diagnostic">
          {disableReason}
          {isAutofillEnabled ? `（匹配字段 ${matchableCount}/${fieldCount}）` : ""}
        </p>

        {hasResume ? (
          <div className="parsed-fields-card">
            <p className="parsed-fields-title">结构化简历字段</p>
            <div className="parsed-fields-grid">
              {FIELD_LABELS.map((field) => (
                <div className="parsed-field-row" key={field.key}>
                  <span className="parsed-field-label">{field.label}</span>
                  <span className="parsed-field-value">{formatFieldValue(resumeRecord?.parsed[field.key])}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {statusText ? <p className="status-line">{statusText}</p> : null}
      </section>

      <footer className="popup-footer" data-node-id="0:368">
        <div className="footer-left">
          <button className="text-action" onClick={onSettings} type="button">
            <img alt="Settings" src={ASSETS.settings} />设置
          </button>
          <button className="text-action" type="button">
            <img alt="Help" src={ASSETS.help} />帮助
          </button>
        </div>
        <button className="text-action" type="button">
          管理简历库 <img alt="Chevron" src={ASSETS.chevron} />
        </button>
      </footer>
    </main>
  )
}

export default IndexPopup
