# VYRA Product Vision & Revenue Mission

_Last updated: 2026-11-02_

## 1. Mission — the non-negotiable project goal

VYRA is a customer-facing **AI Video Creation SaaS and AI Creative Studio**. Its goal is to help customers turn creative ideas into finished visual content through one connected production environment, then grow into a reliable business with sustainable recurring revenue.

The product direction is **Chat-First, Not Chat-Only**:
- Natural-language Chat is a primary way to understand, control, and use VYRA's capabilities.
- The visual workspace remains fully important: customers can also create, inspect, edit, organize, and manage work manually.
- Chat and the visual workspace are two interaction methods for the same product and should work with shared project data and state.

Founder constraints and target:
- Monthly revenue ambition: **฿300,000+**.
- Starting capital: **almost zero**.
- Founder operating time: **about 1–2 hours per day**.
- Main income strategy: earn through VYRA itself (subscriptions and usage credits), not by depending on a separate video-editing agency/service.
- The revenue target is an ambition, not a forecast or guarantee. Track gross revenue, provider/API costs, hosting, payment fees, refunds, support and taxes separately; optimize for sustainable net profit.

This mission guides product scope, architecture, UX, prioritization and release decisions. The mission does not replace the product identity and capability overview in [VYRA Project Overview](./VYRA_PROJECT_OVERVIEW.md); the two documents are complementary.

## 2. Product experience — Chat-First, Not Chat-Only

VYRA should be approachable for beginners while providing meaningful creative control to experienced creators. It should not require customers to operate a complicated professional editor or understand AI infrastructure.

### Conversational control

Customers can describe ideas naturally, brainstorm with the AI Creative Assistant, compare creative directions, and ask it to perform supported tasks in the application. As capabilities are implemented, Chat is intended to provide a conversational control surface for project and production work, including:
- Developing and saving creative ideas and turning approved ideas into projects.
- Creating, viewing, updating and organizing projects.
- Working with characters, reference images, media and other assets.
- Preparing and refining scripts, storyboards, scenes and creative plans.
- Starting supported image, video, voice and audio workflows.
- Reviewing project status, production progress, previews and results.
- Finding application features, navigating to relevant workspaces, learning how to use them and troubleshooting issues.
- Understanding account, plan, credit and usage information where those systems are available.

Chat should invoke real application capabilities when available; it should not imply that an action was completed merely by describing it. The assistant should communicate limitations and distinguish implemented capabilities from planned ones.

### Manual creative workspace

Chat is not the only way to use VYRA. Customers can also work directly in the visual application: create and open projects, upload and organize assets, edit scripts and scenes, adjust creative decisions, inspect previews, use timelines and production tools, and export supported results.

### One shared product state

Chat and manual workspace are not separate products. They should operate on the same underlying projects, characters, assets and production state. A change made through Chat should appear in the relevant workspace, and manual changes should be available to the AI when it works with that project. The actual completeness of this synchronization must be verified in the implementation; this is a product direction, not a claim that every data type is already synchronized.

## 3. Integrated creative capabilities

VYRA aims to connect the creative process from initial idea to finished deliverable:

- **Idea development:** conversational brainstorming, concept exploration, creative feedback and saved ideas.
- **Project management:** creating, viewing, updating, organizing and tracking projects and production progress.
- **Character creation and continuity:** generating or importing character references, saving reusable characters in a Character Library, associating them with projects and scenes, and using reference details to help maintain recognizable character appearance.
- **Image creation:** generating and refining images through Chat or the visual workspace, and organizing approved results.
- **Script and story development:** premises, stories, scripts, scene descriptions and other creative material.
- **Storyboards and scene planning:** structuring stories into scenes and reviewing visual direction before production.
- **Video production:** creating and refining video content through supported generation and production workflows.
- **Media and asset organization:** uploading, browsing, reusing and managing creative assets.
- **Voice and audio:** relevant voice, narration, music and audio workflows as available.
- **Editing and review:** inspecting previews, refining output, reviewing production stages and preparing work for completion.
- **Export and delivery:** preparing finished creative work for supported export, download and publishing destinations.
- **In-app guidance:** explaining features, helping users navigate the product, identifying next steps and troubleshooting.

The intended customer experience is an integrated creative studio, not a collection of disconnected generators.

### Advanced video formats, simple creation

VYRA should support a growing range of advanced video outcomes without making customers learn a professional editing workflow. The experience should begin with the result the customer wants—not provider names, model parameters or a complicated timeline.

Examples of target formats include:
- Animated cartoons, character-led stories and recurring-character episodes.
- Cinematic scenes, trailers, short films and narrative sequences.
- Talking characters, avatars, dialogue scenes and lip-sync where verified.
- Product showcases, advertisements, brand promos and small-business content.
- Educational explainers, documentaries, science/history stories and tutorials.
- Social-first vertical videos for TikTok, Reels and Shorts, plus landscape and long-form YouTube videos.
- Music videos, lyric videos and audio-reactive visualizers.
- Image-to-video, text-to-video and reference-guided video workflows where supported.

