function toTryOnListItem(row) {
  if (!row) return null
  return {
    tryOnId: String(row.TryOnId || ''),
    userId: String(row.UserId || ''),
    sourceImageUrl: row.SourceImageUrl || null,
    templateImageUrl: row.TemplateImageUrl || null,
    resultImageUrl: row.ResultImageUrl || null,
    designId: row.DesignId || null,
    params: row.Params || null,
    createdAt: row.CreatedAt || null,
  }
}

module.exports = { toTryOnListItem }
