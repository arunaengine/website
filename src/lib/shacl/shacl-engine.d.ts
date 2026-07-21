// Minimal structural typings for shacl-engine (MIT, ships no types). Only the
// surface validate.ts touches is declared; everything else stays unknown.
declare module 'shacl-engine' {
  export interface ShaclEngineTerm {
    termType: string
    value: string
  }

  export interface ShaclEngineResult {
    focusNode?: { term?: ShaclEngineTerm | null } | null
    // Simple IRI paths arrive as one step whose predicates hold the property.
    path?: Array<{ predicates?: ShaclEngineTerm[] }> | null
    severity?: ShaclEngineTerm | null
    constraintComponent?: ShaclEngineTerm | null
    message?: ShaclEngineTerm[]
    shape?: { ptr?: { term?: ShaclEngineTerm | null } | null } | null
  }

  export interface ShaclEngineReport {
    conforms: boolean
    results: ShaclEngineResult[]
  }

  export class Validator {
    constructor(shapes: unknown, options: { factory: unknown })
    validate(data: { dataset: unknown }): Promise<ShaclEngineReport>
  }
}
