import cors from "cors"
import dotenv from "dotenv"
import express from "express"

dotenv.config()

const app = express()
const port = Number(process.env.BACKEND_PORT || 8787)

const RESUME_JSON_SCHEMA = {
  name: "resume_schema_cn",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "name",
      "gender",
      "phone",
      "email",
      "school",
      "major",
      "degree",
      "graduation_year",
      "education",
      "internship_experience",
      "project_experience",
      "skills",
      "certificates",
      "awards",
      "job_target",
      "city_preference",
      "portfolio",
      "linkedin",
      "personal_summary"
    ],
    properties: {
      name: { type: "string" },
      gender: { type: "string" },
      phone: { type: "string" },
      email: { type: "string" },
      school: { type: "string" },
      major: { type: "string" },
      degree: { type: "string" },
      graduation_year: { type: "string" },
      education: { type: "string" },
      internship_experience: { type: "array", items: { type: "string" } },
      project_experience: { type: "array", items: { type: "string" } },
      skills: { type: "array", items: { type: "string" } },
      certificates: { type: "array", items: { type: "string" } },
      awards: { type: "array", items: { type: "string" } },
      job_target: { type: "string" },
      city_preference: { type: "string" },
      portfolio: { type: "string" },
      linkedin: { type: "string" },
      personal_summary: { type: "string" }
    }
  }
}

const normalizeResumeData = (data) => {
  const toStringOrUndefined = (value) => {
    const s = typeof value === "string" ? value.trim() : ""
    return s || undefined
  }

  const toArray = (value) => {
    if (!Array.isArray(value)) return []
    return value.map((item) => String(item).trim()).filter(Boolean)
  }

  return {
    name: toStringOrUndefined(data?.name),
    gender: toStringOrUndefined(data?.gender),
    phone: toStringOrUndefined(data?.phone),
    email: toStringOrUndefined(data?.email),
    school: toStringOrUndefined(data?.school),
    major: toStringOrUndefined(data?.major),
    degree: toStringOrUndefined(data?.degree),
    graduation_year: toStringOrUndefined(data?.graduation_year),
    education: toStringOrUndefined(data?.education),
    internship_experience: toArray(data?.internship_experience),
    project_experience: toArray(data?.project_experience),
    skills: toArray(data?.skills),
    certificates: toArray(data?.certificates),
    awards: toArray(data?.awards),
    job_target: toStringOrUndefined(data?.job_target),
    city_preference: toStringOrUndefined(data?.city_preference),
    portfolio: toStringOrUndefined(data?.portfolio),
    linkedin: toStringOrUndefined(data?.linkedin),
    personal_summary: toStringOrUndefined(data?.personal_summary)
  }
}

const extractStructuredData = (payload) => {
  if (payload && typeof payload.output_parsed === "object" && payload.output_parsed !== null) {
    return payload.output_parsed
  }

  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content && typeof content.parsed === "object" && content.parsed !== null) {
        return content.parsed
      }

      if (content?.type === "output_json" && typeof content?.json === "object" && content.json !== null) {
        return content.json
      }

      // Structured output sometimes still returns JSON text under output_text.
      // This is schema-constrained by `text.format.json_schema`.
      if (content?.type === "output_text" && typeof content?.text === "string") {
        try {
          const parsed = JSON.parse(content.text)
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed
          }
        } catch {
          // Continue; this is handled by final failure path.
        }
      }
    }
  }

  return null
}

app.use(cors({ origin: true }))
app.use(express.json({ limit: "8mb" }))

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "resume-parser-backend" })
})

app.post("/parse-resume", async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    res.status(500).json({ ok: false, error: "Missing OPENAI_API_KEY in backend environment." })
    return
  }

  const resumeText = typeof req.body?.resumeText === "string" ? req.body.resumeText.trim() : ""
  const model = typeof req.body?.model === "string" && req.body.model.trim() ? req.body.model : "gpt-4.1-mini"

  if (!resumeText) {
    res.status(400).json({ ok: false, error: "resumeText is required." })
    return
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "你是中文简历结构化提取器。严格按给定 schema 返回结构化字段。"
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `请解析以下简历文本并输出结构化结果：\n\n${resumeText}`
              }
            ]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            ...RESUME_JSON_SCHEMA
          }
        }
      })
    })

    if (!response.ok) {
      const reason = await response.text()
      res.status(502).json({ ok: false, error: `OpenAI error: ${response.status} ${reason}` })
      return
    }

    const payload = await response.json()
    const parsed = extractStructuredData(payload)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.error("[resume-backend] structured output parse failed")
      console.error("[resume-backend] raw OpenAI response:", JSON.stringify(payload))
      res.status(502).json({
        ok: false,
        error: "AI 结构化输出失败（未返回有效 schema JSON），请重试或切换模型。"
      })
      return
    }

    res.json({ ok: true, data: normalizeResumeData(parsed) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown backend error"
    res.status(500).json({ ok: false, error: message })
  }
})

app.listen(port, "127.0.0.1", () => {
  console.log(`[resume-backend] listening on http://127.0.0.1:${port}`)
})
