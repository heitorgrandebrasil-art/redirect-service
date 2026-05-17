import * as redirectService from '../services/redirect-service.js';

function wantsJson(request) {
  const accept = request.headers.accept || '';
  return accept.includes('application/json');
}

function sendMessage(reply, statusCode, title, message, request) {
  if (wantsJson(request)) {
    return reply.status(statusCode).send({
      status: 'error',
      message
    });
  }

  return reply
    .status(statusCode)
    .type('text/html; charset=utf-8')
    .send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 3rem; color: #1d2327; }
    main { max-width: 42rem; }
    h1 { font-size: 1.7rem; margin-bottom: 0.5rem; }
    p { line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${message}</p>
  </main>
</body>
</html>`);
}

function requestMetadata(request) {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'] || null,
    referer: request.headers.referer || request.headers.referrer || null
  };
}

export function registerPublicRedirectRoutes(fastify) {
  async function handleRedirect(request, reply) {
    let shortPath = '';

    try {
      shortPath = decodeURIComponent(request.params.short_path || request.params['*'] || '').trim();
    } catch {
      return sendMessage(reply, 404, 'Redirect not found', 'The redirect link could not be found.', request);
    }

    if (!shortPath) {
      return sendMessage(reply, 404, 'Redirect not found', 'The redirect link could not be found.', request);
    }

    const redirect = await redirectService.findRedirectForPublicPath(shortPath);

    if (!redirect) {
      return sendMessage(reply, 404, 'Redirect not found', 'The redirect link could not be found.', request);
    }

    if (!redirect.active) {
      redirectService.logRedirectClick(redirect, {
        ...requestMetadata(request),
        statusCode: 410
      });

      return sendMessage(reply, 410, 'Redirect disabled', 'This redirect link is currently disabled.', request);
    }

    redirectService.logRedirectClick(redirect, {
      ...requestMetadata(request),
      statusCode: 302
    });

    return reply.redirect(302, redirect.target_url);
  }

  fastify.get('/r/:short_path', handleRedirect);
  fastify.get('/r/*', handleRedirect);
}

export default async function publicRedirectRoutes(fastify) {
  registerPublicRedirectRoutes(fastify);
}
