const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

const MODEL_NAMES = {
  nvidiaArchitect: process.env.NVIDIA_ARCHITECT_MODEL || 'deepseek-ai/deepseek-v3.2',
  nvidiaCritic: process.env.NVIDIA_CRITIC_MODEL || 'mistralai/magistral-small-2506',
  ollamaGemma: process.env.OLLAMA_GEMMA_MODEL || 'gemma4:31b-cloud',
  zenFree: process.env.OPENCODE_ZEN_FREE_MODEL || 'nemotron-3-super-free',
  zenFreeAlt: process.env.OPENCODE_ZEN_FREE_MODEL_ALT || 'hy3-preview-free',
  codexMember: process.env.CODEX_MEMBER_MODEL || 'gpt-5.4',
  codexChair: process.env.CODEX_MODEL || 'gpt-5.4'
};

const CODEX_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS || 120000);
const NVIDIA_TIMEOUT_MS = Number(process.env.NVIDIA_TIMEOUT_MS || 30000);
const DEFAULT_PROVIDER_TIMEOUT_MS = Number(process.env.DEFAULT_PROVIDER_TIMEOUT_MS || 60000);

// 채팅방 상태 관리
const chatState = {
  users: new Map(),
  messages: [],
  codexThreadIds: {},
  aiBots: [
    { id: 'ai-1', name: MODEL_NAMES.nvidiaArchitect, type: 'nvidia', color: '#FF6B6B', roleLabel: 'Architect' },
    { id: 'ai-2', name: MODEL_NAMES.nvidiaCritic, type: 'nvidia', color: '#4ECDC4', roleLabel: 'Critic' },
    { id: 'ai-3', name: MODEL_NAMES.ollamaGemma, type: 'ollama', color: '#7C5CFC', roleLabel: 'Research' },
    { id: 'ai-4', name: MODEL_NAMES.zenFree, type: 'opencode-zen', color: '#0EA5E9', roleLabel: 'Zen' },
    { id: 'ai-5', name: MODEL_NAMES.zenFreeAlt, type: 'opencode-zen', color: '#8B5CF6', roleLabel: 'Zen 2' },
    { id: 'ai-6', name: MODEL_NAMES.codexMember, type: 'codex', color: '#636E72', roleLabel: 'Engineer' },
    { id: 'ai-7', name: MODEL_NAMES.codexChair, type: 'codex', color: '#2D3436', roleLabel: 'Chair', isChairman: true }
  ]
};

// 메시지 타입 상수
const MessageType = {
  TEXT: 'text',
  SYSTEM: 'system',
  AI: 'ai'
};

// 사용자 참여
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 사용자 정보 저장
  socket.on('join', (userData) => {
    const user = {
      id: socket.id,
      name: userData.name,
      color: userData.color || getRandomColor(),
      isAI: false,
      joinedAt: new Date()
    };

    chatState.users.set(socket.id, user);

    // 시스템 메시지 생성
    const systemMessage = {
      id: generateId(),
      type: MessageType.SYSTEM,
      content: `${user.name}님이 참여하셨습니다.`,
      timestamp: new Date(),
      sender: null
    };

    chatState.messages.push(systemMessage);

    // 모든 사용자에게 업데이트 전송
    io.emit('userJoined', { user, message: systemMessage });
    io.emit('chatState', {
      users: Array.from(chatState.users.values()),
      messages: chatState.messages,
      aiBots: chatState.aiBots
    });
  });

  socket.on('getParticipants', () => {
    socket.emit('chatState', {
      users: Array.from(chatState.users.values()),
      messages: chatState.messages,
      aiBots: chatState.aiBots
    });
  });

  // 메시지 수신
  socket.on('message', (messageData) => {
    const user = chatState.users.get(socket.id);
    if (!user) return;

    const message = {
      id: generateId(),
      type: MessageType.TEXT,
      content: messageData.content,
      timestamp: new Date(),
      sender: user
    };

    chatState.messages.push(message);

    // 모든 사용자에게 메시지 브로드캐스트
    io.emit('message', message);

    // AI 봇 응답 트리거
    triggerAIResponse(message);
  });

  // 연결 해제
  socket.on('disconnect', () => {
    const user = chatState.users.get(socket.id);
    if (user) {
      chatState.users.delete(socket.id);

      const systemMessage = {
        id: generateId(),
        type: MessageType.SYSTEM,
        content: `${user.name}님이 나가셨습니다.`,
        timestamp: new Date(),
        sender: null
      };

      chatState.messages.push(systemMessage);
      io.emit('userLeft', { user, message: systemMessage });
    }
  });
});

