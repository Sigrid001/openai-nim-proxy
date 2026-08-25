// server.js - NEMOTRON 3 ULTRA & MULTI-MODEL PROXY (READY TO USE)
// ============================================================================
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

const NIM_API_BASE = process.env.NIM_API_BASE || 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY || 'MASUKKAN_KEY_NVIDIA_ANDA_DI_SINI';

// ============================================================================
// 🔥 1. TEMPAT ANDA TUKAR / TOGGLE SETTING SERVER (EDIT DI SINI)
// ============================================================================

// A) TAHAP THINKING MODE:
// Pilihan: "none" (tutup), "low" (pendek), "medium" (biasa), "high" (paling mendalam)
const GLOBAL_REASONING_EFFORT = "medium"; 

// B) NAK TUNJUK ATAU SOROK PROSES PEMIKIRAN (<think>):
// true  = Anda DAPAT lihat isi pemikiran <think>...</think>
// false = Bersihkan dan BUANG teks pemikiran (dapat jawapan akhir sahaja)
const SHOW_REASONING = false; 

// ============================================================================

// Mapping model
const MODEL_MAPPING = {
  'gpt-4o': 'nvidia/nemotron-3-ultra-550b-a55b',
  'claude-3-sonnet': 'z-ai/glm4.7',
  'gemini-pro': 'z-ai/glm-5.1',
  'gemma-romance': 'nvidia/nemotron-3-super-120b-a12b',
  'claude-3-haiku-20240307': 'minimaxai/minimax-m3',
  'gpt-4o-latest': 'minimaxai/minimax-m2.7',
  'claude-3-opus-20240229': 'deepseek-ai/deepseek-v4-flash-0731',
  'gpt-4-0613': 'deepseek-ai/deepseek-v4-pro' 
};

// Fungsi penapis reasoning (jika SHOW_REASONING = false)
function filterReasoning(text) {
  if (!text) return text;
  
  let cleanText = text;
  cleanText = cleanText.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleanText = cleanText.replace(/```thought[\s\S]*?```/gi, '');

  const garbagePhrases = [
    "\\*Okay, let me analyze", "\\*The scene:", "\\*The user wants me to",
    "\\*Current situation:",
