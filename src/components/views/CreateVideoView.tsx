/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import heroCyberCity from '../../assets/images/hero_cyber_city_1792925206979.jpg';
import sceneQuantumChip from '../../assets/images/scene_quantum_chip_1792925206672.jpg';
import sceneAvatarPresenter from '../../assets/images/scene_avatar_presenter_1792925207281.jpg';
import { useStudio } from '../../context/StudioContext';
import {
  AspectRatio,
  VideoFormat,
  VisualStyle,
  NarrationStyle,
  SubtitleStyle,
  ContentCategory,
  Scene,
} from '../../types';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Smartphone,
  Monitor,
  Square,
  Check,
  Film,
  Layers,
  Wand2,
} from 'lucide-react';

export const CreateVideoView: React.FC = () => {
  const { createProject, navigateToProjectWorkspace } = useStudio();

  // Wizard Step: 1 = Format & Platforms, 2 = Content & Topic, 3 = Creative & Audio Style, 4 = Storyboard Preview
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 1: Format & Platforms
  const [format, setFormat] = useState<VideoFormat>('short_form');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    'YouTube Shorts',
    'TikTok',
    'Instagram Reels',
  ]);

  // Step 2: Content & Topic
  const [workingTitle, setWorkingTitle] = useState<string>('Neural Horizons: The Synthetic Frontier');
  const [topic, setTopic] = useState<string>(
    'How photonic neural processors and autonomous robotic logistics will reshape manufacturing in 2030'
  );
  const [category, setCategory] = useState<ContentCategory>('Tech & AI');
  const [targetAudience, setTargetAudience] = useState<string>('Tech professionals, founders, and innovators');
  const [targetDuration, setTargetDuration] = useState<number>(45);

  // Step 3: Creative Style & Voice
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('cyber_minimal');
  const [narrationStyle, setNarrationStyle] = useState<NarrationStyle>('energetic_tech');
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>('dynamic_pop');

  // Step 4: Generated Outline state
  const [isGeneratingOutline, setIsGeneratingOutline] = useState<boolean>(false);
  const [generatedScenes, setGeneratedScenes] = useState<Scene[]>([]);
  const [outlineError, setOutlineError] = useState<string>('');

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  const togglePlatform = (p: string) => {
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter((item) => item !== p));
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  const handleNextToStep2 = () => {
    setCurrentStep(2);
  };

  const handleNextToStep3 = () => {
    const errs: Record<string, string> = {};
    if (!workingTitle.trim()) errs.title = 'Please enter a working title';
    if (!topic.trim()) errs.topic = 'Please describe the core video topic';
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setCurrentStep(3);
  };

  const handleGenerateOutline = async () => {
    setOutlineError('');
    setIsGeneratingOutline(true);
    try {
      let apiKey = '';
      let selectedModels: Partial<Record<'text' | 'image' | 'video' | 'audio', string>> = {};
      try {
        apiKey = sessionStorage.getItem('vyra_openrouter_key_session') || '';
        selectedModels = JSON.parse(sessionStorage.getItem('vyra_openrouter_models_v1') || '{}') as typeof selectedModels;
      } catch { /* Show setup guidance if session storage is unavailable. */ }
      const model = selectedModels.text;
      if (!apiKey || !model) throw new Error('Connect OpenRouter and select a Text model in Settings before generating a storyboard.');
      const prompt = [
        'Create a production-ready storyboard for the following video.',
        'Return ONLY valid JSON with this shape: {"scenes":[{"narration":"...","visualPrompt":"...","cameraMovement":"...","duration":10}]}',
        'Do not wrap JSON in Markdown fences. Do not include media URLs or claim any media has been rendered.',
        'Use 3 to 8 scenes. Scene durations must be positive integers and add up as closely as possible to the target duration.',
        'Write narration in clear, natural English. Make each visual prompt specific and visually distinct.',
        'Video title: ' + workingTitle,
        'Topic: ' + topic,
        'Category: ' + category,
        'Audience: ' + targetAudience,
        'Format: ' + format,
        'Aspect ratio: ' + aspectRatio,
        'Target duration in seconds: ' + targetDuration,
        'Visual style: ' + visualStyle,
        'Narration style: ' + narrationStyle,
        'Subtitle style: ' + subtitleStyle,
      ].join('\n');
      const response = await fetch('/api/providers/openrouter/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-openrouter-api-key': apiKey },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await response.json().catch(() => ({})) as { text?: string; error?: string };
      if (!response.ok) throw new Error(data.error || 'Storyboard generation failed. Please retry.');
      if (!data.text) throw new Error('The selected model returned an empty storyboard.');
      const fence = String.fromCharCode(96).repeat(3);
      const jsonText = data.text.trim().startsWith(fence) ? data.text.trim().split('\n').slice(1).join('\n').split(fence)[0].trim() : data.text.trim();
      const parsed = JSON.parse(jsonText) as { scenes?: Array<{ narration?: unknown; visualPrompt?: unknown; cameraMovement?: unknown; duration?: unknown }> };
      if (!Array.isArray(parsed.scenes) || parsed.scenes.length < 3) throw new Error('The model returned fewer than 3 scenes. Please retry or choose another Text model.');
      const placeholderImages = [
        sceneQuantumChip,
        heroCyberCity,
        sceneAvatarPresenter,
      ];
      const scenes: Scene[] = parsed.scenes.slice(0, 8).map((scene, index) => {
        const duration = Number(scene.duration);
        const narration = typeof scene.narration === 'string' ? scene.narration.trim() : '';
        const visualPrompt = typeof scene.visualPrompt === 'string' ? scene.visualPrompt.trim() : '';
        const cameraMovement = typeof scene.cameraMovement === 'string' ? scene.cameraMovement.trim() : '';
        if (!narration || !visualPrompt || !Number.isInteger(duration) || duration < 1 || duration > 600) throw new Error('The model returned an incomplete scene or an invalid duration. Each scene must have narration, a visual prompt, and a whole-number duration from 1 to 600 seconds. Please retry or choose another Text model.');
        return {
          id: 'sc-' + Date.now() + '-' + (index + 1),
          order: index + 1,
          narration,
          visualPrompt,
          cameraMovement: cameraMovement || 'Static cinematic shot',
          duration: Math.max(1, Math.round(duration)),
          // Existing reference images only; actual scene media has not been rendered.
          mediaUrl: placeholderImages[index % placeholderImages.length],
          status: 'scripted',
        };
      });
      setGeneratedScenes(scenes);
      setCurrentStep(4);
    } catch (error) {
      setOutlineError(error instanceof Error ? error.message : 'Could not generate the storyboard. Please retry.');
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const handleFinishAndCreate = () => {
    const cover =
      generatedScenes[0]?.mediaUrl ||
      (aspectRatio === '9:16'
        ? sceneAvatarPresenter
        : heroCyberCity);

    const projectId = createProject({
      title: workingTitle,
      topic,
      category,
      format,
      aspectRatio,
      visualStyle,
      narrationStyle,
      subtitleStyle,
      targetDuration,
      targetPlatforms: selectedPlatforms,
      coverImage: cover,
      publishingCaption: `${workingTitle} — ${topic.slice(0, 120)}... #FutureTech #Innovation #VYRAStudio`,
      selectedPlatformsForPublishing: selectedPlatforms.map((p) =>
        p.toLowerCase().includes('youtube')
          ? 'youtube'
          : p.toLowerCase().includes('tiktok')
          ? 'tiktok'
          : p.toLowerCase().includes('instagram')
          ? 'instagram'
          : p.toLowerCase().includes('linkedin')
          ? 'linkedin'
          : 'x'
      ),
      scenes: generatedScenes.length > 0 ? generatedScenes : [
        {
          id: 'sc-init-1',
          order: 1,
          narration: `Introducing ${workingTitle}. ${topic}`,
          visualPrompt: `Photorealistic macro view of next-generation optical technology in ${visualStyle} style`,
          cameraMovement: 'Slow inward macro push',
          duration: targetDuration,
          mediaUrl: cover,
          status: 'ready',
        },
      ],
    });

    navigateToProjectWorkspace(projectId);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16">
      {/* Step Progress Tracker (Zero-pill discipline: quiet step indicator with subtle lines) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400 light:text-slate-500">
          <span className="font-semibold text-white light:text-slate-900">
            Step {currentStep} of 4:
            {currentStep === 1 && ' Format & Distribution'}
            {currentStep === 2 && ' Content & Core Topic'}
            {currentStep === 3 && ' Creative Direction & Audio'}
            {currentStep === 4 && ' Storyboard Generation'}
          </span>
          <span className="font-mono tabular-nums">{Math.round((currentStep / 4) * 100)}% Complete</span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((stepNum) => (
            <div
              key={stepNum}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                stepNum <= currentStep
                  ? 'bg-gradient-to-r from-[#8D7CFF] to-[#55F4FF]'
                  : 'bg-[#1E2345] light:bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* STEP 1: FORMAT & PLATFORMS */}
      {currentStep === 1 && (
        <div className="p-6 sm:p-8 rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-6 animate-in fade-in duration-200">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white light:text-slate-900">
              1. Video Format & Distribution Channels
            </h2>
            <p className="text-xs text-slate-400 light:text-slate-500">
              Choose your canvas geometry, target duration style, and primary audience channels.
            </p>
          </div>

          {/* Format Selection (Short vs Long) */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 light:text-slate-700">
              Video Cadence
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  id: 'short_form',
                  title: 'Short-Form Video',
                  desc: '15s - 60s viral pacing for mobile social feeds',
                },
                {
                  id: 'long_form',
                  title: 'Long-Form Video',
                  desc: '1m - 5m comprehensive educational or documentary narrative',
                },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFormat(item.id as VideoFormat)}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    format === item.id
                      ? 'border-[#55F4FF] bg-[#1E2345] light:bg-slate-50 text-white light:text-slate-900 shadow-sm'
                      : 'border-[#2B3058] light:border-slate-200 text-slate-300 light:text-slate-700 hover:border-slate-500'
                  }`}
                >
                  <div className="text-xs font-bold">{item.title}</div>
                  <div className="text-[11px] text-slate-400 light:text-slate-500 mt-1 leading-normal">
                    {item.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio Options */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 light:text-slate-700">
              Aspect Ratio
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  id: '9:16',
                  title: '9:16 Vertical',
                  icon: <Smartphone className="w-4 h-4" />,
                  desc: 'Shorts, TikTok, Reels',
                },
                {
                  id: '16:9',
                  title: '16:9 Widescreen',
                  icon: <Monitor className="w-4 h-4" />,
                  desc: 'YouTube, LinkedIn, TV',
                },
                {
                  id: '1:1',
                  title: '1:1 Square',
                  icon: <Square className="w-4 h-4" />,
                  desc: 'Instagram Feed, X Posts',
                },
              ].map((ratio) => (
                <button
                  key={ratio.id}
                  type="button"
                  onClick={() => setAspectRatio(ratio.id as AspectRatio)}
                  className={`p-4 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    aspectRatio === ratio.id
                      ? 'border-[#55F4FF] bg-[#1E2345] light:bg-slate-50 text-white light:text-slate-900 shadow-sm'
                      : 'border-[#2B3058] light:border-slate-200 text-slate-400 light:text-slate-600 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-white light:text-slate-900">
                    <span className="flex items-center gap-1.5">
                      {ratio.icon}
                      {ratio.title}
                    </span>
                    {aspectRatio === ratio.id && <Check className="w-3.5 h-3.5 text-[#55F4FF]" />}
                  </div>
                  <span className="text-[10px] text-slate-400 light:text-slate-500 mt-2">
                    {ratio.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Intended Social Platforms */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 light:text-slate-700">
              Intended Social Platforms
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                'YouTube Shorts',
                'YouTube & Shorts',
                'TikTok',
                'Instagram Reels',
                'LinkedIn Video',
                'X (Twitter)',
              ].map((plat) => {
                const isSelected = selectedPlatforms.includes(plat);
                return (
                  <button
                    key={plat}
                    type="button"
                    onClick={() => togglePlatform(plat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      isSelected
                        ? 'border-[#55F4FF] bg-[#55F4FF]/10 text-[#55F4FF] light:text-[#0284C7]'
                        : 'border-[#2B3058] light:border-slate-200 text-slate-400 hover:text-white'
                    }`}
                  >
                    {plat}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              onClick={handleNextToStep2}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 transition-colors"
            >
              <span>Continue to Topic</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: CONTENT & TOPIC */}
      {currentStep === 2 && (
        <div className="p-6 sm:p-8 rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-6 animate-in fade-in duration-200">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white light:text-slate-900">
              2. Video Topic & Target Audience
            </h2>
            <p className="text-xs text-slate-400 light:text-slate-500">
              Provide context and scope so the AI script engine generates compelling storyboard arcs.
            </p>
          </div>

          {/* Working Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 light:text-slate-700">
              Working Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={workingTitle}
              onChange={(e) => setWorkingTitle(e.target.value)}
              placeholder="e.g. The Quantum Frontier: Light-Speed Photonic Processing"
              className="w-full px-3.5 py-2 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF]"
            />
            {errors.title && <span className="text-[11px] text-red-400">{errors.title}</span>}
          </div>

          {/* Video Topic & Key Points */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 light:text-slate-700">
              Core Video Topic & Narrative Concept <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Describe the thesis, key takeaways, and visual motifs..."
              className="w-full px-3.5 py-2 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF]"
            />
            {errors.topic && <span className="text-[11px] text-red-400">{errors.topic}</span>}
          </div>

          {/* Category & Audience Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 light:text-slate-700">
                Content Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ContentCategory)}
                className="w-full px-3.5 py-2 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none"
              >
                <option value="Tech & AI">Tech & AI</option>
                <option value="Science & Future">Science & Future</option>
                <option value="Product Showcase">Product Showcase</option>
                <option value="Business & Finance">Business & Finance</option>
                <option value="Documentary">Documentary</option>
                <option value="Lifestyle & Culture">Lifestyle & Culture</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 light:text-slate-700">
                Target Audience
              </label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="e.g. Founders, developers, enterprise buyers"
                className="w-full px-3.5 py-2 text-xs rounded-lg bg-[#090B18] light:bg-slate-50 text-white light:text-slate-900 border border-[#2B3058] light:border-slate-300 focus:outline-none focus:border-[#55F4FF]"
              />
            </div>
          </div>

          {/* Target Duration Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-300 light:text-slate-700">
                Target Duration:
              </span>
              <span className="font-mono tabular-nums text-[#55F4FF] light:text-[#0284C7] font-bold">
                {targetDuration} seconds ({Math.floor(targetDuration / 60)}m {targetDuration % 60}s)
              </span>
            </div>
            <input
              type="range"
              min={15}
              max={format === 'short_form' ? 60 : 300}
              step={5}
              value={targetDuration}
              onChange={(e) => setTargetDuration(Number(e.target.value))}
              className="w-full accent-[#55F4FF]"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>15s</span>
              <span>30s</span>
              <span>60s</span>
              {format === 'long_form' && <span>3m</span>}
              {format === 'long_form' && <span>5m</span>}
            </div>
          </div>

          <div className="pt-4 flex justify-between">
            <button
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              onClick={handleNextToStep3}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 transition-colors"
            >
              <span>Continue to Creative Style</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: CREATIVE STYLE & VOICE */}
      {currentStep === 3 && (
        <div className="p-6 sm:p-8 rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-6 animate-in fade-in duration-200">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white light:text-slate-900">
              3. Visual Style, Voice & Subtitles
            </h2>
            <p className="text-xs text-slate-400 light:text-slate-500">
              Customize the sensory direction, voice tone, and typography overlay.
            </p>
          </div>

          {/* Visual Style Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 light:text-slate-700">
              Visual Rendering Aesthetic
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { id: 'hyper_realistic', label: 'Hyper-Realistic 8K', desc: 'Commercial studio cinema lighting' },
                { id: 'cyber_minimal', label: 'Cyber-Minimal', desc: 'Deep obsidian surfaces with neon accents' },
                { id: 'cinematic_3d', label: 'Cinematic 3D', desc: 'Volumetric renders and glass reflections' },
                { id: 'anime_vector', label: 'Neo-Anime Vector', desc: 'Stylized vibrant futuristic outlines' },
                { id: 'documentary_grain', label: 'Documentary 35mm', desc: 'Organic texture, natural lighting' },
              ].map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setVisualStyle(style.id as VisualStyle)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    visualStyle === style.id
                      ? 'border-[#55F4FF] bg-[#1E2345] light:bg-slate-50 text-white light:text-slate-900'
                      : 'border-[#2B3058] light:border-slate-200 text-slate-400 light:text-slate-600 hover:border-slate-500'
                  }`}
                >
                  <div className="text-xs font-bold text-white light:text-slate-900">{style.label}</div>
                  <div className="text-[10px] text-slate-400 light:text-slate-500 mt-1">{style.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Narration Voice Tone */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 light:text-slate-700">
              English Narration Style
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'energetic_tech', label: 'Energetic Tech Lead', desc: 'Fast-paced, confident, clear inflection' },
                { id: 'authoritative', label: 'Deep Authoritative', desc: 'Gravitas, calm, BBC/PBS documentary style' },
                { id: 'conversational', label: 'Casual Host', desc: 'Friendly podcast style, approachable pacing' },
                { id: 'empathetic_storyteller', label: 'Empathetic Storyteller', desc: 'Warm, thoughtful, emotionally grounded' },
              ].map((voice) => (
                <button
                  key={voice.id}
                  type="button"
                  onClick={() => setNarrationStyle(voice.id as NarrationStyle)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    narrationStyle === voice.id
                      ? 'border-[#8D7CFF] bg-[#1E2345] light:bg-slate-50 text-white light:text-slate-900'
                      : 'border-[#2B3058] light:border-slate-200 text-slate-400 light:text-slate-600 hover:border-slate-500'
                  }`}
                >
                  <div className="text-xs font-bold text-white light:text-slate-900">{voice.label}</div>
                  <div className="text-[10px] text-slate-400 light:text-slate-500 mt-1">{voice.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Subtitle Style */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 light:text-slate-700">
              Subtitle Overlay Style
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'dynamic_pop', label: 'Dynamic Pop-in' },
                { id: 'minimal_lower', label: 'Minimal Lower-3rd' },
                { id: 'karaoke_neon', label: 'Karaoke Neon' },
                { id: 'none', label: 'None' },
              ].map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSubtitleStyle(sub.id as SubtitleStyle)}
                  className={`py-2 px-3 rounded-lg border text-xs text-center font-medium transition-all ${
                    subtitleStyle === sub.id
                      ? 'border-[#55F4FF] bg-[#55F4FF]/10 text-[#55F4FF] light:text-[#0284C7]'
                      : 'border-[#2B3058] light:border-slate-200 text-slate-400 hover:text-white'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-between">
            <button
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <div className="flex flex-col items-end gap-2">
              {outlineError && <p role="alert" className="max-w-md text-right text-xs text-rose-400">{outlineError}</p>}
              <button
                onClick={() => void handleGenerateOutline()}
                disabled={isGeneratingOutline}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold bg-gradient-to-r from-[#8D7CFF] to-[#55F4FF] text-[#090B18] hover:opacity-95 transition-all shadow-[0_0_15px_rgba(141,124,255,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Wand2 className="w-4 h-4" />
                <span>{isGeneratingOutline ? 'Generating with AI…' : 'Generate AI Storyboard'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: STORYBOARD OUTLINE PREVIEW & FINALIZE */}
      {currentStep === 4 && (
        <div className="p-6 sm:p-8 rounded-2xl bg-[#171A35] light:bg-white border border-[#2B3058] light:border-slate-200 space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white light:text-slate-900">
                4. Storyboard Outline Generated
              </h2>
              <p className="text-xs text-slate-400 light:text-slate-500">
                Review the multi-scene script breakdown before jumping into the interactive workspace.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-[#55F4FF]">
              <Film className="w-4 h-4" />
              <span>{generatedScenes.length} Scenes · {targetDuration}s total</span>
            </div>
          </div>

          {isGeneratingOutline ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-10 h-10 border-2 border-[#55F4FF] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Synthesizing narrative scenes and camera direction...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {generatedScenes.map((sc, index) => (
                <div
                  key={sc.id}
                  className="p-4 rounded-xl bg-[#090B18] light:bg-slate-50 border border-[#2B3058] light:border-slate-200 flex flex-col md:flex-row gap-4 items-start"
                >
                  <div className="w-full md:w-36 aspect-video rounded-lg overflow-hidden shrink-0 bg-slate-900">
                    <img
                      src={sc.mediaUrl}
                      alt={`Scene ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white light:text-slate-900">
                        Scene 0{index + 1}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-slate-400">
                        {sc.duration}s
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 light:text-slate-700 italic">
                      "{sc.narration}"
                    </p>
                    <div className="text-[11px] text-slate-500 space-y-0.5">
                      <div><strong className="text-slate-400">Prompt:</strong> {sc.visualPrompt}</div>
                      <div><strong className="text-slate-400">Camera:</strong> {sc.cameraMovement}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-4 flex justify-between items-center border-t border-[#2B3058]/60 light:border-slate-100">
            <button
              onClick={() => setCurrentStep(3)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <button
              onClick={handleFinishAndCreate}
              className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold bg-[#55F4FF] text-[#090B18] hover:bg-[#55F4FF]/90 transition-all shadow-[0_0_15px_rgba(85,244,255,0.3)]"
            >
              <span>Initialize Project & Open Storyboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
