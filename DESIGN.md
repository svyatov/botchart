---
name: botchart playground
description: A focused workbench for inspecting bot statecharts and Telegram views.
colors:
  workspace: "#17212b"
  pane: "#1e2b38"
  pane-deep: "#131d27"
  pane-soft: "#223242"
  border: "#334658"
  border-strong: "#4b647b"
  text: "#edf4fa"
  text-dim: "#9bb0c3"
  accent: "#6bc1ff"
  accent-deep: "#2b5278"
  message: "#182533"
  message-action: "#29435c"
  sample: "#f3c76d"
  danger: "#ff9e9e"
typography:
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 750
    lineHeight: 1.5
    letterSpacing: "0.02em"
  label:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.4
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.62
rounded:
  control: "8px"
  message: "12px"
  pane: "14px"
  pill: "999px"
spacing:
  tight: "4px"
  control: "8px"
  pane: "10px"
  content: "16px"
  wide: "24px"
components:
  mode-control:
    backgroundColor: "{colors.accent-deep}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "6px 13px"
  pane:
    backgroundColor: "{colors.pane}"
    textColor: "{colors.text}"
    rounded: "{rounded.pane}"
  state-node:
    backgroundColor: "{colors.pane-deep}"
    textColor: "{colors.text}"
    rounded: "{rounded.message}"
  message:
    backgroundColor: "{colors.message}"
    textColor: "{colors.text}"
    rounded: "{rounded.message}"
    padding: "8px 10px"
  message-action:
    backgroundColor: "{colors.message-action}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "6px"
---

# Design System: botchart playground

## Overview

**Creative North Star: "The Telegram Workbench"**

The playground is a compact technical workbench. It combines Telegram message forms with a clear statechart canvas. Dark layered surfaces keep attention on state changes, views, and source data.

The interface uses dense controls and direct labels. Blue marks actions and structure. Warm yellow marks the selected state and sample data.

**Key Characteristics:**

- Dark Telegram-inspired surfaces
- Compact technical typography
- Clear borders and restrained depth
- Read-only source, chart, and preview panes
- Preview-first order on narrow inspector screens

## Colors

The palette uses cool navy surfaces, clear blue actions, and one warm review signal.

### Primary

- Workbench Blue marks focus, links, chart titles, and active structure.
- Deep Action Blue marks selected mode controls.

### Neutral

- Night Workspace is the page background.
- Workbench Pane holds source, chart, and preview content.
- Deep Canvas separates the chart and toolbar from other surfaces.
- Soft Control Surface supports selects and quiet controls.
- Primary Ink keeps important content clear.
- Muted Ink supports metadata and secondary detail.
- Structural Borders define panes, nodes, and controls.

### Tertiary

- Sample Gold marks selected states and sample-backed previews.
- Failure Coral is reserved for load and render errors.

**The One Warm Signal Rule.** Use sample gold only for selection and sample-data status.

## Typography

The system uses the platform sans-serif stack for controls and content. It uses the platform monospace stack for JSON, state names, and transition labels.

### Hierarchy

- Use the title role for pane headings.
- Use the body role for normal interface text.
- Use the label role for compact state and status labels.
- Use the mono role for authored source and machine identifiers.

**The Identifier Rule.** Keep state names and transition labels in monospace type.

## Layout

Desktop canvas mode uses a narrow source pane and a wide chart pane. Desktop inspector mode adds a bounded preview pane. Pane gaps use the pane spacing token.

At the 940px breakpoint, the workbench becomes one column. Inspector mode moves the preview before the chart and the source. This DOM order must match the visible order. The app shell can scroll on a narrow screen.

## Elevation & Depth

The design uses tonal layering and borders for most depth. State nodes use one low shadow to stay clear of chart edges. A selected node adds a warm outline.

**The Flat Pane Rule.** Keep main panes flat. Use shadow only on chart nodes and interactive focus states.

## Shapes

Panes use the pane radius. State nodes and message bubbles use the message radius. Inputs and inline message actions use the control radius. Mode controls use the pill radius. Dashed rounded borders identify compound states.

## Components

### Mode controls

Use a compact pill group. The active control uses deep action blue. Inactive controls use transparent backgrounds and muted ink.

### Panes

Use a solid border, a rounded container, and a fixed heading strip. Keep headings compact so content remains primary.

### State nodes

Use a dark message-like surface with a strong border. Blue identifies the state name. Warm gold identifies selection. Compound-state title controls must have a minimum 44px target.

### Telegram previews

Use a dark bubble for message text and blue inset blocks for inline actions. Keep preview buttons visually inert because the playground is read only.

### Inputs

Use a soft navy surface, a strong border, and an 8px radius. A visible blue focus outline is required.

### Status badges

Use small bold gold text for sample-data status. Use coral only for failures.

## Do's and Don'ts

### Do:

- Do keep source, chart, and preview roles visually distinct.
- Do use blue for navigation, focus, and chart structure.
- Do keep interactive targets at least 44px high where space permits.
- Do keep mobile DOM order equal to visible order.

### Don't:

- Don't add decorative color without a semantic role.
- Don't use proportional type for state identifiers or JSON.
- Don't make preview buttons behave like live Telegram actions.
- Don't use large shadows on workbench panes.
