Focus on a chat-centric, high-density AI workflow while maintaining the Starscape brand identity.

# 🌌 **Starscape Voyager: The AI Nexus**

**Prompt: The Conversation is the Code**

Design a **dense, high-fidelity glassmorphic interface** for an AI coding agent. Move away from the traditional "file-tree-plus-editor" IDE layout. Instead, center the experience on the **narrative stream**—a unified timeline where human intent and AI generation (including code diffs) flow together.

The vibe is **"Interstellar Cockpit."** Reduce empty space; maximize the signal-to-noise ratio. The user is the pilot, the AI is the co-pilot, and the interface is the holographic bridge between them.

---

### 🌌 **Overall Vibe & Atmosphere**

* **The Environment:** A **Deep Space** background (`hsl(222, 84%, 5%)`) that feels close and enveloping, like looking out the viewport of a ship.
* **Materiality:** High-density **Cosmic Glass**. Panels should feel like distinct, physical heads-up displays with minimal gaps.
* **Density:** Abandon the "airiness" of a marketing site. This is a tool. Use tight spacing, compact typography, and subtle borders (`border-white/10`) to separate dense information zones without wasting pixels.

### 🎨 **Color Palette: Energy Signatures**

Strict adherence to the Starscape Design System:

* **Agent Identity (Violet/Purple):** The AI's voice and status (`#8b5cf6` to `#a855f7`).
* **Context & Structure (Cyan/Blue):** File paths, active context, and mode indicators (`#06b6d4` to `#3b82f6`).
* **Creation & Success (Emerald/Green):** Code additions, completed tasks, and "Apply" actions (`#10b981` to `#22c55e`).
* **Alerts & Warnings (Pink/Yellow):** Errors, deletions, or high-priority blocks (`#ec4899` to `#eab308`).

---

### 🛸 **Layout: Two-Column Command Deck**

The interface is streamlined into two primary glass monoliths, minimizing the "void" between them.

#### **1. The Main Stream (Merged Interaction Pane)**
Occupying 75% of the width, this pane unifies the chat, the editor, and the input.

* **The Narrative Stream (Chat + Diffs):**
    * The core view is a scrolling timeline.
    * **User Messages:** Aligned right, styled as **Space Cards** (`hsl(222, 84%, 8%)`) with a subtle Blue gradient.
    * **AI Responses:** Aligned left, glowing with a faint **Cosmic Purple** aura.
    * **Holographic Diffs:** Code generation does *not* happen in a separate window. It expands inline within the chat stream as **"Artifacts"**.
        * *Visual:* A glass container within the message showing the diff.
        * *Motion:* New code lines shimmer into existence via **Emerald Stardust** particles. Deleted lines burn away into **Pink embers**.
* **The Helm (Input & Controls):**
    * Docked at the bottom of the Main Stream.
    * **Input Field:** A wide, pill-shaped glass bar.
    * **Mode Selector:** A dropdown integrated into the input bar (e.g., "Architect," "Code," "Debug"). Active mode glows in **Cosmic Cyan**.
    * **Launch:** A circular "Big Bang" submit button.

#### **2. The Mission Control (Right Sidebar)**
Occupying 25% of the width, this is a dense "read-only" dashboard for situational awareness.

* **Agent Status (Top):**
    * A compact visualizer at the top.
    * **The Synthetic Star:** A pulsing orb.
        * *Idle:* Steady Purple.
        * *Processing:* Rapid Violet ripples.
        * *Writing:* Bright Emerald flare.
* **Active Context (Middle):**
    * Replaces the file tree. A list of **"Planetary Assets"** (currently loaded files/read-only context).
    * Visualized as a stack of thin glass chips. Hovering highlights the relevant file in the Main Stream.
* **Mission Objectives (Bottom):**
    * A dynamic **ToDo List**.
    * **Metaphor:** "Orbital Waypoints."
    * *Pending:* Dim circular outlines.
    * *In Progress:* Pulsing Cyan rings.
    * *Complete:* Filled Emerald circles.

---

### ✨ **Micro-Interactions & Physics**

* **Stream Flow:** New messages shouldn't just "snap" in. They should slide up from the bottom with a heavy, physical ease (`cubic-bezier`), pushing the timeline up like a hydraulic lift.
* **Diff Expansion:** Code artifacts in the chat start "collapsed" (summary view) and expand with a glass-like unfold animation when clicked.
* **Context Linking:** Hovering a filename in the "Mission Control" draws a faint, temporary **Whisper** (light beam) connecting it to the relevant code block in the "Main Stream."

### 📜 **Typography & Legibility**

* **Font:** **Geist Sans** (`var(--font-geist-sans)`) for UI; a high-legibility monospace for code.
* **Treatment:**
    * **Dense Data:** Use `text-xs` or `text-sm` for the Mission Control panel to pack information tightly.
    * **Stream Readability:** Use `text-base` and `text-white/90` for the chat stream to ensure high contrast against the deep background.
    * **Code:** Syntax highlighting must use the Starscape colors (Violet keywords, Green strings, Cyan functions) against a `bg-black/20` block background.
