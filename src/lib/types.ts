export type ResumeData = {
  name?: string
  gender?: string
  phone?: string
  email?: string
  school?: string
  major?: string
  degree?: string
  graduation_year?: string
  skills: string[]
  education?: string
  internship_experience: string[]
  project_experience: string[]
  certificates: string[]
  awards: string[]
  job_target?: string
  city_preference?: string
  portfolio?: string
  linkedin?: string
  personal_summary?: string
}

export type ResumeRecord = {
  rawText: string
  parsed: ResumeData
  sourceFileName: string
  updatedAt: string
}

export type ParserSettings = {
  backendUrl?: string
  model?: string
}

export const EMPTY_RESUME_DATA: ResumeData = {
  skills: [],
  internship_experience: [],
  project_experience: [],
  certificates: [],
  awards: []
}
