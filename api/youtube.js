// Proxy aman: hanya endpoint & parameter whitelist; API key hanya dari env.
const ALLOW = {
  search: ['q','type','maxResults','order','videoDuration','publishedAfter','pageToken','videoCategoryId','channelId','videoEmbeddable','regionCode','eventType'],
  videos: ['id','chart','videoCategoryId','maxResults','pageToken','regionCode'],
  channels: ['id'],
  playlistItems: ['playlistId','maxResults','pageToken']
};
const PART = { search:'snippet', videos:'snippet,contentDetails,statistics', channels:'snippet,statistics', playlistItems:'snippet,contentDetails' };
const ENUM = { order:['relevance','date','viewCount','rating'], videoDuration:['short','medium','long','any'], type:['video','channel'], eventType:['live'], videoEmbeddable:['true'] };
const cache = new Map();

export default async function handler(req, res) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(500).json({ error: { message: 'YOUTUBE_API_KEY belum diatur di Environment Variables.' } });
  const ep = req.query.endpoint;
  if (!ALLOW[ep]) return res.status(400).json({ error: { message: 'Endpoint tidak diizinkan.' } });
  const p = new URLSearchParams();
  for (const k of ALLOW[ep]) {
    const v = req.query[k];
    if (v === undefined || v === '') continue;
    const s = String(v);
    if (s.length > 400 || (ENUM[k] && !ENUM[k].includes(s))) return res.status(400).json({ error: { message: 'Parameter tidak valid: ' + k } });
    if (k === 'maxResults' && !(+s >= 1 && +s <= 50)) return res.status(400).json({ error: { message: 'maxResults 1-50' } });
    if (k === 'id' && !/^[\w-]+(,[\w-]+){0,49}$/.test(s)) return res.status(400).json({ error: { message: 'ID tidak valid' } });
    p.set(k, s);
  }
  p.set('part', PART[ep]);
  if (ep === 'search') p.set('safeSearch', 'moderate');
  const url = `https://www.googleapis.com/youtube/v3/${ep}?${p}`;
  const hit = cache.get(url);
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  if (hit && Date.now() - hit.t < 300000) return res.status(200).json(hit.d);
  try {
    const r = await fetch(`${url}&key=${key}`);
    const d = await r.json();
    if (!r.ok) { res.setHeader('Cache-Control', 'no-store'); return res.status(r.status).json({ error: { message: d.error?.message || 'Error API', reason: d.error?.errors?.[0]?.reason } }); }
    if (cache.size > 300) cache.clear();
    cache.set(url, { t: Date.now(), d });
    return res.status(200).json(d);
  } catch { res.setHeader('Cache-Control', 'no-store'); return res.status(502).json({ error: { message: 'Gagal menghubungi YouTube API.' } }); }
}
