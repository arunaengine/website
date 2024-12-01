import type {OntologyDoc} from "~/types/OntologyDoc";

export type SelectOntologyResponse = {
  // There are lots of other properties in the response
  // which are not relevant for our use case
  response: {
    numFound: number,
    start: number,
    docs: OntologyDoc[]
  }
}