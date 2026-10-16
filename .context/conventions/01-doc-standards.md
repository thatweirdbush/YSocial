---
module: Document Standards & Token Optimization
updated: 2026-10-02
---

# TOKEN OPTIMIZATION RULES

## 1. Syntax & Encoding
- NO emojis
- USE digits over words: `1`, `150`
- USE `±` instead of `+/-`
- USE ASCII operators/symbols in code & logic: `&` (no `and`), `>`, `<`, `...`, `"`, `'`
- USE `->` / `=>` only for actual directional, transformational, or logical relationships
- DO NOT replace normal punctuation or conjunctions with `->`: use `,` or natural wording when appropriate
- DO NOT replace `to` with `()` or `->`
- DO NOT use `w/` as a replacement for `with`
- PRESERVE symbols required for meaning, readability, or visual structure

## 2. Concise Style
- USE English
- PRIORITY: `correctness > clarity > token efficiency`
- DROP non-semantic words: articles, filler, redundant politeness (e.g. a, an, the...)
- PREFER short active phrasing
- PREFER direct statements over prose
- AVOID repeated context, explanations, or user-provided information
- NEVER append periods (`.`) at the end of list items, bullets, or headers

## 3. Naming & Abbreviations
- WRAP explicit entities in backticks: `auth_store`, `UserContext`
- USE standard industry abbreviations:
  - `configuration` -> `config`
  - `environment` -> `env`
  - `repository` -> `repo`
  - `initialize` -> `init`
  - `reference` -> `ref`
  - `authentication` -> `auth`
  - `database` -> `DB`
  - `frontend`/`backend` -> `FE`/`BE`
- NO abbreviate ambiguous terms
- PRESERVE official API/class/property names

## 4. Structure
- USE bullets (`-`) / numbers for sequential flows. NO long paragraphs
- KEEP **bold formatting** in bullet/number items containing `:`, except bullets containing only `code`
- USE tables for compact state/action mappings
- USE `yaml` / `json` for structured schemas, configs, or nested state
- USE plain bullets when more compact/readable
- AVOID unnecessary headings/nesting
- PRESERVE intentional formatting when it improves scanning or visual structure

## 5. Logic
- USE compact conditional expressions for branches
  - GOOD: `IF user.role != 'admin' & acct_age < 1 -> block_access()`
- USE UPPERCASE for strict constraints: `MUST`, `NEVER`, `ONLY`
- USE normal language when symbolic notation reduces clarity
- PREFER one-line conditions when readable

## 6. Diagram & Visual Structure
- PRESERVE hierarchy diagrams and their original visual structure
- DO NOT replace long hierarchy lines/dashes with shorter characters
- DO NOT optimize spacing, indentation, alignment, or line length when they convey structure
- TREAT diagram characters as formatting, not redundant text

## 7. Redundancy Control
- DEFINE an entity once, then use its short name/ref
- NO repeat unchanged context across sections
- NO restate conclusions already established
- REMOVE duplicate rules with overlapping meaning
- KEEP examples only when they clarify a rule
