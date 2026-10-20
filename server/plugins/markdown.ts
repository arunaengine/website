import {warmMarkdownRenderer} from '~/server/utils/announcement'

export default defineNitroPlugin(() => {
  warmMarkdownRenderer()
})
