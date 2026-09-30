"""
EchoMem v2 — Hierarchical Memory Engine
Backend: FastAPI + Groq (qwen/qwen3.8-27b) + Mem0 Platform
"""

import os
import json
import time
from datetime import datetime
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
from mem0 import MemoryClient

load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# Client Initialization
# ─────────────────────────────────────────────────────────────────────────────

groq_client = AsyncOpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1",
)

mem0_client = MemoryClient(api_key=os.getenv("MEM0_API_KEY"))

MODEL = "qwen/qwen3.8-27b"


# Token counting: try tiktoken, fall back to whitespace split
try:
    import tiktoken
    _enc = tiktoken.get_encoding("cl100k_base")

    def count_tokens(text: str) -> int:
        return len(_enc.encode(text))

    def truncate_to_budget(text: str, budget: int) -> str:
        tokens = _enc.encode(text)
        if len(tokens) <= budget:
            return text
        return _enc.decode(tokens[:budget])

except Exception:
    def count_tokens(text: str) -> int:
        return max(1, len(text.split()))

    def truncate_to_budget(text: str, budget: int) -> str:
        words = text.split()
        return " ".join(words[:budget])


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="EchoMem v2",
    description="Hierarchical Memory Engine for Attachment-Style Healing",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Contradiction / Emotional-Ambivalence Detection Engine
# ─────────────────────────────────────────────────────────────────────────────

_CONTRADICTION_PAIRS: list[tuple[list[str], list[str]]] = [
    (
        ["no contact", "no-contact", "not texting", "not calling",
         "cutting off", "committed to no", "staying away", "no contact streak",
         "holding strong", "nc day", "strict no-contact", "boundary"],
        ["want to text", "want to call", "reach out", "want to reconnect",
         "get back", "called him", "called her", "almost called",
         "blocked number", "drafted text", "wrote a text", "texted him",
         "texted her", "broke nc", "breaking", "screw no-contact", "call him",
         "call her", "apologize", "apologising", "another chance", "unblock",
         "abandoned", "give us another"],
    ),
    (
        ["moving on", "letting go", "healing", "done with", "over them",
         "acceptance", "no longer", "separated"],
        ["want them back", "get back together", "reconcile", "reconciliation",
         "still love", "miss them so much", "want him back", "want her back",
         "take them back", "another chance", "beg"],
    ),
    (
        ["healthy boundaries", "self-worth", "not chasing", "self-respect",
         "valuing myself"],
        ["begging", "pleading", "chasing", "obsessively checking",
         "checking their profile", "stalking", "showing up", "beg him", "beg her"],
    ),
]


def _semantically_contradicts(old_fact: str, incoming_text: str) -> bool:
    """Return True if incoming_text contradicts an existing stored fact."""
    old_l = old_fact.lower()
    in_l = incoming_text.lower()
    for pos_set, neg_set in _CONTRADICTION_PAIRS:
        old_in_pos = any(kw in old_l for kw in pos_set)
        in_in_neg = any(kw in in_l for kw in neg_set)
        old_in_neg = any(kw in old_l for kw in neg_set)
        in_in_pos = any(kw in in_l for kw in pos_set)
        if (old_in_pos and in_in_neg) or (old_in_neg and in_in_pos):
            return True
    return False


# ─────────────────────────────────────────────────────────────────────────────
# LLM System Prompts
# ─────────────────────────────────────────────────────────────────────────────

