# VYRAL DNA & Shared Asset Knowledge System
# VYRAL DNA နှင့် Shared Asset Knowledge System

**Status:** Future-version architecture proposal — recorded as an agreed product direction; implementation is not yet complete or authorized by this document alone.  
**အခြေအနေ:** အနာဂတ် Version အတွက် Architecture မှတ်တမ်း — Product Direction အဖြစ် သဘောတူထားခြင်းဖြစ်ပြီး ဤစာတမ်းတစ်ခုတည်းကြောင့် Implementation ပြီးစီးပြီးဟု မဆိုလိုပါ။

**Related document:** [FUTURE_CREATOR_AND_REUSABLE_ASSET_ECOSYSTEM.md](./FUTURE_CREATOR_AND_REUSABLE_ASSET_ECOSYSTEM.md)

---

## 1. Purpose

VYRAL should preserve the identity and knowledge of every VYRAL collection and every individual asset. As creators and other permitted users reuse assets to generate images, videos, audio, and other media, VYRA should progressively build more useful and accurate knowledge about those assets.

The goal is a shared creative intelligence system: an asset is not merely stored as a file; it has a persistent identity, a structured knowledge record, and a traceable history of how its knowledge was created and improved.

VYRAL တစ်ခုချင်းစီနှင့် ၎င်းအတွင်းရှိ Asset တစ်ခုချင်းစီမှာ ကိုယ်ပိုင် Identity နှင့် Knowledge ရှိရမည်။ Creator နှင့် ခွင့်ပြုချက်ရှိသော အခြားအသုံးပြုသူများက Asset များကို ပြန်လည်အသုံးပြုပြီး Image၊ Video၊ Audio နှင့် အခြား Media များ Generate လုပ်လာသည်နှင့်အမျှ VYRA သည် ထို Asset များအကြောင်း ပိုမိုအသုံးဝင်ပြီး တိကျသော Knowledge ကို တဖြည်းဖြည်း တည်ဆောက်သွားရမည်။

ရည်ရွယ်ချက်မှာ Shared Creative Intelligence System တစ်ခုဖြစ်သည်။ Asset တစ်ခုသည် သိမ်းထားသော File သက်သက်မဟုတ်ဘဲ တည်မြဲသော Identity၊ စနစ်တကျဖွဲ့စည်းထားသော Knowledge Record နှင့် Knowledge ဘယ်လိုတည်ဆောက်တိုးတက်လာသည်ကို ပြန်လည်ခြေရာခံနိုင်သော History ရှိရမည်။

## 2. DNA exists at two levels

### 2.1 VYRAL-level DNA

Each VYRAL has its own collection identity and context, including where applicable:

- VYRAL ID and version identity
- Creator and attribution
- Universe, concept, purpose, and shared rules
- Creator-defined style and consistency rules
- License and permitted uses
- Relationships to included assets and other VYRALs
- Original/derivative lineage

VYRAL တစ်ခုချင်းစီမှာ Collection တစ်ခုလုံးကို ကိုယ်စားပြုတဲ့ DNA ရှိရမည်။ ဥပမာ VYRAL ID၊ Creator၊ Universe၊ Concept၊ Rules၊ Style၊ License၊ ပါဝင်သော Asset များနှင့် Original/Derivative Lineage တို့ဖြစ်သည်။

### 2.2 Asset-level DNA

Every asset inside a VYRAL has its own independent identity and DNA record. Examples include a character, environment, object, product, visual style, voice, music, or another creator-defined component.

An asset record may include:

- **Identity:** stable asset ID, asset type, owning/source VYRAL, and version.
- **Semantic DNA:** what the asset represents, its purpose, meaning, and attributes.
- **Visual DNA:** visible shape, proportions, colors, materials, textures, composition, and distinctive features.
- **Audio DNA:** voice characteristics, transcript, sound/music properties, and other relevant audio observations.
- **Generation DNA:** original prompt/instructions, negative prompt where available, model, settings, and generation event.
- **Relationship DNA:** links to related characters, objects, environments, scenes, and other assets.
- **Lineage DNA:** original creator/source, parent asset, derivative versions, and transformations.
- **Experience DNA:** useful observations and outcomes from permitted reuse and generation sessions.

Asset တစ်ခုချင်းစီမှာလည်း သီးခြား Identity နဲ့ DNA ရှိရမည်။ Character၊ Environment၊ Object၊ Product၊ Visual Style၊ Voice၊ Music စသည့် အမျိုးအစားများ ပါဝင်နိုင်ပြီး အထက်ပါအချက်အလက်များကို Asset ၏ သဘောသဘာဝအလိုက် သိမ်းဆည်းမည်။

## 3. Three distinct DNA components

The term “DNA Fingerprint” describes a system of related records, not one magic hash or one text description. Keep these components distinct:

1. **Identity Fingerprint** — stable identifiers and content/version fingerprints used to distinguish an asset and detect whether its underlying media has changed. A cryptographic hash can help verify exact file identity; perceptual fingerprints can help detect visually similar or transformed media. Neither one alone explains what an asset means.
2. **Knowledge DNA** — structured information that AI can retrieve and use to understand the asset.
3. **Evolution History** — append-only history of new analyses, corrections, observations, versions, and verified improvements.

“DNA Fingerprint” ဆိုသည်မှာ Hash တစ်ခုတည်း သို့မဟုတ် Description တစ်ခုတည်းကို ဆိုလိုခြင်းမဟုတ်ပါ။

- **Identity Fingerprint** က Asset ကို ခွဲခြားသတ်မှတ်ပြီး မူရင်း Media ပြောင်းလဲမှုရှိ/မရှိ စစ်ဆေးရန်။
- **Knowledge DNA** က AI နားလည်အသုံးပြုနိုင်မည့် Structured Knowledge ဖြစ်ရန်။
- **Evolution History** က Analysis၊ ပြင်ဆင်ချက်၊ Observation၊ Version နှင့် အတည်ပြုထားသော တိုးတက်မှုများကို အစဉ်လိုက် ထိန်းသိမ်းရန် ဖြစ်သည်။

## 4. Two-stage knowledge creation

Every generated asset must receive an initial Knowledge Record at generation time. A costly Vision analysis is not required for this first record.

### Stage A — Generation Knowledge (automatic, low-cost)

Create the initial record from information already available during generation:

- Asset ID, VYRAL ID, version, and asset type
- Original prompt and creation instructions
- Negative prompt, if supplied
- Creator-provided descriptions and constraints
- Intended subject, character/object/environment details
- Requested style, colors, composition, and attributes
- Generation model, settings, timestamp, and source references
- Parent/reference assets and known relationships
- Explicitly label prompt-derived information as intended/requested, not visually verified

This record gives AI useful context before it has inspected the generated media. It may contain incomplete or inaccurate assumptions, so each fact must retain its source and verification status.

Asset Generate လုပ်သည့်အချိန်မှာ Generation Knowledge ကို အလိုအလျောက် တည်ဆောက်ရမည်။ Prompt၊ Creator သတ်မှတ်ချက်၊ Model၊ Settings နှင့် ရရှိပြီးသား Context များကို အသုံးပြုမည်။ ဤအဆင့်တွင် Vision API ကို မဖြစ်မနေ ခေါ်စရာမလိုပါ။

