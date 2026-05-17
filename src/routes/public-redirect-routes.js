import * as redirectService from '../services/redirect-service.js';
import config from '../config.js';

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

function appendUtmSource(targetUrl, source) {
  if (!source) return targetUrl;
  try {
    const url = new URL(targetUrl);
    if (!url.searchParams.has('utm_source')) {
      url.searchParams.set('utm_source', source);
    }
    return url.toString();
  } catch {
    return targetUrl;
  }
}

function detectDevice(userAgent) {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|windows phone/.test(ua)) return 'mobile';
  if (/tablet|ipad/.test(ua)) return 'tablet';
  return 'desktop';
}

function requestMetadata(request) {
  const userAgent = request.headers['user-agent'] || null;
  return {
    ip: request.ip,
    userAgent,
    referer: request.headers.referer || request.headers.referrer || null,
    deviceType: detectDevice(userAgent)
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

    const utmSource = request.hostname || new URL(config.app.publicBaseUrl).hostname;
    const finalUrl = appendUtmSource(redirect.target_url, utmSource);
    return reply.redirect(302, finalUrl);
  }

  fastify.get('/r/:short_path', handleRedirect);
  fastify.get('/r/*', handleRedirect);
}

export default async function publicRedirectRoutes(fastify) {
  registerPublicRedirectRoutes(fastify);
}
