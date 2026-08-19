# TabVault Design Directions

## Three possible directions

### 1. Signal Library

**Very Brief Intro:** A calm, editorial workspace inspired by well-indexed research libraries and contemporary information design. Dense enough for power users, but never visually noisy.
**Probability:** 0.07

### 2. Mission Control

**Very Brief Intro:** A dark operational console with data-stream accents and technical instrumentation. It emphasizes the agent-facing, server-connected nature of TabVault.
**Probability:** 0.03

### 3. Paper Systems

**Very Brief Intro:** A warm, tactile knowledge cabinet with paper-like layers and tactile metadata. It would make saved links feel more intentional and archival.
**Probability:** 0.09

## Chosen Direction: Signal Library

### Design Movement

Contemporary Swiss information design interpreted as a calm research workspace. The interface should feel as deliberate as an annotated technical paper: structured, restrained, and immediately legible.

### Core Principles

1. Prioritize information hierarchy over ornamental interface chrome.
2. Use asymmetric bands and quiet empty space to separate navigation, collection context, and active work.
3. Make machine-readable system states feel clear and reassuring rather than opaque or overly technical.
4. Pair precise typographic rules with small tactile details, such as file-label borders and discrete colored signals.

### Color Philosophy

The base is a warm, nearly white paper field so that long periods of browsing are comfortable. Ink black and deep forest establish seriousness and contrast; TabVault Orange is reserved for active focus, saved-state indicators, and primary actions, giving every critical action an intentional visual weight.

### Layout Paradigm

Use a persistent collection rail on the left, a flexible central reading surface for tabs, and a narrow right-side insight strip on larger screens. Rather than a symmetric grid, the content is arranged as a library shelf: the current collection is the object of attention, while related structure remains peripheral but reachable.

### Signature Elements

1. An orange square-tab glyph with a cut-out bookmark, used as the brand mark and active-state signal.
2. Vertical index rules and small uppercase section labels reminiscent of catalog cards.
3. A semantic-search lens panel that surfaces query intent and result confidence as a visible part of the product.

### Interaction Philosophy

Interactions are concise and obvious: moving a tab changes its collection context instantly, saved actions receive a small success message, and data operations expose their status directly. Controls should reward keyboard-oriented workflows without hiding capabilities behind gestures alone.

### Animation

Use brief, understated opacity and translate transitions under 220 ms with a crisp ease-out curve. Panels may enter from their logical side; list reordering should use subtle movement only. System indicators may pulse once when their state changes, and all nonessential motion must respect reduced-motion preferences.

### Typography System

Use **DM Mono** for labels, metadata, codes, shortcuts, and system messages; use **Manrope** for navigational and body copy; use **DM Sans** at high weight for page titles and feature headings. Headlines should be compact and confident, while labels use uppercase mono tracking for a cataloguing feel.

### Brand Essence

**TabVault is the local-first link library for people and AI agents who need every saved tab to stay structured, searchable, and explainable.**

Personality: **exact, calm, capable**.

### Brand Voice

The writing is direct, practical, and a little editorial. Headlines name the job to be done; CTAs describe the exact effect instead of making generic promises.

Example lines: “Sort the loose ends, without losing the thread.” and “Your local index is ready for the next question.”

### Wordmark & Logo

The wordmark pairs a strong compact sans with a custom orange bookmark-tab symbol: a square file tab interrupted by a vertical notch. The symbol works independently in the application rail and favicon, without relying on the wordmark.

### Signature Brand Color

**TabVault Orange — #F05A28.**

## Style Decisions

- The persistent collection rail remains the primary orientation system on desktop; breadcrumb navigation only supplements it.
- Prominent imagery must behave as a catalog fragment or system evidence, using metadata and index rules rather than lifestyle decoration.
- The orange bookmark-tab glyph is visible in the active collection context and system state surfaces, not only on primary buttons.
- Active collection rows use a left orange index rule and the bookmark-tab glyph; inactive collection colors remain muted evidence, not competing brand accents.
- Verified semantic status and on-device query cues use TabVault Orange, while imagery receives a catalog code or evidence label at its edge.