Prompt ထဲတွင် ရေးထားသည့်အချက်ကို ပုံထဲမှာ တကယ်ပါဝင်ကြောင်း အတည်ပြုပြီးသားဟု မမှတ်တမ်းတင်ရ။ “Creator/Prompt က ရည်ရွယ်ထားသည်” နှင့် “Vision က မြင်တွေ့အတည်ပြုထားသည်” ကို သီးခြားခွဲထားရမည်။

### Stage B — Vision Knowledge (on demand)

When a user requests a task that needs detailed visual understanding—such as turning a character into a video, editing an asset, checking consistency, or reconstructing a reference—run Vision analysis on the actual original asset or the relevant version.

Depending on the asset and task, Vision analysis may record:

- Actual visible subjects and objects
- Appearance, facial features, clothing, accessories, and distinctive identity traits
- Shape, proportions, geometry, colors, materials, textures, lighting, and shadows
- Composition, relative positions, and spatial relationships
- Bounding boxes, segmentation masks, or other visual localization data when useful
- Uncertain observations and confidence values
- Analysis model/version, timestamp, source asset version, and task context

Vision analysis must add a new sourced record/version; it must not silently overwrite the original generation record or original media.

Video၊ Editing၊ Consistency စစ်ဆေးခြင်း သို့မဟုတ် Reference ပြန်တည်ဆောက်ခြင်းအတွက် အသေးစိတ် Visual Understanding လိုအပ်လာသည့်အခါမှသာ မူရင်း Asset ကို Vision နဲ့ စစ်ဆေးမည်။ ရရှိလာသော အချက်အလက်များကို Source၊ Confidence၊ Analysis Model နှင့် သက်ဆိုင်ရာ Asset Version တို့နှင့်အတူ ထပ်ဖြည့်မည်။ မူလ Generation Record နှင့် Original Media ကို အစားထိုးဖျက်ပစ်ခြင်း မပြုရ။

## 5. Shared use and reuse of existing knowledge

A VYRAL may be shared with many users under the creator's permissions. When another permitted user selects an asset to create a video or other media:

1. Resolve the exact VYRAL and asset version being used.
2. Retrieve the asset's existing Knowledge Record.
3. Check whether the record contains the level of visual/audio understanding required by this task and whether it applies to this exact asset version.
4. If sufficient, reuse the existing verified knowledge; do not pay to repeat an identical analysis.
5. If missing or insufficient, analyze the original asset or the specific version as needed.
6. Save the new analysis as a sourced knowledge contribution and make eligible verified knowledge reusable by later users.
7. Link the resulting media output to the exact source VYRAL version, asset versions, prompts, and transformations.

When the source media has not changed and an equivalent analysis already exists, later users should normally reuse it. New analysis is appropriate when the source version changes, the task needs information not previously analyzed, or the earlier record is incomplete or unreliable.

VYRAL ကို Creator ၏ Permission အတွင်း လူအများ မျှဝေသုံးစွဲနိုင်သည်။ အခြားအသုံးပြုသူတစ်ယောက်က Character ကို အသုံးပြုပြီး Video ဖန်တီးလိုသည့်အခါ AI သည် အသုံးပြုမည့် Asset Version အတိအကျကို ရှာဖွေပြီး ရှိပြီးသား Knowledge ကို အရင်အသုံးပြုရမည်။ လိုအပ်သော အချက်အလက် မပြည့်စုံသေးမှသာ Vision Analysis ထပ်လုပ်မည်။ တူညီသော Asset ကို တူညီသည့် Analysis ဖြင့် အကြိမ်ကြိမ် ပြန်ဖတ်ပြီး API ကုန်ကျစရိတ် မဖြစ်စေရ။

အသစ်ရရှိလာသော Analysis ကို Source နှင့်အတူ သိမ်းဆည်းပြီး နောက်အသုံးပြုသူများ ပြန်လည်အသုံးချနိုင်သော Verified Knowledge အဖြစ် သတ်မှတ်နိုင်သည်။ Generate လုပ်ထားသော Output တိုင်းကို အသုံးပြုခဲ့သည့် VYRAL Version၊ Asset Version၊ Prompt နှင့် Transformation များနှင့် ချိတ်ဆက်ထားရမည်။

## 6. Knowledge sources, confidence, and verification

Every knowledge item must identify where it came from. Suggested source classes:

- Creator-provided
- Generation prompt/model metadata
- Vision-observed
- Audio-analyzed or transcribed
- User-reported experience
- Community-contributed
- System-derived or inferred
- Creator-confirmed / independently verified

Each item should also carry a status such as **unverified**, **observed**, **corroborated**, **creator-confirmed**, or **disputed**, plus confidence where a model provides one.

Do not treat repeated claims as automatically true. Multiple reports may originate from the same mistaken assumption. For high-impact identity or permission facts, require stronger evidence or creator confirmation. Community contributions must never silently change creator-defined identity, ownership, licensing, or protected rules.

Knowledge Record ထဲက အချက်တိုင်းမှာ ဘယ်ကရလာတယ်ဆိုတဲ့ Source ရှိရမည်။ Creator ထည့်ထားတာ၊ Prompt မှရတာ၊ Vision ကမြင်တာ၊ User Experience မှရတာ၊ Community က ထည့်ဝင်တာ၊ AI က ခန့်မှန်းတာ စသည်ဖြင့် ခွဲခြားမည်။ အတည်မပြုရသေးခြင်း၊ မြင်တွေ့ထားခြင်း၊ အခြားအထောက်အထားများနှင့် ကိုက်ညီခြင်း၊ Creator အတည်ပြုခြင်း၊ အငြင်းပွားနေခြင်းတို့ကိုလည်း Status အဖြစ် သိမ်းမည်။

အကြိမ်များစွာ ပြောဆိုထားခြင်းတစ်ခုတည်းကြောင့် အမှန်ဖြစ်သည်ဟု မသတ်မှတ်ရ။ Community Knowledge သည် Creator ၏ Identity၊ Ownership၊ License သို့မဟုတ် ကာကွယ်ထားသော Rules များကို တိတ်တဆိတ် ပြောင်းလဲခွင့်မရှိပါ။

## 7. Community experience improves knowledge—with safeguards

Reuse and generation sessions can produce useful evidence, for example:

- A user notices that a character's eye color changes in generated videos.
- Another user identifies that the hairstyle is inconsistent in side views.
- A later test finds a better reference or prompt that improves consistency.
- Repeated, independently sourced results support a more reliable observation.

Store relevant task context, source version, model/settings where permitted, user feedback, and outcome. Separate raw user reports from verified conclusions. Promote a community observation into shared verified knowledge only after appropriate corroboration, analysis, or creator review.

User experience can improve shared knowledge, but it does not guarantee perfect accuracy. Models can misread images, generations can vary, and users can report incorrect conclusions. Preserve disagreement and uncertainty instead of forcing every observation into one supposedly certain answer.

အသုံးပြုသူများက Character ကို Video ပြောင်းသည့်အခါ မျက်လုံးအရောင်ပြောင်းသွားခြင်း၊ ဘေးတိုက်ပုံတွင် ဆံပင်မတူခြင်း၊ ပိုကောင်းသော Reference ရှာတွေ့ခြင်း စသည့် Experience များကို အထောက်အထားနှင့်အတူ စုဆောင်းနိုင်သည်။ Raw User Report နှင့် Verified Conclusion ကို သီးခြားထားရမည်။ သင့်လျော်သော ထပ်မံစစ်ဆေးမှု၊ Vision Analysis သို့မဟုတ် Creator Review ရပြီးမှသာ Shared Verified Knowledge အဖြစ် အဆင့်မြှင့်မည်။

