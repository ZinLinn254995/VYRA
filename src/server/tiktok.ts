import { createHmac, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import express, { Router, type Request, type Response } from 'express';

const API_BASE = 'https://open.tiktokapis.com/v2';
const COOKIE_NAME = 'vyra_tiktok_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const STATE_TTL_MS = 10 * 60 * 1000;

type TikTokToken = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  refresh_expires_at: number;
  open_id: string;
  scope: string;
};

function config() {
  return {
    clientKey: process.env.TIKTOK_CLIENT_KEY?.trim() || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET?.trim() || '',
    redirectUri: process.env.TIKTOK_REDIRECT_URI?.trim() || '',
    appSecret: process.env.TIKTOK_SESSION_SECRET || '',
    encryptionKey: process.env.TIKTOK_TOKEN_ENCRYPTION_KEY || '',
    redisUrl: process.env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/$/, '') || '',
    redisToken: process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || '',
    appUrl: process.env.APP_URL?.trim().replace(/\/$/, '') || '',
  };
}

function configured(): boolean {
  const c = config();
  return Boolean(c.clientKey && c.clientSecret && c.redirectUri && c.appSecret.length >= 32 &&
    c.encryptionKey.length >= 32 && c.redisUrl && c.redisToken && c.appUrl);
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function signedCookie(sessionId: string, secret: string): string {
  return sessionId + '.' + sign(sessionId, secret);
}

function readSession(req: Request): string | null {
  const c = config();
  const cookie = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE_NAME + '='));
  if (!cookie) return null;
  const value = decodeURIComponent(cookie.slice(COOKIE_NAME.length + 1));
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const sessionId = value.slice(0, dot);
  if (!/^[a-f0-9]{64}$/.test(sessionId) || !safeEqual(value.slice(dot + 1), sign(sessionId, c.appSecret))) return null;
  return sessionId;
}

function setSessionCookie(res: Response, sessionId: string) {
  const c = config();
  const secure = c.appUrl.startsWith('https://') ? '; Secure' : '';
  res.setHeader('Set-Cookie', COOKIE_NAME + '=' + encodeURIComponent(signedCookie(sessionId, c.appSecret)) +
    '; Path=/api/tiktok; HttpOnly; SameSite=Lax; Max-Age=' + SESSION_TTL_SECONDS + secure);
}

async function redis(command: string[]): Promise<unknown> {
  const c = config();
  const response = await fetch(c.redisUrl + '/' + command.map(v => encodeURIComponent(v)).join('/'), {
    headers: { Authorization: 'Bearer ' + c.redisToken },
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Session storage unavailable');
  const payload = await response.json() as { result?: unknown; error?: string };
  if (payload.error) throw new Error('Session storage operation failed');
  return payload.result;
}

function encryptionKey(): Buffer {
  const key = Buffer.from(config().encryptionKey, 'base64');
  if (key.length !== 32) throw new Error('TIKTOK_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  return key;
}

function encrypt(value: TikTokToken): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function decrypt(value: string): TikTokToken {
  const [ivText, tagText, ciphertextText] = value.split('.');
  if (!ivText || !tagText || !ciphertextText) throw new Error('Invalid encrypted token record');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  const clear = Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]);
  return JSON.parse(clear.toString('utf8')) as TikTokToken;
}

async function getToken(sessionId: string): Promise<TikTokToken | null> {
  const value = await redis(['GET', 'vyra:tiktok:token:' + sessionId]);
  return typeof value === 'string' ? decrypt(value) : null;
}

async function saveToken(sessionId: string, token: TikTokToken): Promise<void> {
  await redis(['SET', 'vyra:tiktok:token:' + sessionId, encrypt(token), 'EX', String(60 * 60 * 24 * 90)]);
}

async function refreshTokenIfNeeded(sessionId: string, token: TikTokToken): Promise<TikTokToken> {
  if (token.expires_at > Date.now() + 60_000) return token;
  if (token.refresh_expires_at <= Date.now()) {
    await redis(['DEL', 'vyra:tiktok:token:' + sessionId]);
    throw new Error('TikTok authorization expired. Reconnect the account.');
  }
  const c = config();
  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: c.clientKey,
      client_secret: c.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    }),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== 'string') throw new Error('TikTok token refresh failed. Reconnect the account.');
  const next: TikTokToken = {
    access_token: body.access_token,
    refresh_token: typeof body.refresh_token === 'string' ? body.refresh_token : token.refresh_token,
    expires_at: Date.now() + Number(body.expires_in || 86400) * 1000,
    refresh_expires_at: Date.now() + Number(body.refresh_expires_in || 0) * 1000,
    open_id: typeof body.open_id === 'string' ? body.open_id : token.open_id,
    scope: typeof body.scope === 'string' ? body.scope : token.scope,
  };
  await saveToken(sessionId, next);
  return next;
}