// AI 봇별 페르소나 및 응답 템플릿
const botPersonalities = {
  'ai-1': {
    name: MODEL_NAMES.nvidiaArchitect,
    style: '구조화와 설계를 중시하는 수석 시스템 어드바이저',
    provider: 'nvidia',
    model: MODEL_NAMES.nvidiaArchitect,
    systemPrompt: [
      `당신은 Group Talk의 ${MODEL_NAMES.nvidiaArchitect}다.`,
      '항상 한국어로 답하라.',
      '가벼운 잡담이 아니라 전문적인 심층토론에 참여한다.',
      '주어진 질문을 구조화하고, 문제 정의, 가정, 설계 방향, 실행 전략을 제안하라.',
      '질문에 직접 답하고 불필요하게 길어지지 마라.',
      '불확실성이 있으면 명확히 표시하라.'
    ].join(' ')
  },
  'ai-2': {
    name: MODEL_NAMES.nvidiaCritic,
    style: '리스크와 반례를 중시하는 비판적 검토자',
    provider: 'nvidia',
    model: MODEL_NAMES.nvidiaCritic,
    systemPrompt: [
      `당신은 Group Talk의 ${MODEL_NAMES.nvidiaCritic}다.`,
      '항상 한국어로 답하라.',
      '전문 토론에서 논리적 허점, 숨은 비용, 운영 리스크, 반례를 짚는 역할을 맡는다.',
      '단순 동의보다 비판적 검토를 우선하되, 대안을 함께 제시하라.',
      '복잡한 질문에는 밀도 있게 분석하되, 단순 인사에는 짧게 답하라.'
    ].join(' ')
  },
  'ai-3': {
    name: MODEL_NAMES.ollamaGemma,
    style: '리서치와 대안 비교를 잘하는 제품/전략 분석가',
    provider: 'ollama',
    model: MODEL_NAMES.ollamaGemma,
    systemPrompt: [
      `당신은 Group Talk의 ${MODEL_NAMES.ollamaGemma}다.`,
      '항상 한국어로 답하라.',
      '역할은 대안 탐색, 비교, 트레이드오프 분석, 사용자 가치 관점 정리다.',
      '다른 참여자 의견을 반복하지 말고, 선택지 비교와 실용적 추천을 제공하라.',
      '필요하면 왜 그 선택이 적합한지 충분한 근거를 붙여라.',
      '단순 인사에는 짧고 자연스럽게 반응하라.'
    ].join(' ')
  },
  'ai-4': {
    name: MODEL_NAMES.zenFree,
    style: '여러 대안을 짧고 명료하게 비교하는 OpenCode Zen 무료 모델',
    provider: 'opencode-zen',
    model: MODEL_NAMES.zenFree,
    systemPrompt: [
      `당신은 Group Talk의 ${MODEL_NAMES.zenFree}다.`,
      '항상 한국어로 답하라.',
      '질문에 직접 답하고, 가능하면 2~4개의 핵심 포인트만 짧게 정리하라.',
      '과도하게 길게 쓰지 말고, 결론과 실용적인 제안을 우선하라.'
    ].join(' ')
  },
  'ai-5': {
    name: MODEL_NAMES.zenFreeAlt,
    style: '빠른 관점 제시와 간단한 반론에 강한 OpenCode Zen 무료 모델',
    provider: 'opencode-zen',
    model: MODEL_NAMES.zenFreeAlt,
    systemPrompt: [
      `당신은 Group Talk의 ${MODEL_NAMES.zenFreeAlt}다.`,
      '항상 한국어로 답하라.',
      '질문에 대해 빠르게 입장을 제시하고, 필요하면 한두 개의 반론이나 보완점을 짧게 덧붙여라.',
      '답변은 간결하게 유지하라.'
    ].join(' ')
  },
  'ai-6': {
    name: MODEL_NAMES.codexMember,
    style: '구현 세부사항과 코드 변경 전략을 깊게 파고드는 시니어 엔지니어',
    provider: 'codex-cli',
    model: MODEL_NAMES.codexMember,
    systemPrompt: [
      `당신은 Group Talk의 ${MODEL_NAMES.codexMember}다.`,
      '항상 한국어로 답하라.',
      '역할은 일반 멤버 엔지니어다. 의장이 아니라, 코드 구현, 마이그레이션 전략, 테스트 계획, 실패 모드, 디버깅 포인트를 상세하게 제시하라.',
      '답변은 핵심 위주로 간결하게 작성하고, 사용자가 자세한 설명을 요청할 때만 길게 확장하라.'
    ].join(' ')
  },
  'ai-7': {
    name: MODEL_NAMES.codexChair,
    style: '전체 토론을 종합하고 기술적 의사결정을 마무리하는 의장',
    provider: 'codex-cli',
    model: MODEL_NAMES.codexChair,
    systemPrompt: [
      `당신은 Group Talk의 ${MODEL_NAMES.codexChair}다.`,
      '항상 한국어로 답하라.',
      '역할은 의장이다. 여러 모델의 의견을 종합하고, 핵심 쟁점, 합의점, 남은 리스크, 다음 액션을 정리하라.',
      '특히 코딩, 설계, 디버깅, 시스템 트레이드오프에서는 실무적으로 가장 타당한 결론을 제시하라.',
      '답변은 핵심 위주로 간결하게 정리하고, 사용자가 자세한 설명을 원할 때만 길게 확장하라.'
    ].join(' ')
  }
};