လူအများ၏ Experience က Knowledge ကို ပိုကောင်းလာစေနိုင်သော်လည်း အမြဲတမ်း အမှားကင်းမည်ဟု အာမမခံနိုင်ပါ။ မတူညီသော အမြင်များ၊ မသေချာမှုများနှင့် အငြင်းပွားမှုများကိုလည်း ထိန်းသိမ်းရမည်။

## 8. Creator authority, privacy, and permissions

- The original creator's source asset and original VYRAL version remain unchanged by downstream use.
- Community contributions may enrich knowledge but cannot silently rewrite creator-owned identity or license terms.
- Respect the VYRAL license and asset-level permissions before analyzing, generating, sharing, or reusing an asset.
- Respect user privacy and visibility settings. Do not expose private prompts, private outputs, or identifiable usage details to other users without authorization.
- Record attribution and provenance for contributions and generated outputs.
- Provide correction, dispute, and rollback/history mechanisms for inaccurate knowledge.
- Do not use private user content as a shared contribution unless the user has authorized that use.

မူရင်း Creator ၏ Asset နှင့် VYRAL Version ကို နောက်ဆက်တွဲအသုံးပြုမှုများကြောင့် မပြောင်းလဲစေရ။ Community က Knowledge ကို ဖြည့်စွက်နိုင်သော်လည်း Creator ၏ မူလ Identity သို့မဟုတ် License ကို ခွင့်ပြုချက်မရှိဘဲ ပြောင်းလဲခွင့်မရှိပါ။ Privacy၊ Visibility၊ Attribution၊ Provenance နှင့် Asset Permission များကို အမြဲလိုက်နာရမည်။ မမှန်ကန်သော Knowledge အတွက် ပြင်ဆင်ခြင်း၊ အငြင်းပွားခြင်းနှင့် ယခင် Version သို့ ပြန်လည်ကြည့်ရှုနိုင်ခြင်းတို့ ရှိရမည်။

## 9. Knowledge record lifecycle

Recommended lifecycle:

1. **Created** — initial Generation Knowledge is stored with the new asset.
2. **Analyzed** — task-triggered Vision/Audio/Document analysis adds sourced observations.
3. **Reused** — later tasks retrieve existing knowledge and avoid duplicate analysis.
4. **Enriched** — new usage experiences and evidence are attached.
5. **Verified** — supported observations are promoted according to evidence and authority rules.
6. **Versioned** — every material change is recorded; prior records remain inspectable.
7. **Superseded or disputed** — outdated or challenged facts are marked, not silently erased.

Knowledge Record Lifecycle သည် Generate လုပ်ချိန်တွင် စတင်ပြီး လိုအပ်သည့်အခါ Analysis လုပ်ခြင်း၊ နောက်လူများက ပြန်လည်အသုံးပြုခြင်း၊ Experience အသစ်များဖြင့် ဖြည့်စွက်ခြင်း၊ အထောက်အထားဖြင့် အတည်ပြုခြင်းနှင့် Version အလိုက် မှတ်တမ်းတင်ခြင်းတို့ကို ဖြတ်သန်းမည်။ မမှန်တော့သော သို့မဟုတ် အငြင်းပွားနေသော အချက်များကို ဖျက်ပစ်မည့်အစား Status ပြောင်းလဲထားရမည်။

## 10. Cost and performance principles

- Generate the initial Knowledge Record from data already available during asset generation.
- Run expensive Vision/Audio analysis only when required by a real task or when the existing record is insufficient.
- Cache and reuse analysis for the same unchanged asset version and equivalent analysis scope.
- Re-analyze only changed versions or missing task-specific details.
- Support different models for generation and analysis; select analysis models by required quality and cost.
- Use deeper analysis (segmentation, object localization, depth, embeddings, or geometry extraction) only when it materially improves the requested workflow.
- Preserve the original media so a future model can inspect it again when needed.

ကုန်ကျစရိတ်လျှော့ချရန် Generation အချိန်မှာ ရရှိပြီးသား Data ဖြင့် အခြေခံ Record ကို ဖန်တီးမည်။ Vision/Audio Analysis ကို အမှန်တကယ်လိုအပ်သည့်အခါမှသာ လုပ်မည်။ Asset Version မပြောင်းလဲဘဲ တူညီသော Analysis ရှိပြီးသားဆိုလျှင် Cache မှ ပြန်သုံးမည်။ Segmentation၊ Object Localization၊ Depth၊ Embeddings နှင့် Geometry Analysis ကဲ့သို့ ပိုမိုကုန်ကျနိုင်သော နည်းလမ်းများကို လိုအပ်မှသာ အသုံးပြုမည်။ Original Media ကို အမြဲထိန်းသိမ်းထားရမည်။

## 11. Relationship to Identity Fingerprints and lineage

Identity fingerprints, knowledge records, and lineage records solve different problems and must be linked without being conflated:

- Identity fingerprint: which exact asset/media version is this?
- Knowledge record: what is known about it, and from which sources?
- Evolution history: how has that knowledge changed over time?
- Lineage: which original VYRAL/asset and creator does this version derive from?

A generated video or image must point to the exact source asset/VYRAL version(s) and knowledge snapshot used for that generation. This makes results auditable and helps reproduce or explain a previous generation.

Identity Fingerprint က ဘယ် Asset Version အတိအကျလဲဆိုတာ သတ်မှတ်သည်။ Knowledge Record က ဘာတွေသိထားလဲနှင့် ဘယ် Source မှရလာလဲဆိုတာ ဖော်ပြသည်။ Evolution History က အချိန်နဲ့အမျှ ပြောင်းလဲမှုကို ထိန်းသိမ်းသည်။ Lineage က မူရင်း Creator နှင့် Source သို့ ပြန်လည်ခြေရာခံစေသည်။ Generate လုပ်ထားသော Media တိုင်းသည် အသုံးပြုခဲ့သည့် Source Version နှင့် Knowledge Snapshot ကို ချိတ်ဆက်ထားရမည်။

## 12. Core product outcome

The intended result is a shared creative intelligence platform in which:

- Every VYRAL has its own collection-level DNA.
- Every asset has its own independent DNA fingerprint and Knowledge Record.
- Every generated asset receives Generation Knowledge immediately.
- Vision and other detailed analysis enrich the record when a real workflow needs it.
- Permitted users reuse existing verified knowledge instead of repeatedly paying for identical analysis.
- Community experience can improve shared knowledge through evidence and verification.
- Creator authority, privacy, licensing, and original asset integrity remain protected.
- Knowledge and lineage become more useful over time without pretending that AI observations are infallible.

အဆုံးသတ်ရည်မှန်းချက်မှာ VYRAL တိုင်းတွင် ကိုယ်ပိုင် DNA ရှိပြီး Asset တိုင်းတွင်လည်း ကိုယ်ပိုင် DNA Fingerprint နှင့် Knowledge Record ရှိသော Shared Creative Intelligence Platform ဖြစ်လာရန် ဖြစ်သည်။ Generate လုပ်သည့်အချိန်ကတည်းက အခြေခံ Knowledge ရှိမည်။ လိုအပ်သည့်အခါ Vision ဖြင့် အသေးစိတ်ဖြည့်မည်။ လူအများက အတည်ပြုထားသော Knowledge ကို မျှဝေသုံးစွဲမည်။ တစ်ချိန်တည်းတွင် Creator Authority၊ Privacy၊ License နှင့် Original Asset များကို ကာကွယ်ထားမည်။


