export interface HighRiskConfirmationDetail {
  label: string
  value: string | number | boolean | null | undefined
}

export function normalizeConfirmationReason(value: unknown): string {
  return String(value ?? '').trim()
}

export function formatHighRiskConfirmationMessage(message: string, details: HighRiskConfirmationDetail[] = []): string {
  const visibleDetails = details
    .map((detail) => {
      const value = detail.value
      if (value === null || value === undefined || value === '') return null
      return `${detail.label}: ${String(value)}`
    })
    .filter((detail): detail is string => Boolean(detail))

  if (visibleDetails.length === 0) return message
  return `${message}\n\n${visibleDetails.join('\n')}`
}