async function tiktokRequest(url: string, token: string): Promise<Record<string, any>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8' },
    body: '{}',
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || (data.error && data.error.code && data.error.code !== 'ok')) {
    throw new Error('TikTok API request failed');
  }
  return data;
}

export function createTikTokRouter(): Router {
  const router = Router();

  router.get('/status', async (req, res) => {
    if (!configured()) return res.status(200).json({
      configured: false, connected: false,
      message: 'TikTok OAuth needs client credentials, secure token encryption, and durable session storage.',
    });
    try {
      const sessionId = readSession(req);
      if (!sessionId) return res.json({ configured: true, connected: false });
      let token = await getToken(sessionId);
      if (!token) return res.json({ configured: true, connected: false });
      token = await refreshTokenIfNeeded(sessionId, token);
      const info = await tiktokRequest(API_BASE + '/post/publish/creator_info/query/', token.access_token);
      const creator = info.data || {};
      return res.json({
        configured: true, connected: true,
        creator: {
          username: creator.creator_username,
          nickname: creator.creator_nickname,
          avatarUrl: creator.creator_avatar_url,
          privacyOptions: Array.isArray(creator.privacy_level_options) ? creator.privacy_level_options : [],
          maxVideoDurationSeconds: Number(creator.max_video_post_duration_sec || 0),
          commentsDisabled: Boolean(creator.comment_disabled),
          duetDisabled: Boolean(creator.duet_disabled),
          stitchDisabled: Boolean(creator.stitch_disabled),
        },
      });
    } catch {
      return res.status(502).json({ error: 'Could not verify TikTok connection. Reconnect and try again.' });
    }
  });

  router.get('/connect', (req, res) => {
    if (!configured()) return res.status(503).json({
      error: 'TikTok integration is not configured on the server. Set the documented server environment variables first.',
    });
    const c = config();
    const sessionId = readSession(req) || randomBytes(32).toString('hex');
    setSessionCookie(res, sessionId);
    const issuedAt = Date.now();
    const nonce = randomBytes(24).toString('base64url');
    const statePayload = Buffer.from(JSON.stringify({ sessionId, issuedAt, nonce })).toString('base64url');
    const state = statePayload + '.' + sign(statePayload, c.appSecret);
    const authorizeUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
    authorizeUrl.search = new URLSearchParams({
      client_key: c.clientKey,
      response_type: 'code',
      scope: 'user.info.basic,video.publish',
      redirect_uri: c.redirectUri,
      state,
    }).toString();
    return res.redirect(302, authorizeUrl.toString());
  });

  router.get('/callback', async (req, res) => {
    if (!configured()) return res.status(503).send('TikTok integration is not configured.');
    const c = config();
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const dot = state.lastIndexOf('.');
    if (dot <= 0) return res.status(400).send('TikTok authorization was incomplete. Please try again.');
    const payload = state.slice(0, dot);
    if (!safeEqual(state.slice(dot + 1), sign(payload, c.appSecret))) return res.status(400).send('Invalid authorization state.');
    let stateData: { sessionId?: string; issuedAt?: number; nonce?: string };
    try { stateData = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
    catch { return res.status(400).send('Invalid authorization state.'); }
    const cookieSession = readSession(req);
    if (!cookieSession || cookieSession !== stateData.sessionId ||
        typeof stateData.issuedAt !== 'number' || Date.now() - stateData.issuedAt > STATE_TTL_MS ||
        Date.now() < stateData.issuedAt || typeof stateData.nonce !== 'string') {
      return res.status(400).send('Authorization expired or did not match this browser session. Start again from VYRA.');
    }
    if (typeof req.query.error === 'string') return res.redirect(302, c.appUrl + '/?tiktok=denied');
    if (!code) return res.status(400).send('TikTok authorization code is missing. Please try again.');
    try {
      const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: c.clientKey, client_secret: c.clientSecret,
          code, grant_type: 'authorization_code', redirect_uri: c.redirectUri,
        }),
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok || typeof body.access_token !== 'string' ||
          typeof body.refresh_token !== 'string' || typeof body.open_id !== 'string') {
        return res.redirect(302, c.appUrl + '/?tiktok=error');
      }
      const token: TikTokToken = {
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_at: Date.now() + Number(body.expires_in || 86400) * 1000,
        refresh_expires_at: Date.now() + Number(body.refresh_expires_in || 0) * 1000,
        open_id: body.open_id,
        scope: typeof body.scope === 'string' ? body.scope : '',
      };
      if (!token.scope.split(',').map(s => s.trim()).includes('video.publish')) {
        return res.redirect(302, c.appUrl + '/?tiktok=scope_missing');
      }
      await saveToken(stateData.sessionId, token);
      return res.redirect(302, c.appUrl + '/?tiktok=connected');
    } catch {
      return res.redirect(302, c.appUrl + '/?tiktok=error');
    }
  });

  router.post('/disconnect', async (req, res) => {
    if (!configured()) return res.status(503).json({ error: 'TikTok integration is not configured.' });
    try {
      const sessionId = readSession(req);
      if (sessionId) await redis(['DEL', 'vyra:tiktok:token:' + sessionId]);
      res.setHeader('Set-Cookie', COOKIE_NAME + '=; Path=/api/tiktok; HttpOnly; SameSite=Lax; Max-Age=0; Secure');
      return res.status(200).json({ connected: false });
    } catch {
      return res.status(503).json({ error: 'Could not securely disconnect TikTok right now. Please retry.' });
    }
  });


  // Direct Post supports an immediate publish flow. TikTok does not provide a
  // general future-scheduling field in this endpoint; do not label this as scheduled.
  router.post('/publish/init', async (req, res) => {
    if (!configured()) return res.status(503).json({ error: 'TikTok integration is not configured.' });
    const sessionId = readSession(req);
    if (!sessionId) return res.status(401).json({ error: 'Connect your TikTok account first.' });
    const body = req.body as {
      caption?: string; privacyLevel?: string; durationSeconds?: number;
      disableComment?: boolean; disableDuet?: boolean; disableStitch?: boolean;
      isAigc?: boolean; confirmed?: boolean; videoSize?: number;
    };
    if (body.confirmed !== true) return res.status(400).json({ error: 'Explicit confirmation is required before sending a video to TikTok.' });
    const caption = typeof body.caption === 'string' ? body.caption : '';
    if (caption.length > 2200) return res.status(400).json({ error: 'TikTok captions must be 2,200 UTF-16 code units or fewer.' });
    const duration = Number(body.durationSeconds);
    const videoSize = Number(body.videoSize);
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(videoSize) || videoSize < 1 || videoSize > 64 * 1024 * 1024) {
      return res.status(400).json({ error: 'This upload path supports a valid duration and video files up to 64 MiB.' });
    }
    try {
      let token = await getToken(sessionId);
      if (!token) return res.status(401).json({ error: 'TikTok account is not connected.' });
      token = await refreshTokenIfNeeded(sessionId, token);
      const creatorResponse = await tiktokRequest(API_BASE + '/post/publish/creator_info/query/', token.access_token);
      const creator = creatorResponse.data || {};
      const privacyOptions = Array.isArray(creator.privacy_level_options) ? creator.privacy_level_options : [];
      if (typeof body.privacyLevel !== 'string' || !privacyOptions.includes(body.privacyLevel)) {
        return res.status(400).json({ error: 'Choose a privacy level currently offered by your TikTok account.' });
      }
      const maxDuration = Number(creator.max_video_post_duration_sec || 0);
      if (!maxDuration || duration > maxDuration) {
        return res.status(400).json({ error: 'This video exceeds the maximum duration currently allowed by TikTok for this account.' });
      }
      const response = await fetch(API_BASE + '/post/publish/video/init/', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token.access_token, 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          post_info: {
            title: caption,
            privacy_level: body.privacyLevel,
            disable_comment: Boolean(body.disableComment),
            disable_duet: Boolean(body.disableDuet),
            disable_stitch: Boolean(body.disableStitch),
            brand_content_toggle: false,
            brand_organic_toggle: false,
            is_aigc: body.isAigc === true,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: videoSize,
            chunk_size: videoSize,
            total_chunk_count: 1,
          },
        }),
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({})) as Record<string, any>;
      if (!response.ok || data.error?.code && data.error.code !== 'ok' || !data.data?.publish_id || !data.data?.upload_url) {
        const code = String(data.error?.code || '');
        if (code === 'unaudited_client_can_only_post_to_private_accounts') {
          return res.status(403).json({ error: 'TikTok has not audited this developer app yet. Posts are restricted to private viewing.' });
        }
        return res.status(response.status === 429 ? 429 : 502).json({ error: 'TikTok could not initialize this post. Check the privacy setting, app approval, and account limits.' });
      }
      const publishId = String(data.data.publish_id);
      const uploadUrl = String(data.data.upload_url);
      if (publishId.length > 128 || uploadUrl.length > 2048 || !uploadUrl.startsWith('https://')) {
        return res.status(502).json({ error: 'TikTok returned invalid upload metadata.' });
      }
      await redis(['SET', 'vyra:tiktok:publish:' + sessionId + ':' + publishId,
        JSON.stringify({ uploadUrl, videoSize, createdAt: Date.now() }), 'EX', '3600']);
      return res.status(200).json({ publishId, uploadRequired: true, uploadUrl, videoSize, maxVideoDurationSeconds: maxDuration });
    } catch {
      return res.status(502).json({ error: 'Could not initialize TikTok publishing. Please retry after checking the connection.' });
    }
  });

  router.post('/publish/:publishId/status', async (req, res) => {
    if (!configured()) return res.status(503).json({ error: 'TikTok integration is not configured.' });
    const sessionId = readSession(req);
    const publishId = req.params.publishId;
    if (!sessionId) return res.status(401).json({ error: 'Connect your TikTok account first.' });
    if (!/^[a-zA-Z0-9_~.-]{1,128}$/.test(publishId)) return res.status(400).json({ error: 'Invalid publish ID.' });
    try {
      const stored = await redis(['GET', 'vyra:tiktok:publish:' + sessionId + ':' + publishId]);
      if (typeof stored !== 'string') return res.status(404).json({ error: 'Publish record expired or does not exist.' });
      const record = JSON.parse(stored) as { videoSize?: number; createdAt?: number };
      if (!record.createdAt || Date.now() - record.createdAt > 24 * 60 * 60 * 1000) return res.status(404).json({ error: 'Publish record expired. Start a new post.' });
      let token = await getToken(sessionId);
      if (!token) return res.status(401).json({ error: 'TikTok account is not connected.' });
      token = await refreshTokenIfNeeded(sessionId, token);
      const response = await fetch(API_BASE + '/post/publish/status/fetch/', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token.access_token, 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ publish_id: publishId }),
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({})) as Record<string, any>;
      if (!response.ok || data.error?.code && data.error.code !== 'ok') {
        return res.status(502).json({ error: 'TikTok status is temporarily unavailable. Retry shortly.' });
      }
      const result = data.data || {};
      return res.status(200).json({
        publishId,
        status: String(result.status || 'PROCESSING'),
        failReason: typeof result.fail_reason === 'string' ? result.fail_reason.slice(0, 300) : undefined,
        publicPostIds: Array.isArray(result.publicaly_available_post_id) ? result.publicaly_available_post_id : [],
      });
    } catch {
      return res.status(502).json({ error: 'Could not fetch TikTok publish status. Please retry.' });
    }
  });

  return router;
}
