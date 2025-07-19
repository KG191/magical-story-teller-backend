// Load environment variables
import 'dotenv/config';

// Debug environment variables for Railway
console.log('🔍 Environment check:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing');
console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Check Google Cloud credentials configuration
if (process.env.GOOGLE_CLOUD_CREDENTIALS_JSON) {
  console.log('Google Cloud credentials: ✅ JSON environment variable found');
  // Write JSON credentials to temporary file for Google Cloud client
  import { writeFileSync } from 'fs';
  const credentialsPath = '/tmp/google-credentials.json';
  writeFileSync(credentialsPath, process.env.GOOGLE_CLOUD_CREDENTIALS_JSON);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.log('Google Cloud credentials: ✅ File path configured');
  import { existsSync } from 'fs';
  console.log('Credentials file exists:', existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS) ? '✅ Found' : '❌ Missing');
} else {
  console.log('Google Cloud credentials: ❌ Not configured');
}
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import bodyParser from 'body-parser';
import { OpenAI } from 'openai';
import Replicate from 'replicate';
import axios from 'axios';

const app = express();
const upload = multer();

// Initialize API clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

app.use(cors());
app.use(bodyParser.json());

// Health check endpoints
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Transcribe audio endpoint
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  // Extract language parameter if provided
  const language = req.body?.language || 'en';
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    console.log('Transcription request received:', {
      fileName: req.file.originalname || 'unknown',
      fileSize: req.file.size,
      fileType: req.file.mimetype
    });

    // Enhanced file validation
    if (!req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: 'Empty audio file' });
    }
    
    // Validate file size
    if (req.file.size > 25 * 1024 * 1024) {
      return res.status(413).json({ error: 'Audio file too large (max 25MB)' });
    }
    
    // Validate content type
    const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/m4a', 'audio/mp4', 'audio/webm', 'audio/ogg'];
    if (req.file.mimetype && !validTypes.includes(req.file.mimetype)) {
      console.warn(`Unsupported mime type: ${req.file.mimetype}, but proceeding anyway`);
    }

    // Set a timeout for the OpenAI request (90 seconds - reduced from 120)
    const timeoutMs = 90000; // 90 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('Manually aborting request due to timeout');
      controller.abort();
    }, timeoutMs);

    try {
      // Create a buffer with reduced size if needed (max 3MB)
      let processingBuffer = req.file.buffer;
      const maxBufferSize = 3 * 1024 * 1024; // 3MB max for faster processing
      
      if (processingBuffer.length > maxBufferSize) {
        console.log(`Audio file too large (${processingBuffer.length} bytes), optimizing for faster processing`);
        // We'll still send the full file, but log that it's large
        console.log('Large file may cause longer processing times');
      }

      console.log('Sending request to OpenAI Whisper API...');
      const startTime = Date.now();
      
      // Create a file object from the buffer
      const fs = await import('fs');
      const path = await import('path');
      
      // Create temp directory if it doesn't exist
      const tempDir = path.resolve('./temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Determine extension based on mimetype so Whisper gets a matching file type
      const mime = req.file.mimetype || '';
      const isWebm = mime.includes('webm');
      const isM4a  = mime.includes('m4a') || mime.includes('mp4'); // iOS recorder produces m4a/mp4
      const extension = isWebm ? 'webm' : (isM4a ? 'mp4' : 'wav');
      const tempFilePath = path.join(tempDir, `audio-${Date.now()}.${extension}`);
      fs.writeFileSync(tempFilePath, processingBuffer);
      
      console.log(`Transcribing audio with language parameter: ${language}`);  
      const transcript = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1',
        language: language,
        response_format: 'text'
      }, {
        signal: controller.signal,
        timeout: timeoutMs
      });
      
      // Clean up the temp file
      try {
        fs.unlinkSync(tempFilePath);
        console.log("Temp file removed:", tempFilePath);
      } catch (err) {
        console.log("Error removing temp file:", err);
      }
      
      const processingTime = (Date.now() - startTime) / 1000;
      
      // Clear the timeout since the request completed
      clearTimeout(timeoutId);
      
      console.log(`Transcription successful, length: ${transcript.length}, processing time: ${processingTime.toFixed(2)}s`);
      res.json({ text: transcript });
    } catch (apiError) {
      clearTimeout(timeoutId);
      
      if (apiError.name === 'AbortError' || apiError.code === 'ETIMEDOUT' || apiError.code === 'ECONNABORTED') {
        console.error('OpenAI request timed out after', timeoutMs/1000, 'seconds');
        return res.status(504).json({ 
          error: 'Transcription request timed out',
          message: 'Try recording a shorter audio segment or try again later'
        });
      }
      
      // Check for specific OpenAI error types
      const errorMessage = apiError.message || 'Unknown error';
      console.error('OpenAI API error:', {
        message: errorMessage,
        type: apiError.type,
        code: apiError.status || apiError.code,
        stack: apiError.stack
      });
      
      // Handle different error types
      if (apiError.status === 401) {
        return res.status(401).json({ error: 'API key is invalid or expired' });
      } else if (apiError.status === 429) {
        return res.status(429).json({ error: 'Rate limit exceeded or insufficient quota' });
      } else if (apiError.status === 400) {
        return res.status(400).json({ error: 'Bad request: ' + errorMessage });
      } else if (apiError.status === 500) {
        return res.status(500).json({ error: 'OpenAI server error', details: errorMessage });
      }
      
      res.status(500).json({ error: 'Failed to transcribe audio', details: errorMessage });
    }
  } catch (error) {
    console.error('Server error processing transcription request:', error);
    res.status(500).json({ 
      error: 'Server error processing request',
      message: error.message || 'Unknown server error' 
    });
  }
});

