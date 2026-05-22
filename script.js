// Combined Differential Diagnosis Game and Custom Symptom Builder
// The dataset of diseases is loaded globally from diseases.js as DISEASES.

/* eslint-disable no-alert */
/* eslint-disable no-console */

// Build a unique sorted list of all symptoms across the dataset
const ALL_SYMPTOMS = Array.from(new Set(Object.values(DISEASES).flat())).sort();

// Mode and case state
let currentMode = 'menu';
let caseCounter = 1;
let totalScore = 0;
let currentCase = null;
let selectedSymptoms = [];

// Flag to enable AI-driven case generation and evaluation. When true, the client
// will request the serverless AI functions to generate a case (initial symptoms
// and ranked differential list) and to evaluate the user's guesses. When false,
// the game uses the local dataset for random case generation and scoring. You
// can toggle this flag once your Netlify site is configured with the ai-case
// function and environment variables (see README or deployment instructions).
// Enable AI-driven case generation and scoring. When true, the client
// requests multi‑round cases from the Netlify backend. Set this to
// `false` if your deployment does not have the necessary API keys.
const AI_CASE_ENABLED = true;

// DOM references
const menuSection = document.getElementById('menu');
const gameSection = document.getElementById('game-mode');
const customSection = document.getElementById('custom-mode');

// Menu buttons
const startGameButton = document.getElementById('start-game-button');
const customModeButton = document.getElementById('custom-mode-button');
const backToMenuButton = document.getElementById('back-to-menu-button');

// Game mode elements
const caseNumberSpan = document.getElementById('case-number');
const stageNumberSpan = document.getElementById('stage-number');
const symptomsContainer = document.getElementById('symptoms-container');
const revealButton = document.getElementById('reveal-button');
const inputsContainer = document.getElementById('inputs-container');
const diseaseList = document.getElementById('disease-list');
const submitButton = document.getElementById('submit-button');
const resultDiv = document.getElementById('result');
const stageSummaryDiv = document.getElementById('stage-summary');
const aiExplanationButton = document.getElementById('ai-explanation-button');
const nextStageButton = document.getElementById('next-stage-button');
const nextCaseButton = document.getElementById('next-case-button');
const scoreDisplay = document.getElementById('score-display');

// Custom mode elements
const customSymptomInput = document.getElementById('custom-symptom-input');
const symptomList = document.getElementById('symptom-list');
const addSymptomButton = document.getElementById('add-symptom-button');
const clearSymptomsButton = document.getElementById('clear-symptoms-button');
const selectedSymptomsDiv = document.getElementById('selected-symptoms');
const customResultsDiv = document.getElementById('custom-results');
const customAIButton = document.getElementById('custom-ai-explanation-button');

// Helper to show the desired section and hide others
function showSection(section) {
  menuSection.classList.add('hidden');
  gameSection.classList.add('hidden');
  customSection.classList.add('hidden');
  if (section === 'menu') {
    menuSection.classList.remove('hidden');
  } else if (section === 'game') {
    gameSection.classList.remove('hidden');
  } else if (section === 'custom') {
    customSection.classList.remove('hidden');
  }
}

// Simple sound effect helper. Uses Web Audio API to play a short tone.
// Each type maps to a different frequency. If the browser does not
// support AudioContext, the function does nothing.
function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.type = 'square';
    // Assign frequencies based on sound type
    const frequencies = {
      correct: 700,
      wrong: 250,
      stage: 500,
      finish: 900,
    };
    osc.frequency.value = frequencies[type] || 440;
    osc.connect(ctx.destination);
    osc.start();
    setTimeout(() => osc.stop(), 200);
  } catch (e) {
    // silently ignore if audio cannot play
  }
}

// Populate datalists on page load
function populateDiseaseList() {
  diseaseList.innerHTML = '';
  Object.keys(DISEASES)
    .sort()
    .forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      diseaseList.appendChild(option);
    });
}

function populateSymptomList() {
  symptomList.innerHTML = '';
  ALL_SYMPTOMS.forEach((sym) => {
    const option = document.createElement('option');
    option.value = sym;
    symptomList.appendChild(option);
  });
}