A simple creation flow should let a customer describe the idea, choose or accept a suggested format, set a few understandable preferences (such as aspect ratio, duration, language and visual style), review the script/storyboard and character references, then approve generation. Advanced controls can remain available when needed, but should not overwhelm the default experience.

VYRA should coordinate specialized providers and models behind the scenes according to the requested outcome, quality, availability and estimated cost. It must clearly label each format as available, tested, experimental or planned; never imply that every format, provider, character-consistency feature or lip-sync workflow is already production-ready. Customers retain creative approval, explicit paid-generation approval and final publishing approval as separate decisions.

## 4. Creative workflows and customer outcomes

VYRA aims to support a range of visual-content needs, including:
- AI animation and cartoon stories with recurring characters.
- Cinematic, narrative and short-film videos.
- Educational, explainer, documentary, history and science videos.
- Product, restaurant, small-business and brand advertisements.
- Talking avatars, narration and lip-sync where provider capability and quality are verified.
- Social media videos for TikTok, Reels, Shorts and longer YouTube formats.
- Music, lyric and visualizer videos.

These are product directions, not a claim that every format is already production-ready. Mark capabilities as available, tested, experimental or planned based on actual implementation and end-to-end verification. In particular, test Burmese language, voice quality, pronunciation, character consistency and lip-sync before marketing them as reliable features.

## 5. Customer journey and user control

A representative AI-assisted video workflow is:

1. Customer signs up with a standard VYRA account and may purchase a credit package when needed.
2. Customer describes a video idea through Chat or starts manually in the workspace.
3. AI helps prepare a creative brief, script, scene plan, character/visual direction and audio direction.
4. Customer reviews and approves the creative plan. **This approval alone must not start paid media generation.**
5. Customer reviews visual references, characters and voice choices where relevant.
6. Before any billable generation, VYRA explains the expected credit use or cost when it can be estimated and asks for explicit approval.
7. Customer reviews a sample or test scene where the workflow supports it.
8. Customer approves further generation, reviews scenes, and regenerates only rejected parts where supported.
9. Customer assembles, edits, previews and exports the final video.
10. Customer gives any required final approval before publishing or other consequential actions.

Preserve project progress. Avoid unnecessarily repeating completed work when a scene or asset is rejected. Distinguish creative approval, paid-generation approval and final publishing approval. Destructive or account-impacting actions require suitable confirmation. Be honest when costs are unavailable or uncertain; never present an estimate as an actual provider charge.

## 6. AI context and memory

VYRA is intended to make AI assistance context-aware over time. Relevant context may include user creative preferences, project history, approved ideas, character descriptions and references, style decisions, and production progress.

This context should help the AI continue work coherently rather than treating every conversation as unrelated. Project-specific information should remain associated with its project, while reusable character information should be available to projects that use those characters. Memory should support continuity while keeping users in control of their creative information.

The existence, durability and cross-device availability of memory must be judged from the actual implementation; do not describe planned memory as already available.

## 7. Business model and revenue mission

Primary model:
- **Pay-as-you-go credit purchases.** Customers buy credits when they need them; a mandatory monthly subscription is not part of the current business-model direction.
- Offer small credit purchases for customers who only need a little usage.
- Offer volume-based bulk discounts so larger purchases have a lower effective price per credit. Package sizes, prices and discount thresholds must be validated against actual provider costs and sustainable margins; no prices are finalized yet.
- Customers spend credits on supported AI generation. Show a clear estimate before billable generation when an estimate is available, and require explicit approval.
- **Account-to-account credit transfers:** one VYRA account can transfer credits to another VYRA account. Both sender and recipient use ordinary VYRA accounts; there is no separate reseller account or role required for the basic transfer feature.
- VYRA provides the credit-transfer capability and its transaction records. Users may independently arrange any external payment or resale between themselves outside VYRA. VYRA does not need to provide an in-app reseller marketplace, set users' resale prices, collect external payments, or calculate reseller commissions.
- Transfers must be server-authorized, atomic and auditable. Prevent transfers beyond the sender's available balance, duplicate processing, and inconsistent balances. Keep immutable ledger records for purchases, generation reservations/charges/refunds and transfers.
- Keep credit accounting separate from provider-reported USD costs. Validate credit package pricing, conversion/rounding, refunds, provider costs, payment fees, taxes and gross margins before launch.
- Apply sensible purchase limits, fraud controls and generation safeguards; do not promise unlimited generation while provider costs vary.