// Generate story endpoint
app.post('/api/generate-story', async (req, res) => {
  try {
    const text = req.body?.prompt || req.body?.text || '';
    const language = req.body?.language || 'English (US)';
    const voiceName = req.body?.voiceName || 'en-US-Standard-C';
    const animationStyle = req.body?.animationStyle || 'Disney/Pixar 3D Animation';
    
    // Enhanced logging for multilingual parameters
    console.log('📝 STORY GENERATION REQUEST:');
    console.log(`📋 Language: ${language}`);
    console.log(`🔊 TTS Voice: ${voiceName}`);
    console.log(`🎨 Animation Style: ${animationStyle}`);
    console.log(`📄 Prompt length: ${text.length} characters`);
    
    console.log(`Generating story in ${language} with voice ${voiceName} and style ${animationStyle}`);
    
    // Get language code for GPT prompt (e.g., 'English (US)' -> 'English')
    const languageCode = getLanguageCodeFromName(language);
    
    // Enhanced story generation with translation support
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a multilingual children's story writer. Your task is to:
1. Take the user's input (which may be in any language)
2. Convert it into a 5-frame story suitable for children
3. Write the final story in ${languageCode} language
4. If the input is in a different language than ${languageCode}, translate it naturally while maintaining the story's essence
5. Make the story whimsical and magical with cultural elements appropriate for ${language} speakers
6. Each frame should be a key moment in the story

Format your response as 5 separate paragraphs, each representing one frame of the story.`
        },
        {
          role: 'user',
          content: `Please create a children's story in ${languageCode} based on this input: "${text}"`
        }
      ],
      temperature: 0.7,
      max_tokens: 1500  // Increased for translation needs
    });

    const storyText = completion.choices[0].message.content;
    // Process the response to match the Next.js API format
    const frames = storyText.split('\n\n')
      .filter(Boolean)
      .map((frame, index) => ({
        id: index + 1,
        text: frame.replace(/^\d+[\.\)]\s*/, '').trim()
      }));

    // Generate images for each frame
    console.log(`Generating images for ${frames.length} frames...`);
    
    // ⚡ OPTIMIZED: Controlled parallel processing to respect rate limits while improving speed
    const imagePromises = frames.map(async (frame, i) => {
      // Add staggered delay to respect OpenAI rate limits (2 seconds between requests)
      await new Promise(resolve => setTimeout(resolve, i * 2000));
      
      try {
        // Clean the text for better prompts (remove "Frame X:" prefix)
        let cleanText = frame.text;
        if (cleanText.startsWith(`Frame ${i+1}:`)) {
          cleanText = cleanText.substring(`Frame ${i+1}:`.length).trim();
        }
        
        // Create a style-appropriate prompt for the image based on selected animation style
        const imagePrompt = generateStyledPrompt(cleanText, animationStyle, language);
        console.log(`🚀 Generating image for frame ${i+1}/${frames.length} with style ${animationStyle}: ${imagePrompt.substring(0, 50)}...`);
        
        // Call our own image generation endpoint directly
        try {
          console.log('Generating image with DALL-E 3 for prompt:', imagePrompt.substring(0, 100) + '...');
          
          // Generate styled image using DALL-E 3 based on selected animation style
          const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: imagePrompt,
            size: "1024x1024",
            quality: "standard",
            n: 1,
            style: "vivid", // Vivid style works better for animated/illustrated looks
          });
          
          // Extract the image URL from the response with better validation
          const imageUrl = response.data && response.data[0] && response.data[0].url;
          
          if (imageUrl && typeof imageUrl === 'string') {
            console.log(`✅ Image generated for frame ${i+1}: ${imageUrl.substring(0, 50)}...`);
            return { index: i, imageURL: imageUrl }; // Return with index for correct assignment
          } else {
            console.warn(`No valid URL in DALL-E response for frame ${i+1}, using fallback image`);
            
            // Create a scene-specific fallback image
            const sceneType = determineSceneType(cleanText);
            const sceneTitle = sceneType.charAt(0).toUpperCase() + sceneType.slice(1);
            let bgColor = "9C89B8"; // Default purple
            
            // Create a context-aware placeholder with text from the prompt
            const safePrompt = encodeURIComponent(typeof cleanText === 'string' ? cleanText.substring(0, 60).trim() : 'Story Scene');
            const placeholderUrl = `https://placehold.co/1024x1024/${bgColor}/FFFFFF?text=Ghibli+${sceneTitle}:+${safePrompt}`;
            return { index: i, imageURL: placeholderUrl };
          }
        } catch (imageGenError) {
          console.error(`Error generating image for frame ${i+1}:`, imageGenError);
          
          // Create a fallback image
          const placeholderUrl = `https://placehold.co/1024x1024/9C89B8/FFFFFF?text=Magical+Story+Scene+${i+1}`;
          return { index: i, imageURL: placeholderUrl };
        }
      } catch (imageError) {
        console.error(`Error in image generation process for frame ${i+1}:`, imageError);
        // Return fallback for this frame
        return { index: i, imageURL: `https://placehold.co/1024x1024/9C89B8/FFFFFF?text=Story+Scene+${i+1}` };
      }
    });
    
    // ⚡ OPTIMIZED: Wait for all images to complete and assign them to frames
    try {
      const imageResults = await Promise.all(imagePromises);
      
      // Assign image URLs to frames based on their index
      imageResults.forEach(result => {
        if (result && result.index !== undefined && result.imageURL) {
          frames[result.index].imageURL = result.imageURL;
        }
      });
      
      console.log(`✅ All ${frames.length} images generated successfully using parallel processing`);
    } catch (parallelError) {
      console.error('Error in parallel image generation:', parallelError);
      // Continue with any frames that might have succeeded
      console.log('Continuing with available frames...');
    }

    // Create a title based on the first frame's text
    const title = frames.length > 0 ? 
      frames[0].text.split('.')[0].trim() : 
      'Magical Story';
    
    // Return complete story object with all metadata
    res.json({
      title,
      frames,
      language,
      ttsVoiceName: voiceName,
      animationStyle
    });
  } catch (error) {
    console.error('Story generation error:', error);
    res.status(500).json({ error: 'Failed to generate story' });
  }
});

