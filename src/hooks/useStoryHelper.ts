import { useState, useCallback, useRef } from "react";
import type { StoryPanel } from "@/components/StorySlideshow";
import {
  generatePollinationsUrl,
  generateCharacterImagePrompt,
  generateSceneImagePrompt,
} from "@/scripts/story-helper";

// New phase types for the simplified flow
export type StoryPhase =
  | "intro"
  | "choose_world"
  | "choose_appearance"   // Step 1: 外觀風格
  | "choose_gender"       // Step 2: 性別/種族
  | "choose_class"        // Step 3: 職業
  | "preview_character"   // Show generated character, can re-roll
  | "choose_event"
  | "generating_story"
  | "slideshow"
  | "pick_favorite"
  | "complete";

export interface StoryRound {
  roundNumber: number;
  world: string;
  worldLabel: string;
  appearance: string;     // 外觀風格
  gender: string;         // 性別/種族
  characterClass: string; // 職業
  characterImageUrl: string;
  characterPrompt: string;
  eventType: string;
  eventLabel: string;
  panels: StoryPanel[];
  storyTitle: string;
}

const MAX_REROLLS = 5;
const DEFAULT_ROUNDS = 3;

export function useStoryHelper(totalRounds: number = DEFAULT_ROUNDS) {
  const [storyPhase, setStoryPhase] = useState<StoryPhase>("intro");
  const [currentRound, setCurrentRound] = useState(1);
  const [completedRounds, setCompletedRounds] = useState<StoryRound[]>([]);
  const [currentRoundData, setCurrentRoundData] = useState<Partial<StoryRound>>({});
  const [rerollCount, setRerollCount] = useState(0);
  const [currentCharacterUrl, setCurrentCharacterUrl] = useState("");
  const [slideshowPanels, setSlideshowPanels] = useState<StoryPanel[]>([]);
  const [slideshowTitle, setSlideshowTitle] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const initialized = useRef(false);

  const reset = useCallback(() => {
    setStoryPhase("intro");
    setCurrentRound(1);
    setCompletedRounds([]);
    setCurrentRoundData({});
    setRerollCount(0);
    setCurrentCharacterUrl("");
    setSlideshowPanels([]);
    setSlideshowTitle("");
    setIsGenerating(false);
    initialized.current = false;
  }, []);

  const setWorld = useCallback((world: string, label: string) => {
    setCurrentRoundData((prev) => ({ ...prev, world, worldLabel: label }));
    setStoryPhase("choose_appearance");
    setRerollCount(0);
  }, []);

  const setAppearance = useCallback((appearance: string) => {
    setCurrentRoundData((prev) => ({ ...prev, appearance }));
    setStoryPhase("choose_gender");
  }, []);

  const setGender = useCallback((gender: string) => {
    setCurrentRoundData((prev) => ({ ...prev, gender }));
    setStoryPhase("choose_class");
  }, []);

  // Map Chinese labels to detailed English character descriptions
  const appearanceMap: Record<string, string> = {
    "帥氣的": "handsome face, sharp jawline, confident smirk, spiky hair, cool demeanor",
    "漂亮的": "beautiful face, long flowing hair, elegant posture, sparkling eyes, graceful",
    "威猛的": "muscular build, battle scars, fierce eyes, strong jaw, towering presence, broad shoulders",
    "神秘的": "face partially hidden by hood, glowing eyes in shadow, dark flowing cloak, mysterious aura, arcane symbols",
    "可愛的": "big round eyes, rosy cheeks, small body, fluffy hair, adorable smile, chibi proportions",
  };

  const genderMap: Record<string, string> = {
    "男生": "young male hero, short messy hair, determined expression",
    "女生": "young female heroine, long hair with accessories, fierce yet elegant",
    "動物": "anthropomorphic animal standing upright, expressive face, fur covered body, animal ears and tail",
    "機器人": "sleek humanoid robot, metallic chrome body, LED glowing eyes, mechanical joints, energy core in chest",
    "精靈": "ethereal elf, pointed ears, luminous skin, ancient rune tattoos, otherworldly beauty",
  };

  const classMap: Record<string, string> = {
    "魔法師": "wizard robes with golden trim, tall magic staff with glowing crystal orb, spell circles floating around hands, arcane book at hip",
    "戰士": "full plate armor with engravings, large broadsword on back, shield with emblem, red cape flowing, battle-ready stance",
    "弓箭手": "leather armor with green hooded cloak, ornate longbow, quiver of arrows on back, keen sharp eyes, agile build",
    "忍者": "black ninja outfit with red accents, dual katana blades crossed on back, face mask, smoke bombs on belt, crouching pose",
    "美人魚": "iridescent fish tail with scales, seashell accessories, flowing underwater hair, pearl jewelry, trident weapon",
  };

  const worldStyleMap: Record<string, string> = {
    "magic forest": "enchanted ancient forest, massive glowing trees, floating luminous particles, mystical fog, moonlight filtering through canopy",
    "outer space": "vast galaxy backdrop, colorful nebula clouds, orbiting planets, spaceship wreckage, zero gravity debris",
    "underwater": "deep ocean abyss, towering coral formations, bioluminescent jellyfish, sunlight rays through water, ancient ruins",
    "cyber city": "neon-lit cyberpunk megacity, holographic billboards, rain-slicked streets, flying vehicles, towering skyscrapers",
    "dinosaur island": "prehistoric volcanic island, dense jungle, erupting volcano in distance, pterodactyls in sky, ancient stone ruins",
  };

  // Art style options
  const ART_STYLES = [
    "anime style, sharp clean lines, cel shading, vibrant saturated colors, studio ghibli quality",
    "Pixar 3D render style, smooth subsurface scattering, soft cinematic lighting, CGI movie quality",
    "AAA video game concept art, digital oil painting, ultra detailed, unreal engine quality",
  ];

  // Build a rich character image prompt
  const buildCharacterPrompt = (data: Partial<StoryRound>) => {
    const appearance = appearanceMap[data.appearance || ""] || data.appearance || "cool";
    const gender = genderMap[data.gender || ""] || data.gender || "male character";
    const charClass = classMap[data.characterClass || ""] || data.characterClass || "warrior";
    const worldStyle = worldStyleMap[data.world || ""] || `${data.world} background`;
    const artStyle = ART_STYLES[Math.floor(Math.random() * ART_STYLES.length)];

    return `single character portrait, ${gender}, ${appearance}, ${charClass}, standing in ${worldStyle}, ${artStyle}, full body shot, dynamic hero pose, dramatic rim lighting, highly detailed, masterpiece, 4k`;
  };

  // Build a short but recognizable character identity string for scene prompts
  const buildCharacterIdentity = (data: Partial<StoryRound>) => {
    const appearance = appearanceMap[data.appearance || ""] || data.appearance || "";
    const gender = genderMap[data.gender || ""] || data.gender || "";
    const charClass = classMap[data.characterClass || ""] || data.characterClass || "";
    return `${gender}, ${appearance}, ${charClass}`;
  };

  const setCharacterClass = useCallback((characterClass: string) => {
    setCurrentRoundData((prev) => {
      const updated = { ...prev, characterClass };
      const prompt = buildCharacterPrompt(updated);
      const url = generatePollinationsUrl(prompt, 512, 512);
      setCurrentCharacterUrl(url);
      return { ...updated, characterPrompt: prompt, characterImageUrl: url };
    });
    setStoryPhase("preview_character");
    setRerollCount(0);
  }, []);

  const rerollCharacter = useCallback(() => {
    setRerollCount((prev) => {
      if (prev >= MAX_REROLLS) return prev;
      return prev + 1;
    });
    setCurrentRoundData((prev) => {
      const prompt = buildCharacterPrompt(prev);
      const url = generatePollinationsUrl(prompt, 512, 512);
      setCurrentCharacterUrl(url);
      return { ...prev, characterPrompt: prompt, characterImageUrl: url };
    });
  }, []);

  const confirmCharacter = useCallback(() => {
    setStoryPhase("choose_event");
  }, []);

  const setEvent = useCallback((eventType: string, label: string) => {
    setCurrentRoundData((prev) => ({ ...prev, eventType, eventLabel: label }));
    setStoryPhase("generating_story");
  }, []);

  // Generate the 3-panel storyboard + TTS
  // Panel 1 reuses the character image; panels 2 & 3 are new scene images
  // All scene images share the same art style for consistency
  const generateStory = useCallback(
    async (storyData: { storyTitle: string; panels: { imagePromptEN: string; text: string }[] }) => {
      setIsGenerating(true);

      // Pick one consistent art style for this round
      const styles = ["anime style, cel shading", "Pixar 3D CGI style", "video game concept art, digital painting"];
      const style = styles[Math.floor(Math.random() * styles.length)];

      // Panel 1: reuse the character image (already generated during character selection)
      const characterUrl = currentRoundData.characterImageUrl || "";

      // Build character identity for consistent appearance in scene images
      const charIdentity = buildCharacterIdentity(currentRoundData);
      const worldBg = worldStyleMap[currentRoundData.world || ""] || currentRoundData.world || "";

      // Use a fixed seed base so panels 2 & 3 share visual coherence
      const seedBase = Math.floor(Math.random() * 9999);

      // Panels 2 & 3: character + story action + scene environment
      // imagePromptEN from AI describes what's HAPPENING in the scene
      // We prepend the character identity so the character is recognizable
      const sceneImages = storyData.panels.slice(1).map((p, i) => {
        const actionScene = p.imagePromptEN || "epic scene";
        const scenePrompt = [
          charIdentity,
          actionScene,
          worldBg,
          style,
          "cinematic wide shot, dramatic lighting, vibrant colors, highly detailed, masterpiece",
        ].join(", ");
        const url = `https://gen.pollinations.ai/image/${encodeURIComponent(scenePrompt.slice(0, 400))}?model=flux&width=768&height=512&seed=${seedBase + i}&safe=true`;
        return `/api/image-proxy?url=${encodeURIComponent(url)}`;
      });

      // All 3 panels use the same fixed aspect ratio (768x512)
      // Panel 1 also gets proxied at 768x512 for consistency
      const characterAt768 = characterUrl; // Already generated, keep as-is
      const panelImages = [characterAt768, ...sceneImages];

      // Generate TTS for all 3 panels in parallel
      const ttsResults = await Promise.allSettled(
        storyData.panels.map((p) =>
          fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: p.text }),
          }).then((r) => r.json())
        )
      );

      const panels: StoryPanel[] = storyData.panels.map((p, i) => {
        const ttsResult = ttsResults[i];
        const audioBase64 =
          ttsResult.status === "fulfilled" && ttsResult.value.success
            ? ttsResult.value.audio
            : undefined;
        return {
          imageUrl: panelImages[i] || "",
          text: p.text,
          audioBase64,
        };
      });

      setSlideshowPanels(panels);
      setSlideshowTitle(storyData.storyTitle);
      setIsGenerating(false);
      setStoryPhase("slideshow");

      // Save round data (include art style for potential replay)
      setCurrentRoundData((prev) => ({
        ...prev,
        panels,
        storyTitle: storyData.storyTitle,
      }));
    },
    [currentRoundData.characterImageUrl, currentRoundData.world]
  );

  const onSlideshowComplete = useCallback(() => {
    // Save this round
    const round: StoryRound = {
      roundNumber: currentRound,
      world: currentRoundData.world || "",
      worldLabel: currentRoundData.worldLabel || "",
      appearance: currentRoundData.appearance || "",
      gender: currentRoundData.gender || "",
      characterClass: currentRoundData.characterClass || "",
      characterImageUrl: currentRoundData.characterImageUrl || "",
      characterPrompt: currentRoundData.characterPrompt || "",
      eventType: currentRoundData.eventType || "",
      eventLabel: currentRoundData.eventLabel || "",
      panels: slideshowPanels,
      storyTitle: slideshowTitle,
    };
    setCompletedRounds((prev) => [...prev, round]);

    if (currentRound < totalRounds) {
      // Next round
      setCurrentRound((prev) => prev + 1);
      setCurrentRoundData({});
      setRerollCount(0);
      setCurrentCharacterUrl("");
      setSlideshowPanels([]);
      setSlideshowTitle("");
      setStoryPhase("choose_world");
    } else {
      // All rounds done
      setStoryPhase("pick_favorite");
    }
  }, [currentRound, currentRoundData, slideshowPanels, slideshowTitle]);

  const pickFavorite = useCallback(
    (roundIndex: number) => {
      // roundIndex is 0-based
      setStoryPhase("complete");
      return completedRounds[roundIndex];
    },
    [completedRounds]
  );

  return {
    // State
    storyPhase,
    setStoryPhase,
    currentRound,
    completedRounds,
    currentRoundData,
    rerollCount,
    maxRerolls: MAX_REROLLS,
    currentCharacterUrl,
    slideshowPanels,
    slideshowTitle,
    isGenerating,
    initialized,
    totalRounds: totalRounds,

    // Actions
    reset,
    setWorld,
    setAppearance,
    setGender,
    setCharacterClass,
    rerollCharacter,
    confirmCharacter,
    setEvent,
    generateStory,
    onSlideshowComplete,
    pickFavorite,
  };
}