// Shuffle an array (Fisher–Yates)
function shuffleArray(arr) {
  const array = arr.slice();
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Compute a ranking of diseases given a list of clues.
// Returns an array of disease names sorted by number of matching clues.
function computeRanking(clues) {
  const threshold = Math.max(1, Math.floor(clues.length * 0.5));
  const ranking = [];
  for (const [disease, symptoms] of Object.entries(DISEASES)) {
    const count = clues.filter((c) => symptoms.includes(c)).length;
    if (count >= threshold) {
      ranking.push({ disease, count });
    }
  }
  ranking.sort((a, b) => b.count - a.count || a.disease.localeCompare(b.disease));
  return ranking.map((item) => item.disease);
}

// Start a new game (resets score and case counter)
function startNewGame() {
  totalScore = 0;
  caseCounter = 1;
  scoreDisplay.textContent = `Total Score: ${totalScore}`;
  nextCaseButton.classList.add('hidden');
  aiExplanationButton.classList.add('hidden');
  stageSummaryDiv.classList.add('hidden');
  startNewCase();
}

// Start a new case: select random disease and initial symptoms
function startNewCase() {
  // When AI is enabled, request a new case from the serverless backend.
  // Otherwise, generate a random case locally.
  if (AI_CASE_ENABLED) {
    startNewCaseAI();
  } else {
    const diseases = Object.keys(DISEASES);
    const randomDisease = diseases[Math.floor(Math.random() * diseases.length)];
    const allSymptoms = DISEASES[randomDisease];
    const shuffled = shuffleArray(allSymptoms);
    const initialCount = Math.min(4, Math.max(3, Math.floor(Math.random() * 2) + 3));
    const displayedSymptoms = shuffled.slice(0, initialCount);
    const remaining = shuffled.slice(initialCount);
    currentCase = {
      disease: randomDisease,
      allSymptoms: allSymptoms,
      displayedSymptoms: displayedSymptoms,
      remainingSymptoms: remaining,
      stage: 1,
      stageGuesses: [],
      stageScores: [],
      stageRankings: [],
    };
    caseNumberSpan.textContent = caseCounter;
    stageNumberSpan.textContent = currentCase.stage;
    resultDiv.classList.add('hidden');
    revealButton.disabled = false;
    submitButton.disabled = false;
    nextStageButton.classList.add('hidden');
    nextCaseButton.classList.add('hidden');
    aiExplanationButton.classList.add('hidden');
    stageSummaryDiv.classList.add('hidden');
    populateDiseaseList();
    renderSymptoms();
    setupStageInputs();
  }
}

// Render the displayed symptoms list
function renderSymptoms() {
  symptomsContainer.innerHTML = '';
  const ul = document.createElement('ul');
  currentCase.displayedSymptoms.forEach((sym) => {
    const li = document.createElement('li');
    li.textContent = sym;
    ul.appendChild(li);
  });
  symptomsContainer.appendChild(ul);
}

// Set up input fields and ranking for the current stage
function setupStageInputs() {
  const stage = currentCase.stage;
  inputsContainer.innerHTML = '';
  // Determine the number of input fields based on stage. Stage 1 allows
  // three guesses, stage 2 allows two, stage 3 or higher allows one.
  const numInputs = stage === 1 ? 3 : stage === 2 ? 2 : 1;
  for (let i = 0; i < numInputs; i++) {
    const div = document.createElement('div');
    const input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('list', 'disease-list');
    input.placeholder = `Differential ${i + 1}`;
    div.appendChild(input);
    inputsContainer.appendChild(div);
  }
  // When AI mode is off, compute the ranking for this stage using the
  // displayed symptoms. In AI mode the ranking lists are supplied by
  // currentCase.stageRankings; we still slice to top 10 in case of
  // longer lists.
  if (!AI_CASE_ENABLED) {
    const ranking = computeRanking(currentCase.displayedSymptoms).slice(0, 10);
    currentCase.stageRankings[currentCase.stage - 1] = ranking;
  }
  // Hide results and summary before each new stage
  resultDiv.classList.add('hidden');
  stageSummaryDiv.classList.add('hidden');
}

// Reveal one extra clue (symptom) when user clicks reveal button
revealButton.addEventListener('click', () => {
  if (currentCase.remainingSymptoms.length > 0) {
    const extra = currentCase.remainingSymptoms.shift();
    currentCase.displayedSymptoms.push(extra);
    renderSymptoms();
    // update ranking for current stage
    currentCase.stageRankings[currentCase.stage - 1] = computeRanking(currentCase.displayedSymptoms).slice(0, 10);
  }
  if (currentCase.remainingSymptoms.length === 0) {
    revealButton.disabled = true;
  }
});

// Handle submit action for each stage
submitButton.addEventListener('click', () => {
  handleSubmit();
});

function handleSubmit() {
  const inputs = inputsContainer.querySelectorAll('input');
  const guesses = [];
  inputs.forEach((input) => {
    const val = input.value.trim();
    if (val) {
      guesses.push(val);
    }
  });
  if (guesses.length === 0) {
    alert('Please enter at least one differential.');
    return;
  }
  // Evaluation logic differs based on AI mode. When AI is enabled,
  // delegate ranking and scoring to the backend. Otherwise use local ranking.
  async function processResult() {
    let stageScore = 0;
    let bestPosition = null;
    let ranking = [];
    if (AI_CASE_ENABLED) {
      // Use the AI backend to evaluate guesses
      const result = await evaluateGuessesAI(guesses);
      stageScore = result.stageScore;
      bestPosition = result.bestPosition;
      ranking = result.ranking;
    } else {
      ranking = computeRanking(currentCase.displayedSymptoms);
      guesses.forEach((guess) => {
        const position = ranking.indexOf(guess);
        if (position >= 0) {
          const pos = position + 1;
          if (pos === 1) {
            stageScore += 10;
          } else if (pos === 2) {
            stageScore += 7;
          } else if (pos === 3) {
            stageScore += 5;
          } else {
            stageScore += 2;
          }
          if (bestPosition === null || pos < bestPosition) {
            bestPosition = pos;
          }
        }
      });
    }
    currentCase.stageGuesses[currentCase.stage - 1] = guesses;
    currentCase.stageScores[currentCase.stage - 1] = stageScore;
    totalScore += stageScore;
    scoreDisplay.textContent = `Total Score: ${totalScore}`;
    // display stage result
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = '';
    const p1 = document.createElement('p');
    p1.textContent = `Stage ${currentCase.stage} score: ${stageScore}`;
    resultDiv.appendChild(p1);
    if (bestPosition !== null) {
      const p2 = document.createElement('p');
      p2.textContent = `Your best-ranked differential was number #${bestPosition}`;
      resultDiv.appendChild(p2);
      // Play a sound to indicate at least one match
      playSound('correct');
    } else {
      const p2 = document.createElement('p');
      p2.textContent = 'None of your choices matched the top ranking.';
      resultDiv.appendChild(p2);
      // Play a sound to indicate no match
      playSound('wrong');
    }
    // disable reveal and submit for this stage
    revealButton.disabled = true;
    submitButton.disabled = true;
    // Decide next step
    // Determine whether to finish the case or proceed to next stage. In AI
    // mode we finish when the last round has been reached or the
    // ranking has narrowed to a single diagnosis. In local mode we use
    // the original logic: finish when ranking length <= 1, no more
    // symptoms to reveal or maximum stage reached.
    const rankingSize = ranking.length;
    if (AI_CASE_ENABLED && currentCase.rounds) {
      const atLastStage = currentCase.stage >= currentCase.totalStages;
      if (rankingSize <= 1 || atLastStage) {
        finishCase();
      } else {
        nextStageButton.classList.remove('hidden');
      }
    } else {
      const noMoreSymptoms = currentCase.remainingSymptoms.length === 0;
      const maxStage = currentCase.stage === 3;
      if (rankingSize <= 1 || noMoreSymptoms || maxStage) {
        finishCase();
      } else {
        nextStageButton.classList.remove('hidden');
      }
    }
  }
  // Execute async processing (sync for local mode). This ensures AI calls
  // complete before UI updates. It returns a promise but we do not await
  // because handleSubmit is not async; any errors will be logged.
  processResult();
}

// Advance to next stage when button clicked
nextStageButton.addEventListener('click', () => {
  currentCase.stage++;
  stageNumberSpan.textContent = currentCase.stage;
  // Play a stage transition sound
  playSound('stage');
  if (AI_CASE_ENABLED && currentCase.rounds) {
    // In AI mode, accumulate clues from the next round
    const nextIndex = currentCase.stage - 1;
    if (currentCase.rounds[nextIndex] && currentCase.rounds[nextIndex].clues) {
      currentCase.displayedSymptoms = currentCase.displayedSymptoms.concat(
        currentCase.rounds[nextIndex].clues
      );
    }
    renderSymptoms();
    // Ranking lists are already provided in currentCase.stageRankings
    revealButton.disabled = true;
    submitButton.disabled = false;
    nextStageButton.classList.add('hidden');
    setupStageInputs();
  } else {
    // Local mode: reveal two more symptoms if available
    for (let i = 0; i < 2; i++) {
      if (currentCase.remainingSymptoms.length > 0) {
        const sym = currentCase.remainingSymptoms.shift();
        currentCase.displayedSymptoms.push(sym);
      }
    }
    renderSymptoms();
    // update ranking for new stage
    currentCase.stageRankings[currentCase.stage - 1] = computeRanking(currentCase.displayedSymptoms).slice(0, 10);
    // reset UI
    revealButton.disabled = currentCase.remainingSymptoms.length === 0;
    submitButton.disabled = false;
    nextStageButton.classList.add('hidden');
    setupStageInputs();
  }
});

// Start next case
nextCaseButton.addEventListener('click', () => {
  caseCounter++;
  startNewCase();
});

// Finish case: show summary lists and enable AI explanation
function finishCase() {
  nextStageButton.classList.add('hidden');
  nextCaseButton.classList.remove('hidden');
  aiExplanationButton.classList.remove('hidden');
  stageSummaryDiv.classList.remove('hidden');
  // Play a sound to indicate the case is finished
  playSound('finish');
  stageSummaryDiv.innerHTML = '';
  const heading = document.createElement('p');
  heading.textContent = 'Differential lists for each stage:';
  stageSummaryDiv.appendChild(heading);
  currentCase.stageRankings.forEach((list, index) => {
    if (list && list.length) {
      const stageHeader = document.createElement('p');
      stageHeader.className = 'stage-list-header';
      stageHeader.textContent = `Stage ${index + 1} top DDx:`;
      stageSummaryDiv.appendChild(stageHeader);
      const ul = document.createElement('ul');
      list.forEach((name) => {
        const li = document.createElement('li');
        li.textContent = name;
        ul.appendChild(li);
      });
      stageSummaryDiv.appendChild(ul);
    }
  });
}

// Generate AI explanation for game mode
aiExplanationButton.addEventListener('click', async () => {
  await showAIExplanation(currentCase.stageGuesses, currentCase.stageRankings, currentCase.displayedSymptoms, currentCase.disease);
});

async function showAIExplanation(stageGuesses, stageRankings, displayedSymptoms, correctDisease) {
  aiExplanationButton.disabled = true;
  aiExplanationButton.textContent = 'Generating...';
  try {
    const payload = {
      mode: 'staged-game',
      symptoms: displayedSymptoms,
      userGuesses: stageGuesses,
      stageDifferentials: stageRankings,
      correctDiagnosis: correctDisease,
    };
    const explanation = await getAIExplanation(payload);
    const p = document.createElement('p');
    p.textContent = explanation;
    stageSummaryDiv.appendChild(p);
  } catch (err) {
    const p = document.createElement('p');
    p.textContent = 'AI explanation could not be generated.';
    p.style.color = 'red';
    stageSummaryDiv.appendChild(p);
  } finally {
    aiExplanationButton.disabled = false;
    aiExplanationButton.textContent = 'AI Explanation';
  }
}

// Custom mode initialisation
function startCustomMode() {
  selectedSymptoms = [];
  populateSymptomList();
  updateSelectedSymptomsDisplay();
  updateCustomResults();
  customAIButton.classList.add('hidden');
}

// ------------------ AI case management ------------------

/**
 * Request the serverless backend to generate a new case. The backend will
 * return a list of initial symptoms and a ranked differential list. A
 * fallback ranking is used if the request fails. After the case is set
 * up, the UI is reset similarly to the local case flow.
 */
async function startNewCaseAI() {
  try {
    const res = await fetch('/.netlify/functions/ai-case', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Request a multi‑round case and pass the PDF file name if present.
      body: JSON.stringify({ mode: 'generate-case', pdfFileName: 'Symptom to Disease 4e.pdf' }),
    });
    if (!res.ok) throw new Error('AI case generation failed');
    const data = await res.json();
    // The backend returns a `rounds` array where each element has
    // `clues` and `ddx`. The first element is also flattened as
    // `symptoms` and `ranking` for backward compatibility.
    const rounds = data.rounds || [];
    if (!rounds.length) throw new Error('AI did not return case rounds');
    // Build the currentCase structure to support multiple rounds. We keep
    // track of the full clues per stage (as provided) and the ranking list
    // for each stage. The displayedSymptoms array accumulates clues as
    // stages progress.
    currentCase = {
      disease: null,
      rounds: rounds.map((r) => ({ clues: r.clues.slice(), ddx: r.ddx.slice() })),
      displayedSymptoms: rounds[0].clues.slice(),
      stage: 1,
      stageGuesses: [],
      stageScores: [],
      stageRankings: rounds.map((r) => r.ddx.slice()),
      totalStages: rounds.length,
    };
    caseNumberSpan.textContent = caseCounter;
    stageNumberSpan.textContent = currentCase.stage;
    resultDiv.classList.add('hidden');
    revealButton.disabled = true; // AI manages clues; no manual reveal
    submitButton.disabled = false;
    nextStageButton.classList.add('hidden');
    nextCaseButton.classList.add('hidden');
    aiExplanationButton.classList.add('hidden');
    stageSummaryDiv.classList.add('hidden');
    populateDiseaseList();
    renderSymptoms();
    setupStageInputs();
  } catch (err) {
    // Fallback to local case generation on error
    console.error(err);
    AI_CASE_ENABLED = false;
    startNewCase();
  }
}

