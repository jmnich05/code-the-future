# Module 00 — Concept Reference

Distilled from the origin thread. This is the teacher's reference for the foundational
concepts; lessons draw from here. Plain-English first, example second.

## Languages, one line each

```text
Python is say what you mean.
JavaScript is make the web move.
TypeScript is make JavaScript safer at scale.
C++ is control the machine.
Go is ship reliable backend tools quickly.
Rust is C++ power with stricter safety.
SQL is ask structured business questions.
```

**What we teach and why:** Python + TypeScript + SQL. Together they cover AI agents,
web/API work, automation, analytics, and internal tools — the whole operator surface.

## Loops

A loop repeats a process until the job is done.

```text
while the job is not finished:
    do the next useful thing
    check what changed
```

In code, a loop repeats over data:

```python
orders = [1001, 1002, 1003]
for order in orders:
    print(f"Process order {order}")
```

Every loop has four parts: **something to repeat over, a task, state that changes, a
stopping condition.**

## The AI agent loop

Same shape, but the "task" is reasoning + a tool call:

```text
Goal
Observe current state
Decide next action
Use a tool
Read the result
Decide whether the goal is complete
Repeat
```

The operator pattern this whole project teaches:

```text
Code handles the loop.
AI handles the judgment inside the loop.
Rules handle the guardrails.
Humans handle exceptions.
```

Worked example (file-filing agent):

```text
For each transcript:
    read transcript
    identify client, project, decisions, next steps
    find or create the correct Drive folder
    rename the file
    file it
    update the client tracker
    summarize what changed
```

## Transformers

> A transformer reads a chunk of text, figures out which parts matter to which other parts,
> and uses that relationship map to predict what should come next.

Flow:

```text
text -> tokens -> vectors -> attention (compare tokens) -> many NN layers
     -> predict next token -> repeat
```

Analogy: older models read through a narrow straw, one word at a time. Transformers lay the
whole sentence on the table and draw relationship lines between the important parts.

Why they mattered: long-range relationships, parallel training, work across text/code/
image/audio/video, scale well with data and compute → made foundation models possible.

## Limits + what comes next

Limits: attention gets expensive as context grows; context isn't durable memory; they
hallucinate; data/compute hungry; don't natively act; strain under video/robotics/realtime;
no native truth-checking without tools.

Likely next phase:

```text
Attention for precise comparison
+ state-space / recurrent layers for long-running context (e.g. Mamba)
+ retrieval for durable external memory
+ tools for grounded action
+ verifier models for checking outputs
+ test-time reasoning
```

Operator takeaway:

```text
The model is becoming less like one brain in a box
and more like a reasoning engine inside a workflow system.
```
