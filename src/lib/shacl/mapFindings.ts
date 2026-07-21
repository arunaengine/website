import { sameSchemaOrgType } from '../profiles/uri'
import type { ProfilePropertyRule, ProfileViolation } from '../profiles/types'
import type { ShaclFinding } from './findings'

// Splits deep-validation findings into the two evaluator surfaces (plan
// section 8): findings that resolve to a rendered root-Dataset control render
// INLINE beside it (as display-only ProfileViolations — they never gate
// submission, the bespoke validator owns that), everything else goes to the
// "Profile conformance" panel. Dependency-free, so the dialog can import it
// without touching the RDF stack.

export interface MappedShaclFindings {
  // Display-only violations keyed by the control property (rule valueName).
  inline: Record<string, ProfileViolation[]>
  panel: ShaclFinding[]
}

// A finding maps inline when it sits on the crate root, names a property path
// that matches a Dataset rule, and is not an info note. Findings the bespoke
// validator already reports at the same field and severity are dropped
// entirely (the dedup rule): the bespoke message is the one shown.
export function mapShaclFindings(
  findings: ShaclFinding[],
  datasetRules: ProfilePropertyRule[],
  bespoke: ProfileViolation[],
  rootId = './',
): MappedShaclFindings {
  const inline: Record<string, ProfileViolation[]> = {}
  const panel: ShaclFinding[] = []
  const bespokeKeys = new Set(bespoke.map((violation) => `${violation.fieldId ?? ''} ${violation.severity}`))
  const seenInline = new Set<string>()
  for (const finding of findings) {
    if (finding.severity === 'info' || finding.focusId !== rootId || !finding.path) {
      panel.push(finding)
      continue
    }
    const rule = datasetRules.find((candidate) => sameSchemaOrgType(candidate.propertyUri, finding.path ?? ''))
    if (!rule) {
      panel.push(finding)
      continue
    }
    const severity = finding.severity === 'error' ? 'error' : 'warning'
    if (bespokeKeys.has(`${rule.valueName} ${severity}`)) continue
    // One message per field+severity+text — repeated shapes over the same path
    // must not stack identical lines.
    const key = `${rule.valueName} ${severity} ${finding.message}`
    if (seenInline.has(key)) continue
    seenInline.add(key)
    ;(inline[rule.valueName] ??= []).push({
      ruleId: `shacl:${finding.sourceShape || 'finding'}`,
      pointer: `/${rule.valueName}`,
      fieldId: rule.valueName,
      message: finding.message,
      severity,
    })
  }
  return { inline, panel }
}