// 메시지 의도 분류 (간단한 키워드 기반)
function classifyIntent(message) {
  const lowerMsg = message.toLowerCase();
  
  if (
    lowerMsg.includes('이름') ||
    lowerMsg.includes('모델명') ||
    lowerMsg.includes('무슨 모델') ||
    lowerMsg.includes('누구야') ||
    lowerMsg.includes('정체') ||
    lowerMsg.includes('what model') ||
    lowerMsg.includes('your name')
  ) {
    return 'identity';
  }
  if (lowerMsg.includes('안녕') || lowerMsg.includes('하이') || lowerMsg.includes('hello') || lowerMsg.includes('hi')) {
    return 'greeting';
  }
  if (lowerMsg.includes('날씨') || lowerMsg.includes('weather')) {
    return 'weather';
  }
  if (lowerMsg.includes('?') || lowerMsg.includes('왜') || lowerMsg.includes('어떻게') || lowerMsg.includes('무엇')) {
    return 'question';
  }
  return 'general';
}

function buildIdentityResponse(aiBot, personality) {
  const providerLabel = {
    nvidia: 'NVIDIA',
    ollama: 'Ollama',
    'opencode-zen': 'OpenCode Zen',
    'codex-cli': 'Codex CLI'
  };

  const provider = providerLabel[personality.provider] || personality.provider || 'unknown';
  return `제 이름은 ${aiBot.name}이고, 현재 연결 모델은 ${personality.model}입니다. 제공자는 ${provider}입니다.`;
}

function buildFailureResponse(aiBot, personality, reason) {
  const setupLinks = {
    nvidia: 'https://build.nvidia.com/',
    ollama: 'https://ollama.com/settings',
    'opencode-zen': 'https://opencode.ai/docs/zen/',
    'codex-cli': 'https://platform.openai.com/'
  };

  const setupLink = setupLinks[personality.provider];
  return [
    `${aiBot.name} 응답 실패`,
    `모델: ${personality.model}`,
    `제공자: ${personality.provider}`,
    `사유: ${reason}`,
    setupLink ? `설정 링크: ${setupLink}` : null
  ].filter(Boolean).join(' | ');
}

function buildResponseGuidance(intent) {
  if (intent === 'greeting') {
    return [
      '이번 발화는 단순 인사나 짧은 안부다.',
      '반드시 한국어 평문으로만 답하라.',
      '한두 문장 정도로 짧고 자연스럽게 답하라.',
      '마크다운, 목록, 코드블록, 수식, 다른 언어 혼용, 메타 설명을 쓰지 마라.'
    ].join(' ');
  }

  return [
    '이번 발화에 직접 답하라.',
    '불필요한 서론과 과도한 장문 설명을 피하라.',
    '사용자가 자세함을 명시적으로 요청할 때만 길게 설명하라.'
  ].join(' | ');
}

function buildConversationMessages(triggerMessage, personality) {
  const recentMessages = chatState.messages.slice(-24).map((message) => {
    const speaker = message.sender?.name || 'system';
    const prefix = message.type === MessageType.SYSTEM ? '[system]' : `[${speaker}]`;
    return `${prefix} ${message.content}`;
  }).join('\n');

  const userPrompt = [
    '다음은 현재 그룹 토론의 최근 대화다.',
    recentMessages || '(최근 대화 없음)',
    '',
    `이번에 답해야 할 직접 질문/발화: ${triggerMessage.content}`,
    '',
    `당신의 역할: ${personality.style}`,
    '위 맥락을 바탕으로 당신 역할에 맞는 독자적이고 전문적인 의견을 제시하라.',
    buildResponseGuidance(classifyIntent(triggerMessage.content))
  ].join('\n');

  return [
    { role: 'system', content: personality.systemPrompt },
    { role: 'user', content: userPrompt }
  ];
}