/**
 * Evaluate the user's guesses for the current stage using the AI backend. The
 * backend returns a score and the best ranking position of the canonical
 * guesses. If the call fails, fall back to local scoring. The result
 * object mirrors the structure used locally: { stageScore, bestPosition, ranking, canonicalGuesses }.
 */
async function evaluateGuessesAI(guesses) {
  try {
    const res = await fetch('/.netlify/functions/ai-case', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'evaluate-case',
        symptoms: currentCase.displayedSymptoms,
        userGuesses: guesses,
        ranking: currentCase.stageRankings[currentCase.stage - 1] || [],
      }),
    });
    if (!res.ok) throw new Error('AI evaluation failed');
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(err);
    // Fallback: compute ranking locally and evaluate guesses
    const ranking = computeRanking(currentCase.displayedSymptoms);
    let stageScore = 0;
    let bestPosition = null;
    guesses.forEach((guess) => {
      const pos = ranking.indexOf(guess) + 1;
      if (pos > 0) {
        if (pos === 1) stageScore += 10;
        else if (pos === 2) stageScore += 7;
        else if (pos === 3) stageScore += 5;
        else stageScore += 2;
        if (bestPosition === null || pos < bestPosition) bestPosition = pos;
      }
    });
    return { stageScore, bestPosition, ranking, canonicalGuesses: guesses };
  }
}

