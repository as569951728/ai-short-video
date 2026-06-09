import { createServer } from 'node:http';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env.local');
const runtimeDir = resolve(process.cwd(), '.runtime');
const modelRunsPath = resolve(runtimeDir, 'model-runs.jsonl');

function providerFromBaseUrl(baseUrl) {
  if (!baseUrl) return 'unconfigured';

  try {
    return new URL(baseUrl).hostname;
  } catch {
    return 'custom';
  }
}

function recordModelRun(run) {
  mkdirSync(runtimeDir, { recursive: true });
  appendFileSync(modelRunsPath, `${JSON.stringify({
    provider: providerFromBaseUrl(run.baseUrl),
    model: run.model || '',
    taskType: run.taskType,
    status: run.status,
    errorMessage: run.errorMessage || '',
    createdAt: new Date().toISOString()
  })}\n`);
}

function readLocalEnv() {
  if (!existsSync(envPath)) return {};

  return readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((env, line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) return env;

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');
      env[key] = value;
      return env;
    }, {});
}

function getConfig(overrides = {}) {
  const localEnv = readLocalEnv();
  const baseUrl =
    overrides.baseUrl ||
    process.env.AI_PROVIDER_BASE_URL ||
    localEnv.AI_PROVIDER_BASE_URL ||
    '';
  const apiKey =
    overrides.apiKey ||
    process.env.AI_PROVIDER_API_KEY ||
    localEnv.AI_PROVIDER_API_KEY ||
    '';
  const model =
    overrides.model ||
    process.env.AI_STORY_MODEL ||
    localEnv.AI_STORY_MODEL ||
    '';

  return {
    baseUrl: baseUrl.replace(/\/+$/g, ''),
    apiKey,
    model
  };
}

function resolveAllowedOrigin(request) {
  const origin = request.headers.origin || '';
  if (/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) return origin;
  return 'http://127.0.0.1:5173';
}

function sendJson(request, response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(request),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy();
        rejectBody(new Error('Request body too large'));
      }
    });
    request.on('end', () => {
      if (!body) {
        resolveBody({});
        return;
      }

      try {
        resolveBody(JSON.parse(body));
      } catch {
        rejectBody(new Error('Invalid JSON body'));
      }
    });
  });
}

async function testModelConnection(overrides) {
  const config = getConfig(overrides);
  const missing = [];
  if (!config.baseUrl) missing.push('Base URL');
  if (!config.apiKey) missing.push('API Key');
  if (!config.model) missing.push('默认模型');

  if (missing.length > 0) {
    recordModelRun({
      ...config,
      taskType: 'connection_test',
      status: 'missing_config',
      errorMessage: `缺少${missing.join('、')}`
    });
    return {
      ok: false,
      status: 'missing_config',
      message: `缺少${missing.join('、')}。请在 .env.local 中配置，或在设置页临时填写后测试。`
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'user',
            content: '请只回复：连接测试通过'
          }
        ],
        temperature: 0,
        max_tokens: 16
      })
    });

    const text = await upstream.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 500) };
    }

    if (!upstream.ok) {
      recordModelRun({
        ...config,
        taskType: 'connection_test',
        status: 'upstream_error',
        errorMessage: data?.error?.message || data?.raw || `HTTP ${upstream.status}`
      });
      return {
        ok: false,
        status: 'upstream_error',
        message: `模型接口返回 ${upstream.status}。请检查 API Key、模型名和 Base URL。`,
        detail: data?.error?.message || data?.raw || ''
      };
    }

    recordModelRun({
      ...config,
      taskType: 'connection_test',
      status: 'connected'
    });
    return {
      ok: true,
      status: 'connected',
      message: '连接测试通过，默认模型可调用。',
      model: config.model,
      sample: data?.choices?.[0]?.message?.content || ''
    };
  } catch (error) {
    recordModelRun({
      ...config,
      taskType: 'connection_test',
      status: error.name === 'AbortError' ? 'timeout' : 'network_error',
      errorMessage: error.message
    });
    return {
      ok: false,
      status: error.name === 'AbortError' ? 'timeout' : 'network_error',
      message: error.name === 'AbortError' ? '连接超时。' : '网络或本地服务调用失败。',
      detail: error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildStoryPackagePrompt(input, profile) {
  return `你是短视频故事内容策划。请基于以下输入生成一条可发布的中文故事类短视频素材包。

要求：
- 只输出 JSON，不要输出 Markdown，不要解释。
- 字段必须完整。
- hook 必须是一句带中文问号“？”的开头悬念问题。
- 脚本适合口播，句子短，有冲突，有反击，有结尾悬念，正文不少于 260 个中文字符。
- storyboard 必须输出 5 到 8 段。
- 所有 JSON 字符串必须使用标准英文双引号，字符串内部不要使用中文弯引号“”或未转义英文双引号。
- 如果内容里需要引用某句话，用中文单书名号或冒号表达，不要在字符串里再套双引号。
- 不要模仿具体作者、影视作品或平台账号。
- 如果账号画像为空，也要正常生成。

输入：
${JSON.stringify({ input, profile }, null, 2)}

JSON 结构：
{
  "hook": "string",
  "script": "string",
  "storyboard": [
    {
      "scene": "string",
      "voiceover": "string",
      "visual": "string",
      "subtitle": "string"
    }
  ],
  "subtitles": ["string"],
  "titleOptions": ["string"],
  "selectedTitle": "string",
  "coverCopyOptions": ["string"],
  "selectedCoverCopy": "string",
  "publishCopy": "string",
  "score": {
    "hookStrength": 4,
    "emotionalDensity": 4,
    "conflictClarity": 4,
    "informationGain": 4,
    "conversationalStyle": 4,
    "visualExecutability": 4,
    "platformFit": 4,
    "samenessRisk": 3,
    "copyrightRisk": 5,
    "aiTraceRisk": 3,
    "recommendations": ["string"]
  }
}`;
}

function parseJsonFromModel(text) {
  const clean = text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('模型未返回 JSON');
    }
    return JSON.parse(clean.slice(start, end + 1));
  }
}

