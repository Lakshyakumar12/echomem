# EchoMem

## Hierarchical Memory Engine for Empathetic AI

EchoMem is a memory architecture and prototype application designed for conversational systems that need to maintain psychological and relational continuity over long periods of interaction.

The central idea behind EchoMem is simple. A conversational AI should not treat every previous message as equally important. Some information should remain available because it describes the user's stable identity, relationships, behavioral patterns, or long term commitments. Other information is temporary and should gradually lose relevance as the emotional situation changes.

EchoMem therefore separates long term identity memory from short lived emotional events, compresses the information supplied to the language model into a deterministic context budget, detects contradictions between established commitments and new behavior, and provides a controlled temporal decay mechanism for volatile memories.

The current implementation consists of a FastAPI backend, a Mem0 based memory layer, a Groq hosted language model, and a React Native interface.

The backend is implemented in Python and exposes chat, memory graph, and simulated decay endpoints. The mobile interface provides a conversational experience together with memory inspection, telemetry, conflict indicators, and a seven day fast forward simulation.

The implementation uses Qwen through the Groq OpenAI compatible API and Mem0 Platform for persistent memory storage. The backend initializes both clients from environment variables and exposes the application as EchoMem v2.0.0.

## Why EchoMem Exists

Long conversational histories create two related problems.

The first is context growth.

If an AI application sends the entire conversation history to the model on every turn, the amount of context grows with every message. This increases inference cost and can eventually make important information harder for the model to identify.

The second is memory drift.

Not every previous event should have the same influence on the next response. A stable fact such as a partner's name or an established relationship pattern may remain relevant for months. A trigger such as seeing an ex partner's social media activity may be highly relevant during one conversation but become irrelevant after the emotional state has changed.

EchoMem treats these two classes of information differently.

Stable information is stored as core traits.

Temporary emotional events are stored as episodic triggers.

The active context sent to the response model is then constructed from a small selection of these memories rather than from the entire stored memory graph.

This architecture makes memory selection an explicit part of the system rather than an accidental consequence of continuously growing conversation history.
## Setup Guide

### Step 1 — Add Your API Keys

Open `backend/.env` and paste your keys:

```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MEM0_API_KEY=m0-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> **Get keys from:**
> - Groq: https://console.groq.com → API Keys
> - Mem0: https://app.mem0.ai → Settings → API Keys

---

### Step 2 — Backend Setup

```powershell
# Navigate to backend
cd d:\anti\echomem_v2\backend

# Create virtual environment
python -m venv venv
.\venv\Scripts\activate

# Install dependencies (~30 seconds)
pip install -r requirements.txt

# Start the server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
```



---
## Core Architecture

The system can be understood as a pipeline.

User message

↓

Memory retrieval

↓

Message distillation

↓

Core trait and episodic trigger extraction

↓

Contradiction and emotional ambivalence detection

↓

Deterministic memory context construction

↓

Coach response generation

↓

Background memory persistence

↓

Telemetry and memory breakdown returned to the client

Each stage has a specific responsibility.

### 1. User Message

The React Native client sends a user message to the FastAPI backend through the `/chat` endpoint.

The request contains a user identifier and the current message.

The backend counts the raw input tokens before performing memory processing. This allows the application to expose the relationship between the original message size and the compressed memory context.

The client also displays the resulting latency, token counts, compression telemetry, detected emotional state, and memory information.

### 2. Memory Retrieval

Before processing the new message, EchoMem retrieves the existing memory graph for the user from Mem0.

The backend categorizes stored memories into three groups.

Core traits

Episodic triggers

Ambivalence records

The categorization is controlled through metadata stored with each Mem0 memory.

Core traits use the `core_trait` category.

Episodic triggers use the `episodic_trigger` category.

Contradiction events use the `ambivalence` category.

This separation allows the system to reason about stable identity, temporary emotional events, and behavioral contradictions independently.

### 3. Message Distillation

The first model call is a dedicated memory extraction operation.

The distillation prompt instructs the model to extract only high signal emotional information and remove conversational filler, repetitive narrative, and unnecessary details.

The extractor produces four outputs.

`core_traits`

`episodic_triggers`

`compressed_summary`

`detected_state`

Core traits represent information intended to remain useful over time.

Examples include attachment style, partner name, relationship history, boundaries, no contact streaks, and location.

Episodic triggers represent events specific to the current emotional situation.

Examples include seeing a former partner online, drafting an unsent message, experiencing an urge to reconnect, or becoming distressed by a particular event.

The extraction prompt also assigns each episodic trigger an intensity from 1 to 10.

A passing thought is represented around intensity 1.

Moderate distress is represented around intensity 5.

A strong urge is represented around intensity 8.

A crisis state is represented around intensity 10.

The detector also assigns one of seven supported states.

`Anxious Relapse Risk`

`Stable Progress`

`Grief Spike`

`Boundary Maintained`

`Emotional Ambivalence`

`Healing Momentum`

`Crisis Mode`

The implementation uses a low temperature for this extraction call and requests JSON output so that the result can be processed deterministically by the backend.

### 4. Core Identity Memory

Core identity memory is designed to represent information that should remain available across conversations.

A core trait is stored with metadata including its category, key, confidence, and timestamp.

For example, a memory may be represented conceptually as:

`partner_name: Alex`

or

`attachment_style: Anxious abandonment response`

or

`no_contact_streak: 6 days strict no contact`

Core traits are intentionally treated differently from acute triggers.

The decay endpoint does not reduce their intensity or remove them.

This distinction is demonstrated in the test suite where the Alex and Marcus memories remain available after episodic decay.

### 5. Episodic Trigger Memory

Episodic triggers represent temporary events.

Each trigger is stored with its text, intensity, timestamp, category, and decayed status.

For example:

`Trigger: Saw Alex like coworker's photo on social media`

