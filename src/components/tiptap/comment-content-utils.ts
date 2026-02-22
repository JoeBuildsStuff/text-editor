"use client"

function decodeHtmlEntities(input: string) {
  return input
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
}

export function richTextToPlainText(content: string) {
  if (!content) {
    return ""
  }

  if (typeof window !== "undefined") {
    const parser = new DOMParser()
    const document = parser.parseFromString(content, "text/html")
    return (document.body.textContent ?? "").replaceAll("\u00A0", " ").trim()
  }

  return decodeHtmlEntities(content.replace(/<[^>]*>/g, " ")).trim()
}

export function isRichTextContentEmpty(content: string) {
  return richTextToPlainText(content).length === 0
}