// Generate image endpoint
app.post('/api/generate-image', async (req, res) => {
  try {
    const promptText = req.body?.prompt || '';
    const language = req.body?.language || 'English (US)';
    const animationStyle = req.body?.animationStyle || 'Disney/Pixar 3D Animation';
    
    console.log(`Generating image with style ${animationStyle} for language ${language}`);
    
    // Create an enhanced prompt with richer characters and backgrounds based on style and language
    const enhancedPrompt = generateStyledPrompt(promptText, animationStyle, language);
    
    try {
      console.log('Generating image with DALL-E 3 for prompt:', enhancedPrompt.substring(0, 100) + '...');
      
      // Generate styled image using DALL-E 3
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: enhancedPrompt,
        size: "1024x1024",
        quality: "standard",
        n: 1,
        style: "vivid", // Vivid style works better for animated/illustrated looks
      });
      
      // Log the full response structure for debugging
      console.log('Full DALL-E response structure:', JSON.stringify(response, null, 2));
      
      // Extract the image URL from the response with better validation
      const imageUrl = response.data && response.data[0] && response.data[0].url;
      
      // Log more detailed information about the response structure
      console.log('Image URL type:', typeof imageUrl);
      console.log('Image URL value:', imageUrl);
      
      // Verify we have a valid URL before returning success
      if (!imageUrl || typeof imageUrl !== 'string') {
        console.warn('No valid URL in DALL-E response, using fallback image');
        
        // Create a scene-specific fallback image
        const sceneType = determineSceneType(promptText);
        const sceneTitle = sceneType.charAt(0).toUpperCase() + sceneType.slice(1);
        let bgColor;
        
        // Set colors based on scene type
        switch(sceneType) {
          case "forest": bgColor = "8BC34A"; break; // Green
          case "sky": bgColor = "64B5F6"; break; // Blue
          case "town": bgColor = "E57373"; break; // Red/pink
          case "home": bgColor = "FFB74D"; break; // Orange
          case "water": bgColor = "4DD0E1"; break; // Cyan
          default: bgColor = "9C89B8"; // Purple for magical scenes
        }
        
        // Create a context-aware placeholder with text from the prompt
        const safePrompt = encodeURIComponent(typeof promptText === 'string' ? promptText.substring(0, 60).trim() : 'Story Scene');
        const placeholderUrl = `https://placehold.co/1024x1024/${bgColor}/FFFFFF?text=Ghibli+${sceneTitle}:+${safePrompt}`;
        
        return res.json({ 
          imageUrl: placeholderUrl,
          success: false,
          message: "Generated fallback image - OpenAI didn't return a valid URL" 
        });
      }
      
      // Log success for monitoring
      console.log('Successfully generated DALL-E image. URL starts with:', imageUrl.substring(0, 30) + '...');
      
      // CRITICAL FIX: Return ONLY the image URL as a string, not an object
      // This matches what the client code expects from storyService.ts
      return res.json(imageUrl);
    } catch (apiError) {
      console.error('Image generation error:', apiError);
      
      // Create a scene-specific fallback image
      const sceneType = determineSceneType(promptText);
      let bgColor;
      
      // Set colors based on scene type
      switch(sceneType) {
        case "forest": bgColor = "8BC34A"; break; // Green
        case "sky": bgColor = "64B5F6"; break; // Blue
        case "town": bgColor = "E57373"; break; // Red/pink
        case "home": bgColor = "FFB74D"; break; // Orange
        case "water": bgColor = "4DD0E1"; break; // Cyan
        default: bgColor = "9C89B8"; // Purple for magical scenes
      }
      
      // Create a scene-specific title
      const sceneTitle = sceneType.charAt(0).toUpperCase() + sceneType.slice(1);
      
      // Create a context-aware placeholder with text from the prompt
      const safePrompt = encodeURIComponent(typeof promptText === 'string' ? promptText.substring(0, 60).trim() : 'Story Scene');
      const placeholderUrl = `https://placehold.co/1024x1024/${bgColor}/FFFFFF?text=Ghibli+${sceneTitle}:+${safePrompt}`;
      
      res.json({ 
        imageUrl: placeholderUrl,
        message: "Using placeholder image (OpenAI API error - check your API key or billing)" 
      });
    }
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

// Google Cloud TTS endpoint
app.post('/api/tts', async (req, res) => {
  try {
    console.log('Google Cloud TTS endpoint called');
    const { text, languageCode = 'en-US', voiceName = 'en-US-Studio-O' } = req.body || {};
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for TTS' });
    }

    // Use the pre-imported TextToSpeechClient from the top of the file
    // The Google Cloud TTS client should be initialized at the top of the file
    // We'll use dynamic import for ES modules compatibility
    const { TextToSpeechClient } = await import('@google-cloud/text-to-speech');
    
    // Create a client
    const client = new TextToSpeechClient();
    
    // Normalize language code to match voice requirements
    // Google Cloud TTS requires exact match between languageCode and voice language
    // Extract language code from voice name (e.g., 'en-US-Studio-O' -> 'en-US')
    const normalizedLanguageCode = voiceName ? voiceName.split('-').slice(0, 2).join('-') : 'en-US';
    
    console.log(`Synthesizing speech for text: "${text.substring(0, 50)}..."`);
    console.log(`Using voice: ${voiceName}, normalized language: ${normalizedLanguageCode} (original: ${languageCode})`);

    // Build the request with normalized language code
    const request = {
      input: { text },
      voice: {
        languageCode: normalizedLanguageCode, // Use normalized language code
        name: voiceName,
      },
      audioConfig: { audioEncoding: 'MP3' },
    };

    // Perform the text-to-speech request
    const [response] = await client.synthesizeSpeech(request);
    
    if (!response || !response.audioContent) {
      console.error('Google TTS returned no audio content');
      return res.status(502).json({ error: 'Google TTS returned no audio' });
    }

    // Send the audio as a response with the appropriate headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(response.audioContent));
    
    console.log('Successfully generated audio with Google Cloud TTS');
  } catch (err) {
    console.error('Google Cloud TTS error:', err);
    res.status(500).json({ error: 'Failed to generate speech' });
  }
});

