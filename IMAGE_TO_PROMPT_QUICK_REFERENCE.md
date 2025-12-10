# Image-to-Prompt Quick Reference

## 🚀 Quick Start

### Test Locally
```bash
node scripts/test-image-to-prompt.js
```

### API Call
```bash
curl -X POST https://your-domain.com/api/image-to-prompt \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://example.com/image.jpg"}'
```

### Service Usage
```javascript
const { generatePromptFromImage } = require('./services/image-prompt-service');
const result = await generatePromptFromImage({ imageUrl: 'https://...' });
```

## 📁 Files Created

| File | Purpose |
|------|---------|
| `prompts/image-to-prompt.txt` | AI prompt template |
| `services/image-prompt-service.js` | Service layer (extended) |
| `api/image-to-prompt.js` | API endpoint |
| `scripts/test-image-to-prompt.js` | Test script |
| `docs/IMAGE_TO_PROMPT.md` | Full documentation |

## 📝 Request Format

```json
{
  "imageUrl": "https://example.com/image.jpg",
  "userId": "optional-user-id",
  "organizationId": "optional-org-id"
}
```

**Alternative**: Use `image_url` instead of `imageUrl`

## 📤 Response Format

```json
{
  "success": true,
  "prompt": "Ultra-detailed 250-500 word description...",
  "variables": {
    "subject": "string",
    "style": "string",
    "lighting": "string",
    "color_palette": ["array"],
    "mood": "string",
    "composition": "string",
    "camera_angle": "string",
    "background": "string",
    "text_present": boolean,
    "text_content": "string or null",
    "aspect_ratio": "string"
  },
  "imageUrl": "https://example.com/image.jpg"
}
```

## ⚙️ Configuration

- **Model**: GPT-4o with Vision
- **Timeout**: 60 seconds
- **Max Tokens**: 2000
- **Temperature**: 0.3
- **Image Detail**: High
- **Memory**: 1024 MB
- **Endpoint**: POST `/api/image-to-prompt`

## 🎯 Use Cases

1. **Reverse Engineering** - Analyze competitor images
2. **Style Transfer** - Recreate similar images with variations
3. **Creative Briefs** - Generate descriptions for design teams
4. **Documentation** - Create textual descriptions of assets
5. **Training Data** - Generate prompts for model fine-tuning

## 🔧 Environment Variables

Required:
- `OPENAI_API_KEY` - OpenAI API key for GPT-4o Vision

## ✅ Validation

The API validates:
- ✓ Image URL is provided
- ✓ URL format is valid
- ✓ OpenAI API key is configured

## 🐛 Error Handling

| Status | Error | Cause |
|--------|-------|-------|
| 400 | Missing required field | No imageUrl provided |
| 400 | Invalid imageUrl | URL format is invalid |
| 500 | Server configuration error | Missing OPENAI_API_KEY |
| 500 | Failed to generate prompt | OpenAI API error or timeout |

## 📊 Output Details

### Prompt Includes:
- Subject details (pose, angle, expression)
- Visual elements (clothing, accessories, textures)
- Color information (colors, gradients, patterns)
- Environment (background, setting)
- Lighting (setup, shadows, highlights)
- Camera specs (lens, aperture, DOF)
- Mood & style (aesthetics, tone)
- Composition (framing, layout)
- Text transcription (if present)

### Variables Include:
- `subject` - Main subject
- `style` - Visual style
- `lighting` - Lighting description
- `color_palette` - Dominant colors
- `mood` - Emotional tone
- `composition` - Layout approach
- `camera_angle` - Perspective
- `background` - Background description
- `text_present` - Boolean for text
- `text_content` - Transcribed text
- `aspect_ratio` - Estimated ratio

## 🔗 Related Endpoints

- `/api/image-gen` - Generate images from prompts
- `/api/image-prompt` - Generate prompts from guidelines
- `/api/gen-image-prompt` - Generate prompts from campaign ideas

## 📚 Documentation

Full docs: `docs/IMAGE_TO_PROMPT.md`
Implementation: `IMAGE_TO_PROMPT_IMPLEMENTATION.md`

## 🧪 Testing

```bash
# Run test script
node scripts/test-image-to-prompt.js

# Expected output:
# - Status: 200
# - Success: true
# - Prompt: 250-500 words
# - Variables: 10+ fields
```

## 💡 Tips

1. Use high-quality images for best results
2. Publicly accessible URLs work best
3. Larger images may take longer to process
4. The prompt is optimized for photorealistic generation
5. Variables can be used for filtering/categorization