There are currently **no approved credit package prices, bulk-discount thresholds, or transfer limits**. Do not reuse the previously discussed monthly subscription price examples as approved pricing. A future optional subscription may be considered only as a separate, explicitly approved product decision; it is not required for the current model.

Revenue arithmetic is not profit: for example, 300 customers paying ฿999 would produce ฿299,700 in monthly gross subscription revenue before costs. Measure paid conversion, active subscribers, churn, average revenue per user, cost per generated minute/project, gross margin and support burden.

## 8. Product principles

1. **Integrated creative production:** connect ideation, planning, character and asset preparation, generation, editing, review and delivery.
2. **Chat-first interaction:** make natural-language conversation a central way to access and control VYRA.
3. **Manual creative freedom:** preserve a capable visual workspace for direct user control and detailed work.
4. **Shared project state:** Chat and manual interactions work with the same underlying creative information.
5. **Context-aware assistance:** use relevant project, character and preference context to support continuity.
6. **Simple for different skill levels:** emphasize creative goals and understandable choices, not technical implementation details.
7. **User control and transparency:** communicate meaningful actions, costs, approvals, limitations and progress.
8. **Honest capability claims:** distinguish implemented, tested, experimental and planned features.
9. **Cost-aware and recoverable workflows:** prevent hidden paid generation, preserve progress, and support safe retries and partial regeneration.
10. **Provider flexibility:** avoid unnecessary lock-in and verify the actual capabilities of each text, image, video, voice and audio provider.

## 9. Roadmap — from current app to revenue

### Phase A — Finish a dependable core workflow
- Audit the existing application and distinguish implemented features from mocked or unverified ones.
- Make the Chat-to-Workspace production journey reliable while preserving manual workflows.
- Validate brief/script/scene review, visual and voice review, sample generation, scene generation, final assembly/export and recovery.
- Verify approval gates never trigger paid generation unexpectedly.
- Test with real provider credentials before calling generation features production-ready.

### Phase B — Validate the first sellable use case
- Choose one initial customer segment and one repeatable video workflow; do not launch every format at once.
- Test with a small group of real target users.
- Measure completion rate, generation cost, time-to-first-result, quality, willingness to pay and support needs.
- Fix the biggest blockers before expanding scope.

### Phase C — Make VYRA commercially usable
- Implement pay-as-you-go credit packages, volume-based pricing, payment integration, receipts, usage history and account-to-account transfers.
- Add server-side provider-key security, quotas, abuse prevention, job limits and cost monitoring.
- Add customer onboarding, help, error recovery, privacy/terms and support processes.
- Ensure publishing integrations use explicit user authorization and confirmation.

### Phase D — Launch and grow sustainably
- Start with a limited beta and paid pilot; gather evidence before broad marketing.
- Improve retention and repeat usage before scaling acquisition.
- Track gross revenue and net contribution, and only scale workflows with healthy unit economics.
- Expand formats and providers based on customer demand and verified quality.

## 10. Operating rule for future development

For proposed features, changes and releases, consider whether they:
- Support VYRA's integrated AI video and creative-studio purpose.
- Make Chat and manual workspace work coherently with shared project state.
- Move the product toward reliable customer outcomes and paid conversion.
- Reduce generation cost, failure rate or support effort.
- Preserve customer control, privacy, cost approval and recoverability.
- Can be tested honestly against the current implementation.

Prioritize a small, dependable path to a product customers will pay to use without losing the broader product vision.

## Related documentation and source of truth

- [VYRA Project Overview](./VYRA_PROJECT_OVERVIEW.md) — what VYRA is and the capabilities it aims to provide.
- [SaaS Backend Architecture](./SAAS_BACKEND_ARCHITECTURE.md) — proposed technical foundation and security decisions.
- [Customer Project API](./CUSTOMER_PROJECT_SYNC_API.md) — implemented API scope and limitations.
- [Cloud Project Restore](./CLOUD_PROJECT_RESTORE.md) — current backup/restore behavior and limitations.
- [Supabase Auth Foundation](./SUPABASE_AUTH_FOUNDATION.md) and [Supabase Account UI Setup](./SUPABASE_ACCOUNT_UI_SETUP.md) — authentication foundation and UI setup.
- [Usage Ledger API Integration](./USAGE_LEDGER_API_INTEGRATION.md) — usage/credit integration contract and rollout safeguards.
- [Credit Economy & Transfer Model](./CREDIT_ECONOMY_AND_TRANSFER_MODEL.md) — pay-as-you-go credit purchases, bulk discounts, standard-account transfers and external resale boundaries.

This product vision and the Project Overview define product intent. Technical documents describe narrower implementation decisions or current behavior; they do not replace or silently redefine the product's overall direction.

---

## Burmese summary

