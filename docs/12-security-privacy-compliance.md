# 12 — Security, Privacy, and Compliance (API Key + Upload)

This document defines the security and privacy posture of the application, focusing on the two highest-risk surfaces in this assessment:

1) **User-provided AI API key** (must be accepted at runtime and stored **in memory only**)  
2) **Image upload** (untrusted binary input)

The goal is not to build an enterprise security program, but to demonstrate **strong engineering hygiene**:
- clear policies
- safe defaults
- defensible implementation choices
- minimal but credible protections

---

## 12.1 API Key Policy (In-Memory Only)

### 12.1.1 Core Requirement
The application must accept the user's AI provider API key at runtime and:
- store it **in memory only**
- **never** persist it to disk
- **never** persist it to database
- **never** commit it to git
- **never** leak it in logs

This is a hard requirement and must be explicitly stated and enforced.

---

### 12.1.2 Where the Key Lives (Frontend vs Backend)
Two acceptable models exist. The chosen model must be documented.

#### Model A — Key stored in **frontend memory**, sent per request (recommended)
- Key is held in React state (or in-memory store)
- For each search request, frontend sends key via HTTPS to backend (e.g., header)
- Backend uses key for the duration of the request, then discards it

**Pros**
- Complies with “in-memory only”
- No persistent server storage
- Matches assessment simplicity

**Cons**
- Key traverses network (must be HTTPS in production)
- Key exists in browser memory until tab reload

---

#### Model B — Key stored in **backend memory** tied to a short-lived session
- Frontend posts the key once
- Backend stores it in an in-memory map (sessionId → apiKey), with TTL
- Subsequent requests reference sessionId

**Pros**
- Key not sent on every request
- Can support multiple actions in a session

**Cons**
- More complexity (session semantics)
- Still must avoid persistence
- Requires TTL cleanup

---

### 12.1.3 Transport and Headers
If using Model A (per-request):
- Prefer an explicit header:
  - `X-AI-API-KEY: <key>`
- Alternative is including in body, but headers are cleaner and easier to sanitize.

**Rules**
- Never echo this header back to the client.
- Never include it in error messages.
- Ensure reverse proxies (if any) do not log it (document that risk).

---

### 12.1.4 Key Handling Rules (Strict)
Implement these rules in code and document them:

- **Do not store** key in:
  - localStorage
  - sessionStorage
  - cookies
  - backend files
  - database
- **Do not include** key in:
  - telemetry exports
  - request logs
  - error stacks returned to UI
- **Do not forward** key beyond the AI provider call.

---

### 12.1.5 UX for API Key Entry (Safe)
- Use a modal or settings panel: “Enter AI API Key”
- Input field uses `type="password"` (masked)
- Provide a clear “Clear key” button
- Key resets on:
  - page reload
  - tab close
  - manual clear

Optional (nice):
- “Test key” button that calls a minimal backend endpoint (no images) to validate.

---

### 12.1.6 Key Validation and Error Messaging
Backend should detect:
- missing key
- invalid format (optional)
- provider auth failure (401/403)

User messages should be:
- “API key is missing. Please provide a key to run the search.”
- “API key rejected by provider. Please verify your key.”

Do not include provider raw errors verbatim if they might contain sensitive details.

---

### 12.1.7 Minimal Compliance Notes
Even though this is not handling PII in a traditional sense, images can be sensitive.

Document:
- images are processed only for matching
- images are not stored permanently by your app
- key is not stored, only used to call provider
- logs are sanitized

---

## 12.2 Upload Security (Type, Size, Sanitization)

### 12.2.1 Threat Model for Uploads
User uploads are untrusted. Risks include:
- oversized payloads (DoS)
- malformed images triggering library issues
- hidden content (polyglot files)
- content-type spoofing
- path traversal / filesystem risks (if saving files)
- accidental logging of binary data

Goal: accept the needed formats, reject everything else, and avoid persistence.

---

### 12.2.2 Accepted Types and Validation Strategy
**Allowed formats**
- JPEG (`image/jpeg`)
- PNG (`image/png`)
- WebP (`image/webp`)

Validation should be done in two layers:
1) **Client-side validation** (UX-friendly)
2) **Server-side validation** (authoritative)

---

### 12.2.3 Server-side Validation Requirements
Do not rely on file extension alone.

#### Validate:
- presence of file
- file size <= `MAX_UPLOAD_BYTES` (e.g., 10MB)
- MIME type in allowlist
- magic bytes / signature check (recommended):
  - verify JPEG/PNG/WebP signatures

If validation fails:
- return `400` with safe error codes, e.g.:
  - `INVALID_IMAGE_TYPE`
  - `FILE_TOO_LARGE`
  - `MISSING_FILE`

---

### 12.2.4 Image Sanitization / Re-encoding (Optional but strong)
If time permits, sanitize by:
- decoding the image with a trusted library
- re-encoding it to a safe format (e.g., JPEG)
- stripping metadata (EXIF)

**Pros**
- neutralizes many malformed file risks
- removes EXIF GPS/location metadata (privacy-friendly)

**Cons**
- adds CPU cost and latency
- requires an image library dependency

If you skip re-encoding:
- at minimum, do not store the file
- pass raw bytes to provider only after validation

---

