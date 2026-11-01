# VYRA Product Vision & Revenue Mission

_Last updated: 2026-11-01_

## 1. Mission — the non-negotiable project goal

VYRA is being built as a customer-facing AI video creation SaaS business. The goal is not merely to finish a demo or a collection of AI tools: **take VYRA from its current development state to a reliable product that real customers can pay for, then grow it into sustainable recurring revenue.**

Founder constraints and target:
- Monthly revenue ambition: **฿300,000+**.
- Starting capital: **almost zero**.
- Founder operating time: **about 1–2 hours per day**.
- Main income strategy: **earn through VYRA itself** (subscriptions and usage credits), not by depending on a separate video-editing agency/service.
- The revenue target is an ambition, not a forecast or guarantee. Track gross revenue, provider/API costs, hosting, payment fees, refunds, support and taxes separately; optimize for sustainable net profit.

This mission must guide product scope, architecture, UX, prioritization and release decisions. Do not lose sight of the path from working software to paying customers.

## 2. Product experience

**Recommended experience: AI does the heavy work, while the customer can review, edit and control every important stage.**

VYRA should be approachable for beginners but provide meaningful control to experienced creators. It should not force customers to operate a complicated professional editor.

Core customer journey:
1. Sign up and choose a plan / credit package.
2. Describe a video idea in natural language.
3. AI Creative Assistant prepares a creative brief, script, scene plan, character/visual direction and audio direction.
4. Customer reviews and approves the plan. **This approval must not start paid media generation.**
5. Customer reviews visual references/characters and voice choices where relevant.
6. Generate a low-cost/limited sample or selected test scene; show the estimated credit cost before starting.
7. Customer reviews the sample (visual quality, motion, consistency, voice, timing and lip-sync where applicable).
8. Generate the approved full scenes.
9. Assemble, edit, preview and export the final video.
10. Customer gives final approval and publishes/downloads through supported destinations.

At every stage, preserve project progress. If one scene is rejected, allow that scene or asset to be regenerated without unnecessarily repeating the entire project. Show costs and require explicit approval before billable generation or publishing actions.

## 3. Customer services VYRA aims to provide

Build toward one integrated workflow for:
- AI animation and cartoon stories, including recurring characters.
- Cinematic, narrative and short-film videos.
- Educational, explainer, documentary and history/science videos.
- Product, restaurant, small-business and brand advertisements.
- Talking avatars, narration and lip-sync (only where provider capability and quality are verified).
- Social media videos for TikTok, Reels, Shorts and longer YouTube formats.
- Music, lyric and visualizer videos.

These are product directions, not a claim that every format is already production-ready. Mark each capability as available, experimental or planned until it has been tested end-to-end with real providers and representative content. In particular, test Burmese language, voice quality, pronunciation, character consistency and lip-sync before marketing them as reliable features.

## 4. Business model

Primary model:
- Recurring monthly subscriptions with clearly defined included credits/usage.
- Optional credit top-ups for additional generation.
- Transparent cost estimates before generation.
- Usage limits and safeguards; **do not promise unlimited video generation** while provider costs are variable.
- Consider a free trial or limited free credits only when abuse controls and unit economics are understood.

Previously discussed price points (฿299 / ฿999 / ฿2,999 per month) are **hypotheses for testing, not finalized prices**. Validate willingness to pay, competitor positioning, provider costs and payment fees before launch.

Revenue arithmetic is not profit: for example, 300 customers paying ฿999 would produce ฿299,700 in monthly gross subscription revenue before all costs. Measure paid conversion, active subscribers, churn, average revenue per user, cost per generated minute/project, gross margin and support burden.

## 5. Product principles

1. **Cost-aware by design:** choose suitable models/providers per task; estimate credits before paid work; log actual provider cost.
2. **Approval gates:** creative approval, sample approval and final approval are distinct. No hidden paid generation.
3. **Recoverable workflow:** persist jobs/assets/project state and support retries and partial regeneration.
4. **Honest capability claims:** distinguish working, tested, experimental and planned features.
5. **Simple UX:** natural-language guidance, compact screens, responsive desktop/mobile, Burmese and English support.
6. **Provider flexibility:** avoid unnecessary lock-in; route tasks to suitable text, image, video, audio and lip-sync providers. A gateway key alone must not be assumed to cover every modality.
7. **Customer trust:** clear usage, privacy, rights/licensing considerations, publishing confirmation and failure/refund handling.

## 6. Roadmap — from current app to revenue

### Phase A — Finish a dependable core workflow
- Audit the existing application and distinguish implemented features from mocked or unverified ones.
- Make the Chat-to-Workspace production journey reliable.
- Validate brief/script/scene review, visual and voice review, sample generation, scene generation, final assembly/export and recovery.
- Verify that approval gates never trigger paid generation unexpectedly.
- Test with real provider credentials before calling generation features production-ready.

