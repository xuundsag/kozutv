// V5.4.13d regression tests: regional dub discovery, Chinese audio identity and
// CJK caption timing. Runs without network so it can gate every release.
import assert from 'node:assert/strict';
import { _test as ai } from '../ai-transcription.js';
import { _testLangs as langs } from '../ott-resolvers.js';

// --- 1. Multi-audio dub discovery -----------------------------------------
// Naruto is served by one multi-audio master whose label names no language;
// before 5.4.13d a hardcoded skip dropped it and the series showed zero dubs.
assert(langs.REGIONAL_ANIME_WANTED.some(([code]) => code === 'zh'), 'Chinese is a wanted dub language');
assert(langs.REGIONAL_ANIME_WANTED.some(([code]) => code === 'yue'), 'Cantonese is a wanted dub language');
for (const label of ['Hindi','Tamil','Telugu','Malayalam','Kannada','Bengali','Chinese','Cantonese']) {
  assert(langs.REGIONAL_ANIME_LABELS.has(label), `${label} is a regional dub label`);
}

// --- 2. Chinese audio identity --------------------------------------------
const zh = langs.cleanLanguageOnlyLabel('中文', 'zh-Hans', 'ja');
assert.deepEqual(zh, { code: 'zh', label: 'Chinese' }, 'zh-Hans master becomes one Chinese dub');
assert.deepEqual(langs.cleanLanguageOnlyLabel('Mandarin', '', 'ja'), { code: 'zh', label: 'Chinese' });
assert.deepEqual(langs.cleanLanguageOnlyLabel('普通话', 'cmn', 'ja'), { code: 'zh', label: 'Chinese' });
assert.deepEqual(langs.cleanLanguageOnlyLabel('粤语', 'yue', 'ja'), { code: 'yue', label: 'Cantonese' });
assert.equal(langs.cleanLanguageOnlyLabel('Chinese Subtitles', 'zh', 'ja'), null, 'a Chinese subtitle is never treated as audio');
assert.equal(langs.normalizeAudioLangCode('zh-Hant-TW'), 'zh');
assert.equal(langs.normalizeAudioLangCode('yue-HK'), 'yue');

// --- 3. CJK caption timing ------------------------------------------------
// A stray punctuation token reported far away must not stretch the cue.
const stray = ai.wordsToCues([{ words: [
  { word: '你好', start_time: 0, end_time: 400, confidence: 0.9 },
  { word: '世界', start_time: 400, end_time: 900, confidence: 0.9 },
  { word: '。', start_time: 30000, end_time: 30500, confidence: 0.9 }
]}], 'zh', 0, 12);
assert.equal(stray.length, 1);
assert(stray[0].end <= 1.3, 'far-away punctuation cannot extend a Chinese cue: ' + JSON.stringify(stray));
// Adjacent punctuation still belongs to the phrase.
const adjacent = ai.wordsToCues([{ words: [
  { word: '你好', start_time: 0, end_time: 400, confidence: 0.9 },
  { word: '世界', start_time: 400, end_time: 900, confidence: 0.9 },
  { word: '。', start_time: 900, end_time: 950, confidence: 0.9 }
]}], 'zh', 0, 12);
assert.equal(adjacent[0].text, '你好世界。');
// Unpunctuated Chinese is split into readable captions rather than one block.
const pieces = ai.splitCjkText('你好世界今天天气很好我们一起去公园散步吧');
assert(pieces.length >= 2, 'long unpunctuated Chinese is split');
assert(pieces.every(x => x.length <= 24), 'each Chinese piece stays caption-sized');
assert.deepEqual(ai.splitCjkText('你好世界，今天天气很好。我们一起去公园散步吧'),
  ['你好世界，今天天气很好。', '我们一起去公园散步吧'], 'clause boundaries are preferred');
// English and Japanese behaviour is unchanged.
const en = ai.wordsToCues([{ words: [
  { word: 'Hello', start_time: 0, end_time: 400, confidence: 0.9 },
  { word: 'there', start_time: 400, end_time: 900, confidence: 0.9 },
  { word: '.', start_time: 900, end_time: 950, confidence: 0.9 }
]}], 'en', 0, 12);
assert.equal(en[0].text, 'Hello there.');
assert.equal(ai.wordsToCues([{ words: [
  { word: 'その', start_time: 0, end_time: 400, confidence: 0.9 },
  { word: '財宝', start_time: 400, end_time: 2480, confidence: 0.9 }
]}], 'ja', 0, 12)[0].text, 'その財宝');

console.log('PASS regional dub discovery, Chinese audio identity and CJK caption timing');