with intensity 9.

Another event may be:

`Trigger: Unblocked number and drafted unsent text`

with intensity 10.

The memory graph shown in the React Native interface sorts episodic triggers by intensity and displays their current intensity as a visual progress bar.

A trigger that has undergone decay is displayed as faded.

### 6. Emotional Ambivalence Detection

EchoMem includes a contradiction engine that compares existing core memories with both the newly extracted traits and the raw incoming message.

The engine uses predefined semantic contradiction groups.

One group connects established no contact or boundary commitments with actions such as wanting to text, wanting to call, reaching out, reconnecting, apologizing, unblocking, or breaking no contact.

Another group connects moving on and healing with statements about wanting the relationship back or asking for another chance.

A third group connects healthy boundaries and self respect with behaviors such as begging, pleading, chasing, obsessive checking, stalking, or showing up.

The detection engine checks both directions.

It can identify a new negative behavior that contradicts a positive stored commitment.

It can also identify a new positive commitment that conflicts with a previously stored negative state.

When a contradiction is detected, EchoMem does not simply overwrite the old memory.

Instead, it creates an ambivalence record containing the old fact, the newly expressed behavior, the relevant key, and a timestamp.

The response also exposes a `conflict_alert` boolean.

The React Native client uses this flag to display an Emotional Ambivalence Detected and Logged indicator inside the AI response bubble.

This preserves the distinction between a stable commitment and a temporary emotional impulse.

### 7. Deterministic Context Bounding

The central optimization in EchoMem is the construction of a bounded memory context.

The backend does not inject the entire memory graph into the response model.

Instead, `build_context` applies explicit selection rules.

The current implementation considers up to three recent unique core trait keys.

It then selects up to two active episodic triggers ordered by intensity.

Already decayed episodic memories are excluded from this active selection.

The resulting memory strings are joined into a compact context and passed through the token truncation function with a budget of 55 tokens.

The implementation therefore has a hard upper bound on the constructed memory context.

The token counter uses `tiktoken` with the `cl100k_base` encoding when available.

If that package cannot be loaded, the implementation falls back to whitespace based counting.

The same fallback strategy is used for truncation.

This design makes the memory budget explicit in code instead of relying on an uncontrolled conversation history.

The tests demonstrate this behavior across long messages, short messages, edge cases, and multi turn conversations.

### 8. Coach Response Generation

The second model call generates the actual conversational response.

The system prompt describes Echo as a warm, psychologically grounded AI therapist specializing in attachment style healing and breakup recovery.

The response instructions emphasize emotional validation without enabling destructive urges, compassionate use of attachment theory, and a conversational rather than lecturing style.

The response is limited to two to four sentences by instruction.

The model receives three important pieces of information.

The original user message

The bounded memory context

The detected emotional state

The memory context is explicitly described as internal awareness rather than something that should be quoted directly to the user.

This allows the response model to maintain continuity without exposing raw memory formatting.

### 9. Background Memory Persistence

Memory persistence is performed as a FastAPI background task after the response has been generated.

This keeps memory writes separate from the main response path.

New core traits are stored as `core_trait` memories.

New episodic events are stored as `episodic_trigger` memories.