/**
 * Request an updated ranking for a custom set of symptoms using the AI backend.
 * If the request fails or AI is disabled, fall back to computeRanking().
 */
async function fetchCustomRankingAI(symptoms) {
  try {
    const res = await fetch('/.netlify/functions/ai-case', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'custom-ranking', selectedSymptoms: symptoms }),
    });
    if (!res.ok) throw new Error('AI custom ranking failed');
    const data = await res.json();
    return data.ranking || [];
  } catch (err) {
    console.error(err);
    return computeRanking(symptoms);
  }
}

// Event listeners for custom mode
addSymptomButton.addEventListener('click', () => {
  const val = customSymptomInput.value.trim();
  if (val && !selectedSymptoms.includes(val)) {
    selectedSymptoms.push(val);
    customSymptomInput.value = '';
    updateSelectedSymptomsDisplay();
    updateCustomResults();
  }
});

clearSymptomsButton.addEventListener('click', () => {
  selectedSymptoms = [];
  updateSelectedSymptomsDisplay();
  updateCustomResults();
});

function updateSelectedSymptomsDisplay() {
  selectedSymptomsDiv.innerHTML = '';
  selectedSymptoms.forEach((sym) => {
    const chip = document.createElement('span');
    chip.className = 'symptom-chip';
    chip.textContent = sym;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      selectedSymptoms = selectedSymptoms.filter((s) => s !== sym);
      updateSelectedSymptomsDisplay();
      updateCustomResults();
    });
    chip.appendChild(removeBtn);
    selectedSymptomsDiv.appendChild(chip);
  });
}

