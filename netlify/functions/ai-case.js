const fs = require('fs');
const path = require('path');

/**
 * AI case management function for Netlify.
 *
 * This serverless function is designed to power advanced workflows for the
 * differential‑diagnosis game. It supports three modes:
 *  1. `generate-case` – produce an initial set of clues (symptoms/signs) that
 *     yield multiple plausible differential diagnoses. This can be driven
 *     by an AI model in production, but falls back to a deterministic
 *     algorithm based on the local dataset when no AI key is present.
 *
 *  2. `evaluate-case` – evaluate a set of user guesses against the current
 *     symptom list. It canonicalises common abbreviations (e.g. “DKA” →
 *     “Diabetic Ketoacidosis”) and scores the answers based on the
 *     underlying ranking of diseases. Optionally, this can be enhanced
 *     with an AI model to incorporate disease prevalence or additional
 *     heuristics.
 *
 *  3. `custom-ranking` – compute a ranked differential list for an arbitrary
 *     set of user‑selected symptoms. In AI mode this can incorporate
 *     textbook or internet sources; in fallback mode it uses simple
 *     matching against the dataset.
 *
 * The dataset is loaded from `diseases.json` at the project root. A
 * small synonym dictionary provides mappings from common abbreviations or
 * alternative disease names to canonical entries in the dataset.
 */

// Load disease dataset from the shared diseases.js file. In Node.js
// environments (serverless functions) the DISEASES constant is exported.
// This avoids issues with JSON formatting and keeps the client and
// server in sync.
const DISEASES = require('../../diseases.js');

// Helper: build a unique sorted list of symptoms across all diseases.
const ALL_SYMPTOMS = Array.from(
  new Set(Object.values(DISEASES).flat().map((s) => s.trim()))
).sort();

// A small dictionary of common synonyms and abbreviations mapped to their
// canonical disease names. This can be extended over time. When using a
// true AI model, this mapping can be learned implicitly.
const SYNONYMS = {
  dka: 'Diabetic ketoacidosis',
  'diabetic ketoacidosis': 'Diabetic ketoacidosis',
  'bergers disease': "IgA nephropathy (Berger's disease)",
  bergers: "IgA nephropathy (Berger's disease)",
  'tb': 'Tuberculosis',
  't.b.': 'Tuberculosis',
  influenza: 'Influenza',
  'common cold': 'Common cold',
  covid: 'COVID-19',
  covid19: 'COVID-19',
};

// Normalise a guess by trimming, lowercasing and removing punctuation.
function normalise(text) {
  return text
    .toLowerCase()
    .replace(/['"\-]/g, '')
    .replace(/\s+/g, ' ') // collapse multiple spaces
    .trim();
}

// Canonicalise a user guess to a disease in the dataset.
function mapGuessToDisease(guess) {
  const norm = normalise(guess);
  // Direct match via synonyms
  if (SYNONYMS[norm]) return SYNONYMS[norm];
  // Exact match to dataset key
  for (const disease of Object.keys(DISEASES)) {
    if (normalise(disease) === norm) return disease;
  }
  // Partial match: check if guess is contained within disease name or vice versa
  for (const disease of Object.keys(DISEASES)) {
    const dNorm = normalise(disease);
    if (dNorm.includes(norm) || norm.includes(dNorm)) {
      return disease;
    }
  }
  return null;
}

// Compute a ranking of diseases given a list of clues. Only diseases with
// at least `threshold` matching clues are included. The ranking is sorted
// descending by match count and then alphabetically.
function computeRanking(clues) {
  const cleanClues = clues.map((c) => c.trim());
  const threshold = Math.max(1, Math.floor(cleanClues.length * 0.5));
  const ranking = [];
  for (const [disease, symptoms] of Object.entries(DISEASES)) {
    const count = cleanClues.filter((c) => symptoms.includes(c)).length;
    if (count >= threshold) {
      ranking.push({ disease, count });
    }
  }
  ranking.sort((a, b) => b.count - a.count || a.disease.localeCompare(b.disease));
  return ranking.map((item) => item.disease);
}

// For generate-case: select a set of clues that yields multiple differentials.
function generateCase() {
  // Build a list of candidate symptoms that appear in at least 3 diseases. This
  // ensures that the clues will produce multiple differential diagnoses.
  const symptomCounts = {};
  for (const symptoms of Object.values(DISEASES)) {
    symptoms.forEach((sym) => {
      symptomCounts[sym] = (symptomCounts[sym] || 0) + 1;
    });
  }
  const commonSymptoms = Object.keys(symptomCounts).filter((sym) => symptomCounts[sym] >= 3);
  // Randomly shuffle the list of common symptoms.
  const shuffled = commonSymptoms.sort(() => Math.random() - 0.5);
  // Attempt to pick 3 or 4 clues that yield more than one diagnosis.
  for (let attempts = 0; attempts < shuffled.length; attempts++) {
    const count = Math.random() < 0.5 ? 3 : 4;
    const clues = shuffled.slice(attempts, attempts + count);
    const ranking = computeRanking(clues);
    if (ranking.length > 1) {
      return { clues, ranking };
    }
  }
  // Fallback: pick any three symptoms from the master list
  const fallback = ALL_SYMPTOMS.sort(() => Math.random() - 0.5).slice(0, 3);
  return { clues: fallback, ranking: computeRanking(fallback) };
}

// Evaluate user guesses: returns a score and best position based on ranking.
function evaluateGuesses(symptoms, guesses) {
  const ranking = computeRanking(symptoms);
  let stageScore = 0;
  let bestPosition = null;
  const canonicalGuesses = [];
  guesses.forEach((guess) => {
    const mapped = mapGuessToDisease(guess);
    canonicalGuesses.push(mapped || guess);
    if (mapped) {
      const idx = ranking.indexOf(mapped);
      if (idx >= 0) {
        const pos = idx + 1;
        // Assign points decreasing with rank. You can adjust these values
        // based on prevalence or AI‑derived heuristics.
        if (pos === 1) stageScore += 10;
        else if (pos === 2) stageScore += 7;
        else if (pos === 3) stageScore += 5;
        else stageScore += 2;
        if (bestPosition === null || pos < bestPosition) bestPosition = pos;
      }
    }
  });
  return { stageScore, bestPosition, ranking, canonicalGuesses };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }
  try {
    const body = JSON.parse(event.body || '{}');
    const mode = body.mode || '';
    if (mode === 'generate-case') {
      // In production you could call a language model here to select clues
      // based on prevalence, textbook information or other heuristics.
      const { clues, ranking } = generateCase();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms: clues, ranking }),
      };
    } else if (mode === 'evaluate-case') {
      const symptoms = body.symptoms || [];
      const guesses = body.userGuesses || [];
      const result = evaluateGuesses(symptoms, guesses);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      };
    } else if (mode === 'custom-ranking') {
      const selected = body.selectedSymptoms || [];
      const ranking = computeRanking(selected).slice(0, 10);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ranking }),
      };
    }
    // Unsupported mode
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid mode' }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Internal server error' }),
    };
  }
};