
# DokumAI

Telegram AI Document Assistant powered by Gemini.

## Features

- PDF document reading
- DOCX document reading
- Automatic document summaries
- Document-based question answering
- Detailed answers
- Per-user document sessions
- Supabase document storage

## Architecture

Telegram -> Vercel -> Cloudflare Worker -> Gemini

Supabase handles database and private file storage.

## Deployment

1. Push this repository to GitHub.
2. Import the repository into Vercel.
3. Add all required environment variables.
4. Deploy the project.
5. Configure the Telegram webhook.

## API Endpoint

POST /api/telegram

## Supported Documents

- PDF
- DOCX

Maximum Telegram document size: 20 MB.

Scanned PDFs require OCR and are not supported in this initial version.
