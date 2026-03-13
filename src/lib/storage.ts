import type { ParserSettings, ResumeRecord } from "./types"

const RESUME_RECORD_KEY = "resumeRecord"
const PARSER_SETTINGS_KEY = "parserSettings"

const DEFAULT_SETTINGS: ParserSettings = {
  backendUrl: "http://127.0.0.1:8787/parse-resume",
  model: "gpt-4.1-mini"
}

export const saveResumeRecord = async (record: ResumeRecord): Promise<void> => {
  await chrome.storage.local.set({ [RESUME_RECORD_KEY]: record })
}

export const getResumeRecord = async (): Promise<ResumeRecord | null> => {
  const result = await chrome.storage.local.get(RESUME_RECORD_KEY)
  return result[RESUME_RECORD_KEY] ?? null
}

export const getParserSettings = async (): Promise<ParserSettings> => {
  const result = await chrome.storage.local.get(PARSER_SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(result[PARSER_SETTINGS_KEY] ?? {}) }
}

export const saveParserSettings = async (settings: ParserSettings): Promise<void> => {
  await chrome.storage.local.set({ [PARSER_SETTINGS_KEY]: settings })
}