## 13. Fingerprint types — what each one identifies

VYRAL should not treat “fingerprint” as one single technique. Use three complementary fingerprint types for different matching and verification tasks. These are identity/matching tools; they are not the asset's Knowledge DNA.

### 13.1 Cryptographic Fingerprint (exact file identity and integrity)

- Calculate a cryptographic hash such as SHA-256 from the exact original file bytes.
- The same exact bytes produce the same hash; even a small byte-level change normally produces a different hash.
- Use it to verify exact file integrity, detect exact duplicates, and confirm whether a stored file is byte-for-byte identical.
- Do not use it to recognize a resized, recompressed, re-encoded, or edited copy as the same visual content.

### 13.2 Perceptual Fingerprint (media similarity)

- Calculate a perceptual signature from media features, such as a perceptual image hash; use suitable audio/video fingerprinting methods for those media types.
- Use it to find likely visually or acoustically similar copies even when the file has been resized, recompressed, or converted to another format.
- Treat a perceptual match as a similarity signal, not proof of ownership, exact identity, or copyright.
- Keep thresholds and matching decisions appropriate to the media type and use case.

### 13.3 Semantic Fingerprint (meaning and concept similarity)

- Create an embedding/vector representation from the asset or its analyzed content using a suitable model.
- Use it to retrieve assets with similar meaning or concepts, even when their pixels, audio waveform, composition, or wording are different.
- Example: find other images that depict a similar kind of character or scene, or find a video that conveys a similar concept.
- A semantic match is not a unique identifier and must never be treated as proof that two assets are the same asset.

### 13.4 How the three work together

| Type | Main question | Typical use |
|---|---|---|
| Cryptographic | “Are these exact file bytes identical?” | Integrity and exact duplicate detection |
| Perceptual | “Does this media look or sound substantially similar?” | Similar-copy and transformed-media discovery |
| Semantic | “Do these assets express similar content or meaning?” | AI search and concept-based retrieval |

**Keep the core distinction clear:**
- **Fingerprint = identification, integrity checking, and similarity matching.**
- **Knowledge DNA = structured understanding of what the asset is and what is known about it.**
- **Evolution History = the traceable record of how that knowledge changes over time.**

The three fingerprint types may point to or help retrieve a Knowledge Record, but they do not replace it. A perceptual or semantic match must not automatically merge two assets or overwrite their separate identities. Preserve each asset's own ID, creator attribution, license, version, and lineage.

Fingerprint ဆိုတာ နည်းပညာတစ်မျိုးတည်း မဟုတ်ဘဲ ရည်ရွယ်ချက်မတူတဲ့ အမျိုးအစား ၃ မျိုးကို ပေါင်းစပ်အသုံးပြုမည်။

1. **Cryptographic Fingerprint (ဥပမာ SHA-256)** — File ရဲ့ မူရင်း Byte အတိအကျကို Hash လုပ်ပြီး တူညီတဲ့ File ဟုတ်/မဟုတ်၊ ပြောင်းလဲထားခြင်းရှိ/မရှိ စစ်ဆေးမည်။ File ကို အရွယ်အစားပြောင်းခြင်း၊ Format ပြောင်းခြင်း သို့မဟုတ် Re-encode လုပ်ခြင်းဖြင့် Hash ပြောင်းသွားနိုင်သည်။
2. **Perceptual Fingerprint** — ပုံ သို့မဟုတ် အသံရဲ့ မြင်ရ/ကြားရသော လက္ခဏာများအပေါ် အခြေခံပြီး Resize၊ Compression သို့မဟုတ် Format ပြောင်းထားသော်လည်း ဆင်တူသော Media များကို ရှာဖွေမည်။ ဆင်တူမှုသည် Ownership သို့မဟုတ် မူရင်းတူညီမှုကို သက်သေပြခြင်း မဟုတ်ပါ။
3. **Semantic Fingerprint** — Model မှ ဖန်တီးထားသော Embedding/Vector ကို အသုံးပြုပြီး Pixel သို့မဟုတ် Waveform မတူသော်လည်း အဓိပ္ပာယ်၊ အကြောင်းအရာ၊ Concept ဆင်တူသော Asset များကို ရှာဖွေမည်။ ၎င်းသည် Unique ID မဟုတ်သလို Asset နှစ်ခုတူညီကြောင်း သက်သေမပြနိုင်ပါ။

အဓိကကွာခြားချက်မှာ **Fingerprint က ခွဲခြားသတ်မှတ်ခြင်း၊ Integrity စစ်ဆေးခြင်းနှင့် Similarity ရှာဖွေခြင်းအတွက် ဖြစ်ပြီး၊ DNA က Asset အကြောင်း AI နားလည်ထားသော Knowledge ဖြစ်သည်။ Evolution History က Knowledge ပြောင်းလဲတိုးတက်မှုကို မှတ်တမ်းတင်ခြင်း ဖြစ်သည်။**

Perceptual သို့မဟုတ် Semantic Similarity တွေ့ရုံဖြင့် Asset နှစ်ခုကို တစ်ခုတည်းအဖြစ် အလိုအလျောက် ပေါင်းစည်းခြင်း မပြုရ။ Asset တစ်ခုချင်းစီ၏ ID၊ Creator၊ License၊ Version နှင့် Lineage ကို သီးခြားထိန်းသိမ်းရမည်။

---

## Change log

- **2026-11-05 — VYRAL DNA & Shared Asset Knowledge System:** Recorded VYRAL-level and asset-level DNA, the three DNA components (Identity Fingerprint, Knowledge DNA, Evolution History), automatic low-cost Generation Knowledge, on-demand Vision Knowledge, shared reuse/caching across users, evidence-based community enrichment, source/confidence tracking, creator authority, privacy, licensing, and lineage requirements.
- **2026-11-05 — Fingerprint types clarification:** Added Cryptographic (SHA-256), Perceptual, and Semantic Fingerprints, their distinct purposes and limitations, and the rule that similarity matches must not merge separate asset identities.

- **2026-11-05 — VYRAL DNA နှင့် Shared Asset Knowledge System:** VYRAL အဆင့်နှင့် Asset အဆင့် DNA၊ Identity Fingerprint / Knowledge DNA / Evolution History၊ Generation အချိန် အလိုအလျောက်ဖန်တီးမည့် ကုန်ကျစရိတ်နည်းသော Knowledge၊ လိုအပ်မှသာ လုပ်မည့် Vision Analysis၊ လူအများကြား Knowledge ပြန်လည်မျှဝေသုံးစွဲခြင်းနှင့် Cache၊ အထောက်အထားအခြေပြု Community Knowledge တိုးတက်မှု၊ Source/Confidence မှတ်တမ်း၊ Creator Authority၊ Privacy၊ License နှင့် Lineage စည်းမျဉ်းများကို မှတ်တမ်းတင်ထားသည်။
- **2026-11-05 — Fingerprint အမျိုးအစားများ:** Cryptographic (SHA-256), Perceptual နှင့် Semantic Fingerprint တို့၏ ရည်ရွယ်ချက်၊ ကွဲပြားချက်၊ ကန့်သတ်ချက်များနှင့် Similarity တွေ့ရုံဖြင့် Asset Identity များကို အလိုအလျောက် မပေါင်းစည်းရသည့် စည်းမျဉ်းကို ထည့်သွင်းထားသည်။


