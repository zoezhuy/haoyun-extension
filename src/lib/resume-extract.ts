import mammoth from "mammoth"
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist"

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString()

const readAsArrayBuffer = (file: File): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsArrayBuffer(file)
  })

const readAsText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(new Error("Failed to read text file"))
    reader.readAsText(file)
  })

const extractFromPdf = async (file: File): Promise<string> => {
  const data = await readAsArrayBuffer(file)
  const doc = await getDocument({ data }).promise
  const pages: string[] = []

  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
    pages.push(pageText)
  }

  return pages.join("\n")
}

const extractFromDocx = async (file: File): Promise<string> => {
  const data = await readAsArrayBuffer(file)
  const result = await mammoth.extractRawText({ arrayBuffer: data })
  return result.value
}

export const extractResumeText = async (file: File): Promise<string> => {
  const name = file.name.toLowerCase()

  if (name.endsWith(".pdf")) {
    return extractFromPdf(file)
  }

  if (name.endsWith(".docx")) {
    return extractFromDocx(file)
  }

  if (name.endsWith(".txt") || file.type.startsWith("text/")) {
    return readAsText(file)
  }

  throw new Error("Unsupported file type. Use PDF, DOCX, or TXT.")
}
