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
  maxAge: useRuntimeConfig().cacheMaxAge || 60 * 60 * 24, // Defaults to 1 day
  swr: false,
  getKey: (articleId: string) => articleId,
})

async function mdToHtml(mdContent: string | undefined): Promise<string> {
  if (mdContent) {
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

    return md.render(mdContent)
  }

  return ''
}