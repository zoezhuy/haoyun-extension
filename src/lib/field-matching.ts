import type { ResumeData } from "./types"

export const normalizeDescriptor = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")

const includesAny = (text: string, keywords: string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword))

export const inferValue = (descriptor: string, parsed: ResumeData): string | null => {
  const key = normalizeDescriptor(descriptor)

  if (includesAny(key, ["fullname", "姓名", "联系人"]) && !includesAny(key, ["company", "公司"])) {
    return parsed.name ?? null
  }

  if (includesAny(key, ["firstname", "givenname", "名字"])) {
    return parsed.name?.split(" ")[0] ?? null
  }

  if (includesAny(key, ["lastname", "familyname", "姓"])) {
    const parts = parsed.name?.split(" ") ?? []
    return parts.length > 1 ? parts[parts.length - 1] : null
  }

  if (includesAny(key, ["name"]) && !includesAny(key, ["company", "公司"])) {
    return parsed.name ?? null
  }

  if (includesAny(key, ["email", "邮箱", "电子邮件"])) return parsed.email ?? null
  if (includesAny(key, ["phone", "mobile", "tel", "手机号", "电话"])) return parsed.phone ?? null
  if (includesAny(key, ["gender", "sex", "性别"])) return parsed.gender ?? null
  if (includesAny(key, ["school", "university", "college", "学校", "院校"])) return parsed.school ?? null
  if (includesAny(key, ["major", "专业"])) return parsed.major ?? null
  if (includesAny(key, ["degree", "学历", "学位"])) return parsed.degree ?? null
  if (includesAny(key, ["graduation", "毕业", "graduationyear"])) return parsed.graduation_year ?? null
  if (includesAny(key, ["target", "position", "求职方向", "应聘职位"])) return parsed.job_target ?? null
  if (includesAny(key, ["city", "location", "意向城市", "工作地点"])) return parsed.city_preference ?? null
  if (includesAny(key, ["linkedin"])) return parsed.linkedin ?? null
  if (includesAny(key, ["portfolio", "website", "作品集", "个人网站"])) return parsed.portfolio ?? null
  if (includesAny(key, ["summary", "about", "coverletter", "自我评价", "个人总结"])) {
    return parsed.personal_summary ?? null
  }

  return null
}
