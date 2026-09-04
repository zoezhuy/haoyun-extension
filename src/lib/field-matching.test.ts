import { describe, expect, it } from "vitest"
import { inferValue, normalizeDescriptor } from "./field-matching"
import type { ResumeData } from "./types"

const resume: ResumeData = {
  name: "Zoe Zhu",
  email: "zoe@example.com",
  phone: "13800000000",
  school: "Example University",
  major: "Human-Computer Interaction",
  degree: "Master",
  graduation_year: "2027",
  job_target: "AI Product Manager",
  city_preference: "New York",
  portfolio: "https://example.com",
  linkedin: "https://linkedin.com/in/example",
  personal_summary: "AI and HR product builder",
  skills: [],
  internship_experience: [],
  project_experience: [],
  certificates: [],
  awards: []
}

describe("bilingual field matching", () => {
  it.each([
    ["Full Name", "Zoe Zhu"],
    ["姓名", "Zoe Zhu"],
    ["电子邮箱", "zoe@example.com"],
    ["手机号码", "13800000000"],
    ["毕业院校", "Example University"],
    ["Major / 专业", "Human-Computer Interaction"],
    ["最高学历", "Master"],
    ["Graduation Year", "2027"],
    ["应聘职位", "AI Product Manager"],
    ["意向城市", "New York"],
    ["Portfolio Website", "https://example.com"],
    ["LinkedIn profile", "https://linkedin.com/in/example"],
    ["个人总结", "AI and HR product builder"]
  ])("maps %s to the expected resume value", (descriptor, expected) => {
    expect(inferValue(descriptor, resume)).toBe(expected)
  })

  it("does not confuse company name with candidate name", () => {
    expect(inferValue("Company Name", resume)).toBeNull()
  })

  it("returns null for unsupported fields", () => {
    expect(inferValue("Security clearance", resume)).toBeNull()
  })

  it("normalizes punctuation and whitespace", () => {
    expect(normalizeDescriptor("  E-mail / 电子邮箱 ")).toBe("email电子邮箱")
  })
})
