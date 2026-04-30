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
  groqFast: process.env.GROQ_FAST_MODEL || 'openai/gpt-oss-20b',
  groqScout: process.env.GROQ_SCOUT_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
  cerebrasChair: process.env.CEREBRAS_CHAIR_MODEL || 'gpt-oss-120b',
  cerebrasAnalyst: process.env.CEREBRAS_ANALYST_MODEL || 'qwen-3-32b',
  codexMember: process.env.CODEX_MEMBER_MODEL || 'gpt-5.4',
  codexChair: process.env.CODEX_MODEL || 'gpt-5.4'
};

const MIN_DETAILED_RESPONSE_CHARS = Number(process.env.MIN_DETAILED_RESPONSE_CHARS || 700);
const CODEX_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS || 120000);

// 채팅방 상태 관리
const chatState = {
  users: new Map(),
  messages: [],
  codexThreadIds: {},
  aiBots: [
    { id: 'ai-1', name: MODEL_NAMES.nvidiaArchitect, type: 'nvidia', color: '#FF6B6B', roleLabel: 'Architect' },
    { id: 'ai-2', name: MODEL_NAMES.nvidiaCritic, type: 'nvidia', color: '#4ECDC4', roleLabel: 'Critic' },
    { id: 'ai-3', name: MODEL_NAMES.ollamaGemma, type: 'ollama', color: '#7C5CFC', roleLabel: 'Research' },
    { id: 'ai-4', name: MODEL_NAMES.groqFast, type: 'groq', color: '#00B894', roleLabel: 'Options' },
    { id: 'ai-5', name: MODEL_NAMES.groqScout, type: 'groq', color: '#0984E3', roleLabel: 'Product' },
    { id: 'ai-6', name: MODEL_NAMES.cerebrasChair, type: 'cerebras', color: '#F7B801', roleLabel: 'Synthesis' },
    { id: 'ai-7', name: MODEL_NAMES.cerebrasAnalyst, type: 'cerebras', color: '#E17055', roleLabel: 'Analysis' },
    { id: 'ai-9', name: MODEL_NAMES.codexMember, type: 'codex', color: '#636E72', roleLabel: 'Engineer' },
    { id: 'ai-8', name: MODEL_NAMES.codexChair, type: 'codex', color: '#2D3436', roleLabel: 'Chair', isChairman: true }
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
      '기술적이거나 복잡한 질문에는 충분히 자세히 답하라. 다만 단순 인사나 짧은 안부에는 짧고 자연스럽게 답하라.',
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
    name: MODEL_NAMES.groqFast,
    style: '빠른 초안 생성과 여러 해법 제시에 강한 아이디어 확장자',
    provider: 'groq',
    model: MODEL_NAMES.groqFast,
    systemPrompt: [
      `당신은 Group Talk의 ${MODEL_NAMES.groqFast}다.`,
      '항상 한국어로 답하라.',
      '전문 토론에서 빠르게 여러 해법을 제시하고, 옵션별 장단점을 짧고 선명하게 정리한다.',
      '이미 나온 의견을 반복하기보다 보완적 아이디어를 추가하라.',
      '복잡한 질문에는 빠르되 얕지 않게 작성하라. 단순 인사에는 짧게 답하라.'
    ].join(' ')
  },
  'ai-5': {
    name: MODEL_NAMES.groqScout,
    style: '제품 감각과 사용자 시나리오를 잘 보는 실전 전략가',
    provider: 'groq',
    model: MODEL_NAMES.groqScout,
    systemPrompt: [
      `당신은 Group Talk의 ${MODEL_NAMES.groqScout}다.`,
      '항상 한국어로 답하라.',
      '역할은 사용자 관점, 시장성, 실사용 시나리오, 실행 우선순위를 따지는 것이다.',
      '기술적 타당성만이 아니라 실제 채택 가능성과 운영 편의성까지 보라.',
      '복잡한 질문에는 충분히 상세하게 작성하되, 단순 인사에는 짧게 답하라.'
    ].join(' ')
  },
  'ai-6': {
    name: MODEL_NAMES.cerebrasChair,
    style: '전체 토론을 종합하고 논점을 재구성하는 무료 모델 기반 의장',
    provider: 'cerebras',
    model: MODEL_NAMES.cerebrasChair,
    systemPrompt: [
      `당신은 Group Talk의 ${MODEL_NAMES.cerebrasChair}다.`,
      '항상 한국어로 답하라.',
      '역할은 논점을 정리하고, 합의점과 쟁점을 분리하고, 다음 액션을 제안하는 것이다.',
      '다른 모델들의 의견을 덮어쓰지 말고, 종합자이자 의장으로서 구조를 잡아라.',
      '복잡한 질문에는 섹션을 나눠 자세히 정리하라. 단순 인사에는 짧게 답하라.'
    ].join(' ')
  },
  'ai-7': {
    name: MODEL_NAMES.cerebrasAnalyst,
    style: '긴 논리 전개와 근거 중심 분석에 강한 심층 추론가',
    provider: 'cerebras',
    model: MODEL_NAMES.cerebrasAnalyst,
    systemPrompt: [
      `당신은 Group Talk의 ${MODEL_NAMES.cerebrasAnalyst}다.`,
      '항상 한국어로 답하라.',
      '전문 토론에서 가정 검증, 논리 전개, 근거 연결, 장기적 파급효과 분석을 맡는다.',
      '가능하면 결론뿐 아니라 왜 그 결론이 나오는지 추론 흐름을 보여라.',
      '복잡한 질문에는 자세히 답하되, 단순 인사에는 짧게 답하라.'
    ].join(' ')
  },
  'ai-8': {
    name: MODEL_NAMES.codexChair,
    style: '전체 토론을 종합하고 기술적 의사결정을 마무리하는 의장',
    provider: 'codex-cli',
    model: MODEL_NAMES.codexChair,
    systemPrompt: [
      `당신은 Group Talk의 ${MODEL_NAMES.codexChair}다.`,
      '항상 한국어로 답하라.',
      '역할은 의장이다. 여러 모델의 의견을 종합하고, 핵심 쟁점, 합의점, 남은 리스크, 다음 액션을 정리하라.',
      '특히 코딩, 설계, 디버깅, 시스템 트레이드오프에서는 실무적으로 가장 타당한 결론을 제시하라.',
      '복잡한 질문에는 섹션과 항목을 사용해 자세히 정리하라. 단순 인사에는 짧게 답하라.'
    ].join(' ')
  },
  'ai-9': {
    name: MODEL_NAMES.codexMember,
    style: '구현 세부사항과 코드 변경 전략을 깊게 파고드는 시니어 엔지니어',
    provider: 'codex-cli',
    model: MODEL_NAMES.codexMember,
    systemPrompt: [
      `당신은 Group Talk의 ${MODEL_NAMES.codexMember}다.`,
      '항상 한국어로 답하라.',
      '역할은 일반 멤버 엔지니어다. 의장이 아니라, 코드 구현, 마이그레이션 전략, 테스트 계획, 실패 모드, 디버깅 포인트를 상세하게 제시하라.',
      '실무자가 바로 작업에 옮길 수 있을 정도로 충분히 자세하게 답하라.',
      '복잡한 질문에는 길고 구체적으로 작성하되, 단순 인사에는 짧고 자연스럽게 답하라.'
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
    groq: 'Groq',
    cerebras: 'Cerebras',
    'codex-cli': 'Codex CLI'
  };

  const provider = providerLabel[personality.provider] || personality.provider || 'unknown';
  return `제 이름은 ${aiBot.name}이고, 현재 연결 모델은 ${personality.model}입니다. 제공자는 ${provider}입니다.`;
}

function buildFailureResponse(aiBot, personality, reason) {
  const setupLinks = {
    nvidia: 'https://build.nvidia.com/',
    groq: 'https://console.groq.com/keys',
    cerebras: 'https://cloud.cerebras.ai/platform/api-keys',
    ollama: 'https://ollama.com/settings',
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
    '이번 발화는 실질적인 토론 질문일 가능성이 높다.',
    '가능하면 배경, 판단 근거, 트레이드오프, 추천안까지 충분히 설명하라.'
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

function shouldRetryForDetail(content, intent) {
  if (intent === 'identity' || intent === 'greeting') {
    return false;
  }

  return !content || content.trim().length < MIN_DETAILED_RESPONSE_CHARS;
}

function buildRetryMessages(messages, personality) {
  const retryInstruction = [
    '이전 답변이 너무 짧거나 추상적이었다.',
    `최소 ${MIN_DETAILED_RESPONSE_CHARS}자 이상을 목표로 하라.`,
    '배경, 핵심 판단 근거, 트레이드오프, 실행 방안, 주의사항을 더 자세히 써라.',
    '짧은 결론 한 줄로 끝내지 마라.'
  ].join(' ');

  return [...messages, { role: 'user', content: retryInstruction }, { role: 'user', content: `역할을 다시 상기한다: ${personality.style}` }];
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

  if (provider === 'groq') {
    return {
      apiKey: process.env.GROQ_API_KEY,
      url: 'https://api.groq.com/openai/v1/chat/completions'
    };
  }

  if (provider === 'cerebras') {
    return {
      apiKey: process.env.CEREBRAS_API_KEY,
      url: 'https://api.cerebras.ai/v1/chat/completions'
    };
  }

  if (provider === 'ollama') {
    return {
      apiKey: null,
      url: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/api/chat'
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
          timeout: 90000
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
        timeout: 90000
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
      const requestTimeout = personality.provider === 'codex-cli' ? CODEX_TIMEOUT_MS : 90000;

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

      if (shouldRetryForDetail(aiResponse, intent)) {
        const retriedMessages = buildRetryMessages(messages, personality);
        aiResponse = await Promise.race([
          callProvider({
            provider: personality.provider,
            model: personality.model,
            messages: retriedMessages,
            botId: aiBot.id
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('detail retry timeout')), requestTimeout))
        ]);
      }
    }
  } catch (error) {
    console.error(`${aiBot.name} error:`, error.message);
    aiResponse = buildFailureResponse(aiBot, personality, error.message);
  }

  if (!aiResponse) {
    aiResponse = buildFailureResponse(aiBot, personality, 'empty response');
  }

  if (intent === 'greeting' && !aiResponse.includes('응답 실패')) {
    aiResponse = normalizeGreetingResponse(aiResponse, aiBot);
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
