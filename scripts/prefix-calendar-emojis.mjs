import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { google } from 'googleapis';

const LOOKAHEAD_DAYS = 14;
const INTEGRATIONS_PATH = path.join(os.homedir(), '.claude', 'data', 'calendar', 'integrations.json');
const OLLAMA_EMBED_URL = 'http://127.0.0.1:11434/api/embeddings';
const OLLAMA_EMBED_MODEL = 'nomic-embed-text:latest';
const PERSONAL_INTEGRATION_ID = '52fc762d-7c0b-4966-9650-d0ae4820e1b1';
const OM_INTEGRATION_ID = 'bd227fcf-f146-450f-a63d-0cfcbdb761ec';
const PERSONAL_CALENDAR_ID = 'davebuckley34@gmail.com';
const OM_CALENDAR_ID = 'dave@openmined.org';
const GENERIC_EMOJI = '📌';

const EMOJI_CANDIDATES = [
  {
    emoji: '🎵',
    examples: [
      'learn wedding tunes',
      'band rehearsal',
      'practice guitar',
      'bass practice',
      'record demo',
      'track in studio',
      'music night',
    ],
  },
  {
    emoji: '💒',
    examples: [
      'wedding',
      'wedding prep',
      'bridesmaid fitting',
      'ceremony',
      'wedding reception',
    ],
  },
  {
    emoji: '🚗',
    examples: [
      'drive to venue',
      'car trip',
      'pick up by car',
      'road trip',
      'taxi to station',
    ],
  },
  {
    emoji: '🚶',
    examples: [
      'walk in the park',
      'long walk',
      'walking route',
      'stroll outside',
    ],
  },
  {
    emoji: '🏋️',
    examples: [
      'gym session',
      'workout',
      'strength training',
      'exercise block',
      'parkrun',
      'run and core',
    ],
  },
  {
    emoji: '✈️',
    examples: [
      'flight to city',
      'airport transfer',
      'plane journey',
      'travel day',
      'depart for holiday',
    ],
  },
  {
    emoji: '📞',
    examples: [
      'call with colleague',
      'meeting',
      'weekly sync',
      'catch up chat',
      'interview call',
      'one to one',
    ],
  },
  {
    emoji: '💻',
    examples: [
      'coding session',
      'ship feature',
      'fix bug',
      'deploy app',
      'software work',
      'dev task',
    ],
  },
  {
    emoji: '📝',
    examples: [
      'write draft',
      'edit document',
      'review notes',
      'reading session',
      'research task',
      'planning block',
    ],
  },
  {
    emoji: '🧾',
    examples: [
      'admin task',
      'forms and paperwork',
      'tax return',
      'pay bill',
      'expenses',
      'delay repay claim',
    ],
  },
  {
    emoji: '🍽️',
    examples: [
      'dinner with friends',
      'lunch booking',
      'coffee meeting',
      'meal out',
      'pub trip',
    ],
  },
  {
    emoji: '🏠',
    examples: [
      'home task',
      'water plants',
      'clean flat',
      'house admin',
      'checkout accommodation',
    ],
  },
];

let emojiCandidateEmbeddings;

function createAuthClient(integration) {
  const oauth2Client = new google.auth.OAuth2(integration.clientId, integration.clientSecret);
  oauth2Client.setCredentials({
    access_token: integration.credentials?.accessToken,
    refresh_token: integration.credentials?.refreshToken,
  });
  return oauth2Client;
}

async function loadIntegrations() {
  const raw = await fs.readFile(INTEGRATIONS_PATH, 'utf8');
  return JSON.parse(raw);
}