### 12.2.5 Storage Policy for Uploads
Default policy:
- **no disk persistence**
- process in memory only

Implementation constraints:
- use multipart handling that stores files in memory (not in /tmp) if possible
- if a temp file is used, ensure it is deleted immediately after request completes

Document:
- “The app does not store uploaded images; they are processed and discarded.”

---

### 12.2.6 Payload Limits and DoS Controls
Enforce:
- max file size
- max total request size (multipart)
- max fields in multipart
- max concurrent requests (optional via server config)
- request timeout

These are basic protections even for a small demo.

---

### 12.2.7 Content Safety (Out of Scope, but mention)
We are not building content moderation.
However, the app should handle:
- non-furniture images gracefully (not a security issue, but UX)
- avoid crashing on weird content

---

## 12.3 CORS and Browser Policies

### 12.3.1 CORS Goals
- allow frontend app to call backend API
- do not open CORS to `*` in production mode
- keep developer experience smooth locally

---

### 12.3.2 Recommended CORS Configuration

#### Development
Allow:
- `http://localhost:<port>`
- possibly `http://127.0.0.1:<port>`

#### Production
Allow only:
- the deployed frontend origin(s)
- optionally a short allowlist

---

### 12.3.3 Headers and Methods
Allow:
- Methods: `GET, POST, PUT, OPTIONS`
- Headers:
  - `Content-Type`
  - `X-AI-API-KEY` (if using header key)
  - `X-ADMIN-TOKEN` (admin)

Do not allow unnecessary headers.

---

### 12.3.4 Cookies / Credentials
Prefer **no cookies** and `credentials: false`.
This reduces CSRF concerns in this test context.

If you later add cookie-based admin auth, re-evaluate CSRF protection.

---

### 12.3.5 Browser-Side Security Hygiene
Frontend should:
- avoid storing secrets in persistent storage
- avoid exposing secrets via query params
- avoid logging secrets to console

---

## 12.4 Rate Limiting and Basic Protection

### 12.4.1 Why Rate Limiting Matters Here
Even in a test app:
- AI calls are expensive
- uploads can be abused
- uncontrolled retries can cause cost spikes

Rate limiting demonstrates maturity and cost awareness.

---

### 12.4.2 Suggested Rate Limit Policies (Simple)
Implement per-IP rate limiting on backend.

Recommended defaults (tunable in config):
- `/api/search`:
  - 10 requests / minute / IP
  - burst allowed up to 3
- `/api/config` (admin):
  - 30 requests / minute / IP (or lower)
- Optionally:
  - stricter limits for large uploads

For local development, limits can be looser or disabled.

---

### 12.4.3 Abuse and Anomaly Guardrails
Add these protective checks:
- reject requests without a file early
- reject requests with missing key early
- cap `candidateTopN` and `llmRerankTopM` from admin to prevent cost explosions
- enforce `totalTimeoutMs` so requests don’t hang indefinitely

---

### 12.4.4 Retry Policy (Avoid Thundering Herd)
Retries should be:
- bounded (0–1)
- only for transient provider errors (timeouts, 429)
- use exponential backoff with jitter (small)

Never retry:
- invalid key (401/403)
- invalid upload (400)
- schema validation errors from provider parsing (unless you implement a “repair” pass)

---

### 12.4.5 Admin Misuse Protection
Admin is internal, but:
- enforce numeric bounds in backend validation
- never trust client-sent config values
- validate config updates with Zod

---

## 12.5 Logging Best Practices (No Secret Leaks)

### 12.5.1 Logging Goals
Logs should:
- support debugging and demo
- allow correlation per request
- avoid sensitive data leaks
- keep output readable

---

### 12.5.2 Never Log These
- `X-AI-API-KEY` value
- `X-ADMIN-TOKEN` value
- raw image bytes
- full request headers
- full provider request payloads (they may contain the key or large image encodings)

---

### 12.5.3 Log Redaction and Sanitization
Implement a sanitizer:
- redact any header keys matching:
  - `*key*`
  - `*token*`
  - `authorization`
- truncate long strings (e.g., prompt) to safe length in logs
- log prompt length rather than full prompt (optional)

Example:
- log `promptChars: 42` instead of the whole prompt.

---

### 12.5.4 Structured Logs (Recommended)
Use JSON logs with:
- `requestId`
- `route`
- `statusCode`
- `timings`
- `stage`
- `errorCode` (safe code)
- `fallbackFlags`

Avoid including:
- provider raw response text
- stack traces in production responses

---

### 12.5.5 Error Handling: Safe for Users, Detailed for Logs
User responses should be short and safe:
- “Provider timeout. Try again.”
- “Invalid image format.”

Logs can include:
- internal error stack
- provider status codes
- retry attempts
- but still never include secrets

---

### 12.5.6 Observability and Security Together
If you export telemetry/eval logs:
- ensure export payload never includes secrets
- consider a final “scrub” step for export
- treat exports as potentially shareable artifacts

---

## Expected Outcome
After implementing these security and privacy rules, the application will:

- fully comply with “API key in-memory only”
- safely accept and validate image uploads
- avoid common web security pitfalls (overly permissive CORS, leaking headers)
- prevent cost and abuse issues through basic rate limiting and timeouts
- produce high-quality logs and telemetry without secret leakage