// Function to generate styled prompts based on animation style and language
function generateStyledPrompt(storyText, animationStyle, language) {
  // Extract scene type from story text for context-appropriate backgrounds
  const sceneType = determineSceneType(storyText);
  
  // Get cultural elements based on language
  const culturalElements = getCulturalElements(language);
  
  // Base style description based on animation style
  let baseStyle = "";
  let characterStyle = "";
  
  switch(animationStyle) {
    case "Disney/Pixar 3D Animation":
      baseStyle = "Disney/Pixar 3D animation style, vibrant colors, soft lighting";
      characterStyle = "with expressive characters featuring big eyes, detailed textures, and fluid movements";
      break;
    case "Japanese Anime":
    case "Anime (Ghibli, Toei)":
      baseStyle = "Japanese anime style, vibrant colors, dynamic composition, detailed backgrounds";
      characterStyle = "with characters featuring large expressive eyes, stylized proportions, and emotional expressions";
      break;
    case "Studio Ghibli":
      baseStyle = "Studio Ghibli anime style, hand-drawn, watercolor textures, soft lighting";
      characterStyle = "with whimsical characters featuring large expressive eyes, simple but emotive facial features";
      break;
    case "European Fairy Tale":
      baseStyle = "Classic European fairy tale illustration style, rich colors, detailed artwork, storybook quality";
      characterStyle = "with characters featuring traditional fairy tale designs, elegant proportions, and classic attire";
      break;
    case "Claymation":
    case "Aardman Stop-motion":
      baseStyle = "Claymation stop-motion style, textured surfaces, warm lighting, handcrafted appearance";
      characterStyle = "with characters featuring rounded shapes, visible texture, and charming imperfections";
      break;
    case "Franco-Belgian Comics/Cartoons":
      baseStyle = "Franco-Belgian comic book style, clean lines, bright colors, European illustration";
      characterStyle = "with characters featuring expressive faces, dynamic poses, and European comic aesthetics";
      break;
    case "Bollywood Animation":
      baseStyle = "Bollywood animation style, vibrant colors, ornate details, Indian cultural elements";
      characterStyle = "with characters featuring traditional Indian clothing, expressive eyes, and colorful designs";
      break;
    case "Donghua (Chinese anime)":
      baseStyle = "Chinese donghua animation style, elegant lines, traditional elements, soft colors";
      characterStyle = "with characters featuring graceful movements, traditional elements, and Chinese aesthetic principles";
      break;
    case "K-animation, Webtoons":
      baseStyle = "Korean animation style, modern aesthetics, clean lines, contemporary colors";
      characterStyle = "with characters featuring modern Korean design, expressive features, and K-pop inspired elements";
      break;
    case "Arabic 2D Cartoons (Freej, Mansour)":
      baseStyle = "Arabic 2D cartoon style, bright colors, Middle Eastern elements, traditional motifs";
      characterStyle = "with characters featuring traditional Arabic clothing, expressive eyes, and Middle Eastern cultural elements";
      break;
    case "Gujarati Folk Animation":
      baseStyle = "Gujarati folk animation style, traditional Indian elements, bright colors, cultural motifs";
      characterStyle = "with characters featuring traditional Gujarati clothing, folk art elements, and Indian cultural aesthetics";
      break;
    case "Brazilian Animation":
      baseStyle = "Brazilian animation style, tropical colors, vibrant aesthetics, Latin American elements";
      characterStyle = "with characters featuring colorful clothing, expressive features, and Brazilian cultural elements";
      break;
    case "Australian TV Animation":
      baseStyle = "Australian TV animation style, bright colors, outback elements, Australian cultural references";
      characterStyle = "with characters featuring Australian aesthetics, outdoor elements, and local cultural references";
      break;
    case "Indian TV Animation":
      baseStyle = "Indian TV animation style, vibrant colors, traditional elements, Indian cultural motifs";
      characterStyle = "with characters featuring traditional Indian clothing, expressive eyes, and Indian cultural elements";
      break;
    case "Tamil TV Animation":
    case "Telugu TV Animation":
    case "Malayalam TV Animation":
    case "Marathi TV Animation":
    case "Kannada TV Animation":
    case "Bengali TV Animation":
    case "Punjabi TV Animation":
      baseStyle = "Indian regional TV animation style, vibrant colors, traditional elements, cultural motifs";
      characterStyle = "with characters featuring regional traditional clothing, expressive features, and local cultural elements";
      break;
    case "Spanish-language Animation":
      baseStyle = "Spanish animation style, warm colors, Mediterranean elements, Spanish cultural references";
      characterStyle = "with characters featuring Spanish aesthetics, traditional elements, and Iberian cultural motifs";
      break;
    case "Classic German Animation":
      baseStyle = "Classic German animation style, fairy tale elements, traditional European aesthetics";
      characterStyle = "with characters featuring Germanic design elements, traditional clothing, and fairy tale aesthetics";
      break;
    case "Finnish Animation (Moomins)":
      baseStyle = "Finnish animation style, Nordic elements, soft colors, Scandinavian aesthetics";
      characterStyle = "with characters featuring Nordic design, natural elements, and Scandinavian cultural references";
      break;
    case "Czech Stop-motion":
      baseStyle = "Czech stop-motion style, handcrafted appearance, Eastern European elements";
      characterStyle = "with characters featuring stop-motion textures, traditional elements, and Czech cultural motifs";
      break;
    case "Soviet/Russian Animation":
      baseStyle = "Soviet/Russian animation style, traditional elements, folk art influences";
      characterStyle = "with characters featuring Russian folk elements, traditional clothing, and Slavic cultural motifs";
      break;
    case "Polish Animated Films":
      baseStyle = "Polish animation style, traditional elements, Eastern European aesthetics";
      characterStyle = "with characters featuring Polish cultural elements, traditional clothing, and regional motifs";
      break;
    case "Hungarian Animated Films":
      baseStyle = "Hungarian animation style, Central European elements, traditional motifs";
      characterStyle = "with characters featuring Hungarian cultural elements, traditional designs, and regional aesthetics";
      break;
    case "Thai Animated Films":
      baseStyle = "Thai animation style, Southeast Asian elements, Buddhist influences, tropical colors";
      characterStyle = "with characters featuring Thai traditional clothing, temple elements, and Southeast Asian cultural motifs";
      break;
    case "Vietnamese Animated Films":
      baseStyle = "Vietnamese animation style, Southeast Asian elements, traditional motifs, tropical aesthetics";
      characterStyle = "with characters featuring Vietnamese cultural elements, traditional clothing, and regional designs";
      break;
    case "Turkish Animated Films":
      baseStyle = "Turkish animation style, Middle Eastern elements, Ottoman influences, rich colors";
      characterStyle = "with characters featuring Turkish cultural elements, traditional clothing, and Anatolian motifs";
      break;
    case "Israeli Animation":
      baseStyle = "Israeli animation style, Middle Eastern elements, modern aesthetics, Mediterranean influences";
      characterStyle = "with characters featuring Israeli cultural elements, diverse backgrounds, and Middle Eastern motifs";
      break;
    case "Hong Kong Animated Films":
      baseStyle = "Hong Kong animation style, urban elements, Chinese cultural influences, modern aesthetics";
      characterStyle = "with characters featuring Hong Kong cultural elements, urban backgrounds, and Cantonese cultural motifs";
      break;
    case "Indonesian Animated Films":
      baseStyle = "Indonesian animation style, tropical elements, archipelago influences, Southeast Asian motifs";
      characterStyle = "with characters featuring Indonesian cultural elements, traditional clothing, and island aesthetics";
      break;
    case "Malaysian Animated Films":
      baseStyle = "Malaysian animation style, tropical elements, multicultural influences, Southeast Asian aesthetics";
      characterStyle = "with characters featuring Malaysian cultural elements, diverse backgrounds, and regional motifs";
      break;
    case "Filipino Animated Films":
      baseStyle = "Filipino animation style, tropical elements, island influences, Southeast Asian motifs";
      characterStyle = "with characters featuring Filipino cultural elements, traditional clothing, and archipelago aesthetics";
      break;
    default:
      // For any unrecognized animation style, use a generic but high-quality approach
      baseStyle = "High-quality animation style, vibrant colors, detailed artwork, professional animation";
      characterStyle = "with expressive characters featuring detailed features, appropriate cultural elements, and engaging aesthetics";
  }
  
  // Background styling based on scene type
  let backgroundStyle = "";
  
  if (sceneType.includes("forest") || sceneType.includes("nature")) {
    backgroundStyle = `lush detailed forest background with ${culturalElements.nature} elements, magical vegetation`;
  } else if (sceneType.includes("sky") || sceneType.includes("flying")) {
    backgroundStyle = `expansive cloud-filled sky, ${culturalElements.sky} features, distant views`;
  } else if (sceneType.includes("town") || sceneType.includes("village")) {
    backgroundStyle = `charming ${culturalElements.architecture} inspired village, ${culturalElements.buildings} details`;
  } else if (sceneType.includes("home") || sceneType.includes("inside")) {
    backgroundStyle = `cozy ${culturalElements.interior} interior, ${culturalElements.decor} elements, warm lighting`;
  } else if (sceneType.includes("water") || sceneType.includes("ocean") || sceneType.includes("sea")) {
    backgroundStyle = `shimmering water reflections, ${culturalElements.water} elements, gentle waves`;
  } else {
    // Default magical landscape
    backgroundStyle = `${culturalElements.landscape} landscape, ${culturalElements.features} features`;
  }
  
  // Lighting and color palette
  const atmosphereStyle = "soft color palette, diffused lighting, magical atmosphere, painterly quality";
  
  // Combine all elements with the original story prompt
  return `${baseStyle}, ${characterStyle}, ${backgroundStyle}, ${atmosphereStyle}, child-friendly magical scene with ${culturalElements.cultural} elements: ${storyText}`;
}