## 14. Native `.vyral` file format — portable hybrid package

A `.vyral` file is intended to be a portable Digital Identity Package for one complete VYRAL. It must contain both the VYRAL-level Master DNA and the independent records for every included asset. It is not merely a text document, a media folder, or a model-specific embedding file.

### 14.1 Recommended container

Use a ZIP-compatible package container with the `.vyral` extension as the initial implementation. This gives the format a practical, inspectable structure while allowing it to be treated as one file by ordinary file managers.

The package should use a versioned, documented internal specification. The ZIP container is an implementation choice, not the definition of VYRAL identity itself. A future container implementation must preserve the same logical data model and compatibility rules.

### 14.2 Recommended internal layout

```text
MyCharacter.vyral
├── manifest.json
├── dna/
│   ├── vyral-dna.json
│   ├── assets-dna.json
│   ├── knowledge.json
│   ├── relationships.json
│   └── evolution-history.json
├── fingerprints/
│   ├── cryptographic.json
│   ├── perceptual.json
│   ├── semantic/
│   └── structural.json
├── assets/
│   ├── original/
│   ├── generated/
│   └── versions/
├── vision/
│   ├── observations.json
│   ├── analysis-records/
│   └── evidence/
└── security/
    ├── signatures/
    └── permissions.json
```

This is a proposed logical layout. Exact filenames and required/optional entries will be finalized in the formal format specification. A package may omit optional media payloads when the creator chooses a knowledge-only export, but it must clearly declare that those originals are not embedded and must never imply that exact recovery is possible without the missing information.

### 14.3 Data representation

Use a hybrid representation so each type of information is stored in a suitable form:

- **JSON** for manifest data, identities, DNA records, structured observations, provenance, permissions, relationships, version history, and fingerprint metadata. JSON is human-readable and broadly supported.
- **Original binary payloads** for images, video, audio, documents, 3D files, and other media. Preserve the original bytes when exact file recovery is required.
- **Vector/binary data** for semantic embeddings and other high-dimensional model representations. Include model/provider, model version, dimensions, encoding, and compatibility metadata; never assume every AI model can interpret every embedding.
- **Hash/signature data** for cryptographic integrity checks and package authenticity. Define exactly which payload bytes or canonicalized logical records each digest covers.

Example only — a simplified asset DNA record:

```json
{
  "asset_id": "VYR-ASSET-001",
  "identity": {
    "name": "Character_001",
    "type": "character"
  },
  "visual_dna": {
    "hair": {
      "color": "blue",
      "style": "long"
    },
    "clothing": {
      "primary_color": "black"
    }
  },
  "knowledge_status": "evolving"
}
```

The actual schema must support typed values, provenance, confidence, uncertainty, verification status, source asset/version references, and extensible fields. The simplified example above is not the final schema.

### 14.4 Package identity and integrity

The package must distinguish:
- The hash of the complete serialized `.vyral` file (which may change when ZIP metadata, ordering, or compression changes).
- Per-file cryptographic hashes for exact embedded payload integrity.
- A logical Master Fingerprint calculated from a documented canonical representation of the VYRAL identity and its included asset/version records.
- The VYRAL Master DNA, which describes the collection and its relationships and is not itself a hash.

A change to an asset or its version must update the relevant asset records and the logical package fingerprint. A package rebuild that only changes ZIP serialization must not silently create a new creator-defined VYRAL identity. Digital signatures should cover a well-defined canonical manifest and content-digest list so tampering can be detected.

### 14.5 Interoperability

The `.vyral` format should have an open, versioned specification so VYRA and other compatible AI platforms can parse the package without depending on one vendor's private embedding format or one specific AI model.

A compatible platform should be able to:
1. Read the manifest and identify the VYRAL and its version.
2. Read asset identities, permissions, lineage, and Knowledge DNA.
3. Verify available hashes and signatures.
4. Retrieve the original media when included and authorized.
5. Interpret model-independent structured observations.
6. Use supported embeddings or create its own analysis representation when an embedding is incompatible.
7. Preserve provenance and append new observations without erasing earlier records.

### 14.6 Creator-facing simplicity

Creators should interact with VYRAL as they would with an ordinary asset file manager: add files, create folders, name assets, organize them, and choose sharing/export permissions. DNA, fingerprint generation, analysis records, and package maintenance should happen behind the scenes wherever possible.

The technical complexity belongs to the VYRAL format and VYRA services, not to the creator's everyday workflow.

## 15. DNA completion principle — reconstruction is the acceptance test

**A VYRAL DNA record must not be declared complete merely because it contains many descriptions, observations, embeddings, or fingerprint records. DNA completeness is determined by a reconstruction test.**

The governing principle is:

> DNA is not complete until an AI can reconstruct the original asset from the DNA alone, without being given the original asset as a visual/audio reference, and the reconstructed result meets the defined exact-equivalence requirement.

### 15.1 DNA-only reconstruction test

1. Preserve the original asset separately as a protected test reference. Do not pass it to the reconstruction model.
2. Give the reconstruction system only the relevant DNA package and the documented decoder/reconstruction instructions.
3. Generate the reconstructed asset without access to the original media payload or hidden reference.
4. Compare the result with the protected original using the appropriate exact and modality-specific verification procedures.
5. Record the model, version, settings, decoding steps, test conditions, output fingerprint, comparison results, and any failures.
6. Repeat across independent runs and compatible reconstruction systems where the claimed portability requires it.
7. Mark the DNA as complete only when the predeclared acceptance criteria are met. Otherwise retain an incomplete/evolving status and record what information is still missing.

### 15.2 Exactness must be defined per asset type

For a digital file, **byte-for-byte identity** is the strictest exact-recovery criterion: the reconstructed file has the same bytes and therefore the same cryptographic hash as the original.

For media where the intended requirement is identical decoded content rather than identical file encoding, the specification may additionally define a decoded-content criterion, such as identical pixel/sample data, dimensions, frame sequence, timing, color interpretation, or other modality-specific properties. This criterion must be explicitly named and must not be mislabeled as byte-for-byte identity.

Perceptual similarity, semantic similarity, or a high Vision score alone is not exact reconstruction and must never qualify as DNA completion under the exact-reconstruction target.

### 15.3 Important feasibility boundary

A DNA description or model embedding cannot guarantee recovery of information it never captured. If the original file is deleted and the package contains only lossy observations, prompts, embeddings, or approximate descriptions, exact recovery may be information-theoretically impossible.

Therefore:
- If exact recovery is required, the package must preserve enough lossless information to reproduce the original bytes or the explicitly defined exact decoded content.
- If the creator exports a knowledge-only package without the original payload or a proven lossless reconstruction representation, label it as **reconstruction-capable to the tested level**, not exact-recovery complete.
- Never claim exact reconstruction based only on a perceptual or semantic match.
- The completion test must be performed with the original hidden from the reconstruction model; the original is used only by the independent verifier for comparison.

### 15.4 Suggested status vocabulary