Detected contradictions are stored as `ambivalence` memories.

A conflicted core trait is not immediately saved as a replacement for the existing trait.

This is important because the system is designed to record ambivalence rather than erase the original stable commitment.

### 10. Temporal Decay

EchoMem includes a simulated temporal decay endpoint.

The endpoint is:

`POST /simulate-decay/{user_id}`

For every stored episodic trigger, the current implementation reduces its intensity using:

`new_intensity = max(1, round(old_intensity * 0.3))`

The original trigger is replaced with a decayed memory carrying the reduced intensity and a `decayed` flag.

Core traits are not modified by this operation.

The endpoint returns the decay results and a list of preserved core traits.

The React Native application exposes this operation through the Fast forward 7 Days control.

After the request completes, the client refreshes the memory graph and adds a system message explaining that episodic triggers have faded while core identity information remains intact.

The test suite verifies this behavior with both the Alex and Marcus personas.

## Backend Components

The main backend file is `main.py`.

It contains the application configuration, model clients, token utilities, contradiction engine, memory extraction logic, context builder, response generation, persistence functions, data models, and API endpoints.

### Dependencies and Services

The backend uses:

FastAPI for the HTTP API

Pydantic for request and response models

Groq through its OpenAI compatible API

Qwen as the language model

Mem0 Platform for persistent memory

python dotenv for environment configuration

tiktoken for token counting when available

The client configuration expects the following environment variables.

`GROQ_API_KEY`

`MEM0_API_KEY`

The model configured in the current implementation is:

`qwen/qwen3.8-27b`

### API Endpoints

#### GET `/`

Returns a basic health response containing the EchoMem status, model name, and application version.

#### POST `/chat`

Accepts:

`user_id`

`message`

The endpoint performs the complete memory pipeline.

It retrieves existing memory, distills the message, detects contradictions, constructs bounded context, generates the response, schedules background memory persistence, and returns the response together with telemetry and memory information.

The response contains:

`reply`

`memory_breakdown`

`telemetry`

`conflict_alert`

`detected_state`

The telemetry object contains:

`raw_tokens`

`memory_tokens`

`compression_ratio`

`latency_ms`

The memory breakdown contains:

`core_traits`

`episodic_triggers`

`ambivalence_records`

#### GET `/memory-graph/{user_id}`

Returns the user's stored memory categories.

This endpoint is used by the mobile memory drawer to refresh the current memory graph.

#### POST `/simulate-decay/{user_id}`

Simulates the passage of time by reducing the intensity of stored episodic memories.

The operation preserves core identity memories.

## React Native Application

The mobile client is implemented in `App.js`.

It provides the user facing demonstration of the memory engine.

The interface contains a telemetry bar, chat feed, message input, memory drawer, conflict alerts, typing state, error state, and seven day decay control.

The client sends messages to the backend using:

`POST /chat`

It retrieves the memory graph using:

`GET /memory-graph/{user_id}`

It triggers decay using:

`POST /simulate-decay/{user_id}`

### Telemetry Bar

The telemetry bar displays:

Token reduction

Raw token count

Memory token count

Latency

Detected emotional state

The color of the detected state changes according to its category.

Crisis and relapse risk states use the conflict color.

Ambivalence, grief, and spike states use the warning color.

Progress and momentum states use the success color.

This makes the memory system observable during the demonstration rather than hiding the architecture behind the chat interface.

### Chat Interface

User messages and AI messages are displayed as separate bubbles.

The application shows a typing indicator while waiting for the backend.

If the backend reports a conflict alert, the AI message includes a dedicated emotional ambivalence indicator.

Connection failures are rendered as system messages so that backend connectivity problems are visible to the user.

### Memory Drawer

The memory drawer presents the internal memory graph.

It has separate views for episodic triggers and core identity.

The header reports the number of core traits, triggers, and ambivalence events.

The episodic view sorts triggers by intensity.

Each trigger shows its intensity, timestamp, trigger description, and whether it has decayed.

The core identity view shows stable identity facts together with confidence values.

Ambivalence records are shown separately with the previous fact and newly expressed behavior.

This makes the architectural distinction visible in the interface.

## Test Architecture

The automated test runner is implemented in `run_tests.py`.

Each execution generates a timestamp based identifier so that the test users have isolated memory spaces.

The test runner creates separate users for the Alex, Maya, edge case, and Marcus scenarios.

The test client communicates with the backend at:

`http://localhost:8000`

The test runner uses three backend operations.