function validateGeneratedPackage(generated) {
  const requiredStringFields = ['hook', 'script', 'selectedTitle', 'selectedCoverCopy', 'publishCopy'];
  const missingStringField = requiredStringFields.find((field) => !generated?.[field] || typeof generated[field] !== 'string');
  if (missingStringField) return `缺少字段：${missingStringField}`;

  if (!Array.isArray(generated.storyboard) || generated.storyboard.length < 3) return '分镜不足';
  if (!Array.isArray(generated.subtitles) || generated.subtitles.length === 0) return '字幕缺失';
  if (!Array.isArray(generated.titleOptions) || generated.titleOptions.length < 3) return '标题选项不足';
  if (!Array.isArray(generated.coverCopyOptions) || generated.coverCopyOptions.length === 0) return '封面文案缺失';
  if (!generated.score || !Array.isArray(generated.score.recommendations)) return '质检评分缺失';

  return '';
}

function toSrtTime(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function buildSrt(segments) {
  return segments
    .map((segment, index) => `${index + 1}
${toSrtTime(segment.start)} --> ${toSrtTime(segment.end)}
${segment.subtitle}
`)
    .join('\n');
}

function estimateSegmentDuration(row) {
  const textLength = `${row.voiceover || ''}${row.subtitle || ''}`.replace(/\s/g, '').length;
  return Math.min(8, Math.max(3.5, Math.round((textLength / 7) * 10) / 10));
}

function buildVideoPlan(requestBody) {
  const project = requestBody?.project;
  const generated = project?.generated;
  if (!project || !generated || !Array.isArray(generated.storyboard)) {
    return {
      ok: false,
      status: 'bad_project',
      message: '缺少可导出的视频项目数据。'
    };
  }

  let cursor = 0;
  const segments = generated.storyboard.map((row, index) => {
    const duration = estimateSegmentDuration(row);
    const start = cursor;
    const end = Math.round((cursor + duration) * 10) / 10;
    cursor = end;

    return {
      index: index + 1,
      start,
      end,
      duration,
      scene: row.scene || `镜头 ${index + 1}`,
      voiceover: row.voiceover || row.subtitle || '',
      visual: row.visual || '使用可商用背景素材或简单文字画面。',
      subtitle: row.subtitle || row.voiceover || ''
    };
  });

  const totalDuration = segments.length > 0 ? segments[segments.length - 1].end : 0;
  const srt = buildSrt(segments);
  const ffmpegDraft = [
    '# 下一步可用 FFmpeg/Remotion 渲染此计划。',
    '# V1 当前先导出稳定结构，不自动使用未经确认的素材。',
    `# 标题：${generated.selectedTitle}`,
    `# 预计时长：${totalDuration.toFixed(1)} 秒`,
    'ffmpeg -loop 1 -i cover.png -i voiceover.wav -vf "subtitles=subtitles.srt:force_style=\'Fontsize=18\'" -shortest output.mp4'
  ].join('\n');

  return {
    ok: true,
    status: 'planned',
    message: '已生成自动成片 MVP 计划。当前计划适合后续 Remotion + FFmpeg 渲染。',
    plan: {
      title: generated.selectedTitle,
      coverCopy: generated.selectedCoverCopy,
      totalDuration,
      aspectRatio: '9:16',
      resolution: '1080x1920',
      segments,
      srt,
      ffmpegDraft,
      renderRoute: 'V1 推荐先用 Remotion + FFmpeg 做本地自动成片，不依赖剪映/Canva API。'
    }
  };
}

async function generateStoryPackage(requestBody) {
  const config = getConfig(requestBody?.modelConfig);
  const missing = [];
  if (!config.baseUrl) missing.push('Base URL');
  if (!config.apiKey) missing.push('API Key');
  if (!config.model) missing.push('默认模型');

  if (missing.length > 0) {
    recordModelRun({
      ...config,
      taskType: 'generate_story_package',
      status: 'missing_config',
      errorMessage: `缺少${missing.join('、')}`
    });
    return {
      ok: false,
      status: 'missing_config',
      message: `缺少${missing.join('、')}，已回退本地 Mock 生成。`
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const upstream = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: '你是一个中文故事类短视频策划，只返回符合要求的 JSON。'
          },
          {
            role: 'user',
            content: buildStoryPackagePrompt(requestBody.input, requestBody.profile)
          }
        ],
        temperature: 0.7,
        max_tokens: 3000,
        response_format: { type: 'json_object' }
      })
    });

    const text = await upstream.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok) {
      recordModelRun({
        ...config,
        taskType: 'generate_story_package',
        status: 'upstream_error',
        errorMessage: data?.error?.message || data?.raw?.slice(0, 500) || `HTTP ${upstream.status}`
      });
      return {
        ok: false,
        status: 'upstream_error',
        message: `模型接口返回 ${upstream.status}，已回退本地 Mock 生成。`,
        detail: data?.error?.message || data?.raw?.slice(0, 500) || ''
      };
    }

    const content = data?.choices?.[0]?.message?.content || '';
    const generated = parseJsonFromModel(content);
    const validationError = validateGeneratedPackage(generated);
    if (validationError) {
      recordModelRun({
        ...config,
        taskType: 'generate_story_package',
        status: 'invalid_model_output',
        errorMessage: validationError
      });
      return {
        ok: false,
        status: 'invalid_model_output',
        message: `模型输出结构不完整：${validationError}，已回退本地 Mock 生成。`
      };
    }

    recordModelRun({
      ...config,
      taskType: 'generate_story_package',
      status: 'generated'
    });
    return {
      ok: true,
      status: 'generated',
      message: '已使用真实模型生成内容包。',
      generated
    };
  } catch (error) {
    recordModelRun({
      ...config,
      taskType: 'generate_story_package',
      status: error.name === 'AbortError' ? 'timeout' : 'generation_error',
      errorMessage: error.message
    });
    return {
      ok: false,
      status: error.name === 'AbortError' ? 'timeout' : 'generation_error',
      message: error.name === 'AbortError' ? '模型生成超时，已回退本地 Mock 生成。' : '模型生成失败，已回退本地 Mock 生成。',
      detail: error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

const server = createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    sendJson(request, response, 200, { ok: true });
    return;
  }

  if (request.method === 'GET' && request.url === '/api/health') {
    sendJson(request, response, 200, { ok: true, service: 'AIShortvideo local API' });
    return;
  }

  if (request.method === 'POST' && request.url === '/api/model/test') {
    try {
      const body = await readBody(request);
      const result = await testModelConnection(body);
      sendJson(request, response, 200, result);
    } catch (error) {
      sendJson(request, response, 400, {
        ok: false,
        status: 'bad_request',
        message: error.message
      });
    }
    return;
  }

  if (request.method === 'POST' && request.url === '/api/generate/story-package') {
    try {
      const body = await readBody(request);
      const result = await generateStoryPackage(body);
      sendJson(request, response, 200, result);
    } catch (error) {
      sendJson(request, response, 400, {
        ok: false,
        status: 'bad_request',
        message: error.message
      });
    }
    return;
  }

  if (request.method === 'POST' && request.url === '/api/export/video-plan') {
    try {
      const body = await readBody(request);
      const result = buildVideoPlan(body);
      sendJson(request, response, result.ok ? 200 : 400, result);
    } catch (error) {
      sendJson(request, response, 400, {
        ok: false,
        status: 'bad_request',
        message: error.message
      });
    }
    return;
  }

  sendJson(request, response, 404, {
    ok: false,
    status: 'not_found',
    message: 'API route not found'
  });
});

const localEnv = readLocalEnv();
const port = Number(process.env.AI_API_PORT || localEnv.AI_API_PORT || 8787);

server.listen(port, '127.0.0.1', () => {
  console.log(`AIShortvideo local API listening on http://127.0.0.1:${port}`);
});
