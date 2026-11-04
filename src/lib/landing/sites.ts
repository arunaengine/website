// The six places of the example zebrafish study and where the hero map draws them.
import type { Component } from 'vue'
import { Cloud, FlaskConical, Fish, Globe, Microscope, TestTubes } from '@lucide/vue'

export interface Site {
  folder: string
  size: string
  name: string
  place: string
  icon: Component
  /** Longitude and latitude; the public reference is linked only and has no pin. */
  at: [number, number] | null
  /** Where the map label sits: above, below or left of its pin. */
  side: 'a' | 'b' | 'l'
  hub?: boolean
}

export const SITES: Site[] = [
  { folder: 'boston-fish/', size: '1.2 MiB', name: 'Fish facility', place: 'Boston', icon: Fish, at: [-71.06, 42.36], side: 'a' },
  {
    folder: 'heidelberg-imaging/',
    size: '18.5 TiB',
    name: 'Imaging facility',
    place: 'Heidelberg',
    icon: Microscope,
    at: [8.67, 49.4],
    side: 'a',
    hub: true,
  },
  { folder: 'mumbai-archive/', size: '9.6 TiB', name: 'Cloud archive', place: 'Mumbai', icon: Cloud, at: [72.88, 19.08], side: 'l' },
  {
    folder: 'sandiego-variants/',
    size: '3.8 GiB',
    name: 'Genomics group',
    place: 'San Diego',
    icon: FlaskConical,
    at: [-117.16, 32.72],
    side: 'b',
  },
  {
    folder: 'tokyo-sequencing/',
    size: '2.1 TiB',
    name: 'Sequencing core',
    place: 'Tokyo',
    icon: TestTubes,
    at: [139.69, 35.69],
    side: 'a',
  },
  { folder: 'ncbi-reference/', size: '1.4 GiB', name: 'NCBI', place: 'linked', icon: Globe, at: null, side: 'a' },
]

/** Natural Earth projection, fitted to the 600 wide land outline. */
export function project(lon: number, lat: number): [number, number] {
  const l = (lon * Math.PI) / 180
  const p = (lat * Math.PI) / 180
  const p2 = p * p
  const p4 = p2 * p2
  const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)))
  const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))
  return [109.6687 * x + 299.9885, -109.6687 * y + 140.9256]
}