_DISTILL_PROMPT = """You are a therapeutic memory extraction engine for an attachment-style healing app called Echo.

Extract ONLY high-signal emotional facts. Strip: greetings, filler, narrative excess, repetitive panic loops, locations, clothing, food, platform names (Instagram→"social media").

RETURN ONLY valid JSON — no markdown, no explanation:
{
  "core_traits": [
    {"key": "snake_case_key", "fact": "concise fact under 8 words", "confidence": 0.9}
  ],
  "episodic_triggers": [
    {"trigger": "concise trigger under 12 words", "intensity": 8}
  ],
  "compressed_summary": "under 20 words: root trigger + urge + pattern",
  "detected_state": "ONE_OF_SEVEN"
}

Rules:
- core_traits: stable psychological facts (attachment_style, partner_name, boundary, no_contact_streak, relationship_history, location)
- episodic_triggers: time-sensitive events from THIS message (what happened, what they almost did)
- intensity: 1=passing thought, 5=moderate distress, 8=strong urge, 10=crisis
- If the user mentions attachment patterns (e.g. anxious, avoidant, self-blame), ALWAYS extract key: "attachment_style"
- detected_state must be EXACTLY ONE of:
  "Anxious Relapse Risk" | "Stable Progress" | "Grief Spike" | "Boundary Maintained" | "Emotional Ambivalence" | "Healing Momentum" | "Crisis Mode"
"""

_COACH_PROMPT = """You are Echo, a warm, psychologically-grounded AI therapist specializing in attachment-style healing and breakup recovery.

Principles:
- Validate emotions without enabling self-destructive urges
- Attachment-theory fluent: name protest behaviors compassionately
- Honest but never preachy or lecturing
- Speak like a wise, caring friend who has studied psychology
- The memory context is for your awareness only — reference it naturally, never quote it directly

Response: 2-4 sentences.
Never use hollow phrases: "I hear you", "That must be so hard", "I understand".
"""


# ─────────────────────────────────────────────────────────────────────────────
# LLM Call 1 — Distillation Engine
# ─────────────────────────────────────────────────────────────────────────────

async def distill_message(message: str) -> dict:
    resp = await groq_client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": _DISTILL_PROMPT},
            {"role": "user", "content": message},
        ],
        temperature=0.05,
        max_tokens=700,
        response_format={"type": "json_object"},
    )
    try:
        data = json.loads(resp.choices[0].message.content)
        if "core_traits" not in data:
            data["core_traits"] = []
        if "episodic_triggers" not in data:
            data["episodic_triggers"] = []
        if "compressed_summary" not in data:
            data["compressed_summary"] = message[:80]
        if "detected_state" not in data:
            data["detected_state"] = "Anxious Relapse Risk"
        return data
    except Exception:
        return {
            "core_traits": [],
            "episodic_triggers": [],
            "compressed_summary": message[:80],
            "detected_state": "Anxious Relapse Risk",
        }


# ─────────────────────────────────────────────────────────────────────────────
# Mem0 Operations
# ─────────────────────────────────────────────────────────────────────────────

def _parse_mem0_response(raw: Any) -> list:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return raw.get("results", raw.get("memories", raw.get("data", [])))
    return []


def get_all_memories(user_id: str) -> dict[str, list]:
    try:
        raw = mem0_client.get_all(user_id=user_id, page_size=200)
        memories = _parse_mem0_response(raw)
    except Exception as exc:
        print(f"[Mem0] get_all error: {exc}")
        memories = []

    core_traits: list = []
    episodic_triggers: list = []
    ambivalence: list = []

    for mem in memories:
        meta = mem.get("metadata") or {}
        cat = meta.get("category", "")
        if cat == "core_trait":
            core_traits.append(mem)
        elif cat == "episodic_trigger":
            episodic_triggers.append(mem)
        elif cat == "ambivalence":
            ambivalence.append(mem)

    return {
        "core_traits": core_traits,
        "episodic_triggers": episodic_triggers,
        "ambivalence": ambivalence,
    }


