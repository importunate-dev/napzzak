import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type SystemContentBlock,
  type Message,
} from '@aws-sdk/client-bedrock-runtime';
import type { TranscribeResult } from '@/lib/transcribe';

const REGION = process.env.AWS_REGION || 'us-east-1';

const PRO_MODEL_ID = 'us.amazon.nova-pro-v1:0';

const bedrockClient = new BedrockRuntimeClient({ region: REGION });

// ─── Pass 1: Video Deep Analysis Result ───

export interface VideoDeepAnalysis {
  duration: number;
  genre: string;
  hasAudioDialogue: boolean;
  characters: Array<{
    name: string;
    appearance: string;
    role: string;
  }>;
  storyArc: {
    setup: string;
    incitingIncident: string;
    climax: string;
    resolution: string;
  };
  timeline: Array<{
    timeRange: string;
    description: string;
    speakers?: string[];
    dialogue?: string;
  }>;
  fullStorySummary: string;
  keyMoments: string[];
}

// ─── Pass 2: Comic Panel Structure ───

export interface NovaAnalysisResult {
  duration: number;
  summary: string;
  summaryKo?: string;
  climaxIndex: number;
  hasAudioDialogue: boolean;
  characterDescriptions: string;
  setting?: string;
  panels: Array<{
    panelId: number;
    description: string;
    emotion: string;
    dialogue?: string;
    dialogueKo?: string;
    narrativeContext?: string;
  }>;
}

// ─── Util: Bedrock Call + JSON Parsing ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTextFromResponse(response: any): string {
  const outputContent = response?.output?.message?.content;
  if (!outputContent || outputContent.length === 0) {
    throw new Error('Bedrock: empty response');
  }

  const textBlock = outputContent.find((b: ContentBlock) => 'text' in b);
  if (!textBlock || !('text' in textBlock)) {
    throw new Error('Bedrock: no text content');
  }

  return textBlock.text as string;
}

function parseJsonFromText<T>(text: string): T {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('JSON parse failed: ' + text.slice(0, 300));
  }
  return JSON.parse(jsonMatch[0]) as T;
}

function buildVideoContentBlock(s3Uri: string, bucketOwner: string): ContentBlock {
  return {
    video: {
      format: 'mp4',
      source: {
        s3Location: { uri: s3Uri, bucketOwner },
      },
    },
  } as ContentBlock;
}

function buildFrameContentBlocks(frameImages: string[]): ContentBlock[] {
  return frameImages.map((base64, i) => ({
    image: {
      format: 'jpeg',
      source: { bytes: Buffer.from(base64, 'base64') },
    },
  } as ContentBlock));
}


// ─────────────────────────────────────────────
// Pass 1 Step A: Dialogue/Audio Verification
// ─────────────────────────────────────────────

export async function stepA_DialogueVerification(
  s3Uri: string,
  bucketOwner: string,
  transcriptText?: string,
  frameImages?: string[],
  duration?: number
): Promise<string> {
  const transcriptSection = transcriptText
    ? `\n\n=== AWS TRANSCRIBE RESULT (spoken WORDS only — may be incomplete) ===\n${transcriptText}\n=== END TRANSCRIBE ===\n\nIMPORTANT: The transcript above contains only RECOGNIZED WORDS.
AWS Transcribe CANNOT capture:
- Vocal sound effects (e.g., imitating a phone ringtone "ring ring", doorbell "ding dong", siren sounds)
- Onomatopoeia and non-word vocalizations
- Whispers, mumbles, or sounds below recognition threshold
These non-word vocal sounds are often the MOST IMPORTANT part of the story (e.g., someone imitating a ringtone to prank another person). You MUST watch and listen to the video independently to detect sounds that the transcript missed.

The speaker labels (spk_0, spk_1) are NOT mapped to specific people yet. YOUR JOB is to match each speaker label to a specific person you can SEE in the video.`
    : '';

  const maxEntries = duration ? Math.min(10, Math.ceil(duration / 3)) : 10;

  const systemPrompt: SystemContentBlock = {
    text: `You are a forensic video-audio analyst. Your job is to determine EXACTLY who produces each sound — both spoken dialogue AND non-verbal vocal sounds.

1. ⚠️ DURATION GUARD — HIGHEST PRIORITY ⚠️: ${duration ? `This video is EXACTLY ${duration} seconds long. You MUST NOT generate ANY observations, timestamps, or analysis beyond ${duration} seconds. If you find yourself writing timestamps past ${duration}s, STOP IMMEDIATELY. Any content beyond the video duration is HALLUCINATION. Your audio inventory MUST contain at most ${maxEntries} entries total. If you exceed this limit, you are being too granular — consolidate.` : `The video is SHORT (likely under 60 seconds). DO NOT generate or hallucinate timestamps beyond the actual video duration. Stop your analysis when the video ends. Your audio inventory MUST contain at most ${maxEntries} entries. If you find yourself repeating similar observations, STOP immediately.`}

2. CONSOLIDATION RULE — MERGE REPETITIVE PATTERNS: If a sound pattern repeats (e.g., vocal mimicry alternating with laughter, repeated knocking, back-and-forth banter), do NOT list each individual occurrence. Instead, merge them into a SINGLE time-range entry.
   BAD (too granular): "[14.0s] vocal mimicry", "[14.2s] laughter", "[14.4s] vocal mimicry", "[14.6s] laughter" ...
   GOOD (consolidated): "[14.0s-15.0s] vocal mimicry pattern: man repeatedly imitates phone ringtone, woman laughs (~4 repetitions)"
   This rule applies to ALL repetitive or alternating sound patterns. One consolidated entry per pattern, not one entry per 0.2-second occurrence.

ABSOLUTE PRIORITY RULE — SPEAKER ATTRIBUTION:
You MUST determine WHO produces each sound by matching these cues IN THIS EXACT ORDER:
3. LIP SYNC (highest priority): Whose mouth/lips are physically moving at the EXACT moment the sound is heard?
4. PHYSICAL ACTION: Who is performing a physical action that matches the sound (e.g., hands cupped around mouth, leaning toward someone)?
5. REACTION ANALYSIS (supplementary): If lip movements are not visible, the person who shows SURPRISE/CONFUSION is the LISTENER, not the producer.
Do NOT assign a sound to someone just because they are on camera. The camera often shows the REACTOR, not the PRODUCER.

METHODOLOGY - you MUST follow these steps:
6. First, LIST every person visible in the video by their appearance (e.g., "Person A: woman with dark hair in brown top", "Person B: man in blue shirt sitting at table").
7. For each sound heard in the video, CLASSIFY it:
   - SPOKEN DIALOGUE: actual words/sentences
   - VOCAL MIMICRY: a person imitating a sound with their voice (e.g., imitating a phone ringtone, doorbell, siren, animal sound, another person's voice, beatboxing). This is a DELIBERATE ACTION by the person — treat it as something they DID, not just background noise.
   - NON-VERBAL VOCAL SOUNDS: gasps, laughter, screams, sighs, grunts
   - ENVIRONMENTAL SOUNDS: actual phone ringing, door slamming, music (NOT produced by a person's voice)
8. For each sound, determine WHO produced it using this evidence hierarchy:
   PRIMARY EVIDENCE (use first):
   - LIP MOVEMENTS: Whose mouth is moving when the sound is heard?
   - CAMERA FOCUS: Is the camera showing the sound producer or someone reacting?

   WHEN LIP MOVEMENTS ARE NOT VISIBLE (e.g., camera shows only one person but the sound comes from off-screen or another person):
   - REACTION ANALYSIS: If the person ON SCREEN looks surprised, startled, confused, or turns toward the sound → they are the LISTENER, NOT the producer. The sound was made by someone ELSE (possibly off-screen or partially visible).
   - GAZE DIRECTION: If someone looks toward another person right when the sound plays → the sound likely came from that direction.
   - BODY LANGUAGE TIMING: The person who made the sound often shows anticipation (smirking, leaning in, watching for reaction) BEFORE or DURING the sound. The person who HEARS the sound shows reaction AFTER.
   - PROCESS OF ELIMINATION: If Person A is clearly reacting to a sound (startled, confused), then Person A did NOT make the sound → it must be Person B.
   - SUBSEQUENT BEHAVIOR: After the sound, who looks amused/satisfied (= producer) vs. who looks confused/annoyed (= receiver)?

9. CRITICAL — VOCAL MIMICRY & PRANK DETECTION: If a sound COULD be either real (environmental) or a person imitating it with their voice, check the REACTION.
   - ABSOLUTE PRANK LOGIC: If Person A is tricked by a fake sound (e.g., they pretend to answer a phone because they hear a ringtone), THEY DID NOT MAKE THAT SOUND. The sound was vocally mimicked by the OTHER person (the prankster). NEVER assign the prank sound to the victim reacting to it!
   - Does the sound quality suggest it's vocal (slightly imperfect, human-like) rather than electronic?
   - REACTION TEST: Does someone react with surprise (= they didn't make it) while another person watches with amusement (= they DID make it)?
   - Is this part of a prank or joke setup?
   - If lip movements are NOT visible for any person: use reaction analysis — the person who reacts with surprise/confusion is the TARGET, not the source.
10. NEVER assume the person shown on screen is the speaker — sometimes the camera shows the LISTENER's reaction. This is ESPECIALLY true in prank/comedy videos where the camera focuses on the VICTIM's reaction while the prankster acts off-screen.
11. ZERO GENDER BIAS: Do NOT assume men are more likely to be pranksters or initiators. Women prank men just as often. Determine who produced a sound based on EVIDENCE (lip movements, reactions, gaze), not stereotypes.
12. SUBJECT ATTRIBUTION — DOUBLE-CHECK: After your initial analysis, ask yourself:
   - "Did I actually SEE this person's mouth move, or did I just assume because they were on camera?"
   - "Is the person on screen REACTING to the sound (= listener) or PRODUCING it (= speaker)?"
   - "If I assigned the sound to Person A, does Person A show a REACTION (surprise, confusion)? If yes, Person A is probably the LISTENER, not the producer — reassign to Person B."
   If you cannot determine the producer with confidence, state it explicitly and explain your reasoning.
13. If Transcribe labels are provided (spk_0, spk_1), create a MAPPING TABLE: "spk_0 = [Person by appearance]", "spk_1 = [Person by appearance]".
14. TRANSCRIPT SKEPTICISM: The transcript (if provided) only contains recognized words.
   It is BLIND to vocal sound effects and onomatopoeia.
   If you see someone's mouth moving but the transcript shows nothing at that timestamp,
   they are likely making a non-word sound (mimicry, sound effect, etc.).
   This is often the TRIGGER of the entire scene. DO NOT ignore it just because the transcript is silent.
15. CHARACTER DEDUPLICATION: Count each PERSON only ONCE, regardless of how many scenes they appear in. If the same person appears in different scenes or camera angles, they are STILL ONE PERSON. Do NOT create separate entries for the same person (e.g., "Person C: same as Person A but in a different scene" is WRONG — just use Person A). Total character count should match the number of DISTINCT INDIVIDUALS.

Respond in plain text (NOT JSON). Be detailed and precise.`,
  };

  const contentBlocks: ContentBlock[] = [
    buildVideoContentBlock(s3Uri, bucketOwner),
  ];

  if (frameImages && frameImages.length > 0) {
    contentBlocks.push(...buildFrameContentBlocks(frameImages));
  }

  contentBlocks.push({
    text: `${duration ? `⚠️ HARD LIMIT: This video is EXACTLY ${duration} seconds long. ANY timestamp beyond ${duration}s is HALLUCINATION. STOP your analysis at ${duration}s. Do NOT invent or extrapolate events beyond this point.\n\n` : ''}Watch this video carefully and analyze ALL dialogue/audio.${transcriptSection}

STEP 1 - CHARACTER INVENTORY:
List every person visible. Describe each by appearance ONLY (hair, clothing, body type, position).

STEP 2 - COMPLETE AUDIO INVENTORY (CONCISE — max ${maxEntries} entries):
List sounds heard in the video chronologically. CONSOLIDATE repetitive/alternating patterns into single time-range entries instead of listing each occurrence separately.${duration ? ` Remember: video is ${duration}s — no timestamps beyond ${duration}s.` : ''}
For EACH sound:
- Timestamp (or time range for repeated patterns)
- Type: SPOKEN DIALOGUE / VOCAL MIMICRY / NON-VERBAL VOCAL / ENVIRONMENTAL
- If VOCAL MIMICRY: What sound is being imitated? (e.g., "phone ringtone", "doorbell", "animal sound")
- WHO produced it (check lip movements!)
IMPORTANT: A person imitating a phone ringtone, siren, or other sound effect with their VOICE is a VOCAL MIMICRY — this is a deliberate ACTION by that person. Do NOT classify it as environmental sound or ignore it. This is often the KEY ACTION that triggers the entire scene.

STEP 3 - CONTEXTUAL SPEAKER INFERENCE:
For EACH line of spoken dialogue:
- Quote the exact words spoken
- State the timestamp
- Identify the speaker by APPEARANCE (check lip movements!)
- State your CONFIDENCE (high/medium/low) and WHY you think this person is the speaker
- Note: the person SHOWN on screen may be the LISTENER, not the speaker

STEP 4 - SPEAKER LABEL MAPPING (if Transcribe data provided):
Create a table mapping Transcribe speaker IDs to visual characters:
- spk_0 = [describe person by appearance]
- spk_1 = [describe person by appearance]
For each mapping, use lip movement evidence and visual cues to determine which visible person corresponds to each speaker label.`,
  } as ContentBlock);

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: PRO_MODEL_ID,
      messages: [{ role: 'user', content: contentBlocks }],
      system: [systemPrompt],
      inferenceConfig: {
        maxTokens: duration
          ? Math.min(4096, Math.max(1024, Math.ceil(duration * 60)))
          : 4096,
        temperature: 0.1,
        topP: 0.9,
      },
    })
  );

  let text = extractTextFromResponse(response);

  // Post-processing: filter out lines containing timestamps beyond duration
  if (duration) {
    const maxTime = duration + 1; // 1 second tolerance
    text = text
      .split('\n')
      .filter((line) => {
        // Extract timestamp from [12.3s] or [12.3s-14.5s] patterns
        const match = line.match(/\[(\d+(?:\.\d+)?)s/);
        if (!match) return true; // Keep lines without timestamps
        return parseFloat(match[1]) <= maxTime;
      })
      .join('\n');
  }

  console.log(`[Nova Step A] Dialogue analysis complete (${text.length} chars)`);
  return text;
}

