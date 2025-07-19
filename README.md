# 🚀 Magical Story Teller Backend for Railway

This is the production-ready backend API for the **Magical Story Teller** iOS app, optimized for Railway deployment.

## 🌟 Features

- **Voice Transcription**: OpenAI Whisper API for multilingual speech-to-text
- **Story Generation**: GPT-4 for creating magical children's stories in 50+ languages
- **Image Generation**: DALL-E 3 for culturally-appropriate illustrations
- **Text-to-Speech**: Google Cloud TTS with Studio voices for high-quality narration
- **Multicultural Support**: 50+ languages and animation styles

## 📚 API Endpoints

- `GET /api/health` - Health check
- `POST /api/transcribe` - Convert audio to text (supports 50+ languages)
- `POST /api/generate-story` - Generate 5-frame magical story
- `POST /api/generate-image` - Generate culturally-appropriate illustrations
- `POST /api/tts` - High-quality text-to-speech synthesis

## 🔧 Environment Variables Required

Set these in Railway dashboard:

```bash
OPENAI_API_KEY=your_openai_api_key
REPLICATE_API_TOKEN=your_replicate_token
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=voice_id_for_fallback
GOOGLE_APPLICATION_CREDENTIALS=./whimzivoicetales-8cd3df15c0b4.json
```

## 🚀 Railway Deployment

1. **Connect Repository**: Link this repository to Railway
2. **Configure Environment Variables**: Set the above variables in Railway dashboard
3. **Deploy**: Railway will automatically detect and deploy using `nixpacks.toml`

## 📱 iOS App Integration

Update your iOS app's API endpoint from:
```swift
// Old development endpoint
let baseURL = "http://192.168.6.68:3001/api"

// New production endpoint
let baseURL = "https://your-railway-app.railway.app/api"
```

## 🔒 Security Features

- CORS enabled for cross-origin requests
- Request validation and error handling
- File size limits for audio uploads (25MB max)
- Timeout protection for long-running requests

## 🌍 Multicultural Features

- **50+ Languages**: Complete story generation in user's native language
- **Cultural Animation Styles**: Disney/Pixar, Studio Ghibli, Anime, Regional styles
- **Culturally Appropriate Content**: Stories and images respect cultural elements
- **Professional TTS**: Google Cloud Studio voices for natural speech

## 📊 Performance

- **Parallel Processing**: Images generated concurrently with staggered delays
- **Rate Limiting**: Respects OpenAI and Google Cloud API limits
- **Fallback Systems**: Graceful degradation with placeholder content
- **Health Monitoring**: Built-in health checks for Railway monitoring

## 🛠️ Technical Stack

- **Runtime**: Node.js 18+
- **Framework**: Express 5
- **APIs**: OpenAI GPT-4, DALL-E 3, Whisper; Google Cloud TTS
- **Deployment**: Railway with Nixpacks
- **File Handling**: Multer for audio uploads