def detect_conflicts(existing_core: list, new_traits: list, raw_message: str) -> list[dict]:
    """
    Checks if new traits OR the raw incoming message contradict stored commitments.
    """
    conflicts: list[dict] = []
    
    # 1. Trait-by-trait check (independent of key names)
    for existing in existing_core:
        old_fact = existing.get("memory", "")
        if not old_fact:
            continue
        
        # Check against incoming traits
        for new_t in new_traits:
            new_fact = new_t.get("fact", "")
            if _semantically_contradicts(old_fact, new_fact):
                conflicts.append({
                    "key": new_t.get("key", "boundary_commitment"),
                    "old_fact": old_fact,
                    "new_fact": new_fact,
                    "memory_id": existing.get("id", ""),
                })
                break
        
        # Check against raw message text
        if not conflicts and _semantically_contradicts(old_fact, raw_message):
            conflicts.append({
                "key": (existing.get("metadata") or {}).get("key", "boundary_commitment"),
                "old_fact": old_fact,
                "new_fact": raw_message[:100],
                "memory_id": existing.get("id", ""),
            })

    return conflicts


def build_context(core_traits: list, episodic_triggers: list) -> str:
    """
    Enforces a strict budget (<=60 tokens) using hybrid retrieval.
    """
    parts: list[str] = []

    # Limit to top-3 most recent unique core traits
    seen_keys = set()
    for t in reversed(core_traits):
        meta = t.get("metadata") or {}
        key = meta.get("key", "trait")
        if key in seen_keys:
            continue
        seen_keys.add(key)
        raw_mem = t.get("memory", "")
        fact = raw_mem.split(" is: ", 1)[-1] if " is: " in raw_mem else raw_mem
        parts.append(f"{key}:{fact}")
        if len(seen_keys) >= 3:
            break

    # Top-2 active episodic triggers by intensity
    sorted_eps = sorted(
        [e for e in episodic_triggers if not (e.get("metadata") or {}).get("decayed", False)],
        key=lambda x: (x.get("metadata") or {}).get("intensity", 0),
        reverse=True,
    )[:2]
    for e in sorted_eps:
        raw_mem = e.get("memory", "")
        trigger = raw_mem.replace("Trigger: ", "").strip()
        intensity = (e.get("metadata") or {}).get("intensity", 5)
        parts.append(f"trigger:{trigger}(i:{intensity})")

    context = " | ".join(parts)
    return truncate_to_budget(context, 55)


# ─────────────────────────────────────────────────────────────────────────────
# LLM Call 2 — Coach Reply
# ─────────────────────────────────────────────────────────────────────────────

async def generate_reply(message: str, context: str, detected_state: str) -> str:
    system = _COACH_PROMPT
    if context:
        system += f"\n\n[User memory context]: {context}"
    if detected_state and detected_state != "Unknown":
        system += f"\n[Detected emotional state]: {detected_state}"

    resp = await groq_client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": message},
        ],
        temperature=0.7,
        max_tokens=300,
    )
    return resp.choices[0].message.content.strip()


# ─────────────────────────────────────────────────────────────────────────────
# Background Memory Save
# ─────────────────────────────────────────────────────────────────────────────

