# Batch 2 frames · Nano Banana prompts

Goal: give the whale girl the actions a real pet needs. 8 animations in total, **each one a 2×2 four-panel grid**. When you're done, drop the images into `assets/whale/source/batch2/` named by the filenames below. I'll cut, align, and build the sprite sheet.

## How to generate (important: this is what keeps the style consistent)

1. **Attach only 1 reference image**: `assets/whale/source/batch2/_ref.jpg` (your eating frame, same color as the existing sprite sheet).
   - Don't add the original icon: its color is a darker navy, and two references make the model treat them as two characters, giving two copies in different colors.
   - Don't use the output of the previous generation as a reference. Small drifts add up.
2. **Paste the "shared prompt" first, then the per-animation prompt**. Each animation is one request.
3. If a panel is off (wrong outfit, missing tail, extra text), regenerate that grid, or edit that panel on its own with "only change panel N, keep everything else".
4. If colors still drift, add this at the end: `Color-match every panel to the reference image; same hair blue, same navy dress.` A slight color shift is fine too; I can pull it back with color correction when assembling the sprite sheet.
5. Text / Zzz / sweat marks: don't let the model draw them. I add bubbles in code, which is cleaner and editable.

---

## Shared prompt (paste before each animation's prompt)

```
The attached image shows ONE character. Draw that same single character, with exactly the same
colors and art style — do not add a second character or a recolored variant.

Character: the chibi whale maid girl — long wavy blue hair (main color #415D9C, lighter #4F7DB6
toward the tips), a curled ahoge on top, white frilly maid headband, dark whale-fin ears with light
undersides, a light-blue bow on the right side, big glossy blue eyes, deep navy (#2C3E76) long-sleeve
maid dress with white apron (small whale emblem on the apron), gold bow details on the skirt,
white socks, navy shoes, and a thick navy (#2C3E76) whale tail on her right side.
Keep the identical art style and brightness of the reference: clean anime chibi, soft cel shading,
thin dark outlines, ~2.5 heads tall. Match the reference colors exactly; do not darken or desaturate.

Layout: a 2x2 grid of four panels on a pure white background (#FFFFFF), reading order
left-to-right, top-to-bottom, as a smooth animation sequence. Exactly one character per panel —
four drawings of the same girl in total, all with identical colors. Leave a wide clear white gap between
panels; the whole character — ahoge, hair tips, tail — must stay fully inside its own panel with margin.
Same camera distance and same character size in every panel; feet on the same baseline near the
bottom of each panel. No background, no floor, no shadows, no text, no letters, no speech bubbles,
no "Zzz", no sound effects, no symbols, no sparkles unless asked.
```

---

## 1. Walking · `walk.png`
Event: wandering around inside her area (replaces the current hop)

```
Animation: a cute 4-frame walk cycle, three-quarter view facing to the RIGHT.
She hugs her empty white rice bowl (blue whale pattern) to her chest with both hands.
Frame 1: right foot forward touching the ground, left foot back.
Frame 2: passing pose — feet together, body slightly raised, hair and tail lifting.
Frame 3: left foot forward touching the ground, right foot back.
Frame 4: passing pose again, body slightly raised.
Happy relaxed face, small bounce, hair and tail swaying opposite to the step.
```
> Facing left is made by mirroring in code; no need to generate it.

## 2. Falling asleep · `sleep.png`
Event: idle for more than 5 minutes → asleep; she wakes when generation starts

```
Animation: falling asleep while sitting.
Frame 1: sitting on the ground with legs stretched forward, bowl in her lap, yawning with one hand over her mouth, eyes half closed.
Frame 2: sitting, head drooping forward, eyes closed, sleepy.
Frame 3: asleep sitting, head tilted to one side, peaceful closed eyes, small open mouth, tail curled around her.
Frame 4: same as frame 3 with the head tilted slightly further and a tiny smile (breathing variation).
```
> I'll loop frames 3 and 4 while she sleeps; frames 1 and 2 are the "dozing off" transition.