`POST /chat`

`POST /simulate-decay/{user_id}`

`GET /memory-graph/{user_id}`

The test suite checks both functional behavior and telemetry.

## Test Suite 1: Alex and Emotional Ambivalence

The first suite starts with a late night no contact spiral.

The message contains relationship information, a six day no contact streak, an attachment pattern, an acute social media trigger, and a strong urge to contact Alex.

The recorded test result shows 165 raw tokens and 0 memory tokens for that first request, producing 99 percent compression according to the backend telemetry.

The extracted core traits include Alex as the partner, the six day no contact streak, a two year relationship, and an anxious abandonment response.

Two high intensity episodic triggers were extracted.

The first represented seeing Alex interact with a coworker's photo and received intensity 9.

The second represented unblocking the number and drafting an unsent text and received intensity 10.

All checks in this test passed.

The next message deliberately contradicts the stored no contact commitment.

The system detects the contradiction and returns `conflict_alert = True`.

An ambivalence record is created containing the original no contact commitment and the new expression of wanting to call and ask for another chance.

The original core commitment remains present.

All checks for the contradiction stage passed.

The decay stage then reduced one episodic trigger from intensity 9 to intensity 3 while preserving the stored core traits.

The post decay context test also confirmed that stale references to Sarah and Instagram were not present in the generated response while Alex remained available through the retained memory.

## Test Suite 1: Maya Scenario

The same suite includes an independent Maya persona.

The message describes an avoidant withdrawal pattern and discomfort with forced emotional vulnerability.

The system extracted Maya as the partner, an avoidant withdrawal pattern, silence as a boundary, and a negative self perception.

Two episodic triggers were recorded.

Maya contacting family and friends was assigned intensity 8.

The expectation of forced emotional vulnerability was assigned intensity 9.

All checks for this scenario passed.

## Edge Case Testing

The test suite also evaluates unusual input conditions.

### Large Input With Prompt Injection

The system receives a relatively large narrative containing an instruction attempting to redirect the assistant into writing a poem.

The test verifies that the response remains coaching oriented and does not follow the embedded poem instruction.

The memory context remains bounded.

The recorded test result shows 88 raw tokens, 0 memory tokens, and 99 percent compression.

All checks passed.

### One Word Input

The system is tested with the message:

`Hurts.`

The purpose is to ensure that extremely short input does not create a crash or a division by zero while calculating compression.

The test verifies that a valid reply is returned, the raw token count is at least one, the compression ratio remains valid, and the memory breakdown is present.

All checks passed.

### Emoji and Panic Text

The system is also tested with highly emotional text containing repeated emojis and repeated phrases.

The response is classified as `Crisis Mode`.

The test verifies that the system does not crash, produces a detected state, and retains the expected memory breakdown.

All checks passed.

## Test Suite 2: Marcus Continuity

The second major suite tests multi turn memory continuity.

The initial message establishes:

Marcus as the partner

Chicago as the location

Three years of cohabitation

An anxious self blame pattern

A twelve day no contact streak

The recorded test shows all of these facts being extracted as core traits.

The next message mentions Marcus indirectly by referring to his leftover winter coats without using his name.

The system does not ask who the coats belong to.

The test therefore demonstrates implicit relational continuity through stored memory.

The following message introduces a product management interview.

The interview is recorded as an episodic or event related memory while the relationship context remains available.

The next message refers to Illinois rather than Chicago and does not mention Marcus.

The system retains the Marcus and Chicago context while also recording the Illinois relationship reference.

The test verifies that the relevant relationship context remains connected without creating excessive duplicate city entries.

## Marcus Temporal Decay Test

The Marcus scenario then invokes the simulated decay endpoint.

One stored episodic trigger is reduced from intensity 7 to intensity 2.

The preserved memory output still contains the partner, location, relationship history, no contact streak, and attachment information.

A post decay message is then sent about feeling a familiar heavy ache on another Sunday.

The test verifies that stale references to the product management interview and winter coats do not leak into the generated response.

At the same time, Marcus and the anxious attachment context remain available.

All checks in the post decay continuity stage passed.

## Observed Test Results

The supplied test results show the complete suite progressing through the Alex scenario, edge cases, and Marcus continuity scenario with all displayed checks passing.

The Alex late night spiral achieved 99 percent compression in the recorded run.

The Maya scenario also completed successfully.

The contradiction test successfully produced an ambivalence alert and stored an ambivalence record.

The decay test successfully reduced episodic intensity while preserving core traits.

