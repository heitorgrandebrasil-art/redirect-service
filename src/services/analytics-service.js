import { query } from '../db.js';

const DEVICE_SQL = `
  CASE
    WHEN device_type IS NOT NULL AND device_type != '' THEN device_type
    WHEN lower(user_agent) ~ '(mobile|android|iphone|ipod|blackberry|windows phone)' THEN 'mobile'
    WHEN lower(user_agent) ~ '(tablet|ipad)' THEN 'tablet'
    WHEN user_agent IS NULL THEN 'unknown'
    ELSE 'desktop'
  END
`;

export async function getOverview() {
  const [byDevice, byPlatform, topCampaigns, totals, byDay, linkStatus] = await Promise.all([
    getClicksByDevice(),
    getClicksByPlatform(),
    getTopCampaigns(),
    getTotals(),
    getClicksByDay(),
    getLinkStatusDistribution(),
  ]);
  return { byDevice, byPlatform, topCampaigns, totals, byDay, linkStatus };
}

async function getClicksByDevice() {
  const result = await query(`
    SELECT
      ${DEVICE_SQL} AS device,
      COUNT(*)::int AS clicks
    FROM redirect_clicks
    GROUP BY device
    ORDER BY clicks DESC
  `);
  return result.rows;
}

async function getClicksByPlatform() {
  const result = await query(`
    SELECT
      COALESCE(NULLIF(lower(v.platform), ''), 'outros') AS platform,
      COUNT(rc.id)::int AS clicks
    FROM redirect_clicks rc
    JOIN redirects r ON r.id = rc.redirect_id
    LEFT JOIN products p ON p.id = r.product_id
    LEFT JOIN videos v ON v.id = p.video_id
    GROUP BY lower(v.platform)
    ORDER BY clicks DESC
    LIMIT 10
  `);
  return result.rows;
}

async function getTopCampaigns() {
  const result = await query(`
    SELECT
      v.id, v.title, v.platform,
      COUNT(rc.id)::int AS clicks
    FROM videos v
    LEFT JOIN products p ON p.video_id = v.id
    LEFT JOIN redirects r ON r.product_id = p.id
    LEFT JOIN redirect_clicks rc ON rc.redirect_id = r.id
    GROUP BY v.id, v.title, v.platform
    ORDER BY clicks DESC
    LIMIT 5
  `);
  return result.rows;
}

async function getTotals() {
  const result = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM redirect_clicks) AS total_clicks,
      (SELECT COUNT(*)::int FROM videos) AS total_campaigns,
      (SELECT COUNT(*)::int FROM profiles) AS total_profiles,
      (SELECT COUNT(*)::int FROM products
         WHERE video_id IS NOT NULL
           AND affiliate_url IS NOT NULL AND affiliate_url != '') AS total_links,
      (SELECT COUNT(*)::int FROM products
         WHERE video_id IS NOT NULL
           AND affiliate_url IS NOT NULL AND affiliate_url != ''
           AND link_status = 'ok') AS links_ok,
      (SELECT COUNT(*)::int FROM products
         WHERE video_id IS NOT NULL
           AND affiliate_url IS NOT NULL AND affiliate_url != ''
           AND link_status IN ('broken', 'human_review')) AS links_broken
  `);
  return result.rows[0];
}

async function getClicksByDay() {
  const result = await query(`
    SELECT
      gs.day::date::text AS date,
      COALESCE(cnt.clicks, 0)::int AS clicks
    FROM generate_series(
      (CURRENT_DATE - INTERVAL '29 days')::date,
      CURRENT_DATE::date,
      '1 day'::interval
    ) AS gs(day)
    LEFT JOIN (
      SELECT DATE(created_at) AS day, COUNT(*)::int AS clicks
      FROM redirect_clicks
      WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
      GROUP BY DATE(created_at)
    ) cnt ON cnt.day = gs.day::date
    ORDER BY gs.day
  `);
  return result.rows;
}

async function getLinkStatusDistribution() {
  const result = await query(`
    SELECT
      CASE
        WHEN snoozed_until IS NOT NULL AND snoozed_until > now() THEN 'snoozed'
        ELSE COALESCE(NULLIF(link_status, ''), 'unknown')
      END AS status,
      COUNT(*)::int AS count
    FROM products
    WHERE video_id IS NOT NULL
      AND affiliate_url IS NOT NULL AND affiliate_url != ''
    GROUP BY status
    ORDER BY count DESC
  `);
  return result.rows;
}
