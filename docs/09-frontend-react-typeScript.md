# 09 — Frontend (React + TypeScript) — User UI

This document defines the **frontend UI** for the Image-Based Product Search application. The UI must be:
- **Fast to use** (minimal friction)
- **Clear and trustworthy** (ranking is understandable at a glance)
- **Resilient** (good empty/error states)
- **Aligned with the assessment goals** (match relevance + admin tunability)
- **Safe with API keys** (in-memory only)

The frontend is intentionally **simple and focused**:
- A **Search** experience (end-user)
- An **Admin** experience (internal/back-office) — documented separately in Topic 09

This document covers only the **end-user UI**.

---

## 09.1 App Structure and Routing

### Architectural Goals
- Keep routing minimal: few pages, low complexity.
- Keep state local and explicit (avoid over-architecture).
- Make API integration predictable and typed.

### Recommended App Shape (Two viable options)
#### Option A — Vite SPA (Recommended for simplicity)
- React Router (or a minimal router)
- Routes:
  - `/` (Search)
  - `/admin` (Admin, internal)
- Fast iteration, minimal server setup.

#### Option B — Next.js (If you want to align with job stack)
- App Router:
  - `/` (Search)
  - `/admin` (Admin)
- Still keep it a client-heavy UI with server API separated.

> Either option is acceptable; for the assessment, **simplicity and clarity** matter more than framework choice.
> If you choose Next.js, avoid adding unnecessary server-side complexity.

---

### Suggested Frontend Folder Organization
Keep it feature-oriented but light:

```

apps/web/src
/app (or /pages depending on router)
/components
/features
/search
SearchPage.tsx
UploadPanel.tsx
PromptInput.tsx
ResultsList.tsx
ResultCard.tsx
SearchNotices.tsx
useSearchController.ts
types.ts
/settings
ApiKeyModal.tsx
/lib
apiClient.ts
validators.ts
format.ts
/styles

```

---

### State Management Approach
**Goal:** keep state simple.

Use React built-ins:
- `useState` for API key, prompt, file
- `useReducer` (optional) for search state machine
- `useMemo`/`useCallback` for derived logic

Avoid:
- Redux, Zustand, etc. (unless you already use them and keep it minimal)

---

### API Client (Typed)
Define a small, typed API client:
- `searchProducts(formData, apiKey)`
- `getConfig()` (for admin)
- `updateConfig()` (for admin)

Keep response parsing centralized to avoid repeated error handling.

---

## 09.2 Upload Screen and Image Preview

### Primary UX Goal
Make uploading a clear, frictionless first step:
- user selects image
- sees preview immediately
- understands “Search” is available

---

### UI Components (Suggested)
#### `UploadPanel`
**Responsibilities**
- Accept file selection (click + drag-and-drop)
- Validate file before submission
- Show image preview
- Allow user to replace/remove image

---

### File Handling Rules
#### Accepted Formats (UI validation)
- `.jpg`, `.jpeg`, `.png`, `.webp`
- UI should block known unsupported types early.

#### Size Limit
- Enforce the same limit as backend (e.g., 10MB default).
- If the backend config defines limits, frontend should mirror them (optionally fetched at startup).

#### Preview behavior
- Use `URL.createObjectURL(file)` for preview.
- Revoke object URL when:
  - user replaces the file
  - component unmounts

---

### Upload UX Details
#### “Empty” upload state
- Visual dropzone
- Button: “Choose an image”
- Helper text:
  - “Use a well-lit photo focused on one furniture item.”

#### “File selected” state
- Show preview image
- Show:
  - filename
  - file size (formatted)
- Actions:
  - “Replace”
  - “Remove”

#### Validation feedback
Display inline errors near the upload area (see §08.5 for messaging style):
- “Unsupported file type…”
- “File too large…”

---

### Optional Enhancements (Nice-to-have)
- Show a small “tips” section:
  - “Avoid multiple items in one photo”
  - “Try closer framing”

Keep this non-intrusive.

---

## 09.3 Prompt Input (UX and Validation)

### Purpose of the Prompt
The prompt is optional and serves as **refinement** (preferences/constraints), not the primary query.

Examples:
- “Scandinavian, light wood”
- “Smaller, under $300”
- “Not leather”

---

### Component: `PromptInput`
**Responsibilities**
- Provide a single-line input or textarea (short)
- Validate max length
- Provide examples and guidance

---

### Prompt UX Requirements
- Prompt is optional; do not make it feel required.
- Provide placeholder examples.
- Allow quick clearing.
- Provide a subtle character count near limit (optional).

---

### Prompt Validation Rules
- Trim whitespace.
- Enforce max length:
  - soft limit (UX warning) e.g., 200 chars
  - hard limit e.g., 500 chars (match backend)
- If prompt is too long:
  - block search
  - show inline validation message

---

### How prompt affects behavior (UI messaging)
The UI should not expose complex internals.
But it may hint:
- “Optional: add details like color, style, size, price.”

Do not promise perfect filtering.

---

## 09.4 Results List (Cards, Ranking, Details)

