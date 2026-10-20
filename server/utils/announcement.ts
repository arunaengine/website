import type {v2Announcement, v2GetAnnouncementResponse} from "~/composables/aruna_api_json";
import MarkdownIt from "markdown-it";
import MarkdownItDefList from "markdown-it-deflist";
import Shiki from "@shikijs/markdown-it";
import MarkdownItClass from "@bynect/markdown-it-class";

export const fetchConvertedAnnouncement = defineCachedFunction(async (articleId: string): Promise<v2Announcement | undefined> => {
  const baseUrl = useRuntimeConfig().serverHostUrl
  const fetchUrl = `${baseUrl}/v2/info/announcements/${articleId}`

  return await $fetch<v2GetAnnouncementResponse>(fetchUrl)
      .then(async response => {
        let ann = response.announcement
        if (ann) {
          ann.content = await mdToHtml(ann.content)
        }
        return ann
      }).catch(error => {
        console.error('[API Error]', error)
        return undefined
      })
}, {
  group: 'news',
  name: 'articles-id',
  maxAge: 5 * 60, // New or edited posts show up within five minutes
  swr: false,
  getKey: (articleId: string) => articleId,
})

// The Markdown renderer with its code highlighter is built once and reused
let markdownRenderer: Promise<MarkdownIt> | undefined

async function buildRenderer(): Promise<MarkdownIt> {
  const md = MarkdownIt()
      .use(MarkdownItDefList)
      .use(await Shiki({
        theme: 'catppuccin-macchiato',
        transformers: [
          {
            pre(node) {
              this.addClassToHast(node, 'm-4 p-4 overflow-x-auto rounded-md border border-gray-500')
            },
          }
        ]
      })).use(MarkdownItClass, useRuntimeConfig().markdownCss)

  const renderImage = md.renderer.rules.image!
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    tokens[idx].attrSet('loading', 'lazy')
    tokens[idx].attrSet('decoding', 'async')
    return renderImage(tokens, idx, options, env, self)
  }
  return md
}

// Called at server start so the first visitor does not wait for the highlighter
export function warmMarkdownRenderer() {
  markdownRenderer ??= buildRenderer()
}

async function mdToHtml(mdContent: string | undefined): Promise<string> {
  if (mdContent) {
    markdownRenderer ??= buildRenderer()
    return (await markdownRenderer).render(mdContent)
  }

  return ''
}
