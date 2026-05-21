const fs = require('fs');
const path = require('path');
// Netlify functions run on Node 18+ by default, where fetch is global.
// Keep node-fetch as a fallback for older local dev environments.
const fetch = global.fetch || require('node-fetch');

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_) {
    return String(value);
  }
}

async function readPdfText(pdfFileName) {
  if (!pdfFileName) return '';

  // Prevent path traversal attacks such as ../../secret.env
  const cleanName = path.basename(pdfFileName);
  const candidatePaths = [
    path.join(process.cwd(), 'docs', cleanName),
    path.join(__dirname, '..', '..', 'docs', cleanName),
    path.join(__dirname, 'docs', cleanName),
  ];

  const filePath = candidatePaths.find((p) => fs.existsSync(p));
  if (!filePath) return '';

  try {
    const buffer = fs.readFileSync(filePath);
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(buffer);
    return (parsed.text || '').slice(0, 20000);
  } catch (error) {
    return `PDF was found but could not be parsed: ${error.message}`;
  }
}

function buildPrompt(body, pdfText) {
  const mode = body.mode || 'staged-game';
  const symptoms = body.symptoms || body.selectedSymptoms || [];
  const userGuesses = body.userGuesses || [];
  const stageDifferentials = body.stageDifferentials || body.topDifferentials || [];
  const correctDiagnosis = body.correctDiagnosis || '';

  let prompt = '';
  prompt += 'You are a medical educator helping with an educational differential diagnosis game.\n';
  prompt += 'This is NOT medical advice and must not be used for diagnosis or treatment.\n';
  prompt += 'Explain clinical reasoning clearly, concisely, and safely.\n\n';
  prompt += `Mode: ${mode}\n`;
  prompt += `Patient symptoms/signs: ${safeStringify(symptoms)}\n`;

  if (mode === 'staged-game') {
    prompt += `User guesses by stage: ${safeStringify(userGuesses)}\n`;
    prompt += `Computed DDx lists by stage: ${safeStringify(stageDifferentials)}\n`;
    if (correctDiagnosis) {
      prompt += `Correct diagnosis: ${correctDiagnosis}\n`;
    }
    prompt += '\nExplain:\n';
    prompt += '1. Why the high-ranked DDx fit the symptom pattern.\n';
    prompt += '2. Why weaker DDx are less likely.\n';
    prompt += '3. How the DDx narrows across stages.\n';
    prompt += '4. Which additional clues/tests would separate the leading diagnoses.\n';
  } else {
    prompt += `Top DDx generated: ${safeStringify(stageDifferentials)}\n`;
    prompt += '\nFor each top DDx, explain:\n';
    prompt += '1. Which selected symptoms support it.\n';
    prompt += '2. Which selected symptoms argue against it.\n';
    prompt += '3. Which expected findings are absent.\n';
    prompt += '4. What clue/test would help distinguish it from the others.\n';
  }

  if (pdfText) {
    prompt += '\nReference PDF excerpt for grounding/verification:\n';
    prompt += pdfText;
    prompt += '\nUse this reference only when it is relevant. Do not quote long passages.\n';
  }

  prompt += '\nKeep the response concise and educational. Use bullets.';
  return prompt;
}

async function callGemini(prompt, apiKey) {
  // gemini-pro is deprecated/removed for many projects. Use a configurable
  // model, with safe fallbacks. Set GEMINI_MODEL in Netlify to override.
  const modelsToTry = [
    process.env.GEMINI_MODEL,
    'gemini-2.0-flash',
    'gemini-1.5-flash',
  ].filter(Boolean);

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 900,
    },
  };

  const errors = [];

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      errors.push(`${model}: HTTP ${res.status} ${text.slice(0, 500)}`);
      continue;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      errors.push(`${model}: invalid JSON response`);
      continue;
    }

    const explanation = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('\n')
      .trim();

    if (explanation) {
      return { explanation, modelUsed: model };
    }

    errors.push(`${model}: no text in Gemini response`);
  }

  throw new Error(`Gemini request failed. Tried models: ${modelsToTry.join(', ')}. ${errors.join(' | ')}`);
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return json(500, {
        error: 'Missing GEMINI_API_KEY environment variable. Add it in Netlify: Site configuration → Environment variables, then redeploy.',
      });
    }

    const body = JSON.parse(event.body || '{}');
    const pdfText = await readPdfText(body.pdfFileName);
    const prompt = buildPrompt(body, pdfText);
    const result = await callGemini(prompt, apiKey);

    return json(200, {
      explanation: result.explanation,
      modelUsed: result.modelUsed,
      usedPdf: Boolean(pdfText),
    });
  } catch (error) {
    return json(500, {
      error: error.message || 'Internal server error',
    });
  }
};