// Function to get cultural elements based on language
function getCulturalElements(language) {
  switch(language) {
    case "English (US)":
      return {
        nature: "North American wilderness",
        sky: "vast open American",
        architecture: "modern American suburban",
        buildings: "contemporary neighborhood",
        interior: "American home",
        decor: "modern comfortable",
        water: "American lakes and rivers",
        landscape: "rolling American countryside",
        features: "diverse natural",
        cultural: "American"
      };
    case "Spanish (Spain)":
      return {
        nature: "Mediterranean",
        sky: "Spanish coastal",
        architecture: "Spanish Mediterranean",
        buildings: "terracotta roofs and stucco walls",
        interior: "Spanish villa",
        decor: "terracotta and blue tile",
        water: "Mediterranean Sea",
        landscape: "Spanish countryside with olive groves",
        features: "rolling hills and vineyards",
        cultural: "Spanish flamenco and festival"
      };
    case "French (France)":
      return {
        nature: "French countryside",
        sky: "Parisian",
        architecture: "French provincial",
        buildings: "Parisian apartments and cafes",
        interior: "French chateau",
        decor: "elegant French provincial",
        water: "Seine river",
        landscape: "French countryside with lavender fields",
        features: "vineyards and chateaus",
        cultural: "French artistic and cafe"
      };
    case "Japanese (Japan)":
      return {
        nature: "Japanese garden",
        sky: "Mount Fuji backdrop",
        architecture: "traditional Japanese",
        buildings: "pagodas and torii gates",
        interior: "traditional Japanese",
        decor: "tatami mats and shoji screens",
        water: "koi ponds and gentle streams",
        landscape: "Japanese mountainside with cherry blossoms",
        features: "zen gardens and stone paths",
        cultural: "kimono and festival"
      };
    case "Hindi (India)":
      return {
        nature: "Indian tropical",
        sky: "monsoon clouds and bright sun",
        architecture: "Indian palace",
        buildings: "colorful facades and ornate details",
        interior: "Indian home",
        decor: "colorful textiles and ornate patterns",
        water: "sacred rivers",
        landscape: "vibrant Indian countryside",
        features: "ancient temples and colorful markets",
        cultural: "festival and traditional clothing"
      };
    case "Arabic (Various)":
      return {
        nature: "desert oasis",
        sky: "desert sunset",
        architecture: "Middle Eastern",
        buildings: "domes and intricate geometric patterns",
        interior: "Middle Eastern palace",
        decor: "ornate rugs and lanterns",
        water: "oasis pools",
        landscape: "desert with palm trees",
        features: "sand dunes and ancient cities",
        cultural: "traditional Middle Eastern"
      };
    default:
      return {
        nature: "diverse",
        sky: "beautiful",
        architecture: "charming",
        buildings: "interesting",
        interior: "cozy",
        decor: "comfortable",
        water: "peaceful",
        landscape: "magical",
        features: "unique",
        cultural: "diverse"
      };
  }
}