async function saveIntegrations(data) {
  await fs.writeFile(INTEGRATIONS_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function ensureValidCredentials(allIntegrations, integration) {
  if (!integration.credentials) {
    throw new Error(`Integration ${integration.name} has no credentials`);
  }

  if (integration.credentials.expiresAt && Date.now() < integration.credentials.expiresAt - 60_000) {
    return integration.credentials;
  }

  const oauth2Client = new google.auth.OAuth2(integration.clientId, integration.clientSecret);
  oauth2Client.setCredentials({ refresh_token: integration.credentials.refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();

  integration.credentials = {
    accessToken: credentials.access_token,
    refreshToken: integration.credentials.refreshToken,
    expiresAt: credentials.expiry_date || Date.now() + 3_600_000,
  };

  await saveIntegrations(allIntegrations);
  return integration.credentials;
}

function extractLeadingEmoji(title) {
  const match = title.match(/^\s*((?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F)?)/u);
  return match ? match[1] : null;
}

function stripLeadingEmoji(title) {
  return title.replace(/^\s*(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F)?\s*/u, '').trim();
}

function isAmbiguousBareTitle(title = '') {
  const trimmed = title.trim();
  if (!trimmed) return true;
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/.test(trimmed)) return true;
  if (/^[A-Z][a-z]+(?:shire)?$/.test(trimmed)) return true;
  return false;
}

function inferEmoji(title = '', description = '', location = '') {
  const haystack = `${title} ${description} ${location}`.toLowerCase();
  const rules = [
    [/(\bfooty\b|\bfootball\b|\bsoccer\b|\bworld cup\b|\barsenal\b|\bmatch\b)/, '⚽'],
    [/(\bparkrun\b|\bjog\b|\brunning\b|\b5k\b|\b10k\b)/, '🏃'],
    [/(\bdrive\b|\bcar\b|\buber\b|\btaxi\b|\blift\b)/, '🚗'],
    [/(\btrain\b|\brail\b|\bstation\b)/, '🚆'],
    [/(\bflight\b|\bfly\b|\bairport\b|\bholiday\b)/, '✈️'],
    [/(\bbus\b|\bcoach\b)/, '🚌'],
    [/(\bbike\b|\bcycle\b)/, '🚲'],
    [/(\bwalk\b|\bwalking\b|\bstroll\b)/, '🚶'],
    [/(\bgym\b|\bworkout\b|\bexercise\b|\brun\b|\btraining\b)/, '🏋️'],
    [/(\bhaircut\b|\bbarber\b|\bhairdresser\b)/, '💇'],
    [/(\bpedicure\b|\bmanicure\b|\bnails\b)/, '💅'],
    [/(\bdoctor\b|\bdentist\b|\bphysio\b|\btherapy\b|\bappointment\b|\bclinic\b|\bhospital\b)/, '🩺'],
    [/(\bcall\b|\bmeeting\b|\b1:1\b|\bone to one\b|\binterview\b|\bcatch[- ]?up\b|\bsync\b)/, '📞'],
    [/(\bemail\b|\binbox\b|\badmin\b|\bpaperwork\b|\bforms\b|\bself-assessment\b|\bpay\b|\bcancel\b|\bdelay repay\b)/, '🧾'],
    [/(\bwrite\b|\bdraft\b|\bedit\b|\breview\b|\bread\b|\bnotes\b)/, '📝'],
    [/(\bcoding\b|\bcode\b|\bdev\b|\bbug\b|\bdeploy\b|\bship\b|\bbuild\b|\bapp\b|\bdns\b)/, '💻'],
    [/(\bmusic\b|\btunes\b|\brehearsal\b|\bpractice\b|\bguitar\b|\bbass\b|\bsing\b|\bstudio\b|\btrack\b|\brecord\b|\bgig\b)/, '🎵'],
    [/(\bfilm\b|\bcinema\b|\bmovie\b)/, '🎬'],
    [/(\blunch\b|\bdinner\b|\bbreakfast\b|\bcoffee\b|\bdrink\b|\bpub\b|\brestaurant\b|\bmeal\b)/, '🍽️'],
    [/(\bshopping\b|\bbuy\b|\bgrocer(?:y|ies)\b|\berrands?\b)/, '🛒'],
    [/(\bclean\b|\btidy\b|\blaundry\b|\bwash\b)/, '🧹'],
    [/(\bwater plants?\b|\bplants?\b|\bgarden(?:s)?\b)/, '🌿'],
    [/(\bcheckout\b|\bcheck out\b|\bhotel\b|\baccommodation\b|\bhome\b|\bhouse\b|\bflat\b)/, '🏠'],
    [/(\btravel\b|\btrip\b|\bjourney\b)/, '🧳'],
  ];

  for (const [pattern, emoji] of rules) {
    if (pattern.test(haystack)) return emoji;
  }

  return null;
}

async function fetchEmbedding(input) {
  const response = await fetch(OLLAMA_EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_EMBED_MODEL,
      prompt: input,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data.embedding)) {
    throw new Error('Embedding response missing embedding vector');
  }

  return data.embedding;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function ensureEmojiCandidateEmbeddings() {
  if (emojiCandidateEmbeddings) {
    return emojiCandidateEmbeddings;
  }

  emojiCandidateEmbeddings = await Promise.all(
    EMOJI_CANDIDATES.map(async (candidate) => {
      const prompt = candidate.examples.join('\n');
      const embedding = await fetchEmbedding(prompt);
      return { ...candidate, embedding };
    }),
  );

  return emojiCandidateEmbeddings;
}

async function inferEmojiWithEmbeddings(title = '', description = '', location = '') {
  if (isAmbiguousBareTitle(title)) {
    return GENERIC_EMOJI;
  }

  const semanticText = [title, description, location].filter(Boolean).join('\n');
  const titleEmbedding = await fetchEmbedding(semanticText);
  const candidates = await ensureEmojiCandidateEmbeddings();

  let best = { emoji: GENERIC_EMOJI, score: -Infinity };

  for (const candidate of candidates) {
    const score = cosineSimilarity(titleEmbedding, candidate.embedding);
    if (score > best.score) {
      best = { emoji: candidate.emoji, score };
    }
  }

  return best.score >= 0.38 ? best.emoji : GENERIC_EMOJI;
}

function formatWindowStart() {
  const now = new Date();
  return new Date(now.getTime() - 60_000).toISOString();
}

function formatWindowEnd() {
  const end = new Date();
  end.setDate(end.getDate() + LOOKAHEAD_DAYS);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

function attendeeEmails(event) {
  return (event.attendees || [])
    .map((attendee) => attendee.email?.toLowerCase())
    .filter(Boolean);
}

function isSoloOmEvent(event) {
  const emails = new Set(attendeeEmails(event));
  const organiser = event.organizer?.email?.toLowerCase();
  const creator = event.creator?.email?.toLowerCase();
  if (organiser) emails.add(organiser);
  if (creator) emails.add(creator);

  if (emails.size === 0) {
    return true;
  }

  return emails.size === 1 && emails.has(OM_CALENDAR_ID);
}

async function listEvents(calendar, calendarId) {
  const response = await calendar.events.list({
    calendarId,
    timeMin: formatWindowStart(),
    timeMax: formatWindowEnd(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 2500,
  });

  return response.data.items || [];
}

async function maybePrefixEvent(calendar, calendarId, event) {
  const currentTitle = event.summary || 'Untitled Event';
  const currentEmoji = extractLeadingEmoji(currentTitle);
  const baseTitle = currentEmoji ? stripLeadingEmoji(currentTitle) : currentTitle;
  let emoji = inferEmoji(baseTitle, event.description || '', event.location || '');
  if (!emoji) {
    emoji = await inferEmojiWithEmbeddings(baseTitle, event.description || '', event.location || '');
  }

  const nextTitle = `${emoji} ${baseTitle}`;
  if (nextTitle === currentTitle) {
    return { updated: false, reason: 'already-correct', title: currentTitle };
  }

  await calendar.events.patch({
    calendarId,
    eventId: event.id,
    requestBody: {
      summary: nextTitle,
    },
  });

  return { updated: true, title: nextTitle, previousTitle: currentTitle };
}

async function runForIntegration(allIntegrations, integrationId, calendarId, filterFn = null) {
  const integration = allIntegrations.googleIntegrations.find((item) => item.id === integrationId);
  if (!integration) {
    throw new Error(`Missing Google integration ${integrationId}`);
  }

  await ensureValidCredentials(allIntegrations, integration);
  const auth = createAuthClient(integration);
  const calendar = google.calendar({ version: 'v3', auth });
  const events = await listEvents(calendar, calendarId);
  const eligible = filterFn ? events.filter(filterFn) : events;
  const results = [];

  for (const event of eligible) {
    if (!event.id) continue;
    const outcome = await maybePrefixEvent(calendar, calendarId, event);
    results.push({
      id: event.id,
      start: event.start?.dateTime || event.start?.date || '',
      ...outcome,
    });
  }

  return {
    integrationName: integration.name,
    calendarId,
    scanned: events.length,
    eligible: eligible.length,
    updated: results.filter((item) => item.updated).length,
    skipped: results.filter((item) => !item.updated).length,
    results,
  };
}

async function main() {
  const allIntegrations = await loadIntegrations();
  const personal = await runForIntegration(allIntegrations, PERSONAL_INTEGRATION_ID, PERSONAL_CALENDAR_ID);
  const om = await runForIntegration(allIntegrations, OM_INTEGRATION_ID, OM_CALENDAR_ID, isSoloOmEvent);

  const summary = {
    ranAt: new Date().toISOString(),
    lookaheadDays: LOOKAHEAD_DAYS,
    totals: {
      scanned: personal.scanned + om.scanned,
      eligible: personal.eligible + om.eligible,
      updated: personal.updated + om.updated,
      skipped: personal.skipped + om.skipped,
    },
    calendars: [personal, om],
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