### Primary UX Goal
Make ranking **scannable and trustworthy**:
- show top matches clearly
- highlight key attributes
- allow quick comparison

---

### Results Layout
Recommended layout:
- header row:
  - “Results (Top K)”
  - optional sorting dropdown (default: Relevance)
- list of result cards
- notices / fallback banners above list

---

### Component: `ResultsList`
**Responsibilities**
- Render ranked results
- Handle empty and loading states
- Show notices (fallback / low confidence)
- Support optional per-result feedback (thumbs)

---

### Result Card Content (Minimum)
Component: `ResultCard`

Each card displays:
- **Rank indicator** (e.g., `#1`, `#2`, etc.)
- **Title** (prominent)
- **Category + Type** (secondary line)
- **Price** (if available)
- **Dimensions**: `W × H × D cm`
- Optional:
  - truncated description snippet (1–2 lines)
  - “match band” badge: HIGH / MEDIUM / LOW
  - short “Matched on: …” tags (controlled vocabulary)

---

### Ranking UX Conventions
- Top result marked as “Best match”
- Optional match band display derived from returned metadata:
  - HIGH / MEDIUM / LOW
- Avoid showing raw numeric scores unless in Admin/debug mode.

---

### Sorting Controls (Optional)
If implemented, sorting should not confuse the main purpose:
- Default: Relevance
- Optional:
  - Price (low→high, high→low)
  - Width (small→large) — only if consistently available
- Sorting should be client-side and clearly labeled “Sort by”.

---

### Progressive Disclosure (Optional)
If users want more detail:
- Expand/collapse to show full description
- Show “Matched on” tags
Keep it lightweight to avoid UI bloat.

---

## 09.5 States and Errors (Empty State, Retry, etc.)

The UI must behave consistently across all states.  
A simple search state machine is recommended:

- `idle`
- `validating`
- `loading`
- `success`
- `empty`
- `error`

---

### Loading State
When search is running:
- Disable “Search” button
- Show a clear loading indicator
- Show stage text (optional):
  - “Analyzing image…”
  - “Searching catalog…”
  - “Ranking results…”

The backend already captures timings; UI messaging should be generic.

---

### Error State
Errors can come from:
- validation issues (client or server)
- provider timeouts / rate limits
- network failures

**UI behavior**
- Show one clear message
- Provide a “Try again” button
- Keep the uploaded image and prompt so retry is easy
- Do not display stack traces or provider raw messages

**Examples**
- “The analysis took too long. Try again.”
- “Too many requests. Try again in a moment.”
- “Something went wrong. Try again.”

---

### Empty State
Empty results should be rare due to fallback logic, but must exist:

**UI behavior**
- Friendly, actionable message
- Suggestions:
  - “Try a clearer photo focused on one item.”
  - “Add a short prompt describing the item.”
  - “Remove strict constraints like price/size.”

---

### Fallback Notice State
If backend signals fallback usage (`meta.notices`):
- Show a subtle banner:
  - “Showing best-effort matches.”
- Do not imply a broken system.
- Do not show provider names.

---

### Validation Errors (Inline)
Validation errors should be shown near the offending input:
- image errors near upload panel
- prompt errors near prompt input
- missing API key near “Search” action

---

### Retry Behavior
Retry should:
- reuse the same image + prompt
- re-run request with current config
- not require re-uploading

---

### Reset Behavior
Provide a “Reset” button (optional):
- clears results
- keeps the API key (still in memory)
- clears image + prompt

---

## 09.6 Accessibility and Responsiveness (Minimum Required)

### Accessibility Goals
Meet baseline accessibility without over-engineering:

- Keyboard navigable
- Visible focus states
- Labels for inputs
- Proper alt text for images
- Announce loading and errors via ARIA live regions (basic)

---

### Required Accessibility Behaviors

#### File Input
- Label: “Upload image”
- Drag-and-drop area must be keyboard accessible:
  - or provide a clear “Choose file” button as primary

#### Prompt Input
- Label: “Optional prompt”
- Assistive text: “Add details like style, color, size, or price.”

#### Results
- Each result card should be a semantic region:
  - title as heading
  - rank as text
- If “Best match” exists, it should be accessible text, not color-only.

#### Error and Notices
- Use `role="alert"` for critical errors
- Use `aria-live="polite"` for loading state updates

---

### Responsiveness (Minimum)
The UI should work on:
- Desktop (primary evaluation)
- Mobile (basic layout)

**Layout rules**
- Use a single-column layout on narrow screens
- Cards stack vertically
- Ensure buttons are large enough (touch targets)

**Performance**
- Avoid re-render storms:
  - keep results list keyed and stable
- Large lists are not expected (top-K), so virtualization not required.

---

## Expected Outcome
After implementing this frontend spec, the user experience will:
- make image upload and search extremely straightforward
- clearly show ranked matches and key catalog attributes
- handle failures gracefully with actionable guidance
- support Admin tuning (separately) without cluttering the user flow
- remain accessible and responsive with minimal complexity