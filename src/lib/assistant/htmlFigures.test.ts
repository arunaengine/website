import { describe, expect, it } from 'vitest'
import { figureName, htmlFigures, pickFigure } from './htmlFigures'

const image = (size: number) => `data:image/png;base64,${'A'.repeat(size)}`

// The shape a FastQC report has: a status icon in the heading, the plot below.
const report = `<div class="module"><h2 id="M1"><img src="${image(40)}" alt="[PASS]"/>Per base sequence quality</h2>`
  + `<p><img class="indented" src="${image(4000)}" alt="Per base quality graph"></p></div>`
  + `<div class="module"><h2 id="M2"><img src="${image(40)}" alt="[WARN]"/>Per sequence GC content</h2>`
  + `<p><img class="indented" src="${image(3000)}" alt="Per sequence GC content graph"></p></div>`

describe('htmlFigures', () => {
  it('reads the plots and leaves the status icons out', () => {
    const figures = htmlFigures(report)

    expect(figures).toHaveLength(2)
    expect(figures[0].section).toBe('Per base sequence quality')
    expect(figures[0].alt).toBe('Per base quality graph')
    expect(figures[0].contentType).toBe('image/png')
    expect(figureName(figures[1])).toBe('Per sequence GC content')
  })

  it('takes only images the file itself holds', () => {
    const figures = htmlFigures('<h2>Coverage</h2><img src="https://cdn.test/plot.png" alt="Coverage">')

    expect(figures).toHaveLength(0)
  })

  it('finds the asked-for figure and refuses a stray word', () => {
    const figures = htmlFigures(report)

    expect(pickFigure(figures, 'per base sequence quality')?.alt).toBe('Per base quality graph')
    expect(pickFigure(figures, 'GC content')?.section).toBe('Per sequence GC content')
    expect(pickFigure(figures, 'adapter content overrepresented sequences duplication')).toBeNull()
  })
})
