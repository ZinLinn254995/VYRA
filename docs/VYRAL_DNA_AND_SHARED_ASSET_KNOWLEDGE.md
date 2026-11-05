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

---

## Change log

- **2026-11-05 — VYRAL DNA & Shared Asset Knowledge System:** Recorded VYRAL-level and asset-level DNA, the three DNA components (Identity Fingerprint, Knowledge DNA, Evolution History), automatic low-cost Generation Knowledge, on-demand Vision Knowledge, shared reuse/caching across users, evidence-based community enrichment, source/confidence tracking, creator authority, privacy, licensing, and lineage requirements.

- **2026-11-05 — VYRAL DNA နှင့် Shared Asset Knowledge System:** VYRAL အဆင့်နှင့် Asset အဆင့် DNA၊ Identity Fingerprint / Knowledge DNA / Evolution History၊ Generation အချိန် အလိုအလျောက်ဖန်တီးမည့် ကုန်ကျစရိတ်နည်းသော Knowledge၊ လိုအပ်မှသာ လုပ်မည့် Vision Analysis၊ လူအများကြား Knowledge ပြန်လည်မျှဝေသုံးစွဲခြင်းနှင့် Cache၊ အထောက်အထားအခြေပြု Community Knowledge တိုးတက်မှု၊ Source/Confidence မှတ်တမ်း၊ Creator Authority၊ Privacy၊ License နှင့် Lineage စည်းမျဉ်းများကို မှတ်တမ်းတင်ထားသည်။
