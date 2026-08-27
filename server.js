// server.js - FULL COMPLETE WORKING FILE
// ============================================================================
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY || '';

// ============================================================================
// 🔥 SETTING KAWALAN (TUKAR DI SINI)
// ============================================================================
// 1. TAHAP THINKING GLOBAL (Untuk Nemotron / GLM dll): "none", "low", "medium", "high"
const GLOBAL_REASONING_EFFORT = "medium"; 

// 🔥 2. KHAS UNTUK DEEPSEEK SAHAJA (Flash & Pro):
//    "none"   -> Tutup terus reasoning mode
//    "low"    -> Mode 1: Reasoning seringkas mungkin & pantas
//    "medium" -> Mode 2: Standard step-by-step reasoning
//    "high"   -> Mode 3: Maksimum deep thinking & analisa penuh
const DEEPSEEK_REASONING_MODE = "high"; 

// 3. NAK TUNJUK ISI <think> ATAU TIDAK:
// true  = Tunjuk teks berfikir
// false = Padam/sorok teks berfikir (dapat jawapan bersih sahaja)
const SHOW_REASONING = false; 
// ============================================================================

const MODEL_MAPPING = {
  'gpt-4o': 'nvidia/nemotron-3-ultra-550b-a55b',
  'claude-3-sonnet': 'z-ai/glm4.7',
  'gemini-pro': 'z-ai/glm-5.1',
  'gemma-romance': 'nvidia/nemotron-3-super-120b-a12b',
  'claude-3-haiku-20240307': 'minimaxai/minimax-m3',
  'gpt-4o-latest': 'minimaxai/minimax-m2.7',
  'claude-3-opus-20240229': 'deepseek-ai/deepseek-v4-flash-0731',
  'gpt-4-0613': 'deepseek-ai/deepseek-v4-pro-0813' 
};

function filterReasoning(text) {
  if (!text) return text;
  
  let cleanText = text;
  cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleanText = cleanText.replace(/```thought[\s\S]*?```/gi, '');

  const garbagePhrases = [
    "\\*Okay, let me analyze", "\\*The scene:", "\\*The user wants me to",
    "\\*Current situation:", "\\*Key elements to include:", "\\*I need to describe:",
    "\\*Evelyn's psychology:", "\\*How would Evelyn react\\?", "\\*Physical details to describe:",
    "\\*I need to avoid:", "\\*I should focus on:", "\\*The act of sliding", "\\*Sound integration:",
    "\\*Analysis:", "\\*Thought Process:", "\\*Reasoning:", "Thought:\n"
  ];

  garbagePhrases.forEach(phrase => {
    let regex = new RegExp(phrase + "[\\s\\S]*?\\n\\n", "gi");
    cleanText = cleanText.replace(regex, '');
  });

  cleanText = cleanText.replace(/\n- [\s\S]*?\n\n/gi, '\n\n');
  cleanText = cleanText.replace(/\d\. [\s\S]*?\n\n/gi, '\n\n');

  return cleanText.trim();
}

function getNemotronPromptByLevel(level) {
  switch (level) {
    case 'low':
      return "\n\n[SYSTEM INSTRUCTION: Provide a brief, concise reasoning inside <think>...</think> before giving the final answer.]";
    case 'high':
    case 'max':
      return "\n\n[SYSTEM INSTRUCTION: You must think extremely deeply, analyze all edge cases, verify step-by-step logic thoroughly, and plan exhaustively inside <think>...</think> tags before writing your final response.]";
    case 'medium':
    default:
      return "\n\n[SYSTEM INSTRUCTION: Please reason through this carefully step-by-step inside <think>...</think> tags before providing the final answer.]";
  }
}

// 3 Mod Reasoning Khas DeepSeek
function getDeepSeekPromptByLevel(level) {
  switch (level) {
    case 'low':
      // Mode 1: Ringkas & jimat token
      return "\n\n[SYSTEM INSTRUCTION: Provide a minimal and concise reasoning inside <think>...</think> focusing strictly on core logic and constraints before giving your response.]";
    case 'high':
    case 'max':
      // Mode 3: Deep exploration & full analysis
      return "\n\n[SYSTEM INSTRUCTION: Engage in comprehensive, rigorous, and exhaustive reasoning inside <think>...</think>. Explore alternative perspectives, systematically verify every intermediate step, test edge cases, and self-correct before presenting your final answer.]";
    case 'medium':
    default:
      // Mode 2: Standard
      return "\n\n[SYSTEM INSTRUCTION: Reason step-by-step thoroughly inside <think>...</think> to logically solve the prompt before providing the final response.]";
  }
}

