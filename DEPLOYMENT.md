# 🚀 Railway Deployment Guide for Magical Story Teller Backend

## 📋 Step-by-Step Deployment

### Phase 1: GitHub Repository Setup (2 minutes)

1. **Create New GitHub Repository**:
   ```bash
   # Navigate to the Railway-ready backend directory
   cd /Users/kirangokal/Documents/whimzi-backend-railway
   
   # Initialize git repository
   git init
   git add .
   git commit -m "Initial commit: Railway-ready Magical Story Teller backend"
   ```

2. **Create GitHub Repository** (via GitHub web interface):
   - Go to https://github.com/new
   - Repository name: `magical-story-teller-backend`
   - Description: `Production backend API for Magical Story Teller iOS app`
   - Set to Public or Private (your choice)
   - **Do not** initialize with README (we already have one)
   - Click "Create repository"

3. **Push to GitHub**:
   ```bash
   # Add GitHub remote (replace YOUR_USERNAME with your GitHub username)
   git remote add origin https://github.com/YOUR_USERNAME/magical-story-teller-backend.git
   git branch -M main
   git push -u origin main
   ```

### Phase 2: Railway Deployment (3 minutes)

1. **Connect to Railway**:
   - Go to https://railway.app
   - Click "Start a New Project"
   - Select "Deploy from GitHub repo"
   - Choose your `magical-story-teller-backend` repository

2. **Configure Environment Variables** in Railway dashboard:
   ```
   OPENAI_API_KEY=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
   
   REPLICATE_API_TOKEN=r8_ej2AUinl7JraCSkBe5wN2gwT0S1IpnZ3G19mT
   
   ELEVENLABS_API_KEY=sk_8f16172b8ec14cc34b91bdb2c194b666ef26a40ad4e0d27c
   
   ELEVENLABS_VOICE_ID=8N2ng9i2uiUWqstgmWlH
   
   GOOGLE_APPLICATION_CREDENTIALS=./whimzivoicetales-8cd3df15c0b4.json
   ```

3. **Upload Google Cloud Credentials**:
   - In Railway dashboard, go to your project settings
   - Upload the `whimzivoicetales-8cd3df15c0b4.json` file
   - Ensure the path matches the environment variable

4. **Deploy**:
   - Railway will automatically detect the `nixpacks.toml` configuration
   - Build process will install dependencies and start the server
   - Monitor deployment logs for any issues

### Phase 3: Verify Deployment (1 minute)

1. **Test Health Endpoint**:
   ```bash
   # Replace YOUR-APP-NAME with your Railway app URL
   curl https://your-app-name.railway.app/api/health
   
   # Expected response:
   # {"status":"ok"}
   ```

2. **Test All Endpoints**:
   ```bash
   # Test transcription endpoint
   curl -X POST https://your-app-name.railway.app/api/transcribe \
     -F "audio=@test-audio.wav" \
     -F "language=en"
   
   # Test story generation
   curl -X POST https://your-app-name.railway.app/api/generate-story \
     -H "Content-Type: application/json" \
     -d '{"prompt":"A magical forest adventure","language":"English (US)","voiceName":"en-US-Studio-O","animationStyle":"Disney/Pixar 3D Animation"}'
   ```

### Phase 4: Update iOS App (2 minutes)

Update your iOS app's API endpoint in `WhimziAPIService.swift`:

```swift
// Old development endpoint
private let baseURL = "http://192.168.6.68:3001/api"

// New production endpoint (replace with your actual Railway URL)
private let baseURL = "https://your-app-name.railway.app/api"
```

## 🔍 Troubleshooting

### Common Issues:

1. **Build Failures**:
   - Check Node.js version in Railway logs
   - Verify all dependencies are in package.json
   - Ensure `"type": "module"` is set for ES modules

2. **Environment Variable Issues**:
   - Verify all required variables are set in Railway dashboard
   - Check Google Cloud credentials file path
   - Ensure API keys are valid and have sufficient quota

3. **API Endpoint Issues**:
   - Check Railway logs for error messages
   - Verify CORS is properly configured
   - Test health endpoint first

4. **TTS Issues**:
   - Verify Google Cloud credentials are uploaded correctly
   - Check Google Cloud TTS API is enabled
   - Test with simple text strings first

## 📊 Monitoring

Railway provides built-in monitoring:
- **Health Checks**: Automatic monitoring via `/api/health`
- **Logs**: Real-time application logs
- **Metrics**: CPU, memory, and network usage
- **Alerts**: Configurable notifications for issues

## 🔒 Security

Production-ready security features:
- Environment variables secured in Railway vault
- CORS configured for cross-origin requests
- Request validation and rate limiting
- Graceful error handling without exposing internals

## 📈 Performance

Optimized for production:
- Parallel image generation with staggered delays
- Request timeouts and retry logic
- Memory-efficient file handling
- Connection pooling for database operations

## 🌍 Global Deployment

Railway advantages:
- **Global CDN**: Automatic edge caching
- **Auto-scaling**: Scales based on demand
- **Zero-downtime**: Rolling deployments
- **SSL/TLS**: Automatic HTTPS certificates

Your backend is now ready for global production use! 🚀