- **Evolving** — knowledge is still being collected; no qualifying reconstruction test has passed.
- **Reconstruction-tested** — one or more DNA-only tests have been run; results and limitations are recorded.
- **High-fidelity** — the declared perceptual/structural thresholds have passed, but exact equivalence has not.
- **Exact-reconstruction verified** — the declared exact-equivalence test has passed under documented conditions.
- **Not recoverable from current DNA** — the required source information is missing; additional original data or lossless capture is needed.

These labels describe evidence and test scope, not an absolute promise that every future AI model will reproduce the asset identically. A model-specific pass must name the model and test conditions. A portable claim requires successful tests across the specified compatible systems.

### 15.5 No self-confirming evaluation

The same generative model must not be the sole judge of its own reconstruction. Use deterministic hash checks where applicable and independent comparison/verification methods for the relevant media type. Keep the original reference protected and separate from the reconstruction input.

## 16. VYRAL product principles added

1. A creator's everyday workflow remains as simple as a normal file manager.
2. Every asset has its own identity, DNA/Knowledge Record, fingerprints, and evolution history.
3. The complete VYRAL has its own Master DNA, relationship map, and logical Master Fingerprint.
4. AI use is also a knowledge-building event: when an AI inspects or uses an asset to generate a video or other output, it records relevant observations about both the source assets and generated assets, with provenance and evidence.
5. Repeated AI Vision analysis should improve coverage and confidence, not blindly overwrite earlier knowledge or drift away from creator-confirmed identity.
6. DNA completion is earned through DNA-only reconstruction tests, not by record volume or model confidence.
7. Exact recovery after deleting the original is only claimed when sufficient lossless information is preserved in the package and the exact test passes.
8. The `.vyral` format should remain portable and documented for compatible third-party AI systems.

## Change log — additional decisions

- **2026-11-06 — Native `.vyral` package architecture:** Recorded the ZIP-compatible hybrid container direction, proposed internal package layout, JSON/binary/vector/hash data roles, package-level and asset-level integrity, open specification, and simple creator-facing file-manager workflow.
- **2026-11-06 — DNA Reconstruction Completion Principle:** Recorded DNA-only reconstruction as the acceptance test for DNA completion, exactness definitions, independent verification, reconstruction status labels, and the requirement to preserve sufficient lossless information before claiming exact recovery after original deletion.
- **2026-11-06 — VYRAL product direction:** Recorded AI usage as a knowledge-building event and the requirement for both asset-level DNA/fingerprints and VYRAL-level Master DNA/Master Fingerprint.
- **2026-11-06 — Native `.vyral` package architecture:** ZIP-compatible Hybrid Package၊ JSON/Binary/Vector/Hash Data တို့၏ တာဝန်၊ Package နှင့် Asset အဆင့် Integrity၊ Open Specification နှင့် Creator အတွက် ရိုးရှင်းသော File Manager Workflow ကို မှတ်တမ်းတင်ထားသည်။
- **2026-11-06 — DNA Reconstruction Completion Principle:** DNA ပြည့်စုံမှုကို DNA-only Reconstruction Test ဖြင့်သာ ဆုံးဖြတ်ရန်၊ Exactness အဓိပ္ပာယ်၊ Independent Verification၊ Reconstruction Status များနှင့် မူရင်းဖျက်ပြီးနောက် Exact Recovery ပြောနိုင်ရန် Lossless Information လုံလောက်စွာ ထိန်းသိမ်းထားရမည့် စည်းမျဉ်းကို မှတ်တမ်းတင်ထားသည်။
- **2026-11-06 — VYRAL Product Direction:** AI အသုံးပြုမှုတိုင်းကို Knowledge တည်ဆောက်သည့် ဖြစ်စဉ်တစ်ခုအဖြစ် သတ်မှတ်ခြင်းနှင့် Asset-level DNA/Fingerprint၊ VYRAL-level Master DNA/Master Fingerprint နှစ်မျိုးစလုံး လိုအပ်ကြောင်း မှတ်တမ်းတင်ထားသည်။

---

## Implementation Baseline — 2026-11-06

The first VYRAL Details Workspace foundation is now implemented on `rebuild/marketplace-workspace-foundation` and applied to the isolated **VYRA Development** Supabase project only.

### Implemented data foundation
- Creator-owned Vyral collections and nested folders.
- Asset metadata separated from binary media.
- Private `vyral-assets` Storage bucket with owner-folder RLS policies and a 100 MB per-file upload limit.
- Immutable asset version records.
- Append-only DNA records with creator-authored knowledge and provenance fields.
- Fingerprint registry for cryptographic, perceptual, semantic and structural types.
- AI Vision observation evidence records.
- Parent/derived asset lineage.
- DNA-only reconstruction test registry with byte-exact, decoded-exact and perceptual comparison modes.
- Composite ownership constraints, RLS policies and foreign-key indexes.

### Implemented workspace behavior
- Cloud-backed Vyral library with one-time migration from the previous browser-local Vyral list.
- Create/delete Vyral, create nested folders, upload and preview assets, rename/delete assets.
- SHA-256 calculated in the browser on original upload and stored as **unverified client evidence**.
- Initial asset DNA and asset-version records created during upload.
- Creator-authored Vyral-level and asset-level DNA notes.
- Fingerprint, Vision evidence, lineage, reconstruction and license-policy views.
- Creator license preferences stored as Vyral metadata.

### Verification and trust boundaries
- Browser clients cannot promote Vyral or asset DNA to a verified completion state.
- Browser clients cannot self-assert independent verification.
- Vision observations and reconstruction test results are read-only to browser clients; trusted server-side analysis/verification services must write them.
- Browser clients may register only explicitly unverified SHA-256 evidence; a database trigger rejects client-supplied trusted verification metadata. Perceptual, semantic and structural fingerprints are reserved for trusted analysis services.
- Similarity is not exact identity. DNA completion remains unearned until an isolated DNA-only reconstruction is independently compared with the protected original.

### Not yet implemented
- AI Vision execution, multi-model observation ingestion and conflict resolution.
- Perceptual, semantic and structural fingerprint generation.
- Native `.vyral` ZIP-compatible package import/export — subsequently implemented in Package Engine v1 below.
- DNA-only reconstruction runner, isolated evaluation environment and independent verifier.
- License enforcement in generation, sharing and publishing workflows.
- Full end-to-end validation of package import/export and server verification against a real signed-in browser session.

The existing Profile Subpage Header, Compact Style transition, Sticky Header behavior, and bottom-radius scroll logic remain protected and unchanged during this implementation.

---

## Native VYRAL Package Engine — 2026-11-06

The first portable package engine is implemented on `rebuild/marketplace-workspace-foundation`.

### Package format
- File extension: `.vyral`
- Container: standard ZIP archive using the ZIP Store method (no compression) for the initial interoperable release.
- MIME type: `application/vnd.vyra.vyral+zip`
- Package manifest: `manifest.json`
- Initial format version: `1`
- Public manifest contract: [`docs/schemas/vyral-package-v1.schema.json`](./schemas/vyral-package-v1.schema.json), JSON Schema Draft 2020-12.
- Each media version is stored as a separate binary entry under `assets/<asset-id>/versions/<version>-<version-id>.bin`.
- The manifest preserves collection metadata, folders, assets, asset versions, DNA records, fingerprints, AI Vision observations, lineage and reconstruction-test evidence.
- Internal Supabase storage paths and user IDs are not exported as portable package metadata.