app.post('/v1/chat/completions', async (req, res) => {
  try {
    let { model, messages, temperature, max_tokens, stream, reasoning_effort } = req.body;
    let isStream = stream || false; 

    let nimModel = MODEL_MAPPING[model] || model;
    
    const isGLM = nimModel.toLowerCase().includes('glm');
    const isDeepSeek = nimModel.toLowerCase().includes('deepseek');
    const isNemotron = nimModel.toLowerCase().includes('nemotron');

    // 👉 PENGASINGAN SETTING: Guna DEEPSEEK_REASONING_MODE jika model DeepSeek
    let effortLevel;
    if (isDeepSeek) {
      effortLevel = (reasoning_effort || DEEPSEEK_REASONING_MODE).toLowerCase();
    } else {
      effortLevel = (reasoning_effort || GLOBAL_REASONING_EFFORT).toLowerCase();
    }

    const isThinkingActive = effortLevel !== "none" && effortLevel !== "off" && effortLevel !== "false";

    let sanitizedMessages = [];
    if (Array.isArray(messages)) {
      for (let m of messages) {
        if (!m || !m.content || m.content.trim() === "") continue; 
        let role = m.role === 'system' ? 'user' : m.role; 
        
        if (sanitizedMessages.length > 0 && sanitizedMessages[sanitizedMessages.length - 1].role === role) {
          sanitizedMessages[sanitizedMessages.length - 1].content += "\n\n" + m.content;
        } else {
          sanitizedMessages.push({ role: role, content: m.content });
        }
      }
    }

    // Suntik prompt mengikut model & mode masing-masing
    if (isThinkingActive && sanitizedMessages.length > 0) {
      if (isDeepSeek) {
        sanitizedMessages[sanitizedMessages.length - 1].content += getDeepSeekPromptByLevel(effortLevel);
      } else if (isNemotron) {
        sanitizedMessages[sanitizedMessages.length - 1].content += getNemotronPromptByLevel(effortLevel);
      } else if (isGLM) {
        sanitizedMessages[sanitizedMessages.length - 1].content += "\n\n[SYSTEM INSTRUCTION: Think deeply before answering. Use <think> tags for reasoning.]";
      }
    }

    const nimRequest = {
      model: nimModel,
      messages: sanitizedMessages,
      temperature: temperature !== undefined ? temperature : 0.6,
      max_tokens: max_tokens || 4096,
      stream: isStream
    };

    if (isNemotron) {
      nimRequest.chat_template_kwargs = {
        enable_thinking: isThinkingActive
      };
    }

    // Parameter khas DeepSeek
    if (isDeepSeek) {
      if (isThinkingActive) {
        nimRequest.reasoning_effort = effortLevel;
        nimRequest.chat_template_kwargs = {
          enable_thinking: true
        };
      } else {
        nimRequest.chat_template_kwargs = {
          enable_thinking: false
        };
      }
    }

    if (!isStream) {
      const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
        headers: {
          'Authorization': `Bearer ${NIM_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
        let originalContent = response.data.choices[0].message.content;
        if (!SHOW_REASONING) {
          response.data.choices[0].message.content = filterReasoning(originalContent);
        }
      }
      return res.json(response.data);

    } else {
      const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
        headers: {
          'Authorization': `Bearer ${NIM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      response.data.on('data', (chunk) => {
        res.write(chunk);
      });

      response.data.on('error', (err) => {
        console.error('🔥 Stream error:', err.message);
        res.end(); 
      });

      response.data.on('end', () => {
        res.end();
      });
    }

  } catch (error) {
    console.error('🔥 ERROR:', error.response?.data || error.message);
    if (!res.headersSent) {
      res.status(error.response?.status || 500).json({ 
        error: { 
          message: error.message, 
          details: error.response?.data 
        } 
      });
    } else {
      res.end(); 
    }
  }
});

app.listen(PORT,