VYRA ဟာ AI Video Creation SaaS နဲ့ AI Creative Studio ဖြစ်တယ်။ Idea ကနေ Script၊ Character၊ Storyboard၊ Image၊ Video၊ Voice/Audio၊ Editing၊ Preview နဲ့ Export အထိ ဖန်တီးမှုလုပ်ငန်းစဉ်တွေကို တစ်နေရာတည်းမှာ ချိတ်ဆက်ပေးဖို့ ရည်ရွယ်တယ်။

VYRA ရဲ့ အသုံးပြုမှုအယူအဆက **Chat-First, Not Chat-Only** ဖြစ်တယ်။ အသုံးပြုသူက Chat မှာ သဘာဝကျကျပြောပြီး AI ကို အလုပ်ခိုင်းနိုင်သလို Visual Workspace ထဲမှာလည်း ကိုယ်တိုင်ဖန်တီး၊ ပြင်ဆင်၊ စီမံနိုင်တယ်။ Chat နဲ့ Manual Workspace နှစ်ခုလုံးဟာ Project Data တစ်ခုတည်းကို အခြေခံပြီး အတူတကွ အလုပ်လုပ်နိုင်ဖို့ ရည်ရွယ်တယ်။

AI က User ရဲ့ Creative Preference၊ Project History၊ Character Reference၊ ဆုံးဖြတ်ချက်နဲ့ Production Progress တွေကို သက်ဆိုင်ရာအတိုင်း မှတ်မိပြီး ဆက်လက်ကူညီနိုင်ဖို့ ရည်ရွယ်တယ်။ Chat ဟာ Creative Assistant သာမက App အသုံးပြုနည်း၊ Navigation နဲ့ Troubleshooting အတွက်လည်း လမ်းညွှန်ပေးနိုင်တဲ့ နေရာဖြစ်တယ်။

ဒီမှတ်တမ်းတွေဟာ ရည်ရွယ်ချက်နဲ့ လုပ်ဆောင်နိုင်စွမ်းကို ရှင်းပြတာဖြစ်ပြီး Feature အားလုံး လက်ရှိအကောင်အထည်ဖော်ပြီးပြီလို့ မဆိုလိုဘူး။ လက်ရှိ Code၊ Test နဲ့ Provider Integration ကို စစ်ဆေးပြီးမှ Available၊ Tested၊ Experimental သို့မဟုတ် Planned အဖြစ် သတ်မှတ်ရမယ်။

VYRA ရဲ့ လက်ရှိစီးပွားရေးပုံစံက လစဉ်ကြေး မဖြစ်မနေ ပေးရတဲ့ Subscription မဟုတ်ဘဲ လိုအပ်သလို Credits ဝယ်ယူအသုံးပြုတဲ့ Pay-as-you-go စနစ်ဖြစ်တယ်။ Credits နည်းနည်းဝယ်လို့ရသလို များများဝယ်ရင် တစ် Credit ချင်းဈေး ပိုသက်သာတဲ့ Bulk Discount ပေးနိုင်တယ်။ ဈေးနှုန်းနဲ့ Discount အဆင့်တွေကို Provider ကုန်ကျစရိတ်နဲ့ အမြတ်နှုန်း စစ်ဆေးပြီးမှ သတ်မှတ်ရမယ်။

VYRA Account တစ်ခုကနေ အခြား VYRA Account တစ်ခုဆီ Credits လွှဲပြောင်းနိုင်ရမယ်။ Account အမျိုးအစားက ပုံမှန် User Account တစ်မျိုးတည်းဖြစ်ပြီး Reseller Account သီးသန့် မလိုအပ်ဘူး။ User တွေက အပြင်မှာ ကိုယ်ပိုင်သဘောတူညီချက်နဲ့ ငွေပေးချေခြင်း၊ ပြန်ရောင်းခြင်းတို့ကို လုပ်နိုင်တယ်။ VYRA က Transfer Feature နဲ့ မှတ်တမ်းကိုသာ ပံ့ပိုးပြီး အပြင်ဘက် အရောင်းအဝယ်၊ ဈေးနှုန်းနဲ့ ငွေပေးချေမှုကို စီမံခန့်ခွဲရန် မလိုအပ်ဘူး။

Credit Transfer တွေကို Server ဘက်က အတည်ပြု၊ တစ်ကြိမ်တည်း မှန်ကန်စွာ ဆောင်ရွက်ပြီး ပြန်လည်စစ်ဆေးနိုင်တဲ့ Ledger မှတ်တမ်းထားရမယ်။ ကုန်ကျစရိတ်ရှိတဲ့ Generation မစခင် အသုံးပြုသူရဲ့ ခွင့်ပြုချက်ရယူရမယ်။ ဝင်ငွေ၊ API ကုန်ကျစရိတ်နဲ့ အမြတ်ကို သီးခြားတိုင်းတာရမယ်။