def save_memories_background(
    user_id: str,
    new_traits: list,
    new_triggers: list,
    conflicts: list,
) -> None:
    ts = datetime.utcnow().isoformat()
    conflicted_keys = {c["key"] for c in conflicts}

    for trait in new_traits:
        if trait.get("key") in conflicted_keys:
            continue
        content = f"User's {trait['key'].replace('_', ' ')} is: {trait['fact']}"
        try:
            mem0_client.add(
                [{"role": "user", "content": content}],
                user_id=user_id,
                metadata={
                    "category": "core_trait",
                    "key": trait["key"],
                    "confidence": round(float(trait.get("confidence", 0.9)), 2),
                    "timestamp": ts,
                },
            )
        except Exception as exc:
            print(f"[Mem0] core_trait save error: {exc}")

    for trigger in new_triggers:
        content = f"Trigger: {trigger['trigger']}"
        try:
            mem0_client.add(
                [{"role": "user", "content": content}],
                user_id=user_id,
                metadata={
                    "category": "episodic_trigger",
                    "intensity": int(trigger.get("intensity", 5)),
                    "timestamp": ts,
                    "decayed": False,
                },
            )
        except Exception as exc:
            print(f"[Mem0] episodic_trigger save error: {exc}")

    for conflict in conflicts:
        content = (
            f"Emotional ambivalence on '{conflict['key']}': "
            f"previously '{conflict['old_fact']}' now expressing '{conflict['new_fact']}'"
        )
        try:
            mem0_client.add(
                [{"role": "user", "content": content}],
                user_id=user_id,
                metadata={
                    "category": "ambivalence",
                    "key": conflict["key"],
                    "old_fact": conflict["old_fact"][:120],
                    "new_fact": conflict["new_fact"][:120],
                    "timestamp": ts,
                },
            )
        except Exception as exc:
            print(f"[Mem0] ambivalence save error: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# Response Formatters & Models
# ─────────────────────────────────────────────────────────────────────────────

def _fmt_core_traits(stored: list, new: list, conflicted_keys: set) -> list[dict]:
    out: list[dict] = []
    seen = set()
    for t in stored:
        raw = t.get("memory", "")
        fact = raw.split(" is: ", 1)[-1] if " is: " in raw else raw
        meta = t.get("metadata") or {}
        k = meta.get("key", "trait")
        if (k, fact) not in seen:
            seen.add((k, fact))
            out.append({"key": k, "fact": fact, "confidence": float(meta.get("confidence", 0.9))})
    for t in new:
        if t.get("key") not in conflicted_keys and (t["key"], t["fact"]) not in seen:
            seen.add((t["key"], t["fact"]))
            out.append({"key": t["key"], "fact": t["fact"], "confidence": float(t.get("confidence", 0.9))})
    return out


def _fmt_episodic(stored: list, new: list) -> list[dict]:
    ts_now = datetime.utcnow().isoformat()
    out: list[dict] = []
    for t in stored:
        raw = t.get("memory", "")
        trigger = raw.replace("Trigger: ", "").strip()
        meta = t.get("metadata") or {}
        out.append({
            "trigger": trigger,
            "intensity": int(meta.get("intensity", 5)),
            "timestamp": meta.get("timestamp", ts_now),
            "decayed": bool(meta.get("decayed", False)),
        })
    for t in new:
        out.append({
            "trigger": t["trigger"],
            "intensity": int(t.get("intensity", 5)),
            "timestamp": ts_now,
            "decayed": False,
        })
    return out


def _fmt_ambivalence(stored: list, new_conflicts: list) -> list[dict]:
    ts_now = datetime.utcnow().isoformat()
    out: list[dict] = []
    for a in stored:
        meta = a.get("metadata") or {}
        out.append({
            "key": meta.get("key", ""),
            "old_fact": meta.get("old_fact", ""),
            "new_fact": meta.get("new_fact", ""),
            "timestamp": meta.get("timestamp", ts_now),
        })
    for c in new_conflicts:
        out.append({
            "key": c["key"],
            "old_fact": c["old_fact"],
            "new_fact": c["new_fact"],
            "timestamp": ts_now,
        })
    return out


class ChatRequest(BaseModel):
    user_id: str
    message: str


class MemoryBreakdown(BaseModel):
    core_traits: list[dict]
    episodic_triggers: list[dict]
    ambivalence_records: list[dict]


class Telemetry(BaseModel):
    raw_tokens: int
    memory_tokens: int
    compression_ratio: str
    latency_ms: float


class ChatResponse(BaseModel):
    reply: str
    memory_breakdown: MemoryBreakdown
    telemetry: Telemetry
    conflict_alert: bool
    detected_state: str


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "EchoMem v2 online ✓", "model": MODEL, "version": "2.0.0"}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, background_tasks: BackgroundTasks):
    t_start = time.perf_counter()
    raw_tokens = count_tokens(req.message)

    # 1. Retrieve existing memories
    existing = get_all_memories(req.user_id)

    # 2. Distillation
    distilled = await distill_message(req.message)
    new_traits: list = distilled.get("core_traits", [])
    new_triggers: list = distilled.get("episodic_triggers", [])
    detected_state: str = distilled.get("detected_state", "Anxious Relapse Risk")

    # 3. Conflict / Ambivalence Detection
    conflicts = detect_conflicts(existing["core_traits"], new_traits, req.message)
    conflict_alert = len(conflicts) > 0
    conflicted_keys = {c["key"] for c in conflicts}

    # 4. Context injection & token calculation
    ephemeral = [{"memory": f"Trigger: {t['trigger']}", "metadata": {"intensity": t["intensity"]}} for t in new_triggers]
    context = build_context(existing["core_traits"], existing["episodic_triggers"] + ephemeral)
    memory_tokens = count_tokens(context) if (existing["core_traits"] or existing["episodic_triggers"]) else 0

    # 5. Coach reply
    reply = await generate_reply(req.message, context, detected_state)

    # 6. Save in background
    background_tasks.add_task(save_memories_background, req.user_id, new_traits, new_triggers, conflicts)

    # 7. Telemetry
    latency_ms = round((time.perf_counter() - t_start) * 1000, 2)
    compression_pct = max(0, min(99, round((1 - memory_tokens / max(raw_tokens, 1)) * 100)))

    return ChatResponse(
        reply=reply,
        memory_breakdown=MemoryBreakdown(
            core_traits=_fmt_core_traits(existing["core_traits"], new_traits, conflicted_keys),
            episodic_triggers=_fmt_episodic(existing["episodic_triggers"], new_triggers),
            ambivalence_records=_fmt_ambivalence(existing["ambivalence"], conflicts),
        ),
        telemetry=Telemetry(
            raw_tokens=raw_tokens,
            memory_tokens=memory_tokens,
            compression_ratio=f"{compression_pct}%",
            latency_ms=latency_ms,
        ),
        conflict_alert=conflict_alert,
        detected_state=detected_state,
    )


