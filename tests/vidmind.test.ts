import assert from "node:assert/strict";
import test from "node:test";
import { buildAdaptiveStudySchedule } from "../src/lib/scheduler/engine";
import { cosineSimilarity } from "../src/lib/rag/embeddings";
import { retrieveRelevantTranscript } from "../src/lib/rag/search";
import { inferMediaMimeType, isBinaryMediaFile } from "../src/lib/ai/transcribe";
import {
  chunkTranscript,
  extractPlaylistId,
  extractYouTubeVideoId,
  formatTimestamp,
  parseCaptionPayload,
  parseSrtOrVtt,
} from "../src/lib/youtube/extractor";

test("extractYouTubeVideoId supports all standard YouTube URL variants", () => {
  const id = "dQw4w9WgXcQ";
  const urls = [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=123`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube.com/embed/${id}`,
    id,
  ];
  for (const url of urls) {
    assert.equal(extractYouTubeVideoId(url), id);
  }
  assert.throws(() => extractYouTubeVideoId("https://vimeo.com/12345"));
});

test("parseCaptionPayload and chunkTranscript preserve timestamps", () => {
  const xml =
    '<transcript><text start="5.0" dur="4.0">Intro to architecture.</text><text start="65.0" dur="5.0">Database scaling.</text></transcript>';
  const segs = parseCaptionPayload(xml);
  assert.equal(segs.length, 2);
  assert.equal(segs[1].timestamp, "01:05");
  assert.equal(formatTimestamp(3665), "1:01:05");

  const chunks = chunkTranscript(segs, 4);
  assert.equal(chunks.length, 2);
});

test("retrieveRelevantTranscript supports timestamp queries", () => {
  const segs = [
    { start: 10, duration: 5, text: "Opening greeting", timestamp: "00:10" },
    { start: 150, duration: 10, text: "Vector indexes use cosine similarity.", timestamp: "02:30" },
  ];
  const hits = retrieveRelevantTranscript("What happened at 02:30?", segs, []);
  assert.equal(hits.length, 1);
  assert.ok(hits[0].excerpt.includes("cosine similarity"));
});

test("buildAdaptiveStudySchedule detects tight deadlines honestly and handles recovery", () => {
  const modules = [
    {
      id: "m1",
      order: 1,
      title: "Module 1",
      description: "Core",
      estimatedMinutes: 180,
      difficulty: "beginner" as const,
      lessons: [
        {
          id: "l1",
          order: 1,
          title: "Lesson 1",
          startSeconds: 0,
          endSeconds: 3600,
          startTimestamp: "00:00",
          endTimestamp: "1:00:00",
          estimatedMinutes: 90,
          difficulty: "beginner" as const,
          objectives: [],
          keyConcepts: ["basics"],
          aiExplanation: "",
          practicePrompt: "",
          completed: false,
        },
        {
          id: "l2",
          order: 2,
          title: "Lesson 2",
          startSeconds: 3600,
          endSeconds: 7200,
          startTimestamp: "1:00:00",
          endTimestamp: "2:00:00",
          estimatedMinutes: 90,
          difficulty: "beginner" as const,
          objectives: [],
          keyConcepts: ["advanced"],
          aiExplanation: "",
          practicePrompt: "",
          completed: false,
        },
      ],
    },
  ];

  const tight = buildAdaptiveStudySchedule(modules, {
    deadlineDays: 1,
    dailyMinutes: 30,
    knowledgeLevel: "beginner",
    learningSpeed: "moderate",
    schedulingMode: "balanced",
    preferredTime: "19:00",
    breakMinutes: 10,
    daysOff: [],
  });
  assert.equal(tight.feasible, false);
  assert.ok(tight.recommendedDays > 1);

  const recovered = buildAdaptiveStudySchedule(
    modules,
    {
      deadlineDays: 7,
      dailyMinutes: 180,
      knowledgeLevel: "beginner",
      learningSpeed: "moderate",
      schedulingMode: "balanced",
      preferredTime: "19:00",
      breakMinutes: 10,
      daysOff: [],
    },
    new Set(["l1"])
  );
  assert.equal(recovered.sessions.length, 1);
  assert.equal(recovered.sessions[0].lessonId, "l2");
});

test("parseSrtOrVtt, extractPlaylistId, and hybrid cosine similarity work cleanly", () => {
  const srt = "1\n00:00:02,000 --> 00:00:05,500\nBinary trees have root nodes.\n\n2\n00:01:05,000 --> 00:01:10,000\nTraversals include inorder.\n";
  const segs = parseSrtOrVtt(srt);
  assert.equal(segs.length, 2);
  assert.equal(segs[1].timestamp, "01:05");

  assert.equal(extractPlaylistId("https://www.youtube.com/playlist?list=PL1234567890"), "PL1234567890");
  assert.equal(extractPlaylistId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), null);

  assert.ok(cosineSimilarity([1, 0], [1, 0]) > 0.99);
  const hits = retrieveRelevantTranscript(
    "tree traversal",
    [],
    [
      {
        index: 0,
        startSeconds: 0,
        endSeconds: 60,
        startTimestamp: "00:00",
        endTimestamp: "01:00",
        content: "Binary trees and traversal algorithms.",
        embedding: [0.9, 0.1],
      },
    ],
    3,
    [0.9, 0.1]
  );
  assert.equal(hits.length, 1);
  assert.ok(hits[0].score > 0.5);
});

test("media detection identifies binary video/audio vs subtitle text formats", () => {
  assert.equal(isBinaryMediaFile("lecture01.mp4"), true);
  assert.equal(isBinaryMediaFile("voice_note.wav"), true);
  assert.equal(isBinaryMediaFile("audio.m4a"), true);
  assert.equal(isBinaryMediaFile("captions.srt"), false);
  assert.equal(isBinaryMediaFile("transcript.txt", "text/plain"), false);
  assert.equal(inferMediaMimeType("clip.webm"), "video/webm");
  assert.equal(inferMediaMimeType("recording.mp3"), "audio/mpeg");
});
