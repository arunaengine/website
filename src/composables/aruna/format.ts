export function colorFor(value: string): string {
  const colors = ['#335DC6', '#24A9E6', '#16a34a', '#0d9488', '#a855f7', '#f97316', '#dc2626']
  let hash = 0
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return colors[hash % colors.length]
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?'
}

export function shortId(id: string): string {
  return id.length > 12 ? id.slice(0, 8) : id
}

export function truncateLabel(value: string, max = 24): string {
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function roleSummary(roles: Array<{ name: string }>): string {
  return roles.length ? `Roles: ${roles.map((role) => role.name).join(', ')}` : ''
}
