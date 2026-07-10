# Brand Subtitle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present Frame Forge as a dynamic sticker creation tool in the UI and README.

**Architecture:** Keep `Frame Forge` as the shared product name. Update only localized subtitle values and the README's opening product description; leave the `frame-forge` package identifier and all behavior unchanged.

**Tech Stack:** React, i18next JSON locales, Markdown, TypeScript/Vite.

---

### Task 1: Update visible product positioning

**Files:**
- Modify: `src/locales/zh.json:3-5`
- Modify: `src/locales/en.json:3-5`
- Modify: `README.md:1-3`

- [ ] **Step 1: Update localized subtitles**

Set `header.subtitle` to `动态表情制作工具` in Chinese and `Dynamic Sticker Studio` in English. Keep `header.title` as `Frame Forge`.

- [ ] **Step 2: Update the README opening**

Set the first paragraph to: `Frame Forge is a browser-based dynamic sticker creation tool for making WeChat dynamic stickers from videos and GIFs. It extracts or parses sticker frames, helps clean and matte the sequence, previews the animation, checks the WeChat export setup, and exports a 240 x 240 animated GIF.`

- [ ] **Step 3: Verify content**

Run: `rg -n '动态表情制作工具|Dynamic Sticker Studio|browser-based dynamic sticker creation tool' src/locales README.md`
Expected: the two localized subtitles and the exact revised README positioning are present.

### Task 2: Validate the presentation change

**Files:**
- Test: `src/locales/en.json`
- Test: `src/locales/zh.json`

- [ ] **Step 1: Build the application**

Run: `npm run build`
Expected: TypeScript and Vite build successfully.

- [ ] **Step 2: Check the diff**

Run: `git diff --check && git diff -- README.md src/locales/en.json src/locales/zh.json`
Expected: no whitespace errors and only the requested positioning copy changes.

- [ ] **Step 3: Commit**

```bash
git add README.md src/locales/en.json src/locales/zh.json
git commit -m "docs: clarify dynamic sticker positioning"
```