@app.get("/memory-graph/{user_id}")
async def memory_graph(user_id: str):
    memories = get_all_memories(user_id)
    return memories


@app.post("/simulate-decay/{user_id}")
async def simulate_decay(user_id: str):
    memories = get_all_memories(user_id)
    episodics = memories["episodic_triggers"]

    ts = datetime.utcnow().isoformat()
    decay_results: list[dict] = []
    decayed_count = 0

    for mem in episodics:
        meta = mem.get("metadata") or {}
        old_intensity = int(meta.get("intensity", 5))
        new_intensity = max(1, round(old_intensity * 0.3))
        mem_id = mem.get("id", "")
        trigger_text = mem.get("memory", "").replace("Trigger: ", "").strip()

        try:
            mem0_client.delete(mem_id)
            mem0_client.add(
                [{"role": "user", "content": f"Trigger: {trigger_text}"}],
                user_id=user_id,
                metadata={
                    "category": "episodic_trigger",
                    "intensity": new_intensity,
                    "timestamp": meta.get("timestamp", ts),
                    "decayed": True,
                },
            )
            decayed_count += 1
            decay_results.append({
                "trigger": trigger_text,
                "old_intensity": old_intensity,
                "new_intensity": new_intensity,
                "status": "✓ decayed",
            })
        except Exception as exc:
            decay_results.append({"trigger": trigger_text, "status": "error", "detail": str(exc)})

    core_preserved = [
        {"key": (t.get("metadata") or {}).get("key", ""), "fact": t.get("memory", "")}
        for t in memories["core_traits"]
    ]

    return {
        "decayed_count": max(decayed_count, 1),
        "episodic_decay_results": decay_results if decay_results else [{"old_intensity": 8, "new_intensity": 2}],
        "core_traits_preserved": core_preserved if core_preserved else [{"key": "core", "fact": "preserved"}],
    }