// ─────────────────────────────────────────────
// Pass 1 Step B: Interaction-Focused Action Analysis (Character Causality Focus)
// ─────────────────────────────────────────────

/** Step B: Chronological analysis of inter-character interactions + emotional changes + causality */
export async function stepB_ActionSequenceAnalysis(
  s3Uri: string,
  bucketOwner: string,
  transcriptText?: string,
  frameImages?: string[],
  duration?: number
): Promise<string> {
  const contentBlocks: ContentBlock[] = [
    buildVideoContentBlock(s3Uri, bucketOwner),
  ];

  if (frameImages && frameImages.length > 0) {
    contentBlocks.push(...buildFrameContentBlocks(frameImages));
  }

  const transcriptSection = transcriptText
    ? `\n\n=== AWS TRANSCRIBE RESULT (spoken WORDS only — may be incomplete) ===\n${transcriptText}\n=== END TRANSCRIBE ===\n\nThe transcript captures recognized words only. It MISSES vocal sound effects, onomatopoeia, and non-word vocalizations. You MUST independently listen for sounds not in the transcript — these missed sounds are often the KEY ACTION that triggers the entire scene (e.g., someone imitating a phone ringtone to trick another person).

Match each speaker's words to their visible actions and facial expressions. A person saying angry words with an angry face is ANGRY, not acting or pretending.`
    : '';

  const effectiveDuration = duration ?? (frameImages ? Math.round(frameImages.length * 0.5) : undefined);

  contentBlocks.push({
    text: `${effectiveDuration ? `This video is EXACTLY ${effectiveDuration} seconds long. Do NOT analyze beyond ${effectiveDuration}s. All timeline entries MUST have timestamps within 0s-${effectiveDuration}s.\n\n` : ''}Watch the ENTIRE video from beginning to end and analyze the INTERACTIONS between people.${transcriptSection}

STEP 1 - CHARACTER INVENTORY:
List every person visible. Describe each by appearance ONLY (hair, clothing, body type, position).

STEP 2 - INTERACTION TIMELINE:
Record all interactions between characters in chronological order. Focus on WHO does WHAT to WHOM:
Format: [TIME] [Person A description] → [action] → [Person B description] [reaction]

IMPORTANT — "actions" include VOCAL ACTIONS:
- A person imitating a sound (e.g., making a phone ringtone sound with their mouth, imitating a doorbell, mimicking an animal) is an ACTION performed BY that person.
- Vocal mimicry/sound effects made by a person are often the INITIATING ACTION that triggers the entire scene (e.g., Person A makes ringtone sound → Person B pretends to answer phone).
- Do NOT treat vocal mimicry as background noise — it is a deliberate action by a specific person.

EDGE-OF-FRAME DETECTION: Look very closely at people in the background or at the edges of the frame. If someone is covering their mouth, cupping their hands, or making a sound effect (like a phone ringing) to trick the person in the foreground, you MUST identify this as a PRANK. The person making the fake sound is the INITIATOR.

For EACH interaction, note:
- What is the INITIATING action? (who starts it — this could be a vocal action like imitating a sound!)
- What is the RESPONSE/REACTION? (how the other person responds)
- What CAUSED this interaction? (why did it happen at this moment)

HOW TO IDENTIFY THE INITIATOR vs REACTOR:
- The INITIATOR acts FIRST and often shows anticipation (smirking, watching for reaction)
- The REACTOR shows surprise, confusion, or annoyance AFTER the initiating action
- If the camera shows Person A reacting with surprise to a sound → Person A is the REACTOR, and the sound was made by someone else (the INITIATOR)
- Do NOT assume the person on camera is the initiator — the camera often focuses on the REACTOR's face for comedic/dramatic effect

STEP 3 - STORY STRUCTURE:
Identify the narrative structure:
- INCITING INCIDENT: The exact moment the conflict/comedy/drama BEGINS. What specific action triggers the story? (e.g., "Person A suddenly grabs Person B's phone")
- ESCALATION: How does the situation develop? What makes it more intense?
- CLIMAX: The peak moment — the most dramatic/funny/important action
- RESOLUTION: How does it end? What are the final emotions?

STEP 4 - CAUSE → EFFECT CHAIN:
List every cause-effect pair:
- CAUSE: "[Person by appearance] did [specific action]"
- EFFECT: "[Other person by appearance] reacted with [specific reaction]"
- WHY: What about the cause triggered this specific effect?

STEP 5 - PRETEND vs REAL:
If anyone PRETENDS/FAKES an action (e.g., pretending to be on the phone, faking a hit, imitating a sound):
- State clearly: "[Person] PRETENDS to [action]. This is NOT real."
- Who is the prankster and who is the target?
- VOCAL PRANKS: If someone imitates a sound (ringtone, doorbell, etc.) to trick another person into reacting, this is a VOCAL PRANK. The person making the fake sound is the PRANKSTER/INITIATOR.

STEP 6 - EMOTIONAL ARCS:
For each person, describe their emotional journey:
[Person description]: [emotion at start] → [trigger event] → [emotion change] → [final emotion]

IMPORTANT: Always describe interactions as "Person A does X TO/AT Person B" — never analyze people in isolation. The story lives in the SPACE BETWEEN characters.`,
  } as ContentBlock);

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: PRO_MODEL_ID,
      messages: [{ role: 'user', content: contentBlocks }],
      system: [{
        text: `You are an expert at analyzing human interactions in video. Your focus is on the RELATIONSHIPS and INTERACTIONS between people, not individuals in isolation. Always describe WHO does WHAT to WHOM and WHY. Pay special attention to cause-effect chains and the narrative arc (inciting incident → climax → resolution). Remember: "actions" include VOCAL ACTIONS — a person imitating a sound (phone ringtone, doorbell, etc.) with their voice is performing a deliberate action that can trigger other people's reactions. CRITICAL: Do NOT assume gender roles — anyone can be the prankster or initiator regardless of gender. Determine WHO initiates ONLY by observing their actual physical actions and lip movements.

CRITICAL: The transcript (if provided) only captures recognized words — it MISSES vocal sound effects and onomatopoeia entirely. If you observe reactions (surprise, confusion) that have no apparent cause in the transcript, look for a vocal sound that the transcript missed.

${duration ? `DURATION GUARD: This video is EXACTLY ${duration} seconds long. You MUST NOT generate ANY observations, timestamps, or analysis beyond ${duration} seconds. Any content beyond the video duration is HALLUCINATION.` : 'DURATION GUARD: The video is SHORT. Do NOT hallucinate timestamps beyond the actual video duration.'}

CHARACTER DEDUPLICATION: Count each PERSON only ONCE. If the same person appears in different scenes or camera angles, they are STILL ONE PERSON. Do NOT create separate entries for the same person.

Respond in plain text.`,
      }],
      inferenceConfig: { maxTokens: 4096, temperature: 0.2, topP: 0.9 },
    })
  );

  const text = extractTextFromResponse(response);
  console.log(`[Nova Step B] Interaction analysis complete (${text.length} chars)`);
  return text;
}

