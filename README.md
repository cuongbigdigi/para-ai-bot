# 🤖 Sumo AI Bot v22 — Telegram Bot CS

> Telegram Bot hỗ trợ vận hành Hệ thống Chuyển đổi (CS)
> Platform: **Supabase Edge Function** (Deno) | AI: **Gemini 2.5 Flash**
> Project: `ihplowkjbyzoahrcriuo`

## Tính năng

- **PARA Content Router** — Gửi nội dung → AI phân loại → xác nhận → lưu Notion
- **Notion Integration** — Clients, Projects, Tasks, Meeting Notes, Deliverables, Resources
- **NotebookLM** — Query knowledge base (cached Supabase)
- **15 CS Skills** — Business Scan → Scale Up + Ads Stack
- **AI Chat** — Gemini 2.5 Flash, function calling, multi-turn

## Lệnh

| Lệnh | Mô tả |
|---|---|
| `/start` | Khởi động bot |
| `/pr` | PARA Router |
| `/ps` | PARA Dashboard |
| `/cs` | CS 3 Pha × 9 GĐ |
| `/skills` | 15 skills CS |
| `/clients` | Danh sách clients |
| `/projects` | Danh sách projects |
| `/notebooks` | NotebookLM |
| `/clear` | Xóa chat history |
| `/stop` | Dừng skill |
| `/<skill-id>` | Chạy skill (VD: `/business-scan`) |

## Kỹ thuật

- **Runtime:** Supabase Edge Function (Deno)
- **AI:** Gemini 2.5 Flash + function calling (14 tools)
- **Auth:** Whitelist `telegram_allowed_users`
- **DB:** Supabase (chat_history, skills, sessions, notebooks)
- **Notion:** 6 databases (Clients, Projects, Tasks, Meeting Notes, Deliverables, Resources)

## Env Variables (Supabase Secrets)

```
TELEGRAM_BOT_TOKEN
GEMINI_API_KEY
NOTION_API_KEY
SUPABASE_URL          # auto
SUPABASE_SERVICE_ROLE_KEY  # auto
```

## Deploy

```bash
# Via Supabase MCP or CLI
supabase functions deploy telegram-bot --project-ref ihplowkjbyzoahrcriuo --no-verify-jwt
```

## Changelog

| Version | Ngày | Thay đổi |
|---------|------|----------|
| v22 | 18/03/2026 | Fix Gemini tool-response, debug logging, emoji escape |
| v20 | 17/03/2026 | PARA confirm UX, `/pr` shortcut, Notion URL fix |
| v13 | 16/03/2026 | PARA Router, NotebookLM, 15 Skills, Notion URLs |
