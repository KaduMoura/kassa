# Context

This document provides the context for a full-stack application developed as part of a technical assessment for a job application.

## Technical Assessment

### **AI full-stack programming task: Image-Based Product Search**

### **Goal**

Build a focused full-stack application that lets a user upload an image of a furniture item and receive **relevant matches** from a furniture catalog, optionally refined by a short natural-language query. We will evaluate the quality and relevance of the matches, not just whether the system returns results.

You are encouraged to use AI coding tools; ownership of the final result and all implementation decisions is entirely yours.

### **Product Catalog**

Connect to the pre-populated database using the following **read-only** connection string:

```
mongodb+srv://catalog-readonly:vcRvxWHQSKUEwd7V@catalog.sontifs.mongodb.net/catalog
```

Use the `products` collection. Each document has the following schema:

```json
{
    "title": string,
    "description": string,
    "category": string,
    "type": string,
    // Price in $
    "price": number,
    // Dimensions in cm
    "width": number,
    "height": number,
    "depth": number
}
```

You may **not** modify the database — use it and its existing indexes as they are.

## **Requirements**

### **AI Provider**

Choose any **frontier model provider** (e.g. OpenAI, Anthropic, Google, etc.). The application must accept the user's own API key at runtime — store it **in memory only** (client-side or server-side); do not persist it to disk.

### **Core Features**

- **Image upload** — accept a product image from the user.
- **Product matching** — analyze the image and return ranked matches from the catalog.
- **Optional user prompt** — allow the user to add a natural-language query to narrow or adjust results.

### **Admin**

The client must include an **admin page or tab** — this is an **internal, back-office interface**, not consumer-facing. It serves as the configuration surface for the product matching functionality. Any meta-parameters that control retrieval and ranking behavior should be exposed here.

### **Evaluation**

Think about how you would evaluate the quality of the matching results. Document your approach in the README — and if feasible, incorporate a lightweight evaluation mechanism into the system.

### **Edge Cases**

Graceful handling of edge cases (e.g. unrecognizable images, API failures, no good matches) is nice to have, but less important than the quality of the core retrieval and ranking functionality.

## **Principles**

Apply software design principles — **KISS**, **DRY**, separation of concerns, and clear abstractions. Keep the architecture simple and straightforward, avoid over-engineering, and extract shared logic rather than duplicating it. Clean, readable code is valued over clever code.

## **Stack**

- **Frontend:** React + TypeScript
- **Backend:** Node.js + TypeScript

## **Deliverables**

- A **Git repository** containing the full solution.
- The repository's `README.md` must include:
    - Clear instructions to run the system locally.
    - A **concise overview** of the system — key design choices, considerations, and tradeoffs. Focus on the retrieval and ranking implementation.
    - A list of **future features or enhancements** you would recommend implementing next.
- A `CHANGELOG.md` file that includes:
    - The main changes made through the development of the project, with concise reasons and motivations. Where relevant, include the corresponding prompts and instructions given to the coding agent.
    - Particular focus on the search functionality and its implementation.

## **Follow-Up**

Be prepared to walk through a live demo, explain your implementation, and discuss how you would incorporate further features and modifications in a follow-up conversation.

---

# Job Description:

```
# Sr AI Engineer
**Fullstack Senior | Remote 🇮🇱**

### Tech Stack
- CI/CD
- Docker
- LangChain
- MongoDB
- Next.js
- Node.js
- OpenAI
- React

### About the Role
#### About Us
Kassa Labs is reinventing how people go from inspiration to reality in home furnishing—a $250B+ industry still stuck in the past. We’ve built an agentic AI commerce experience that turns the chaos of furniture shopping into a single seamless flow, delivering fully styled, instantly shoppable rooms in seconds.

#### The Role: First Hire
- You’ll join right after the founding CTO who built the initial product end-to-end.
- You’ll own core parts of the stack, help shape the system architecture, and lay the foundation for the engineering culture to come.
- This is a rare moment to join a company with momentum and maturity—yet early enough to leave your fingerprints on everything that follows.

### Responsibilities
- Design, develop, and maintain robust and scalable full-stack solutions using Next.js, React, and Node.js.
- Build and deploy AI-powered features utilizing OpenAI and LangChain to enhance user engagement and product capabilities.
- Implement and optimize MongoDB database schemas and queries for performance and scalability.
- Establish and maintain CI/CD pipelines using Docker to ensure seamless and automated deployment processes.
- Collaborate with product and design teams to translate user stories and mockups into functional and performant code.
- Mentor junior developers and contribute to code reviews, fostering a culture of excellence and continuous improvement.
- Troubleshoot and resolve complex technical issues across the entire stack.

### Requirements
- Senior-level experience in Full-Stack software development.
- Proven proficiency in CI/CD, Docker, Next.js, Node.js, OpenAI, PostgreSQL, React, and LangChain.
- Strong communication and collaboration skills.
- Deep understanding of software engineering principles, design patterns, and best practices.
- Experience designing and implementing RESTful APIs.
- Ability to write clean, well-documented, and testable code.
- Bachelor's degree in Computer Science or a related field.

### Nice to Have
- Experience with cloud platforms such as AWS or Google Cloud.
- Familiarity with serverless architectures.
- Contributions to open-source projects.
- Experience with other AI/ML frameworks.

### What We Offer
- Competitive compensation.
- Remote 🇮🇱 work environment.
- Professional growth opportunities.
- Opportunity to work on cutting-edge technologies.
- A collaborative and supportive team environment.
```