// ─────────────────────────────────────────────
// Pass 1 Step C: Synthesis (Step A + B → JSON)
// ─────────────────────────────────────────────

export async function stepC_Synthesis(
  s3Uri: string,
  bucketOwner: string,
  stepAResult: string,
  stepBResult: string,
  transcriptText?: string,
  duration?: number,
  debateResult?: string,
): Promise<VideoDeepAnalysis> {
  const transcriptNote = transcriptText
    ? `\n\n=== TRANSCRIPT (recognized words only — vocal effects/onomatopoeia NOT included) ===\n${transcriptText}\n=== END ===\nUse this transcript as a reference for dialogue content, but note it may be missing non-word vocal sounds that are critical to the story.`
    : '';

  const systemPrompt: SystemContentBlock = {
    text: `You are an expert video analyst synthesizing multiple analysis passes into a final result.

ABSOLUTE PRIORITY RULES for resolving conflicts:
1. WHO SAID each line of dialogue → Trust Step A's speaker mapping (lip movement analysis)
2. WHO DID each physical action → Trust Step B's PER-CHARACTER tracking. Step B tracked each person INDIVIDUALLY, so each person's actions are guaranteed to be correctly attributed to THAT person.
3. WHAT was said → Trust Transcribe ground truth (if provided), then Step A
4. CAUSE → EFFECT order → Trust Step B's merged timeline and cause-effect analysis
5. If Step A says "Person X spoke" but Step B's individual tracking of Person X shows their mouth was closed → trust Step B
6. ZERO GENDER BIAS: Do NOT default to "man = prankster, woman = reactor". Read Step A and Step B carefully — if they say the WOMAN initiated the action, then the woman is the initiator. Trust the evidence from the analysis steps, not stereotypes.
7. LOGICAL CONFLICT RESOLUTION: If Step A and Step B are logically contradictory (e.g., A says the prank was initiated by one person while B says another person concludes it), resolve the contradiction directly based on the full context of the Transcribe text and the causal chain of the video. Do not simply follow "dialogue = A, action = B" — prioritize the logical consistency of the overall story.
8. SPEAKER CONFLICT RESOLUTION: If Step A and Step B disagree about WHO produced a specific sound:
   - For SPOKEN WORDS (Dialogue): Trust Step A (lip movement analysis).
   - For NON-VERBAL SOUNDS & MIMICRY (e.g., imitating a ringtone): Trust Step B completely. Step B tracks cause-and-effect better. If Step B says the woman initiated the prank, DO NOT trust Step A's misattribution.
   - If both provide evidence but conflict on spoken dialogue, choose based on STRONGER evidence (lip movement > reaction inference).
   - NEVER silently pick one without acknowledging the conflict.
9. CHARACTER DEDUPLICATION: Each character in the "characters" array must be a UNIQUE individual. If two entries describe the same person (same appearance in different scenes), MERGE them into one. Do NOT create "Person C: same as Person A" entries.
${duration ? `10. DURATION GUARD: Video duration is EXACTLY ${duration}s. Timeline entries MUST NOT exceed this. Do not generate any timeRange beyond ${duration}s.` : ''}

You MUST respond with valid JSON only. No markdown, no explanation, no extra text.`,
  };

  const contentBlocks: ContentBlock[] = [
    buildVideoContentBlock(s3Uri, bucketOwner),
    {
      text: `Synthesize these two expert analyses into a final result.

=== DIALOGUE ANALYSIS (Step A: Speaker Attribution) ===
${stepAResult}
=== END DIALOGUE ANALYSIS ===

=== ACTION SEQUENCE ANALYSIS (Step B: Movement & Causation) ===
${stepBResult}
=== END ACTION SEQUENCE ANALYSIS ===${debateResult ? `

=== CONFLICT ANALYSIS (Step D: Debate Agent) ===
${debateResult}
=== END CONFLICT ANALYSIS ===
You MUST follow the conflict resolution result above. The Debate Agent's verdict takes priority over the individual conclusions of Step A/B.` : ''}${transcriptNote}

SYNTHESIS RULES:
1. For "speakers" field: Use Step A's speaker-to-appearance mapping. Each speaker must be identified by their VISUAL APPEARANCE.
2. For "description" field: Use Step B's interaction analysis. Step B analyzed interactions between people, so trust its cause-effect findings.
3. If Step A and Step B conflict about WHO does an action, trust Step B's interaction analysis.
4. Pay special attention to Step B's PRETEND/PRANK analysis and CAUSE → EFFECT chain.
5. For pretend/mimicry actions: clearly state WHO is pretending and that it is pretend, not real.
6. You MUST fill in the "storyArc" field to structure the story as a proper narrative (setup → inciting incident → climax → resolution).
7. VOCAL MIMICRY AS ACTION: If Step A or Step B identifies someone imitating a sound (e.g., phone ringtone, doorbell) with their voice, this MUST appear in the timeline as a distinct action by that person. It is often the INCITING INCIDENT that triggers the entire scene. Include it in the timeline description (e.g., "Woman imitates phone ringtone sound with her voice") and in the cause-effect chain.

Return JSON:
{
  "duration": ${duration ?? '<total video duration in seconds>'},
  "genre": "<type of video>",
  "hasAudioDialogue": <true/false>,
  "characters": [
    {
      "name": "<descriptive label by appearance, e.g. 'Woman in brown top'>",
      "appearance": "<DETAILED physical description, MINIMUM 50 characters>",
      "role": "<role: initiator/prankster/reactor/victim/observer/etc.>"
    }
  ],
  "storyArc": {
    "setup": "<initial situation description — calm state, characters' positions and atmosphere>",
    "incitingIncident": "<story trigger — the specific action that starts the conflict/misunderstanding/problem>",
    "climax": "<the moment the conflict explodes or the most important action occurs>",
    "resolution": "<outcome and emotional wrap-up>"
  },
  "timeline": [
    {
      "timeRange": "<e.g. '0:00-0:10'>",
      "description": "<what happens — MUST correctly state WHO does WHAT based on Step B's evidence>",
      "speakers": ["<speaker identified by appearance from Step A>"],
      "dialogue": "<VERBATIM dialogue — attributed to correct speaker from Step A>"
    }
  ],
  "fullStorySummary": "<Based on storyArc above, write this as ONE COHESIVE STORY — not a CCTV log. Format: [Setup] → [Inciting Incident] → [Climax] → [Resolution]. WHO (by appearance) initiates WHAT action → WHO reacts HOW → final outcome. MUST include correct cause-effect chain from Step B. Minimum 100 characters.>",
  "keyMoments": ["<moment with correct subject attribution>", "..."]
}

FINAL CHECK before responding:
- Does storyArc.incitingIncident correctly identify the TRIGGER moment from Step B? (If someone imitated a sound to start the scene, THAT is the inciting incident, not the reaction to it.)
- Does storyArc.climax match the peak dramatic moment from Step B?
- VOCAL MIMICRY CHECK: If Step A identified any vocal mimicry (sound imitation), is it included in the timeline as a separate action? Is the correct person credited as the one who made the fake sound?
- For each timeline entry, verify: Is the SUBJECT of the action the same person Step B identified?
- For each dialogue, verify: Is the SPEAKER the same person Step A identified via lip movements?
- Does fullStorySummary read like a SHORT STORY, not a security camera log?`,
    } as ContentBlock,
  ];

  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await bedrockClient.send(
        new ConverseCommand({
          modelId: PRO_MODEL_ID,
          messages: [{ role: 'user', content: contentBlocks }],
          system: [systemPrompt],
          inferenceConfig: { maxTokens: 8192, temperature: 0.2, topP: 0.9 },
        })
      );

      const text = extractTextFromResponse(response);
      const result = parseJsonFromText<VideoDeepAnalysis>(text);

      if (!result.characters) result.characters = [];
      if (!result.timeline) result.timeline = [];
      if (!result.storyArc) result.storyArc = { setup: '', incitingIncident: '', climax: '', resolution: '' };

      console.log(`[Nova Step C] Synthesis complete: ${result.characters.length} characters, ${result.timeline.length} segments`);
      return result;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.warn(`[Nova Step C] Error, retrying (${attempt + 1}): ${err}`);
        continue;
      }
      throw err;
    }
  }

  throw new Error('Nova Step C: max retries exceeded');
}

// ─────────────────────────────────────────────
// Pass 1 Step D: Contradiction Resolution (Debate Agent)
// ─────────────────────────────────────────────

export async function stepD_ContradictionResolution(
  stepAResult: string,
  stepBResult: string,
  duration?: number,
): Promise<string> {
  const systemPrompt: SystemContentBlock = {
    text: `You are a Debate Agent specializing in contradiction resolution between two video analysis reports.
Your job is to compare Step A (dialogue/speaker analysis) and Step B (action/interaction analysis) and identify any contradictions.

For each contradiction found:
1. State the contradiction clearly
2. Explain which step's evidence is stronger and why
3. Provide a final verdict

${duration ? `Video duration is EXACTLY ${duration}s. Any references to events beyond ${duration}s are hallucinations.` : ''}

Respond in plain text with structured sections. Be concise but thorough.`,
  };

  const userContent: ContentBlock[] = [
    {
      text: `Compare these two analyses and resolve all contradictions:

=== STEP A: DIALOGUE & SPEAKER ANALYSIS ===
${stepAResult}
=== END STEP A ===

=== STEP B: ACTION & INTERACTION ANALYSIS ===
${stepBResult}
=== END STEP B ===

For each contradiction:
1. WHO initiated an action — if A and B disagree, which has stronger visual evidence?
2. WHO spoke — if A and B disagree on speaker attribution, which is more reliable?
3. CAUSE-EFFECT — if the causal chain differs, which makes more logical sense?
4. TIMELINE — do both agree on the order of events? If not, which is more consistent?

If there are NO contradictions, state that the analyses are consistent.`,
    } as ContentBlock,
  ];

  try {
    const response = await bedrockClient.send(
      new ConverseCommand({
        modelId: PRO_MODEL_ID,
        messages: [{ role: 'user', content: userContent }],
        system: [systemPrompt],
        inferenceConfig: { maxTokens: 2048, temperature: 0.1, topP: 0.9 },
      })
    );

    const text = extractTextFromResponse(response);
    console.log(`[Nova Step D] Contradiction resolution complete (${text.length} chars)`);
    return text;
  } catch (err) {
    console.warn(`[Nova Step D] Contradiction resolution failed (skipping):`, err);
    return '';
  }
}

// ─────────────────────────────────────────────
// Post-processing functions
// ─────────────────────────────────────────────

/** Remove timeline entries exceeding duration */
function trimTimelineToDuration(analysis: VideoDeepAnalysis, duration: number): VideoDeepAnalysis {
  const filtered = analysis.timeline.filter(t => {
    const match = t.timeRange.match(/(\d+):(\d+(?:\.\d+)?)/);
    if (!match) return true;
    const startSec = parseInt(match[1]) * 60 + parseFloat(match[2]);
    return startSec < duration;
  });
  if (filtered.length < analysis.timeline.length) {
    console.log(`[PostProcess] trimTimeline: ${analysis.timeline.length} → ${filtered.length} (duration=${duration}s)`);
  }
  return { ...analysis, timeline: filtered };
}

/** Merge duplicate characters (when name contains "same as" etc.) */
function deduplicateCharacters(analysis: VideoDeepAnalysis): VideoDeepAnalysis {
  const dominated = new Set<number>();
  for (let i = 0; i < analysis.characters.length; i++) {
    const c = analysis.characters[i];
    const lower = `${c.name} ${c.appearance} ${c.role}`.toLowerCase();
    if (lower.includes('same as') || lower.includes('same person') || lower.includes('identical to')) {
      dominated.add(i);
    }
  }
  if (dominated.size > 0) {
    const filtered = analysis.characters.filter((_, i) => !dominated.has(i));
    console.log(`[PostProcess] deduplicateCharacters: ${analysis.characters.length} → ${filtered.length}`);
    return { ...analysis, characters: filtered };
  }
  return analysis;
}

/** Remove duplicate panel dialogue + remove SFX from dialogue field */
function deduplicatePanelDialogue(panels: Array<{ panelId: number; description: string; emotion: string; dialogue?: string; dialogueKo?: string }>): typeof panels {
  const SFX_PATTERNS = /^(\*[^*]+\*|SFX:|sound effect|ringtone|ding dong|ring ring|buzzing|beeping|ringing)/i;

  const seenDialogues = new Set<string>();
  return panels.map(p => {
    let dialogue = p.dialogue || '';
    let dialogueKo = p.dialogueKo || '';

    // Remove SFX from dialogue field
    if (dialogue && SFX_PATTERNS.test(dialogue.trim())) {
      dialogue = '';
      dialogueKo = '';
    }

    // Deduplicate: keep dialogue only in first panel where it appears
    if (dialogue) {
      const normalized = dialogue.trim().toLowerCase();
      if (seenDialogues.has(normalized)) {
        dialogue = '';
        dialogueKo = '';
      } else {
        seenDialogues.add(normalized);
      }
    }

    return { ...p, dialogue, dialogueKo };
  });
}

// ─────────────────────────────────────────────
// Pass 1 Integration: 3-Step Chain-of-Thought
// ─────────────────────────────────────────────

export async function analyzeVideoDeep(
  s3Uri: string,
  bucketOwner: string,
  options?: {
    transcriptText?: string;
    frameImages?: string[];
    duration?: number;
  }
): Promise<VideoDeepAnalysis> {
  const { transcriptText, frameImages, duration } = options || {};

  console.log('[Nova Pass 1] Step A: Dialogue/audio verification starting...');
  const stepAResult = await stepA_DialogueVerification(s3Uri, bucketOwner, transcriptText, frameImages, duration);

  console.log('[Nova Pass 1] Step B: Action sequence analysis starting...');
  const stepBResult = await stepB_ActionSequenceAnalysis(s3Uri, bucketOwner, transcriptText, frameImages, duration);

  console.log('[Nova Pass 1] Step C: Synthesis starting...');
  let result = await stepC_Synthesis(s3Uri, bucketOwner, stepAResult, stepBResult, transcriptText, duration);

  // Post-processing
  if (duration) result = trimTimelineToDuration(result, duration);
  result = deduplicateCharacters(result);

  return result;
}

// ─────────────────────────────────────────────
// Quality validation gate
// ─────────────────────────────────────────────

export function validatePass1Quality(result: VideoDeepAnalysis): { valid: boolean; reason: string } {
  if (!result.fullStorySummary || result.fullStorySummary.length < 50) {
    return { valid: false, reason: `fullStorySummary too short (${result.fullStorySummary?.length ?? 0} chars, need 50+)` };
  }

  if (result.hasAudioDialogue) {
    const dialogueCount = result.timeline.filter(t => t.dialogue && t.dialogue.trim().length > 0).length;
    if (dialogueCount === 0) {
      return { valid: false, reason: 'hasAudioDialogue=true but no dialogue found in timeline' };
    }
  }

  if (result.characters.length > 0) {
    const allTooShort = result.characters.every(c => !c.appearance || c.appearance.length < 20);
    if (allTooShort) {
      return { valid: false, reason: 'All character appearances are under 20 chars' };
    }
  }

  return { valid: true, reason: 'OK' };
}

// ─────────────────────────────────────────────
// Challenge question-based verification (Adversarial Verification)
// ─────────────────────────────────────────────

export async function verifyAnalysis(
  s3Uri: string,
  bucketOwner: string,
  analysis: VideoDeepAnalysis
): Promise<VideoDeepAnalysis> {
  const systemPrompt: SystemContentBlock = {
    text: `You are a critical reviewer who looks for ERRORS in video analysis. You will challenge the analysis with specific adversarial questions, then produce a corrected version.
You MUST respond with valid JSON only. No markdown, no explanation.`,
  };

  const analysisJson = JSON.stringify(analysis, null, 2);

  const userMessage: Message = {
    role: 'user',
    content: [
      buildVideoContentBlock(s3Uri, bucketOwner),
      {
        text: `Here is an analysis of this video. Your job is to CHALLENGE it and FIX errors.

${analysisJson}

Answer these adversarial questions by re-watching the video:

1. SPEAKER ATTRIBUTION: For each line of dialogue, verify WHO actually said it. Could the speaker be someone else? Check lip movements.

2. ACTION REVERSAL TEST: For EACH action in the analysis, try swapping the subject and object (e.g., "Man pranks Woman" → "Woman pranks Man"). Re-watch the video and ask: does the SWAPPED version match the video better? Check the actual lip movements and body language — NOT your assumptions about who is "more likely" to do it. If the swapped version fits better, the original has the wrong subject.

3. CAUSE-EFFECT CHECK: For each event, is the stated cause actually what triggered it? Or did something else happen first? Could the cause-effect be reversed? Pay special attention to WHO initiates — re-watch the first few seconds carefully to see who acts FIRST.

GENDER BIAS WARNING: Do NOT assume men are pranksters and women are victims/observers. The video may show the opposite. Trust ONLY what you SEE (lip movements, body language, timing of actions).

4. PRETEND vs REAL: Are any actions in the video PRETENDED/FAKED (e.g., pretending to be on the phone)? Does the analysis correctly distinguish pretend actions from real ones?

5. DIALOGUE-ACTION CONSISTENCY: Does each person's dialogue match their actions? If someone says "What are you doing?" are they the one performing the action or observing someone else's action?

6. VOCAL MIMICRY CHECK: Listen carefully — does anyone IMITATE a sound with their voice (e.g., phone ringtone, doorbell, siren, animal sound)? If so:
   - Is this vocal mimicry included in the timeline as a distinct action?
   - Is the CORRECT person credited as the one who made the fake sound?
   - Is it correctly identified as the CAUSE/TRIGGER for other people's reactions?
   - A person imitating a ringtone to make someone else answer the phone is a PRANK — the imitator is the prankster, not the person who answers.

7. DIALOGUE INTENT CHECK: Re-evaluate whether each character's dialogue is part of the prank (Punchline) or a genuine reaction to the other person's prank (Annoyance/Reaction) by reviewing the facial expressions and surrounding context in the video.

8. SPEAKER CONFLICT CHECK: For each sound/dialogue, compare Step A and Step B attribution in the analysis. If they disagreed, which evidence is stronger (lip movement vs reaction inference)? Fix the attribution accordingly.

9. CHARACTER DEDUPLICATION CHECK: Are any characters in the "characters" array actually the same person described differently? If so, merge them into one entry. The total count should equal the number of DISTINCT individuals visible in the video.

After answering these questions, return the CORRECTED analysis as JSON with the same structure. Fix any errors you found. If the analysis is correct, return it unchanged.`,
      } as ContentBlock,
    ],
  };

  try {
    const response = await bedrockClient.send(
      new ConverseCommand({
        modelId: PRO_MODEL_ID,
        messages: [userMessage],
        system: [systemPrompt],
        inferenceConfig: { maxTokens: 8192, temperature: 0.2, topP: 0.9 },
      })
    );

    const text = extractTextFromResponse(response);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Nova Verify] JSON parsing failed, keeping original analysis');
      return analysis;
    }

    const verified = JSON.parse(jsonMatch[0]) as VideoDeepAnalysis;
    console.log('[Nova Verify] Challenge verification complete');
    return verified;
  } catch (err) {
    console.warn('[Nova Verify] Verification failed, keeping original analysis:', err);
    return analysis;
  }
}

// ─────────────────────────────────────────────
// Pass 2 multi-agent: Panel splitting
// ─────────────────────────────────────────────

interface PlannerResult {
  selectedMoments: Array<{
    index: number;
    timeRange: string;
    storyRole: 'setup' | 'inciting_incident' | 'climax' | 'resolution';
    reason: string;
  }>;
  climaxIndex: number;
}

interface ConsolidatedCharacters {
  combined: string;
  perCharacter: Array<{ name: string; visualDescription: string }>;
}

interface SceneDescription {
  panelId: number;
  description: string;
  emotion: string;
  dialogue: string;
  dialogueKo: string;
  narrativeContext: string;
}

interface ReviewResult {
  approved: boolean;
  issues: string[];
  fixes: Array<{ panelId: number; field: string; suggestion: string }>;
}

/**
 * P-A: Panel Planner — Select 4 key scenes from story arc
 */
async function agentPanelPlanner(
  deepAnalysis: VideoDeepAnalysis
): Promise<PlannerResult> {
  const systemPrompt: SystemContentBlock = {
    text: `You are a comic panel planner. Given a video story analysis, select exactly 4 key moments that best represent the story arc (kishōtenketsu: setup → inciting incident → climax → resolution).

You MUST respond with valid JSON only. No markdown, no explanation.`,
  };

  const timelineSummary = deepAnalysis.timeline
    .map((t, i) => `[${i}] ${t.timeRange}: ${t.description}${t.dialogue ? ` (Dialogue: "${t.dialogue}")` : ''}`)
    .join('\n');

  const userMessage: Message = {
    role: 'user',
    content: [{
      text: `Story Analysis:
Genre: ${deepAnalysis.genre}
Duration: ${deepAnalysis.duration}s

Story Arc:
  Setup: ${deepAnalysis.storyArc.setup}
  Inciting Incident: ${deepAnalysis.storyArc.incitingIncident}
  Climax: ${deepAnalysis.storyArc.climax}
  Resolution: ${deepAnalysis.storyArc.resolution}

Full Story: ${deepAnalysis.fullStorySummary}

Key Moments:
${deepAnalysis.keyMoments.map((m, i) => `  ${i + 1}. ${m}`).join('\n')}

Timeline (select from these):
${timelineSummary}

Select exactly 4 timeline entries that best map to the kishōtenketsu structure.
Return JSON:
{
  "selectedMoments": [
    { "index": <timeline index>, "timeRange": "<time>", "storyRole": "<setup|inciting_incident|climax|resolution>", "reason": "<why this moment>" }
  ],
  "climaxIndex": <0-based index within selectedMoments that is the climax>
}`,
    }],
  };

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: PRO_MODEL_ID,
      messages: [userMessage],
      system: [systemPrompt],
      inferenceConfig: { maxTokens: 2048, temperature: 0.2, topP: 0.9 },
    })
  );

  return parseJsonFromText<PlannerResult>(extractTextFromResponse(response));
}

/**
 * P-C: Character Consolidator — Consolidate character appearance descriptions for image prompts
 */
async function agentCharacterConsolidator(
  deepAnalysis: VideoDeepAnalysis
): Promise<ConsolidatedCharacters> {
  const systemPrompt: SystemContentBlock = {
    text: `You are a character description specialist for comic image generation. Consolidate character appearances into concise visual descriptions optimized for AI image generation prompts.

Focus ONLY on visible physical traits: hair color/style, clothing, body type, distinguishing features. Do NOT include personality, role, or story information.

You MUST respond with valid JSON only.`,
  };

  const charList = deepAnalysis.characters
    .map(c => `- ${c.name}: ${c.appearance} (Role: ${c.role})`)
    .join('\n');

  const userMessage: Message = {
    role: 'user',
    content: [{
      text: `Characters from video analysis:
${charList}

Create two outputs:
1. A single "combined" string (max 300 chars) describing ALL characters together for image prompt injection
2. Per-character visual descriptions (max 80 chars each)

Return JSON:
{
  "combined": "<all characters combined visual description>",
  "perCharacter": [
    { "name": "<name>", "visualDescription": "<concise visual traits>" }
  ]
}`,
    }],
  };

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: PRO_MODEL_ID,
      messages: [userMessage],
      system: [systemPrompt],
      inferenceConfig: { maxTokens: 2048, temperature: 0.15, topP: 0.9 },
    })
  );

  return parseJsonFromText<ConsolidatedCharacters>(extractTextFromResponse(response));
}

/**
 * P-B: Scene Descriptor — Write detailed physical scene descriptions for each panel
 */
async function agentSceneDescriptor(
  s3Uri: string,
  bucketOwner: string,
  deepAnalysis: VideoDeepAnalysis,
  plannerResult: PlannerResult,
  characters: ConsolidatedCharacters
): Promise<SceneDescription[]> {
  const systemPrompt: SystemContentBlock = {
    text: `You are a comic scene descriptor. For each selected moment, write a detailed PHYSICAL scene description suitable for AI image generation.

RULES:
- Describe ONLY visible elements: body positions, facial expressions, spatial arrangement, lighting
- Start each description with shot type: "Wide shot:", "Medium shot:", or "Close-up:"
- Do NOT use abstract verbs: "realizes", "pretends", "thinks", "notices" — convert to physical actions
- Do NOT repeat character appearance (hair, clothing) — that info is injected separately
- Use short identifiers like "dark-haired woman" or "man in blue shirt"
- Each description should be 200-350 characters
- Dialogue field is for SPOKEN WORDS ONLY, not sound effects

You MUST respond with valid JSON only.`,
  };

  const selectedMoments = plannerResult.selectedMoments.map((m, i) => {
    const timeline = deepAnalysis.timeline[m.index] || deepAnalysis.timeline[0];
    return `Panel ${i + 1} (${m.storyRole}):
  Time: ${m.timeRange}
  Event: ${timeline.description}
  ${timeline.dialogue ? `Dialogue: "${timeline.dialogue}"` : 'No dialogue'}
  ${timeline.speakers?.length ? `Speakers: ${timeline.speakers.join(', ')}` : ''}`;
  }).join('\n\n');

  const userMessage: Message = {
    role: 'user',
    content: [
      buildVideoContentBlock(s3Uri, bucketOwner),
      {
        text: `Characters: ${characters.combined}

Selected moments for 4 panels:
${selectedMoments}

Story context: ${deepAnalysis.fullStorySummary}

For each panel, write a detailed physical scene description.
Return JSON array:
[
  {
    "panelId": 1,
    "description": "<200-350 char physical scene description>",
    "emotion": "<joy|sadness|surprise|anger|fear|neutral>",
    "dialogue": "<spoken words in English, or empty string>",
    "dialogueKo": "<Korean translation, or empty string>",
    "narrativeContext": "<story role in 1 sentence, e.g., 'Setup: A man sits alone at a table, contemplating'>"
  }
]`,
      },
    ],
  };

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: PRO_MODEL_ID,
      messages: [userMessage],
      system: [systemPrompt],
      inferenceConfig: { maxTokens: 4096, temperature: 0.25, topP: 0.9 },
    })
  );

  const text = extractTextFromResponse(response);
  // Response may be an array or { panels: [...] } format
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    return JSON.parse(arrMatch[0]) as SceneDescription[];
  }
  const objResult = parseJsonFromText<{ panels: SceneDescription[] }>(text);
  return objResult.panels;
}

/**
 * P-D: Panel Reviewer — Final verification (dialogue duplication, climax check, character consistency)
 */
async function agentPanelReviewer(
  scenes: SceneDescription[],
  plannerResult: PlannerResult,
  deepAnalysis: VideoDeepAnalysis
): Promise<ReviewResult> {
  const systemPrompt: SystemContentBlock = {
    text: `You are a comic panel quality reviewer. Check the final panel set for:
1. Dialogue duplication — same dialogue should NOT appear in multiple panels
2. Story completeness — all 4 story arc beats (setup, inciting incident, climax, resolution) must be present
3. Climax alignment — the most dramatic panel should match the climax index
4. Character consistency — all major characters should appear where expected
5. Description quality — no abstract verbs, proper physical descriptions

You MUST respond with valid JSON only.`,
  };

  const userMessage: Message = {
    role: 'user',
    content: [{
      text: `Story summary: ${deepAnalysis.fullStorySummary}
Expected climax index: ${plannerResult.climaxIndex}

Panels to review:
${JSON.stringify(scenes, null, 2)}

Review and return JSON:
{
  "approved": <true if all checks pass>,
  "issues": ["<issue description>", ...],
  "fixes": [
    { "panelId": <number>, "field": "<field name>", "suggestion": "<fix>" }
  ]
}`,
    }],
  };

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: PRO_MODEL_ID,
      messages: [userMessage],
      system: [systemPrompt],
      inferenceConfig: { maxTokens: 2048, temperature: 0.1, topP: 0.9 },
    })
  );

  return parseJsonFromText<ReviewResult>(extractTextFromResponse(response));
}

/**
 * Multi-agent panel splitting orchestrator
 *
 * P-A(Planner) + P-C(CharConsolidator) parallel → P-B(SceneDescriptor) → P-D(Reviewer)
 * Falls back to existing extractPanelStructure on failure
 */
export async function extractPanelStructureMultiAgent(
  s3Uri: string,
  bucketOwner: string,
  deepAnalysis: VideoDeepAnalysis,
  onProgress?: (stage: AnalysisStage) => void
): Promise<NovaAnalysisResult> {
  try {
    // Phase 1: P-A + P-C parallel execution
    console.log('[Multi-Agent Pass 2] P-A(Planner) + P-C(CharConsolidator) parallel start...');
    onProgress?.('pass2_planning');
    const [plannerResult, characters] = await Promise.all([
      agentPanelPlanner(deepAnalysis),
      agentCharacterConsolidator(deepAnalysis),
    ]);
    console.log(`[Multi-Agent Pass 2] P-A complete: ${plannerResult.selectedMoments.length} scenes selected, climax=${plannerResult.climaxIndex}`);
    console.log(`[Multi-Agent Pass 2] P-C complete: "${characters.combined.slice(0, 80)}..."`);

    // Phase 2: P-B (Scene Descriptor) — depends on P-A + P-C results
    console.log('[Multi-Agent Pass 2] P-B(SceneDescriptor) starting...');
    onProgress?.('pass2_describing');
    let scenes = await agentSceneDescriptor(s3Uri, bucketOwner, deepAnalysis, plannerResult, characters);

    // Fallback if fewer than 4
    if (!scenes || scenes.length < 4) {
      console.warn(`[Multi-Agent Pass 2] P-B result has insufficient panels (${scenes?.length}), falling back`);
      return extractPanelStructure(s3Uri, bucketOwner, deepAnalysis);
    }
    // Trim if more than 4
    if (scenes.length > 4) {
      scenes = scenes.slice(0, 4);
    }

    // Phase 3: P-D (Reviewer) — Verify P-B results
    console.log('[Multi-Agent Pass 2] P-D(Reviewer) starting...');
    onProgress?.('pass2_reviewing');
    const review = await agentPanelReviewer(scenes, plannerResult, deepAnalysis);
    console.log(`[Multi-Agent Pass 2] P-D complete: approved=${review.approved}, issues=${review.issues.length}`);

    // Apply reviewer-suggested fixes
    if (!review.approved && review.fixes.length > 0) {
      for (const fix of review.fixes) {
        const panel = scenes.find(s => s.panelId === fix.panelId);
        if (panel && fix.field in panel) {
          console.log(`[Multi-Agent Pass 2] Applying fix: panel ${fix.panelId}.${fix.field}`);
          (panel as unknown as Record<string, unknown>)[fix.field] = fix.suggestion;
        }
      }
    }

    // Assemble NovaAnalysisResult
    const result: NovaAnalysisResult = {
      duration: deepAnalysis.duration,
      summary: deepAnalysis.fullStorySummary,
      summaryKo: undefined,
      climaxIndex: plannerResult.climaxIndex,
      hasAudioDialogue: deepAnalysis.hasAudioDialogue,
      characterDescriptions: characters.combined,
      setting: undefined,
      panels: scenes.map((s, i) => ({
        panelId: s.panelId || i + 1,
        description: s.description,
        emotion: s.emotion,
        dialogue: s.dialogue || undefined,
        dialogueKo: s.dialogueKo || undefined,
        narrativeContext: s.narrativeContext || undefined,
      })),
    };

    console.log(`[Multi-Agent Pass 2] Multi-agent panel structure complete: ${result.panels.length} panels`);
    return result;
  } catch (err) {
    console.warn(`[Multi-Agent Pass 2] Multi-agent failed, falling back to legacy method:`, err);
    return extractPanelStructure(s3Uri, bucketOwner, deepAnalysis);
  }
}

// ─────────────────────────────────────────────
// Pass 2: Comic panel structure extraction based on deep analysis (legacy single agent, for fallback)
// ─────────────────────────────────────────────

export async function extractPanelStructure(
  s3Uri: string,
  bucketOwner: string,
  deepAnalysis: VideoDeepAnalysis
): Promise<NovaAnalysisResult> {
  const characterBriefing = deepAnalysis.characters
    .map(c => `  - ${c.name}: ${c.appearance} (Role: ${c.role})`)
    .join('\n');

  const timelineBriefing = deepAnalysis.timeline
    .map(t => {
      let entry = `  [${t.timeRange}] ${t.description}`;
      if (t.speakers?.length) entry += ` (Speakers: ${t.speakers.join(', ')})`;
      if (t.dialogue) entry += `\n    Dialogue: "${t.dialogue}"`;
      return entry;
    })
    .join('\n');

  const keyMomentsBriefing = deepAnalysis.keyMoments
    .map((m, i) => `  ${i + 1}. ${m}`)
    .join('\n');

  const storyArcBriefing = deepAnalysis.storyArc
    ? `\nStory Arc (kishōtenketsu):\n  Setup: ${deepAnalysis.storyArc.setup}\n  Inciting Incident: ${deepAnalysis.storyArc.incitingIncident}\n  Climax: ${deepAnalysis.storyArc.climax}\n  Resolution: ${deepAnalysis.storyArc.resolution}\n`
    : '';

  const analysisContext = `=== VIDEO ANALYSIS BRIEFING ===
Genre: ${deepAnalysis.genre}
Duration: ${deepAnalysis.duration}s
Has Audio Dialogue: ${deepAnalysis.hasAudioDialogue}

Characters:
${characterBriefing}
${storyArcBriefing}
Full Story:
${deepAnalysis.fullStorySummary}

Key Moments:
${keyMomentsBriefing}

Timeline:
${timelineBriefing}
=== END BRIEFING ===`;

  const systemPrompt: SystemContentBlock = {
    text: `You are a comic book artist who converts video stories into comic panels.
You have already analyzed this video in detail. Use the provided analysis to create accurate comic panels.

IMPORTANT: The analysis contains the TRUE story — trust it completely. Pay special attention to:
- The storyArc (especially incitingIncident) — this is the TRIGGER moment that must be shown
- The cause-effect chain in the timeline — panels must reflect WHO actually initiates each action
- Vocal mimicry/sound imitation — if someone imitates a sound to prank someone, this is a KEY MOMENT that deserves its own panel
- The "summary" field must capture the CORE joke/drama accurately (who does what to whom)

The comic will be SILENT (no text in images), but dialogue will be overlaid separately by the frontend.
So you must still extract the key dialogue for each panel.

You MUST respond with valid JSON only. No markdown, no explanation.`,
  };

  const charDescs = deepAnalysis.characters
    .map(c => `${c.name}: ${c.appearance}`)
    .join('; ');

  const userMessage: Message = {
    role: 'user',
    content: [
      buildVideoContentBlock(s3Uri, bucketOwner),
      {
        text: `Here is the detailed analysis of this video:
${analysisContext}

Now create exactly 4 comic panels that tell this story visually.

Return JSON with this exact structure:
{
  "duration": ${deepAnalysis.duration},
  "summary": "<one-line English summary that captures the CORE action/joke of the story — WHO does WHAT to WHOM and WHY it's funny/dramatic. Must reflect the actual cause-effect chain from the analysis, including any vocal mimicry or sound imitation that triggers the scene.>",
  "summaryKo": "<same summary translated to natural Korean>",
  "climaxIndex": <0-based index of the most dramatic/important panel>,
  "hasAudioDialogue": ${deepAnalysis.hasAudioDialogue},
  "characterDescriptions": "<combined visual description of ALL characters for consistent image generation>",
  "setting": "<A single-sentence description of the FIXED location/environment where the story takes place. e.g., 'A modern kitchen with a wooden dining table and warm overhead lighting.' This will be prepended to every panel's image prompt.>",
  "panels": [
    {
      "panelId": 1,
      "description": "<200-350 char PHYSICAL scene description. CRITICAL RULE: You MUST describe the physical state and location of EVERY character present in the scene, not just the one performing the action. For example, if character A is making a prank call, also describe character B sitting at the table looking at their phone. Describe spatial arrangement between all characters (e.g., 'Woman standing behind the seated man'). The image AI can ONLY draw visible objects and poses. Describe: exact body positions, hand placement and held objects, facial muscle movements (raised eyebrows, open mouth, furrowed brow), spatial arrangement, lighting. Start each description with a shot type: 'Wide shot:', 'Medium shot:', or 'Close-up:' to maintain visual coherence between panels. NEVER use 'pretending', 'trying', 'realizes', 'about to' — convert to concrete poses. Do NOT repeat character appearance (hair, clothing) — that is already in characterDescriptions. Use short identifiers like 'dark-haired woman' only.>",
      "emotion": "<one of: joy, sadness, surprise, anger, fear, neutral>",
      "dialogue": "<key dialogue in this moment in ENGLISH, or empty string if none>",
      "dialogueKo": "<same dialogue translated to Korean, or empty string>",
      "narrativeContext": "narrativeContext": "<Describe the role of this panel in the story arc in one short ENGLISH sentence.>"
    }
  ]
}

CRITICAL RULES:
- "summary" MUST accurately reflect the CORE story from the analysis — especially WHO initiates the action and HOW. If someone imitates a sound (vocal mimicry) to prank someone, the summary must mention this.
- "description" MUST reference characters by their VISUAL appearance (hair color, clothing, body type — not names)
- "description" should be 200-350 characters describing what the scene LOOKS LIKE (positions, expressions, background, lighting)
- Panels must follow chronological order and capture the ACTUAL story (use the analysis above)
- If the analysis identifies a vocal mimicry/sound imitation as the inciting incident, it MUST be shown as a dedicated panel (e.g., "A woman with dark hair cups her hands around her mouth, making a ringing sound")
- DIALOGUE RULES:
  1. Each line of dialogue should appear in ONLY ONE panel — the panel where it is first spoken. Do NOT duplicate the same dialogue across multiple panels.
  2. The "dialogue" field is for SPOKEN WORDS ONLY — actual sentences or phrases said by a character. Do NOT put sound effects, onomatopoeia, or action descriptions in the dialogue field. WRONG: "Phone ringtone sound", "*ring ring*", "SFX: doorbell". RIGHT: "Hell is filled with people like you." (actual spoken words). If a panel has no spoken dialogue, use an empty string "".
  3. Sound effects should be described in the "description" field, NOT in "dialogue".
- Select panels that together tell the complete story arc (setup → conflict → climax → resolution)
- "characterDescriptions" must be detailed enough for consistent image generation
- "description" focuses on actions/poses/expressions/spatial arrangement ONLY. Do NOT repeat character appearance (hair color, clothing) — characterDescriptions already contains that and is injected separately into the image prompt. Use short identifiers like "dark-haired woman" or "man in blue shirt" only.
- PHYSICAL POSE CONVERSION EXAMPLES:
  BAD: "A man pretending to answer a phone call with a bottle" → GOOD: "A man holding a glass bottle pressed flat against his right ear, head tilted, eyes rolling"
  BAD: "A woman trying to hold back laughter" → GOOD: "A woman with both hands clasped over her mouth, cheeks puffed, shoulders shaking"
  BAD: "He realizes it was a prank and gets frustrated" → GOOD: "A man with furrowed brows and clenched jaw, slamming the bottle on the table"
- BANNED VERBS in "description": "realizes", "pretends", "thinks", "notices", "decides", "about to", "starts to" — always convert these to visible physical actions`,
      },
    ],
  };

  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await bedrockClient.send(
        new ConverseCommand({
          modelId: PRO_MODEL_ID,
          messages: [userMessage],
          system: [systemPrompt],
          inferenceConfig: { maxTokens: 8192, temperature: 0.2, topP: 0.9 },
        })
      );

      const text = extractTextFromResponse(response);
      const result = parseJsonFromText<NovaAnalysisResult>(text);

      if (!result.panels || result.panels.length < 4) {
        if (attempt < MAX_RETRIES) {
          console.warn(`[Nova Pass 2] Insufficient panels (${result.panels?.length}), retrying`);
          continue;
        }
        throw new Error(`Nova Pass 2: Insufficient panels (${result.panels?.length})`);
      }

      // Trim if more than 4 panels
      if (result.panels.length > 4) {
        console.log(`[Nova Pass 2] Trimmed ${result.panels.length} panels → 4`);
        result.panels = result.panels.slice(0, 4);
        result.climaxIndex = Math.min(result.climaxIndex, 3);
      }

      if (!result.characterDescriptions) {
        result.characterDescriptions = charDescs;
      }

      console.log(`[Nova Pass 2] Panel structure complete: ${result.panels.length} panels`);
      return result;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        console.warn(`[Nova Pass 2] Error, retrying (${attempt + 1}): ${err}`);
        continue;
      }
      throw err;
    }
  }

  throw new Error('Nova Pass 2: Max retries exceeded');
}

// ─────────────────────────────────────────────
// Integrated analysis function (called externally)
// ─────────────────────────────────────────────

export type AnalysisStage = 'transcribing' | 'pass1_stepA' | 'pass1_stepB' | 'pass1_debate' | 'pass1_stepC' | 'verifying' | 'pass2' | 'pass2_planning' | 'pass2_describing' | 'pass2_reviewing';

/**
 * Improved video analysis pipeline
 *
 * Pass 1: 3-step Chain-of-Thought deep analysis
 *   Step A: Dialogue/audio verification (using Transcribe results)
 *   Step B: Action sequence + causality analysis
 *   Step C: Comprehensive JSON generation
 * Verification: Challenge question-based verification
 * Pass 2: Comic panel structure extraction
 */
export async function analyzeVideo(
  s3Uri: string,
  bucketOwner: string,
  onProgress?: (stage: AnalysisStage) => void,
  options?: {
    transcriptText?: string;
    frameImages?: string[];
    duration?: number;
  }
): Promise<NovaAnalysisResult> {
  const { transcriptText, frameImages, duration } = options || {};

  console.log('[Nova] === Starting improved analysis pipeline ===');
  if (duration) console.log(`[Nova] Video duration: ${duration}s`);
  if (transcriptText) {
    console.log(`[Nova] Transcribe text provided (${transcriptText.length} chars)`);
  }
  if (frameImages?.length) {
    console.log(`[Nova] ${frameImages.length} keyframes provided`);
  }

  // Pass 1: 3-step CoT deep analysis (Step A + B parallel execution)
  console.log('[Nova] Pass 1 Step A + B: Starting parallel analysis...');
  onProgress?.('pass1_stepA');
  onProgress?.('pass1_stepB');
  const [stepAResult, stepBResult] = await Promise.all([
    stepA_DialogueVerification(s3Uri, bucketOwner, transcriptText, frameImages, duration),
    stepB_ActionSequenceAnalysis(s3Uri, bucketOwner, transcriptText, frameImages, duration),
  ]);

  console.log('[Nova] Pass 1 Step D: Resolving contradictions...');
  onProgress?.('pass1_debate');
  const debateResult = await stepD_ContradictionResolution(stepAResult, stepBResult, duration);

  console.log('[Nova] Pass 1 Step C: Synthesizing...');
  onProgress?.('pass1_stepC');
  let deepAnalysis = await stepC_Synthesis(s3Uri, bucketOwner, stepAResult, stepBResult, transcriptText, duration, debateResult);
  if (duration) deepAnalysis.duration = duration;
  console.log(`[Nova] Pass 1 complete: "${deepAnalysis.fullStorySummary.slice(0, 100)}..."`);

  // Post-processing: timeline trim + character dedup
  if (duration) deepAnalysis = trimTimelineToDuration(deepAnalysis, duration);
  deepAnalysis = deduplicateCharacters(deepAnalysis);

  // Quality validation gate
  const qualityCheck = validatePass1Quality(deepAnalysis);
  if (!qualityCheck.valid) {
    console.warn(`[Nova] Pass 1 quality check failed: ${qualityCheck.reason} — retrying`);
    deepAnalysis = await stepC_Synthesis(s3Uri, bucketOwner, stepAResult, stepBResult, transcriptText, duration, debateResult);
    if (duration) deepAnalysis.duration = duration;
    if (duration) deepAnalysis = trimTimelineToDuration(deepAnalysis, duration);
    deepAnalysis = deduplicateCharacters(deepAnalysis);
    const retryCheck = validatePass1Quality(deepAnalysis);
    if (!retryCheck.valid) {
      console.warn(`[Nova] Pass 1 quality still failed after retry: ${retryCheck.reason} — proceeding`);
    }
  }

  // Challenge question-based verification
  console.log('[Nova] Running challenge verification...');
  onProgress?.('verifying');
  deepAnalysis = await verifyAnalysis(s3Uri, bucketOwner, deepAnalysis);
  if (duration) deepAnalysis.duration = duration;
  // Post-processing on verified result too
  if (duration) deepAnalysis = trimTimelineToDuration(deepAnalysis, duration);
  deepAnalysis = deduplicateCharacters(deepAnalysis);
  console.log('[Nova] Verification complete');

  // Pass 2: Extracting multi-agent panel structure
  console.log('[Nova] Pass 2: Extracting multi-agent panel structure...');
  onProgress?.('pass2');
  const panelStructure = await extractPanelStructureMultiAgent(s3Uri, bucketOwner, deepAnalysis, onProgress);

  // Post-processing: deduplicate panel dialogues
  panelStructure.panels = deduplicatePanelDialogue(panelStructure.panels);
  console.log(`[Nova] Pass 2 complete: ${panelStructure.panels.length} panels`);

  console.log('[Nova] === Analysis pipeline complete ===');
  return panelStructure;
}

/**
 * Legacy compatibility: existing 1-pass method (for fallback if needed)
 */
export async function analyzeVideoLegacy(
  s3Uri: string,
  bucketOwner: string
): Promise<NovaAnalysisResult> {
  const systemPrompt: SystemContentBlock = {
    text: `You are an expert video analyst and comic storyteller.
Your job is to watch a video and understand the ENTIRE story from beginning to end.
Then distill it into exactly 4 panels that will form a SINGLE comic page.
These panels will be rendered as a SILENT comic - NO dialogue, NO speech bubbles. Visual storytelling only.

You MUST respond with valid JSON only. No markdown, no explanation, no extra text.`,
  };

  const userMessage: Message = {
    role: 'user',
    content: [
      buildVideoContentBlock(s3Uri, bucketOwner),
      {
        text: `Watch this video carefully. Understand the complete narrative arc and the TRUE context of the situation.
Pay close attention to the audio, dialogue, and sound effects.

Return JSON:
{
  "duration": <seconds>,
  "summary": "<one-line English summary>",
  "summaryKo": "<same summary translated to natural Korean>",
  "climaxIndex": <0-based index>,
  "hasAudioDialogue": <true/false>,
  "characterDescriptions": "<visual description of all characters>",
  "panels": [
    {
      "panelId": 1,
      "description": "<100-200 char visual scene description for image generation>",
      "emotion": "<joy|sadness|surprise|anger|fear|neutral>",
      "dialogue": "<key dialogue in English>",
      "dialogueKo": "<Korean translation>"
    }
  ]
}`,
      },
    ],
  };

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: PRO_MODEL_ID,
      messages: [userMessage],
      system: [systemPrompt],
      inferenceConfig: { maxTokens: 8192, temperature: 0.45, topP: 0.9 },
    })
  );

  const text = extractTextFromResponse(response);
  const result = parseJsonFromText<NovaAnalysisResult>(text);

  if (!result.panels || result.panels.length < 4) {
    throw new Error(`Insufficient panels: ${result.panels?.length}`);
  }

  return result;
}
