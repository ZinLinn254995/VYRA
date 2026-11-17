# YouTube Video Discovery and Faithful Subtitle Requirements

**Status:** Product requirement accepted — November 17, 2026  
**Scope:** VYRA video discovery, source handling, speech transcription, and subtitle generation.

## 1. YouTube discovery must not be Creative-Commons-only

- Search across YouTube video results regardless of whether a video uses the Creative Commons license or the standard YouTube license.
- Do not silently add a Creative-Commons-only filter. In YouTube Data API terms, use the unfiltered / `videoLicense=any` behavior.
- Do not require a video to already have captions; caption availability is not a search eligibility requirement.
- Offer ordinary discovery filters (query, duration, date, region, relevance, views) only when selected by the user.
- Preserve source attribution and show the YouTube video/channel, original URL, and the available license/rights metadata when known.
- Search is best-effort discovery, not a promise that VYRA can enumerate every video ever uploaded. YouTube's search endpoint returns ranked, paginated matches (up to 50 per page), and search totals are approximate. Continue using page tokens when the user requests more results.

## 2. Discovery does not grant reuse rights

A YouTube search result is not permission to download, copy, edit, redistribute, or republish that video. Keep discovery and rights authorization as separate concerns.

- Prefer official YouTube playback/embedding for ordinary viewing.
- Only ingest/download or transform third-party video/audio when the user supplies the media, owns it, or has the required permission/license.
- For YouTube caption-track retrieval, use only supported, authorized access. The YouTube Data API's caption download endpoint requires permission to edit the video; it is not a general-purpose way to download captions from arbitrary public videos.
- Never bypass YouTube access controls, DRM, download restrictions, or creator permissions.
- Clearly distinguish the video's displayed YouTube license from any additional permission the user may need for a particular use.

## 3. Original audio is the source of truth

- Preserve the video's original audio and original spoken performance.
- Do not synthesize Thai speech or any other replacement narration by default.
- Do not dub, voice-clone, re-voice, translate-and-speak, or replace the original speaker's audio as part of the subtitle-only workflow.
- Subtitle generation must not change the audio track, timing, pitch, volume, or spoken content.
- If the user later explicitly requests voice generation as a separate task, treat it as a separate workflow requiring explicit confirmation; it is not part of subtitle generation.

## 4. Faithful, evidence-based subtitles only

- Generate subtitles from the actual audio speech, using speech recognition with timestamps and source-audio alignment.
- Default to verbatim transcription in the language actually spoken. Do not translate into Thai or another language unless the user explicitly asks for a translated subtitle track.
- Never invent dialogue, paraphrase the speaker, add context from the title/description/comments, or fill gaps using scene visuals or general knowledge.
- Do not add narration, explanations, reactions, sound descriptions, or dialogue that cannot be heard in the source.
- Preserve meaningful wording, names, numbers, and speaker changes. Apply punctuation and line breaks for readability without changing meaning.
- Every subtitle segment must map to an audio interval. Do not create captions for silent sections.
- If speech is unclear, overlapping, masked by noise, or not confidently recognized, mark the segment for review / inaudible according to the subtitle format. Do not guess a plausible sentence.
- Do not claim 100% accuracy solely because an ASR model returned text. Use confidence thresholds and audio replay/review for uncertain spans; retain provenance to the source time range.
- Existing creator-provided captions may be used only when access is authorized and the selected track is appropriate. Clearly distinguish creator captions from VYRA-generated ASR transcripts.

## 5. Subtitle-only output contract

The subtitle workflow may produce:
- a subtitle track/file (for example, WebVTT or SRT);
- transcript text with source timestamps;
- review markers for uncertain or inaudible speech.

It must not produce a replacement voice track or a newly narrated video. The original video and audio remain unchanged. If a future export burns subtitles into a copy of a video, that is a separate video transformation and must pass the same source-rights/permission checks.

## 6. Acceptance tests

1. Search returns standard-license and Creative-Commons videos when they match the query; it does not force Creative Commons.
2. Videos without existing captions remain discoverable.
3. Pagination can retrieve additional ranked matches without claiming exhaustive coverage of YouTube.
4. A public search result alone does not authorize download, ingestion, transformation, or redistribution.
5. The subtitle-only path never calls TTS, dubbing, voice cloning, or audio replacement.
6. A subtitle is emitted only when grounded in a recognized source-audio interval.
7. Unclear or low-confidence speech is flagged for review rather than completed from context.
8. Default transcript language follows the spoken language; translation requires an explicit request and is labeled as translation.
9. The source audio remains unchanged after subtitle generation.
10. Tests cover hallucinated dialogue rejection, timestamps, overlapping speech, silence, uncertain words, and original-audio preservation.

## 7. YouTube API constraints

The YouTube Data API `search.list` supports video search, `videoLicense=any`, `videoCaption=any`, pagination, and up to 50 results per page. It is a ranked search service, not a complete public-video catalogue. Its default quota allocation and per-call costs must be considered when designing broad searches.

The YouTube Data API `captions.download` method requires OAuth authorization and permission to edit the video. It must not be treated as an endpoint for downloading arbitrary public creators' caption tracks.

## 8. Product default

**Find broadly. Respect source rights. Keep original audio. Transcribe only what is actually spoken. Add subtitles only — never unrequested TTS or invented dialogue.**