### Integrity and archive safety
- Export downloads each stored version and recalculates SHA-256 from the actual binary bytes.
- If a stored SHA-256 exists and does not match the downloaded media, export stops rather than producing a package with a known integrity mismatch.
- ZIP entries include CRC-32 checks, UTF-8 filenames and standard local/central directory records.
- The reader rejects unsupported flags, multi-disk/ZIP64 records, unsafe paths, malformed local/central header mismatches and overlapping entry ranges.
- Package paths reject absolute paths, traversal segments, Windows drive paths, backslashes, duplicate paths and malformed ZIP headers.
- Initial limits: 5,000 archive entries, 200 MB total source media per browser export, 256 MB archive/import size and 32 MB manifest.
- ZIP reader currently supports Store (method 0) only; compressed/deflated archives, encrypted archives and ZIP64 are explicitly rejected rather than guessed.
- Package records are portable evidence, not automatic proof. Imported verification statuses must never be trusted without independent verification.

### Server-side cryptographic verification

- Deployed Edge Function: `verify-vyral-asset` (VYRA Development only), with platform JWT verification enabled.
- The function authenticates the caller, checks ownership of both the asset and requested version through the user's RLS-scoped client, and validates the private Storage path before using its privileged client to download the original bytes.
- SHA-256 is recalculated server-side from the protected Storage object, and actual byte size is checked against the stored version metadata.
- The server writes a cryptographic fingerprint with `verification_status: server_verified` and a separate `comparison_status: matched|mismatch`.
- If the stored claim does not match the actual bytes or file size, the service records the actual hash and mismatch evidence, returns an integrity error, and does not silently overwrite the original expected hash.
- If no previous hash exists, a successful server verification stores the calculated hash on the version and current asset record and labels the result `baseline_created`; it is not falsely described as a match against a prior hash.
- `server_verified` means the server calculated the fingerprint from private Storage bytes. The separate comparison status means `matched`, `mismatch`, or `baseline_created`; these meanings must not be conflated.
- The Details workspace exposes a per-asset Verify action and distinguishes a successful match from an integrity mismatch.
- The Edge Function uses the user's authenticated identity for ownership checks; privileged Storage/database access is only performed after those checks. The service/secret key is never sent to the browser.
- A database trigger also prevents authenticated clients from setting `server_verified`, `matched` or other trusted fingerprint metadata, even if they bypass the frontend and call the Data API directly.

### Current implementation boundary
- Export is available from the Vyral Details workspace.
- Archive creation, CRC validation, manifest validation and binary round-trip tests are included.
- Package import/restore is implemented in the current workspace. It remaps database IDs, restores folder hierarchy and asset versions, recalculates hashes, and treats imported AI observations and reconstruction claims as untrusted evidence until trusted services re-verify them.

### Import / restore behavior
- A creator can import a `.vyral` package into the currently open Vyral workspace. Import is additive: existing content is not overwritten.
- Folder, asset and version IDs are remapped to fresh IDs for the destination workspace; folder hierarchy and asset lineage are rebuilt against those new IDs.
- Every media version is SHA-256 checked against the package manifest before upload. Each restored version receives a new storage path and a new cryptographic fingerprint record.
- Folder-name collisions are resolved with an explicit `(Imported N)` suffix rather than overwriting existing folders.
- Imported DNA records and their reconstruction data are preserved, but all imported DNA states are reset to `evolving` and verification status to `unverified`.
- Imported AI Vision observations, non-cryptographic fingerprint claims and reconstruction-test reports are retained as unverified DNA evidence. They are not inserted into trusted Vision or reconstruction result tables by the browser client.
- The package's original collection identity and license policy are preserved as imported Vyral-level evidence; they do not silently replace the destination Vyral's identity or permissions.
- On an import failure, the client attempts to remove newly uploaded media and delete newly created asset/folder records. This is compensating cleanup, not a single database transaction; cleanup failure must be surfaced and audited.
- Current browser memory limits: 200 MB source media per export and 256 MB maximum package import/archive size. Larger packages require a future server-streaming package service.
- Rollback evidence is scoped to a unique import-run ID so a failed retry cannot delete records from an earlier successful import of the same package.
- After a failed restore, the workspace reloads from the database so any cleanup failure is visible instead of leaving stale client state.

### Server-side cryptographic verification
- The `verify-vyral-asset` Supabase Edge Function is deployed to the isolated VYRA Development project with JWT verification enabled.
- The function authenticates the caller, checks asset and version ownership through user-scoped queries, and downloads the protected original from private Storage for server-side SHA-256 calculation.
- It compares the actual bytes against both the asset-version hash and, for the current version, the asset-level hash and size. A disagreement is recorded as a mismatch; it is never silently repaired.
- If no prior hash exists, the function can establish a server-calculated baseline after size checks pass.
- The resulting cryptographic fingerprint records server verification metadata and the verification timestamp. This verifies file integrity, not creator ownership or copyright.
- The client-facing Verify action calls this Edge Function. The function remains JWT-protected; no service-role key is exposed to the browser.



## AI Vision observation ingestion

The Development project now has a JWT-protected `record-vyral-vision-observation` Edge Function and a matching recorder in the Vyral Details DNA & Identity section.

- The recorder accepts structured JSON observations associated with an exact asset and version.
- The Edge Function authenticates the caller, verifies asset/version ownership and Vyral-level plus asset-level `allow_ai_analysis` permissions.
- Before recording, the server downloads the private source media and independently recalculates SHA-256 and byte size. The version's stored SHA-256 and size must match; a current asset's size and hash are also checked when present.
- The observation stores the exact source version ID, source SHA-256, server integrity result, task kind, confidence (if supplied), and submitted model/provider labels.
- Provider and model labels are explicitly marked as user-supplied claims, not provider-authenticated provenance. This recorder does not invoke an AI provider.
- Each observation is mirrored into an evolving asset-level DNA record with `verification_status: observed`. It is not creator-confirmed, independently verified, or automatically eligible for DNA-only reconstruction.
- If the linked DNA record cannot be written, the newly inserted observation is rolled back.
- Observation JSON is limited to 64 KB; source media verification is limited to 100 MB, matching the private asset-storage limit.

This establishes a source-bound evidence intake path without pretending that a model's output is ground truth. Real provider execution, authenticated provider provenance, multi-model comparison, creator review/corroboration, and DNA-only reconstruction remain separate stages.


## Creator review of Vision evidence

The Development project also has a JWT-protected `record-vyral-vision-review` Edge Function. Each Vision observation offers two explicit creator actions: confirm this observation or dispute this observation.

- A review is stored as a new, immutable asset-level DNA evidence record; the original AI observation is not overwritten.
- The review record links to the exact observation ID and preserves its source asset/version/SHA-256 and the model labels that were submitted with it.
- `creator_confirmed` means the creator confirms this specific observation only. It does not confirm the entire asset, all observations, the Master DNA, ownership, or exact reconstructability.
- `disputed` preserves the creator's disagreement as evidence. It does not delete or rewrite the AI's original observation.
- Each observation accepts one immutable creator review. A new model observation is required to create a new review cycle; this avoids silently replacing a prior decision.
- A creator review is never eligible by itself to authorize DNA-only reconstruction.