// Function to get language code from language name
function getLanguageCodeFromName(language) {
  switch(language) {
    // English variants
    case "English (US)":
    case "English (UK)":
    case "English (Australia)":
    case "English (India)":
      return "English";
    
    // Spanish variants
    case "Spanish (Spain)":
    case "Spanish (Spain/LatAm)":
      return "Spanish";
    
    // French variants
    case "French (France)":
    case "French (France/Canada)":
      return "French";
    
    // Chinese variants
    case "Chinese (Mandarin)":
      return "Chinese";
    case "Chinese (Cantonese)":
      return "Cantonese";
    
    // Portuguese variants
    case "Portuguese (Brazil)":
    case "Portuguese (Portugal)":
      return "Portuguese";
    
    // Major world languages
    case "Arabic":
      return "Arabic";
    case "Hindi":
      return "Hindi";
    case "Japanese":
      return "Japanese";
    case "Korean":
      return "Korean";
    case "German":
      return "German";
    case "Italian":
      return "Italian";
    case "Dutch":
      return "Dutch";
    case "Russian":
      return "Russian";
    case "Turkish":
      return "Turkish";
    case "Thai":
      return "Thai";
    case "Vietnamese":
      return "Vietnamese";
    case "Indonesian":
      return "Indonesian";
    case "Malay":
      return "Malay";
    case "Filipino":
      return "Filipino";
    
    // Indian languages
    case "Gujarati":
      return "Gujarati";
    case "Bengali":
      return "Bengali";
    case "Tamil":
      return "Tamil";
    case "Telugu":
      return "Telugu";
    case "Kannada":
      return "Kannada";
    case "Malayalam":
      return "Malayalam";
    case "Marathi":
      return "Marathi";
    case "Punjabi":
      return "Punjabi";
    case "Urdu":
      return "Urdu";
    case "Nepali":
      return "Nepali";
    case "Sinhala":
      return "Sinhala";
    
    // European languages
    case "French":
      return "French";
    case "Spanish":
      return "Spanish";
    case "Polish":
      return "Polish";
    case "Czech":
      return "Czech";
    case "Slovak":
      return "Slovak";
    case "Hungarian":
      return "Hungarian";
    case "Romanian":
      return "Romanian";
    case "Bulgarian":
      return "Bulgarian";
    case "Croatian":
      return "Croatian";
    case "Serbian":
      return "Serbian";
    case "Slovenian":
      return "Slovenian";
    case "Macedonian":
      return "Macedonian";
    case "Ukrainian":
      return "Ukrainian";
    case "Greek":
      return "Greek";
    case "Hebrew":
      return "Hebrew";
    case "Finnish":
      return "Finnish";
    case "Swedish":
      return "Swedish";
    case "Norwegian":
      return "Norwegian";
    case "Danish":
      return "Danish";
    case "Icelandic":
      return "Icelandic";
    case "Estonian":
      return "Estonian";
    case "Latvian":
      return "Latvian";
    case "Lithuanian":
      return "Lithuanian";
    case "Maltese":
      return "Maltese";
    case "Welsh":
      return "Welsh";
    case "Catalan":
      return "Catalan";
    case "Galician":
      return "Galician";
    case "Albanian":
      return "Albanian";
    case "Armenian":
      return "Armenian";
    case "Georgian":
      return "Georgian";
    case "Uzbek":
      return "Uzbek";
    
    // African languages
    case "Afrikaans":
      return "Afrikaans";
    case "Amharic":
      return "Amharic";
    case "Swahili":
      return "Swahili";
    
    // Southeast Asian languages
    case "Burmese":
      return "Burmese";
    case "Khmer":
      return "Khmer";
    case "Sundanese":
      return "Sundanese";
    
    // Default fallback
    default:
      console.warn(`⚠️ Language "${language}" not found in mapping, defaulting to English`);
      return "English";
  }
}