function updateCustomResults() {
  customResultsDiv.innerHTML = '';
  if (selectedSymptoms.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'Add some symptoms to see possible diagnoses.';
    customResultsDiv.appendChild(p);
    customAIButton.classList.add('hidden');
    return;
  }
  // Compute ranking asynchronously if AI is enabled
  const updateCards = (ranking) => {
    const top = ranking.slice(0, 5);
    top.forEach((diseaseName, idx) => {
      const symptoms = DISEASES[diseaseName];
      const absent = symptoms.filter((s) => !selectedSymptoms.includes(s));
      const card = document.createElement('div');
      card.className = 'ddx-card';
      const title = document.createElement('h3');
      title.textContent = `${idx + 1}. ${diseaseName}`;
      card.appendChild(title);
      const cols = document.createElement('div');
      cols.className = 'ddx-cols';
      // Present column
      const presentDiv = document.createElement('div');
      presentDiv.className = 'ddx-present';
      const presentTitle = document.createElement('p');
      presentTitle.textContent = 'Present symptoms';
      presentDiv.appendChild(presentTitle);
      const presentList = document.createElement('ul');
      selectedSymptoms.forEach((sym) => {
        const li = document.createElement('li');
        if (symptoms.includes(sym)) {
          li.className = 'present-match';
          li.textContent = `✓ ${sym}`;
        } else {
          li.className = 'present-miss';
          li.textContent = `✕ ${sym}`;
        }
        presentList.appendChild(li);
      });
      presentDiv.appendChild(presentList);
      cols.appendChild(presentDiv);
      // Absent column
      const absentDiv = document.createElement('div');
      absentDiv.className = 'ddx-absent';
      const absentTitle = document.createElement('p');
      absentTitle.textContent = 'Absent expected findings';
      absentDiv.appendChild(absentTitle);
      const absentList = document.createElement('ul');
      absent.forEach((sym) => {
        const li = document.createElement('li');
        li.className = 'absent-feature';
        li.textContent = sym;
        absentList.appendChild(li);
      });
      absentDiv.appendChild(absentList);
      cols.appendChild(absentDiv);
      card.appendChild(cols);
      customResultsDiv.appendChild(card);
    });
    customAIButton.classList.remove('hidden');
  };
  if (AI_CASE_ENABLED) {
    // Fetch ranking from serverless function
    fetchCustomRankingAI(selectedSymptoms).then((ranking) => updateCards(ranking));
  } else {
    updateCards(computeRanking(selectedSymptoms));
  }
}