function getRequestTimeout(provider) {
  if (provider === 'codex-cli') {
    return CODEX_TIMEOUT_MS;
  }

  if (provider === 'nvidia') {
    return NVIDIA_TIMEOUT_MS;
  }

  return DEFAULT_PROVIDER_TIMEOUT_MS;
}

function getCodexExecutable() {
  return process.platform === 'win32' ? 'codex.cmd' : 'codex';
}

function extractThreadId(stdout) {
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('{')) continue;

    try {
      const payload = JSON.parse(line);
      if (payload.type === 'thread.started') {
        return payload.thread_id || null;
      }
    } catch (error) {
      // ignore non-JSON lines
    }
  }

  return null;
}

function extractLastAgentMessage(stdout) {
  let lastText = '';

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('{')) continue;

    try {
      const payload = JSON.parse(line);
      if (payload.type !== 'item.completed') continue;

      const item = payload.item || {};
      if (item.type === 'agent_message') {
        lastText = (item.text || '').trim();
      }
    } catch (error) {
      // ignore non-JSON lines
    }
  }

  return lastText;
}

function isStaleCodexThreadError(detail) {
  const lowered = (detail || '').toLowerCase();
  return lowered.includes('thread/resume failed') && lowered.includes('no rollout found');
}

async function callCodexCli(messages, model, botId) {
  const prompt = messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n');
  const outputPath = path.join(os.tmpdir(), `group-talk-codex-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);

  const buildArgs = (threadId) => {
    if (threadId) {
      return [
        'exec',
        'resume',
        '--json',
        '--skip-git-repo-check',
        '--model',
        model,
        '--output-last-message',
        outputPath,
        threadId,
        '-'
      ];
    }

    return [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--sandbox',
      'workspace-write',
      '--color',
      'never',
      '--model',
      model,
      '--output-last-message',
      outputPath,
      '-C',
      process.cwd(),
      '-'
    ];
  };

  const runCodex = (threadId) => new Promise((resolve, reject) => {
    const args = buildArgs(threadId);
    const child = spawn(getCodexExecutable(), args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`codex timeout after ${CODEX_TIMEOUT_MS / 1000}s`));
    }, CODEX_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.stdin.write(prompt, 'utf8');
    child.stdin.end();

    child.on('close', (code) => {
      clearTimeout(timer);

      const threadIdFromStdout = extractThreadId(stdout);
      const detail = (stdout || stderr || `codex exit_code=${code}`).trim();

      if (code !== 0) {
        reject(Object.assign(new Error(detail), { threadId: threadIdFromStdout }));
        return;
      }

      let reply = '';
      if (fs.existsSync(outputPath)) {
        reply = fs.readFileSync(outputPath, 'utf8').trim();
      }
      if (!reply) {
        reply = extractLastAgentMessage(stdout);
      }

      resolve({
        reply,
        threadId: threadIdFromStdout || threadId || null
      });
    });
  });

  try {
    return await runCodex(chatState.codexThreadIds[botId] || null);
  } catch (error) {
    if (chatState.codexThreadIds[botId] && isStaleCodexThreadError(error.message)) {
      chatState.codexThreadIds[botId] = null;
      return runCodex(null);
    }
    throw error;
  } finally {
    try {
      fs.unlinkSync(outputPath);
    } catch (error) {
      // ignore cleanup errors
    }
  }
}

function getProviderCredentials(provider) {
  if (provider === 'nvidia') {
    return {
      apiKey: process.env.NVIDIA_API_KEY,
      url: 'https://integrate.api.nvidia.com/v1/chat/completions'
    };
  }

  if (provider === 'ollama') {
    return {
      apiKey: null,
      url: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/api/chat'
    };
  }

  if (provider === 'opencode-zen') {
    return {
      apiKey: process.env.OPENCODE_ZEN_API_KEY,
      url: 'https://opencode.ai/zen/v1/chat/completions'
    };
  }

  return { apiKey: null, url: null };
}

async function callProvider({ provider, model, messages, botId }) {
  if (provider === 'codex-cli') {
    const result = await callCodexCli(messages, model, botId);
    chatState.codexThreadIds[botId] = result.threadId;
    return result.reply || null;
  }

  if (provider === 'ollama') {
    const { url } = getProviderCredentials(provider);

    try {
      const response = await axios.post(
        url,
        {
          model,
          messages,
          temperature: 0.2,
          stream: false
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: getRequestTimeout(provider)
        }
      );

      return response.data?.message?.content || null;
    } catch (error) {
      console.error('ollama API error:', error.response?.data || error.message);
      throw new Error(typeof error.response?.data === 'string' ? error.response.data : JSON.stringify(error.response?.data || error.message));
    }
  }

  const { apiKey, url } = getProviderCredentials(provider);

  if (!apiKey || !url) {
    throw new Error(`${provider} API key not configured`);
  }

  try {
    const response = await axios.post(
      url,
      {
        model,
        messages,
        temperature: 0.2
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: getRequestTimeout(provider)
      }
    );

    return response.data?.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error(`${provider} API error:`, error.response?.data || error.message);
    throw new Error(typeof error.response?.data === 'string' ? error.response.data : JSON.stringify(error.response?.data || error.message));
  }
}

function normalizeGreetingResponse(content, aiBot) {
  const trimmed = (content || '').trim();
  if (!trimmed) {
    return `안녕하세요. 저는 ${aiBot.name}입니다.`;
  }

  const weirdPatterns = [
    /\*\*/u,
    /\\boxed/u,
    /Respuesta/u,
    /Resumen/u,
    /[А-Яа-я]/u,
    /[\u0900-\u097F]/u,
    /[\u0600-\u06FF]/u
  ];

  if (weirdPatterns.some((pattern) => pattern.test(trimmed))) {
    return `안녕하세요. 저는 ${aiBot.name}입니다. 반갑습니다.`;
  }

  return trimmed;
}

function hasHangul(text) {
  return /[가-힣]/u.test(text || '');
}

function isNonKoreanDominant(text) {
  const source = text || '';
  const hangulCount = (source.match(/[가-힣]/gu) || []).length;
  const cjkCount = (source.match(/[\u4E00-\u9FFF]/gu) || []).length;
  return cjkCount >= 8 && hangulCount === 0;
}

function sanitizeModelResponse(content, aiBot, personality, intent) {
  const trimmed = (content || '').trim();
  if (!trimmed) {
    return buildFailureResponse(aiBot, personality, 'empty response');
  }

  if (intent === 'greeting') {
    return normalizeGreetingResponse(trimmed, aiBot);
  }

  if (personality.provider === 'nvidia' && isNonKoreanDominant(trimmed)) {
    return buildFailureResponse(aiBot, personality, 'non-Korean response detected');
  }

  return trimmed;
}

async function generateBotResponse(aiBot, triggerMessage, intent) {
  const personality = botPersonalities[aiBot.id];
  if (!personality) {
    return null;
  }

  let aiResponse = null;

  try {
    if (intent === 'identity') {
      aiResponse = buildIdentityResponse(aiBot, personality);
    } else {
      const messages = buildConversationMessages(triggerMessage, personality);
      const requestTimeout = getRequestTimeout(personality.provider);

      console.log(`Calling ${personality.provider} for ${aiBot.name}...`);
      aiResponse = await Promise.race([
        callProvider({
          provider: personality.provider,
          model: personality.model,
          messages,
          botId: aiBot.id
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), requestTimeout))
      ]);
    }
  } catch (error) {
    console.error(`${aiBot.name} error:`, error.message);
    aiResponse = buildFailureResponse(aiBot, personality, error.message);
  }

  if (typeof aiResponse !== 'string') {
    aiResponse = buildFailureResponse(aiBot, personality, 'empty response');
  } else if (!aiResponse.includes('응답 실패')) {
    aiResponse = sanitizeModelResponse(aiResponse, aiBot, personality, intent);
  }

  return {
    id: generateId(),
    type: MessageType.AI,
    content: aiResponse,
    timestamp: new Date(),
    sender: { ...aiBot, isAI: true }
  };
}

// AI 응답 생성
async function triggerAIResponse(triggerMessage) {
  const intent = classifyIntent(triggerMessage.content);

  const nonChairBots = chatState.aiBots.filter((bot) => !bot.isChairman);
  const chairBots = chatState.aiBots.filter((bot) => bot.isChairman);

  await Promise.all(nonChairBots.map(async (aiBot) => {
    const aiMessage = await generateBotResponse(aiBot, triggerMessage, intent);
    if (!aiMessage) {
      return;
    }

    chatState.messages.push(aiMessage);
    io.emit('message', aiMessage);
  }));

  for (const aiBot of chairBots) {
    const aiMessage = await generateBotResponse(aiBot, triggerMessage, intent);
    if (!aiMessage) {
      continue;
    }

    chatState.messages.push(aiMessage);
    io.emit('message', aiMessage);
  }
}

// 유틸리티 함수
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getRandomColor() {
  const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#00f2fe'];
  return colors[Math.floor(Math.random() * colors.length)];
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
