import assert from 'node:assert/strict';
import {
  inferQuestionMediaType,
  normalizeAudioMaxPlays,
  validateQuestionAudioFile,
  validateQuestionImageFile,
} from '../src/utils/questionMedia';
import { ActiveQuestionState } from '../src/types/multiplayer';

// 1. Backward-compatible mediaType inference
assert.equal(inferQuestionMediaType(null), 'text');
assert.equal(inferQuestionMediaType({}), 'text');
assert.equal(
  inferQuestionMediaType({ imageUrl: 'https://firebasestorage.googleapis.com/img.webp' }),
  'image',
  'Legacy image question without mediaType should infer image'
);
assert.equal(
  inferQuestionMediaType({ audioUrl: 'https://firebasestorage.googleapis.com/clip.mp3' }),
  'audio',
  'Audio question without mediaType should infer audio'
);
assert.equal(
  inferQuestionMediaType({
    mediaType: 'audio',
    audioUrl: 'https://firebasestorage.googleapis.com/clip.mp3',
  }),
  'audio'
);
assert.equal(
  inferQuestionMediaType({
    mediaType: 'image',
    imageUrl: 'data:image/png;base64,AAA',
  }),
  'text',
  'Invalid Base64 imageUrl should not resolve to image'
);

// 2. Audio max plays normalization
assert.equal(normalizeAudioMaxPlays(null), null);
assert.equal(normalizeAudioMaxPlays(undefined), null);
assert.equal(normalizeAudioMaxPlays(''), null);
assert.equal(normalizeAudioMaxPlays(0), null);
assert.equal(normalizeAudioMaxPlays(-3), null);
assert.equal(normalizeAudioMaxPlays(1), 1);
assert.equal(normalizeAudioMaxPlays('3'), 3);
assert.equal(normalizeAudioMaxPlays(99), 20);

// 3. File validation (Image & Audio)
assert.equal(
  validateQuestionImageFile({ name: 'logo.webp', type: 'image/webp', size: 1024 * 500 }),
  null
);
assert.ok(
  validateQuestionImageFile({ name: 'huge.png', type: 'image/png', size: 6 * 1024 * 1024 })
);
assert.ok(
  validateQuestionImageFile({ name: 'doc.pdf', type: 'application/pdf', size: 1024 })
);

assert.equal(
  validateQuestionAudioFile({ name: 'clip.mp3', type: 'audio/mpeg', size: 1024 * 1024 }),
  null
);
assert.equal(
  validateQuestionAudioFile({ name: 'voice.m4a', type: 'audio/mp4', size: 2 * 1024 * 1024 }),
  null
);
assert.equal(
  validateQuestionAudioFile({ name: 'sound.ogg', type: 'audio/ogg', size: 512 * 1024 }),
  null
);
assert.ok(
  validateQuestionAudioFile({ name: 'empty.mp3', type: 'audio/mpeg', size: 0 })
);
assert.ok(
  validateQuestionAudioFile({ name: 'too-big.wav', type: 'audio/wav', size: 11 * 1024 * 1024 })
);
assert.ok(
  validateQuestionAudioFile({ name: 'script.js', type: 'application/javascript', size: 500 })
);

// 4. Online ActiveQuestionState preserves audio & image metadata cleanly
const sampleAudioQuestion: ActiveQuestionState = {
  tileKey: 'sub1__300',
  questionId: 'q-audio-1',
  subcategoryId: 'sub1',
  subcategoryName: 'أصوات ومؤثرات',
  category: 'أصوات ومؤثرات',
  points: 300,
  difficulty: 'صعب',
  questionText: 'استمع للمقطع وحدد الصوت',
  correctAnswer: 'صوت الشلال',
  mediaType: 'audio',
  audioUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/clip.mp3?alt=media',
  audioMaxPlays: 2,
  isAnswerRevealed: false,
  openedAt: 1000,
  openedByHostId: 'host-1',
};
assert.equal(inferQuestionMediaType(sampleAudioQuestion), 'audio');
assert.equal(sampleAudioQuestion.audioMaxPlays, 2);

console.log('ALL_QUESTION_MEDIA_TESTS_PASSED');