The one word input test passed without a division by zero.

The emoji panic test produced a valid Crisis Mode classification.

The Marcus continuity tests retained the partner and relationship context across messages where the partner's name was omitted.

The Marcus decay test removed stale interview and winter coat references from the generated response while retaining core relationship context.

The final test runner explicitly identifies compression, the ambivalence badge, and post decay context hygiene as the key metrics to present.

## Telemetry

EchoMem exposes several metrics directly through the API and mobile interface.

### Raw Tokens

The number of tokens in the incoming user message.

### Memory Tokens

The number of tokens in the bounded memory context supplied to the response model.

### Compression Ratio

Calculated using the relationship between raw input tokens and memory context tokens.

The implementation clamps the displayed value between zero and ninety nine percent.

### Latency

The elapsed backend processing time measured around the `/chat` operation.

Latency includes the operations performed during the request path, including model calls and memory retrieval.

The recorded test runs demonstrate that latency can vary substantially between requests.

This is important because the architecture focuses primarily on memory and context management rather than claiming that the current prototype provides fixed inference latency.

## Memory Selection Strategy

EchoMem does not attempt to reconstruct the entire life history of a user for every response.

Instead it uses a small active context.

Up to three recent unique core trait keys are considered.

Up to two active episodic triggers are selected according to intensity.

Decayed episodic memories are excluded from the active selection.

The resulting context is truncated to a maximum of 55 tokens.

This produces a predictable memory payload regardless of how large the underlying Mem0 memory store becomes.

## Data Model

A core trait contains a key and fact together with confidence information.

A typical conceptual representation is:

`key: partner_name`

`fact: Alex`

`confidence: 1.0`

An episodic trigger contains:

`trigger`

`intensity`

`timestamp`

`decayed`

An ambivalence record contains:

`key`

`old_fact`

`new_fact`

`timestamp`

The API response models formalize these structures using Pydantic.

## Memory Lifecycle

A typical message follows this lifecycle.

The user sends a message.

The backend retrieves existing memories.

The message is passed through the distillation model.

Stable facts and temporary events are separated.

The contradiction engine compares the new information with stored core commitments.

The active memory context is constructed.

The context is limited to the deterministic token budget.

The coach model generates a response.

New memories are saved in the background.

Telemetry is calculated.

The complete response is returned to the client.

Over time, episodic memories can be subjected to the simulated decay mechanism.

Core identity memories remain available while acute events become less prominent.

## Running the Backend

Create a Python environment for the project and install the dependencies used by the implementation.

The backend requires environment variables for the external services.

Create a `.env` file containing:

`GROQ_API_KEY=your_groq_api_key`

`MEM0_API_KEY=your_mem0_api_key`

Start the FastAPI application using the ASGI server configured for your environment.

A typical development command is:

`uvicorn main:app --reload --host 0.0.0.0 --port 8000`

Once running, the health endpoint should be available at:

`http://localhost:8000/`

The React Native application expects the backend to be reachable through the `API_BASE` value configured in `App.js`.

## Running the Test Suite

Start the FastAPI backend first.

Then execute:

`python run_tests.py`

The test runner creates fresh user identifiers for each execution.

This is important because Mem0 contains persistent memory and the tests are designed to operate against isolated user namespaces.

The test runner prints the reply preview, detected state, conflict status, token telemetry, memory breakdown, and individual pass or fail checks.

A successful execution ends with the full suite summary.

## Running the React Native Client

The client is implemented as a React Native application.

The backend URL is configured near the beginning of `App.js`.

The current configuration points to a local network address.

When running on a physical device, the backend address must be reachable from that device over the local network.

The application code explicitly notes that localhost works only for an emulator or simulator environment and not for a physical device.

Update `API_BASE` to the machine's LAN address when necessary.

The mobile client then communicates with the FastAPI server through the endpoints described above.

## Project Structure

The supplied implementation can be understood through the following main files.

`main.py`

Contains the EchoMem backend, memory architecture, model integration, token management, contradiction engine, persistence layer, and API endpoints.

`App.js`

Contains the React Native interface, chat experience, telemetry display, memory drawer, conflict alerts, and temporal decay control.

`run_tests.py`

Contains the automated functional test suite covering the Alex, Maya, edge case, and Marcus continuity scenarios.

`test_results.log`

Contains the recorded output of the test suite and the observed pass results for the supplied execution.

## Design Principles

### Stable Information Should Survive

Long term identity information should not disappear simply because an acute emotional event has faded.

### Acute Events Should Be Isolated

