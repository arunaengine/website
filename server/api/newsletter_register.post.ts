import {parseFromString} from 'dom-parser';

export default defineEventHandler(async event => {
  // Fetch runtime config for mailing list connection properties
  const config = useRuntimeConfig()

  // Parse provided data for mailing list registry
  const data = await readBody(event)

  // Validate provided data is present
  if (!data.email) {
    throw new Error('Email is not defined')
  }

  // Fetch CSRF token
  const [csrfToken, csrfCookie] = await fetch(config.mailingListUrl)
      .then(async response => {
        if (response.headers) {
          const cookie = parseCookie(response.headers.get('set-cookie') as string)
          //console.log('[CSRF Token Cookie]', cookie['csrftoken'])

          const dom = parseFromString(await response.text() as string)
          const elements = dom.getElementsByName('csrfmiddlewaretoken')

          if (elements.length < 1) {
            console.error('[Newsletter Register] No token available on mailing list page')
            throw new Error("Page did not contain token")
          }

          const token = elements[0].getAttribute('value')
          //console.log('[CSRF Token]', token)

          return [token, cookie['csrftoken']]
        } else {
          throw new Error("Response does not contain headers")
        }
      })

  // Prepare form data for registration request
  let formData = new FormData();
  formData.append('email', data.email as string);
  formData.append('display_name', data.displayName ? data.displayName : '');
  formData.append('csrfmiddlewaretoken', csrfToken);

  // Send registration to mailing list endpoint
  return await fetch(config.mailingListSubscribe, {
    method: 'POST',
    headers: {
      'Referer': config.mailingListUrl,
      'Origin': config.mailingListHost,
      'Cookie': `csrftoken=${csrfCookie}`
    },
    body: formData
  }).then(response => {
    console.log("[Newsletter Register] Register POST:", response.status)
    return true
  }).catch(err => {
    console.log(err.data)
    return false
  })
})

const parseCookie = (cookieString: string) =>
    cookieString
        .split(';')
        .map(v => v.split('='))
        .reduce<Record<string, string>>((acc, v: string[]) => {
          acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
          return acc;
        }, {});