customAIButton.addEventListener('click', async () => {
  customAIButton.disabled = true;
  customAIButton.textContent = 'Generating...';
  try {
    const payload = {
      mode: 'custom',
      selectedSymptoms: selectedSymptoms,
      topDifferentials: computeRanking(selectedSymptoms).slice(0, 5),
    };
    const explanation = await getAIExplanation(payload);
    const p = document.createElement('p');
    p.textContent = explanation;
    customResultsDiv.appendChild(p);
  } catch (err) {
    const p = document.createElement('p');
    p.textContent = 'AI explanation could not be generated.';
    p.style.color = 'red';
    customResultsDiv.appendChild(p);
  } finally {
    customAIButton.disabled = false;
    customAIButton.textContent = 'AI Explanation';
  }
});

// Helper to call the AI explanation serverless function
async function getAIExplanation(payload) {
  const response = await fetch('/.netlify/functions/explain-ddx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error('AI request failed');
  }
  const data = await response.json();
  return data.explanation || 'No explanation provided.';
}

// Event handlers for menu buttons
startGameButton.addEventListener('click', () => {
  currentMode = 'game';
  showSection('game');
  startNewGame();
});

customModeButton.addEventListener('click', () => {
  currentMode = 'custom';
  showSection('custom');
  startCustomMode();
});

backToMenuButton.addEventListener('click', () => {
  currentMode = 'menu';
  showSection('menu');
});

// Initialize by showing menu section
showSection('menu');