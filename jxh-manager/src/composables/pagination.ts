export function pageCount(totalItems: number, pageSize: number): number {
  if (!Number.isFinite(totalItems) || !Number.isFinite(pageSize) || totalItems <= 0 || pageSize <= 0) {
    return 0
  }
  return Math.ceil(totalItems / pageSize)
}

export function clampPage(page: number, totalPages: number): number {
  if (totalPages <= 0) return 1
  return Math.min(Math.max(1, Math.trunc(page)), totalPages)
}
