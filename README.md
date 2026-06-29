# Sweet Sound Sync

这是一个通过“甜度目标 -> 音乐参数 -> 实时播放”来辅助控糖体验的项目。

## 1) 本地启动前端

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

打开 `http://127.0.0.1:5173/`。

## 2) 前端环境变量

项目根目录 `.env` 需要包含：

```env
VITE_SUPABASE_URL="https://<your-project-ref>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<your-anon-key>"
VITE_SPOTIFY_CLIENT_ID="<your-spotify-client-id>"
```

## 2b) Spotify Web Playback SDK（Curated Playlist 完整播放）

Spotify 模式支持 **Premium 账号** 在浏览器内播放完整歌曲（Web Playback SDK + PKCE 登录）。

1. 在 [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) 打开你的 App  
2. **Settings → Redirect URIs** 添加（与本地 dev 地址一致）：
   - `http://127.0.0.1:5173/spotify/callback`
   - `http://localhost:5173/spotify/callback`
3. 将 **Client ID** 写入 `.env` 的 `VITE_SPOTIFY_CLIENT_ID`（与 Supabase 里 `SPOTIFY_CLIENT_ID` 相同即可，**不要把 Client Secret 写进前端**）  
4. Supabase Edge Function 仍使用 `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` 做推荐；用户登录 Premium 后由 SDK 播放完整曲目  

**使用流程：** Experience → Curated Playlist → Session → **Connect Spotify Premium** → 授权 → Start Drinking

未登录或非 Premium 时，会回退到 30 秒预览或环境音。

## 3) 配置 AI 音乐生成 API（Supabase Edge Function Secrets）

本项目 `generate-music` 默认对接 Stability AI 音乐接口。

先登录并绑定项目：

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

设置密钥：

```bash
supabase secrets set STABILITY_API_KEY=<your-stability-key>
```

可选项（不设置也可）：

```bash
supabase secrets set STABILITY_AUDIO_URL=https://api.stability.ai/v2beta/audio/stable-audio-2/text-to-audio
supabase secrets set STABILITY_AUDIO_OUTPUT_FORMAT=mp3
```

## 4) 部署云函数

```bash
supabase functions deploy parse-music
supabase functions deploy generate-music
supabase functions deploy spotify-recommend
```

## 5) 联调与验证

1. 在体验页面选择 `AI Music` 模式进入会话；  
2. 观察提示由 `Generating AI audio track...` 变为 `AI track is ready...`；  
3. 点击 `Start Drinking` 后应能播放 AI 生成音频；  
4. 若失败会回退到环境音并提示具体原因（函数不可达、API 报错、密钥未配置等）。

## 7) 生产部署（Vercel — 手机长期访问）

**线上地址：** https://sweet-sound-sync-main.vercel.app

### 首次 / 更新部署

```bash
npm run deploy
# 或
npx vercel deploy --prod
```

环境变量已在 Vercel 项目 `sweet-sound-sync-main` 中配置（`VITE_SUPABASE_*`、`VITE_SPOTIFY_CLIENT_ID`）。修改 `.env` 后需重新执行 `vercel env add ...` 并 `vercel deploy --prod`。

### Spotify Redirect URI（生产环境必加）

在 [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → App → Settings → Redirect URIs 添加：

```
https://sweet-sound-sync-main.vercel.app/spotify/callback
```

保存后等 1–2 分钟。手机浏览器直接打开上述 HTTPS 链接即可使用（Spotify Premium + Connect + Enable player）。

---

## 8) 常见问题

- `STABILITY_API_KEY not configured`  
  说明没设置 secrets，执行第 3 步后重新部署。

- `Cannot reach AI music function`  
  常见于函数未部署、项目 ref 不一致或网络问题。

- AI 生成成功但无法自动播  
  某些浏览器会拦截自动播放，先与页面交互（点击开始按钮）后再试。
