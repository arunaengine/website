import { v2AnnouncementType } from '~/composables/aruna_api_json'
import NewsCard from '~/components/card/news.vue'
import { mountWithNuxt } from '../../helpers/component'

vi.mock('virtual:public?%2Fimgs%2Fblog_release.webp', () => ({ default: '/imgs/blog_release.webp' }))
vi.mock('virtual:public?%2Fimgs%2Fblog_update.webp', () => ({ default: '/imgs/blog_update.webp' }))
vi.mock('virtual:public?%2Fimgs%2Fblog_blog.webp', () => ({ default: '/imgs/blog_blog.webp' }))
vi.mock('virtual:public?%2Fimgs%2Fblog_maintenance.webp', () => ({ default: '/imgs/blog_maintenance.webp' }))
vi.mock('virtual:public?%2Fimgs%2Fblog_orga.webp', () => ({ default: '/imgs/blog_orga.webp' }))
vi.mock('virtual:public?%2Fimgs%2Faruna_icon.webp', () => ({ default: '/imgs/aruna_icon.webp' }))

describe('components/card/news', () => {
  it('renders provided announcement content and custom image', async () => {
    const wrapper = await mountWithNuxt(NewsCard, {
      props: {
        id: 'announcement-1',
        type: v2AnnouncementType.ANNOUNCEMENT_TYPE_RELEASE,
        title: 'Major Release',
        teaser: 'New features are available now.',
        imageUrl: 'https://example.org/release.webp',
        author: 'Aruna Team',
        created_at: '2024-01-01T00:00:00.000Z',
        modified_by: 'Aruna Team',
        modified_at: '2024-01-01T00:00:00.000Z',
      },
    })

    expect(wrapper.text()).toContain('Major Release')
    expect(wrapper.text()).toContain('New features are available now.')
    expect(wrapper.text()).toContain('Aruna Team')
    expect(wrapper.text()).toContain('Release')
    expect(wrapper.html()).toContain('https://example.org/release.webp')
    expect(wrapper.html()).toContain('/articles/announcement-1')
  })

  it('falls back to default type image and shows modified date copy', async () => {
    const wrapper = await mountWithNuxt(NewsCard, {
      props: {
        id: 'announcement-2',
        type: v2AnnouncementType.ANNOUNCEMENT_TYPE_MAINTENANCE,
        title: 'Maintenance Window',
        teaser: 'Scheduled maintenance starts tomorrow.',
        imageUrl: '',
        author: 'Ops Team',
        created_at: '2024-01-01T00:00:00.000Z',
        modified_by: 'Ops Team',
        modified_at: '2024-01-02T00:00:00.000Z',
      },
    })

    expect(wrapper.html()).toContain('/imgs/blog_maintenance.webp')
    expect(wrapper.text()).toContain('Maintenance')
    expect(wrapper.text()).toContain('(modified)')
    expect(wrapper.text()).toContain('Originally posted:')
  })
})
