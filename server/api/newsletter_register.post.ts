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

  // Fetch CSRF tokens
  const csrfToken: string = await $fetch<string>(config.mailingListUrl)
      .then((responseText) => {
        const dom = parseFromString(responseText)
        const elements = dom.getElementsByName('csrfmiddlewaretoken')

        if (elements.length < 1) {
          console.error('[Newsletter Register] No token available on mailing list page')
          throw new Error("Page did not contain token")
        }

        const token = elements[0].getAttribute('value')
        console.log(token)

        return token
      })

  // Prepare form data for registration request
  let formData = new FormData();
  formData.append('email', data.email as string);
  formData.append('display_name', data.displayName ? data.displayName : '');
  formData.append('csrfmiddlewaretoken', csrfToken);

  // Send registration to mailing list endpoint
  return await $fetch(config.mailingListSubscribe, {
    method: 'POST',
    headers: {
      Referer: config.mailingListUrl,
      Origin: config.mailingListHost,
      Cookie: `csrftoken=${csrfToken}`,
    },
    body: formData
  }).then(response => {
    return true
  }).catch(err => {
    return false
  })
})