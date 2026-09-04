const CHROME_EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/

export const parseAllowedExtensionOrigins = (value = "") =>
  new Set(
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  )

export const isAllowedExtensionOrigin = (origin, explicitOrigins = new Set()) => {
  if (typeof origin !== "string" || !origin) return false
  if (explicitOrigins.size > 0) return explicitOrigins.has(origin)
  return CHROME_EXTENSION_ORIGIN.test(origin)
}

export const isRequestOriginAllowed = (origin, explicitOrigins = new Set()) =>
  origin === undefined || isAllowedExtensionOrigin(origin, explicitOrigins)