## 3. Waking up · `wake.png`
Event: generation starts while she's asleep → wake up → start eating

```
Animation: waking up and getting up.
Frame 1: sitting, eyes snapping open in surprise, ahoge standing straight up.
Frame 2: rubbing one eye with her fist, still sitting, sleepy.
Frame 3: standing up, stretching both arms high above her head, eyes closed, mouth open in a yawn.
Frame 4: standing, holding her bowl and chopsticks, excited sparkling eyes, ready to eat.
```

## 4. Idle moves · `idle.png`
Event: shuffled in at random while idle (so she isn't just standing there)

```
Animation: four separate idle poses (each panel is its own short pose, not one sequence).
Frame 1: standing, looking to the side curiously, holding her bowl.
Frame 2: standing, tapping the empty bowl with her chopsticks, slightly impatient pout.
Frame 3: standing, peeking into the empty bowl with a sad little frown.
Frame 4: standing, tail raised and swishing, cheerful closed-eye smile, bowl held at her side.
```

## 5. Waiting on tools · `tool.png`
Event: the model is done talking and is running tools (`assistant/message` → `step/end`)

```
Animation: taking notes while waiting; her rice bowl rests on the ground beside her feet.
Frame 1: standing, holding a small notepad and pencil, looking at it seriously.
Frame 2: writing on the notepad, focused face, tongue slightly out.
Frame 3: tapping the pencil on her chin, thinking, eyes looking up.
Frame 4: nodding with a confident smile, pencil raised.
```

## 6. Needs your approval · `ask.png`
Event: the agent asks for permission (e.g. to run a command) and waits for you to click "allow"

```
Animation: calling the user for attention, facing the viewer.
Frame 1: standing, raising one hand high, other hand holding the bowl, eager open-mouth face.
Frame 2: same pose with the raised hand waving (hand tilted the other way), slightly leaning forward.
Frame 3: holding the bowl out toward the viewer with both hands, pleading puppy eyes.
Frame 4: knocking on the bowl with her chopsticks, puffed cheeks, impatient but cute.
```

## 7. Choking / failure · `oops.png`
Event: the turn ends with error / aborted

```
Animation: choking on rice, then sulking.
Frame 1: cheeks stuffed with rice, eyes wide in shock, holding her bowl.
Frame 2: coughing, eyes squeezed shut with small tears, one hand over her mouth, leaning forward.
Frame 3: teary eyes, trembling lip, looking at her bowl sadly.
Frame 4: wiping tears with her sleeve, pouting, bowl held to her chest.
```

## 8. Stuffed / done · `full.png`
Event: frames 1–2 for max-tokens (she ate too much); frames 3–4 for a long task finishing (cheering to call you back)

```
Animation: two short reactions.
Frame 1: standing, both hands on a slightly round full belly, satisfied closed-eye smile, cheeks pink.
Frame 2: leaning back, patting her belly, happy and sleepy, bowl on the ground beside her.
Frame 3: jumping with both arms raised in celebration, bowl in one hand, big open smile.
Frame 4: landing, giving a proud thumbs-up toward the viewer, wink.
```

---

## Event mapping

| Animation | Trigger | Playback |
|---|---|---|
| walk | Moving inside her area | 4-frame loop, mirrored for left |
| sleep → wake | Idle 5 min → asleep; woken when generation starts or when clicked | 1→2 once, then 3/4 loop; wake plays once |
| idle | Idle, picked at random every so often | Single frame held 1.5–3 s |
| tool | Waiting while tools run | 1→4, then 2/3 loop |
| ask | Waiting for approval | 1/2 alternating loop; 3/4 if it goes on too long |
| oops | error / aborted | Once, then back to idle |
| full | max-tokens: 1/2; task done: 3/4 | Once |
| (existing) eat | Generating | Already in place |
