import Groq from "groq-sdk";
import { NextRequest } from "next/server";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are BlueprintAI, an expert database architect specialized in Supabase and PostgreSQL.

Your job is to help developers design production-ready database schemas through conversation.

## Your behavior:
- Ask ONE smart question at a time — never a list of questions
- Each question should uncover the most important missing information
- Be conversational and friendly, but professional
- After each answer, internally assess if you have enough context

## You need to gather:
- Core business idea and purpose
- Main actors/user types
- Main entities and resources
- Relationships between entities
- Multi-tenancy requirements (single org vs multiple orgs/teams)
- Authentication needs
- Key business rules or constraints

## When to generate:
When you have enough context to design a solid schema, stop asking and say exactly:
"I have everything I need. Generating your schema now..."

Then immediately output:

### Conversation Summary
[summarize what was gathered]

### Schema SQL
\`\`\`sql
[CREATE TABLE statements, production-ready for Supabase]
\`\`\`

### Migration File
\`\`\`sql
[same SQL wrapped as a migration with a comment header]
\`\`\`

## Rules:
- Always include id (uuid), created_at, updated_at on every table
- Always include RLS enable statement for every table
- Use snake_case for all names
- Never generate until you have enough context
- Never ask more than one question at a time
- The app uses Supabase Auth — never create tables with email/password fields
- Never create tables with email/password fields — the app uses Supabase Auth
- User-related tables should reference auth.users(id) ON DELETE CASCADE
- Always use: id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE for user profile tables
- Always use TIMESTAMPTZ not TIMESTAMP
- Always add DEFAULT gen_random_uuid() on UUID primary keys that don't reference auth.users`;


const MAX_MESSAGES = 50;
const MAX_CONTENT_LENGTH = 8000;

type IncomingMessage = { role: "user" | "assistant"; content: string };

function validateMessages(input: unknown): IncomingMessage[] | string {
  if (!input || typeof input !== "object") return "Invalid request body.";
  const messages = (input as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return "`messages` must be an array.";
  if (messages.length === 0) return "`messages` must contain at least one message.";
  if (messages.length > MAX_MESSAGES) return `Too many messages (max ${MAX_MESSAGES}).`;

  const valid: IncomingMessage[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") return "Each message must be an object.";
    const msg = m as { role?: unknown; content?: unknown };
    if (msg.role !== "user" && msg.role !== "assistant") {
      return 'Each message must have role "user" or "assistant".';
    }
    if (typeof msg.content !== "string") return "Each message must have string content.";
    if (msg.content.length === 0) return "Message content cannot be empty.";
    if (msg.content.length > MAX_CONTENT_LENGTH) {
      return `Message content too long (max ${MAX_CONTENT_LENGTH} chars).`;
    }
    valid.push({ role: msg.role, content: msg.content });
  }
  return valid;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const validated = validateMessages(body);
  if (typeof validated === "string") {
    return Response.json({ error: validated }, { status: 400 });
  }

  let completion;
  try {
    completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...validated,
      ],
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
    });
  } catch (err) {
    console.error("Groq API error:", err);
    return Response.json(
      { error: "AI service is temporarily unavailable. Please try again." },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (err) {
        console.error("Groq stream error:", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}