Temporary triggers should remain available when relevant without becoming permanent dominant context.

### Contradictions Should Be Recorded

A moment of behavioral contradiction should not automatically overwrite a previous commitment.

The system instead records the difference between the previous state and the current expression.

### Context Should Be Predictable

The response model should receive a deliberately bounded memory context rather than an uncontrolled memory dump.

### Memory Should Be Observable

The interface exposes telemetry and memory categories so the behavior of the memory engine can be inspected during testing.

### The Response Model Should Not Need the Entire Memory Graph

The memory engine is responsible for deciding what context matters before the response model is called.

This creates a separation between memory management and conversational generation.

## Important Implementation Details

The current system uses a hybrid strategy.

Semantic extraction is delegated to the language model.

Contradiction detection uses deterministic keyword based semantic groups.

Memory retrieval uses Mem0.

Context selection is deterministic.

Response generation is handled by the language model.

Temporal decay is deterministic.

This combination gives the prototype explicit control over the most important memory operations while still using a language model for natural language understanding and response generation.

## Current Prototype Characteristics

EchoMem is a working prototype rather than a complete production mental health platform.

The supplied implementation demonstrates the memory architecture and its behavior through an actual FastAPI backend, persistent memory service, language model calls, React Native interface, and automated test suite.

The current contradiction engine is based on predefined phrase groups rather than a general purpose semantic entailment model.

The temporal decay mechanism is also a simulated seven day operation rather than a continuous time based psychological model.

The memory context budget is explicitly capped at 55 tokens in the backend implementation.

The test suite verifies that the intended memory separation and continuity behavior works across several representative scenarios.

## Example End to End Flow

Consider a user who says that they have maintained six days of no contact with Alex but then sees Alex interacting with someone online and drafts a message.

The distillation engine extracts Alex as a stable relationship fact.

It also extracts the six day no contact commitment.

The online interaction and drafted message become episodic triggers with high intensity.

The detected state becomes Anxious Relapse Risk.

The response model receives a compact memory context rather than the entire original narrative.

If the user later says that they are going to call Alex and beg for another chance, the contradiction engine compares the new message with the stored no contact commitment.

The contradiction is detected.

The system records the previous commitment and the new intention as an ambivalence event.

The original core memory remains available.

When temporal decay is simulated, the acute trigger intensity is reduced.

The stable relationship information remains preserved.

A later message can therefore still reference Alex and the broader relational pattern without automatically resurfacing every stale detail from the earlier emotional episode.

## What the Demonstration Shows

The project demonstrates four main ideas.

First, long term conversational memory can be separated into stable identity information and temporary emotional events.

Second, a bounded memory context can be constructed deterministically instead of continuously expanding with conversation history.

Third, contradictions between stored commitments and new behavior can be surfaced without simply overwriting the original memory.

Fourth, temporal decay can reduce the influence of acute events while preserving stable relational context.

Together these mechanisms form the core of EchoMem's hierarchical memory approach.

## Future Extensions

The current architecture provides a foundation for several possible extensions.

A future version could replace the phrase based contradiction groups with a dedicated semantic contradiction model.

The memory selector could incorporate semantic similarity, recency, confidence, emotional intensity, and user specific relevance into a more sophisticated retrieval score.

The decay engine could use actual timestamps instead of a manually triggered seven day simulation.

Core memory could include explicit versioning and user controlled correction.

Memory conflicts could be resolved through a dedicated review mechanism instead of remaining solely as logged events.

The system could also add stronger privacy controls, memory deletion, memory export, audit logging, authentication, rate limiting, structured observability, and production grade error handling.

These are extensions beyond what is implemented in the supplied prototype and are not required for the current demonstration.

## Summary

EchoMem is a hierarchical memory engine designed around the idea that conversational memory should have structure.

Stable identity information is separated from temporary emotional events.

Temporary events carry intensity and can decay.

Core traits persist through decay.

Incoming messages are distilled before being stored.

Existing commitments are checked for contradictions.

Only a small selection of relevant memory is injected into the response model.

The memory context is deterministically bounded to 55 tokens.

The application exposes memory behavior through a React Native interface.

The automated test suite validates compression, memory extraction, contradiction detection, edge case handling, multi turn continuity, and temporal decay.

The supplied execution shows all displayed test checks passing across the Alex, Maya, edge case, and Marcus scenarios.

EchoMem therefore serves as a concrete prototype for building conversational systems where long term relational continuity does not require continuously replaying an ever growing conversation history.