// Legacy function for backward compatibility
function generateGhibliStylePrompt(storyText) {
  return generateStyledPrompt(storyText, "Studio Ghibli", "English (US)");
}

// Helper function to determine the type of scene from the story text
function determineSceneType(text) {
  text = text.toLowerCase();
  
  // Check for nature/outdoor keywords
  if (text.match(/forest|tree|wood|garden|plant|flower|leaf|grass|bush/)) {
    return "forest";
  }
  
  // Check for sky/flying keywords
  if (text.match(/sky|cloud|fly|float|bird|wind|air|soar|glide/)) {
    return "sky";
  }
  
  // Check for town/village keywords
  if (text.match(/town|village|city|street|shop|market|building|house|home/)) {
    return "town";
  }
  
  // Check for indoor keywords
  if (text.match(/inside|room|kitchen|bedroom|home|house|interior|indoors|living/)) {
    return "home";
  }
  
  // Check for water keywords
  if (text.match(/water|sea|ocean|lake|river|stream|pond|beach|shore|swim|boat/)) {
    return "water";
  }
  
  // Default - generic magical landscape
  return "magical landscape";
}

// Start the Express server for Railway deployment
const PORT = process.env.PORT || 3001;

// Add error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  // Don't exit immediately in production, let Railway handle restarts
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit immediately in production, let Railway handle restarts
});

try {
  const server = await app.listen(PORT, '0.0.0.0');
  console.log(`🚀 Magical Story Teller Backend listening on port ${PORT}`);
  console.log(`🌟 Health check: http://0.0.0.0:${PORT}/api/health`);
  console.log(`🔗 API Base URL: http://0.0.0.0:${PORT}/api`);
  
  // Railway health check endpoint logging
  console.log(`✅ Railway deployment ready - health endpoint active`);
  console.log(`🌍 Server accessible from all interfaces (0.0.0.0:${PORT})`);
  
  // Graceful shutdown handling for Railway
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
  });
  
  process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
  });
  
  server.on('close', () => {
    console.log('🔚 Magical Story Teller Backend has stopped');
  });

  server.on('error', (error) => {
    console.error('❌ Server error:', error);
  });

} catch (err) {
  console.error('❌ Failed to start Magical Story Teller Backend:', err);
  console.error('Stack trace:', err.stack);
  process.exit(1);
}
