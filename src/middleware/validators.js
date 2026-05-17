const videoProperties = {
  title: { type: 'string', minLength: 3, maxLength: 255 },
  description: { type: 'string', maxLength: 2000 },
  platform: { type: 'string', maxLength: 128 },
  original_video_url: { type: 'string', format: 'uri' },
  notes: { type: 'string', maxLength: 4000 },
  publish_date: { type: 'string', format: 'date-time' }
};

const productProperties = {
  title: { type: 'string', minLength: 3, maxLength: 255 },
  description: { type: 'string', maxLength: 2000 },
  affiliate_url: { type: 'string', format: 'uri' },
  short_path: { type: 'string', minLength: 4, maxLength: 128 },
  marketplace: { type: 'string', minLength: 1, maxLength: 128 },
  position: { type: 'string', enum: ['top1', 'top2', 'top3', 'top4', 'top5'] },
  domain_id: { type: ['string', 'integer'] },
  video_id: { type: ['string', 'integer'] }
};

const domainProperties = {
  name: { type: 'string', minLength: 3, maxLength: 255 },
  hostname: { type: 'string', minLength: 3, maxLength: 255 },
  enabled: { type: 'boolean' }
};

const redirectProperties = {
  short_path: { type: 'string', minLength: 4, maxLength: 128 },
  target_url: { type: 'string', format: 'uri' },
  product_id: { type: ['string', 'integer'] },
  domain_id: { type: ['string', 'integer'] },
  active: { type: 'boolean' }
};

export const createVideoSchema = {
  body: {
    type: 'object',
    required: ['title'],
    properties: videoProperties,
    additionalProperties: false
  }
};

export const updateVideoSchema = {
  body: {
    type: 'object',
    properties: videoProperties,
    additionalProperties: false
  }
};

export const createProductSchema = {
  body: {
    type: 'object',
    required: ['title', 'affiliate_url'],
    properties: productProperties,
    additionalProperties: false
  }
};

export const updateProductSchema = {
  body: {
    type: 'object',
    properties: productProperties,
    additionalProperties: false
  }
};

export const createDomainSchema = {
  body: {
    type: 'object',
    required: ['name', 'hostname'],
    properties: domainProperties,
    additionalProperties: false
  }
};

export const updateDomainSchema = {
  body: {
    type: 'object',
    properties: domainProperties,
    additionalProperties: false
  }
};

export const createRedirectSchema = {
  body: {
    type: 'object',
    required: ['short_path', 'target_url'],
    properties: redirectProperties,
    additionalProperties: false
  }
};

export const updateRedirectSchema = {
  body: {
    type: 'object',
    properties: redirectProperties,
    additionalProperties: false
  }
};