### Phase B — Validate the first sellable use case
- Choose one initial customer segment and one repeatable video workflow; do not launch every format at once.
- Test with a small group of real target users.
- Measure completion rate, generation cost, time-to-first-result, quality, willingness to pay and support needs.
- Fix the biggest blockers before expanding scope.

### Phase C — Make VYRA commercially usable
- Implement subscription/credit accounting, payment integration, receipts and usage history.
- Add server-side provider-key security, quotas, abuse prevention, job limits and cost monitoring.
- Add customer onboarding, help, error recovery, privacy/terms and support processes.
- Ensure publishing integrations use explicit user authorization and confirmation.

### Phase D — Launch and grow sustainably
- Start with a limited beta and paid pilot; gather evidence before broad marketing.
- Improve retention and repeat usage before scaling acquisition.
- Track gross revenue and net contribution, and only scale workflows with healthy unit economics.
- Expand formats/providers based on customer demand and verified quality.

## 7. Operating rule for future development

For every proposed feature or PR, ask:
- Does it move VYRA closer to a reliable customer outcome or paid conversion?
- Does it reduce generation cost, failure rate or support effort?
- Is it necessary for the first sellable workflow, or can it wait?
- Can it be tested without spending money, and what real-provider test remains?
- Does it preserve customer control and explicit cost approval?

Prioritize the smallest reliable path to a product customers will pay to use. Avoid building impressive but commercially unvalidated features just for feature count.

---

## Burmese summary

VYRA ကို AI Video SaaS လုပ်ငန်းတစ်ခုအဖြစ် အမှန်တကယ် customer တွေ အသုံးပြုပြီး ငွေပေးချေသုံးစွဲနိုင်တဲ့အဆင့်အထိ တည်ဆောက်မယ်။ ရည်မှန်းချက်က တစ်လ ฿300,000 အထက် ဝင်ငွေရရှိဖို့ဖြစ်ပြီး စတင်အရင်းအနှီးနည်းပါးသလို တစ်နေ့ ၁–၂ နာရီသာ အချိန်ပေးနိုင်တာကို ထည့်တွက်ရမယ်။ ဒီကိန်းဂဏန်းဟာ ရည်မှန်းချက်ဖြစ်ပြီး အာမခံချက်မဟုတ်ဘူး။

VYRA ရဲ့ အဓိကပုံစံက **AI က အလုပ်အများစုကို အလိုအလျောက်လုပ်ပေးမယ်၊ customer က အဆင့်တိုင်းကို စစ်ဆေး၊ ပြင်ဆင်၊ အတည်ပြုနိုင်မယ်** ဆိုတဲ့ပုံစံဖြစ်တယ်။ Idea ကနေ Script၊ Storyboard၊ Character/Visual၊ Voice၊ Sample၊ Full Scenes၊ Final Export နဲ့ Publish အထိ တစ်နေရာတည်းမှာ ဆောင်ရွက်နိုင်ဖို့ ရည်ရွယ်တယ်။ Creative plan ကို approve လုပ်တာနဲ့ အခကြေးငွေရှိတဲ့ generation မစရဘူး။ စတင်မယ့် generation တိုင်းမှာ ကုန်ကျမယ့် credit ကို ကြိုပြပြီး customer ခွင့်ပြုချက်ယူရမယ်။

VYRA ကနေ ဝင်ငွေရဖို့ အဓိကစနစ်က Monthly Subscription + Usage Credits ဖြစ်မယ်။ Unlimited generation ကို မကတိပေးဘူး။ ฿299 / ฿999 / ฿2,999 ဆိုတဲ့ ယခင်ဈေးနှုန်းတွေဟာ စမ်းသပ်ရန် အကြမ်းဖျဉ်းသာဖြစ်ပြီး အတည်မပြုရသေးဘူး။ ဝင်ငွေတိုးတာနဲ့အတူ API ကုန်ကျစရိတ်၊ hosting၊ payment fees၊ support နဲ့ အခြားအသုံးစရိတ်တွေကိုပါ တွက်ရမယ်။

**နောက်ဆုံးဦးတည်ချက် — App ပြီးအောင်လုပ်ရုံမဟုတ်ဘဲ၊ ယုံကြည်စိတ်ချရတဲ့ ပထမဆုံး paid workflow ကို အရင်ထုတ်၊ customer အမှန်တွေနဲ့ စမ်းသပ်၊ ကုန်ကျစရိတ်နဲ့ အမြတ်ကိုတိုင်းတာပြီး VYRA ကို ရေရှည်ဝင်ငွေရတဲ့ SaaS လုပ်ငန်းတစ်ခုအဖြစ် တဖြည်းဖြည်းတိုးချဲ့မယ်။**