The next comparison layer can now group multiple observations by source version and task, expose model-to-model agreement/conflicts, and require creator review before accepted claims are promoted into reusable reconstruction knowledge.

## Multi-model Vision comparison — 2026-11-06

The Vyral Details DNA & Identity workspace now derives a comparison view from stored Vision observations.

- Observations are grouped only when the asset ID, exact source asset-version ID, and task kind all match. Results from different versions or tasks are never placed in the same comparison group.
- Each group shows its model/provider labels, observation count, version number, source SHA-256, and the structured JSON outputs side by side.
- A deterministic field-level comparison canonicalizes JSON object key order and compares exact values at each field path. Missing fields are explicitly treated as differences.
- The interface labels these results as exact JSON value matches or differences. It does not claim semantic agreement, truth, accuracy, or independent model corroboration.
- The comparison is a read-only derived view. It does not mutate observations, creator reviews, DNA records, fingerprints, or reconstruction eligibility.
- Provider/model labels remain user-supplied claims until provider-authenticated execution is implemented. No paid model is invoked by this comparison layer.
- The current interface shows the most recent eight version/task groups and up to twenty field paths per group; the underlying observations remain preserved and are not truncated in storage.

## Creator-controlled Vision knowledge promotion — 2026-11-06

A Vision observation can enter the creator-adopted asset DNA knowledge stream only through a separate explicit action after a server-recorded creator confirmation.

- The promotion Edge Function requires an authenticated owner, an observation belonging to that owner, its source asset, and a matching immutable server creator review with `creator_confirmed` status.
- Unreviewed and disputed observations are rejected. Model agreement alone never authorizes promotion.
- The creator must enter an adoption statement describing what they are accepting. The original model observation, its model labels, source version, and source SHA-256 are preserved as provenance.
- Promotion creates a new immutable creator DNA record. It does not edit the AI observation or review record.
- Each observation can be promoted once; a database unique index enforces this in addition to the server-side duplicate check.
- Promoted knowledge is scoped to that asset observation. It does not certify the complete asset, the whole Vyral, ownership, or lossless/DNA-only reconstruction. Its reconstruction eligibility remains false.
- No AI provider is called. The creator is the authority explicitly adopting the statement; model identity remains a user-supplied claim unless provider authentication is implemented.

## Creator-approved field-level Vision Knowledge promotion — 2026-11-06

A Vision observation is never promoted wholesale. The creator must first create an immutable `creator_confirmed` review for that exact observation, then explicitly select one dotted JSON field path for promotion.

- The promotion endpoint requires a signed-in user JWT and verifies observation ownership and the source asset's ownership.
- It verifies a matching server-recorded Creator Review with decision `creator_confirmed`; a disputed, imported, or merely observed record cannot authorize promotion.
- The accepted value must exactly match the selected field in the stored observation. Creator-authored corrections belong in a separate creator statement, not as a silent rewrite of model evidence.
- Each promoted field becomes a new immutable asset-scoped DNA record. It retains the observation ID, review-record ID, asset version, source SHA-256, task kind, and unverified provider/model labels.
- A database unique index prevents the same observation field from being promoted more than once. A new observation creates a new review/promotion cycle.
- Promotion does not set asset/Vyral DNA status to complete and does not make the field eligible for DNA-only reconstruction by itself.
- This is creator-authorized knowledge adoption, not independent factual verification or proof of ownership.

## Creator-approved DNA field conflict detection — 2026-11-06

The Details workspace now derives a read-only conflict view from immutable field-promotion records.

- A conflict group is scoped to the exact same asset ID, source asset-version ID, Vision task kind, and dotted field path.
- Only creator-authored DNA records created by the guarded field-promotion endpoint are considered. Unreviewed observations, disputed observations, imported claims, and arbitrary creator notes are not mixed into this comparison.
- Values are compared by deterministic canonical JSON representation. Different exact JSON values are reported as an **exact-value disagreement**; this is not a claim of semantic contradiction or factual error.
- Different asset versions and different task kinds are deliberately kept separate. The same field can legitimately vary by version or by the question asked of Vision.
- Each promoted record remains unchanged and retains its source observation, source version, SHA-256, model-label claims, creator note and review provenance.
- The interface shows the competing values side by side and does not automatically select a winner, overwrite a value, merge records, or mark DNA complete.
- This is conflict detection and evidence preservation, not yet a complete contextual-precedence decision workflow. A future explicit creator resolution must be an additional immutable record that references the exact competing promotion records and states its scope; it must never erase the underlying evidence.

## Creator conflict resolution records — 2026-11-06

The first explicit resolution workflow is now available for detected creator-approved Vision field disagreements.

- The creator can record either **prefer one value** or **keep both as context-dependent**.
- A preference is scoped only to the exact asset, source version, Vision task kind, and field represented by the selected promoted records. It is not a global truth claim and does not invalidate other values.
- A contextual decision requires a creator explanation. It records that multiple values remain valid under different contexts; it does not invent or infer those contexts.
- The server requires a signed-in creator, verifies ownership of every selected promoted DNA record, checks that all records belong to the same exact conflict scope, confirms at least two distinct canonical JSON values, verifies the source asset, and validates the original server-side creator-review provenance.
- The server appends a new immutable creator DNA record containing the competing promotion IDs, observation IDs, exact values, chosen preference (if any), creator note, scope, and resolution time.
- The original promotion records and Vision observations are never changed or deleted. Resolution records are idempotent per request ID.
- Resolution records explicitly remain ineligible for DNA-only reconstruction and do not certify a complete asset, Vyral, ownership, or factual correctness.
- The Details UI displays resolution history alongside the conflict and permits a later explicit creator decision to be appended as a new historical record.

This is an auditable creator decision layer, not an automatic conflict solver or semantic truth adjudicator.



## Creator-defined contextual labels — 2026-11-06

The conflict-resolution workflow now records an explicit creator-supplied context label when the creator chooses to retain competing values as context-dependent.

- The creator enters a short label describing the contexts in which the competing values apply (for example, “front view; side view”). This label is supplied by the creator; the system does not infer or generate context labels.
- The creator must also provide an explanation. Both are stored on the immutable resolution record as `creator_context_label` and `creator_note`.
- Context labels are limited to 300 characters. The server validates the field; a client-side prompt alone is not trusted.
- A context label is descriptive scope metadata, not proof that either value is factually correct. It does not change the original observations or promoted values, select a winner, certify the asset, or enable DNA-only reconstruction.
- Future decisions may append a new resolution record. Earlier creator decisions remain in the audit history.


## Conflict decision scope and trusted history — 2026-11-06

The conflict panel now displays a latest-decision summary only from creator-confirmed records carrying the server conflict-resolution provenance marker. Imported or user-claimed resolution payloads are not treated as trusted creator decisions.

A resolution history entry is associated with a displayed conflict when its exact asset/version/task/field scope matches and every promotion ID named by that immutable resolution is still present in the displayed conflict group. This preserves visibility of earlier decisions when later evidence adds another competing promotion. The UI explicitly states that a decision applies only to the promotion records named in that history entry; newly added evidence does not inherit an earlier preference or contextual label automatically.

The latest decision is a history/status indicator, not a global winner and not an instruction to rewrite DNA. All competing promotions and resolution records remain immutable. No contextual precedence is inferred, and no resolution increases reconstruction eligibility.
