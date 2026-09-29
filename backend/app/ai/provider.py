"""LLM provider abstraction, configured entirely through environment variables.

LLM_PROVIDER = none (default) | anthropic | openai
LLM_API_KEY  = your key (any non-empty value for local Ollama)
LLM_MODEL    = model name (anthropic default: claude-haiku-4-5-20251001)
LLM_BASE_URL = openai-compatible only, e.g. http://localhost:11434/v1 for Ollama
"""
from __future__ import annotations

import json
import os

import httpx


class LLMUnavailable(RuntimeError):
    """Provider not configured, unreachable, or returned something unusable."""


def provider_name() -> str:
    return os.getenv("LLM_PROVIDER", "none").strip().lower()


def is_enabled() -> bool:
    return provider_name() != "none"


def _extract_json(text: str) -> dict:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise LLMUnavailable("model did not return JSON")
    try:
        return json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        raise LLMUnavailable("model returned invalid JSON")


def complete_json(system: str, user: str, max_tokens: int = 2000) -> dict:
    name = provider_name()
    if name == "none":
        raise LLMUnavailable("LLM_PROVIDER is not set")
    key = os.getenv("LLM_API_KEY", "")
    if not key:
        raise LLMUnavailable("LLM_API_KEY is missing")
    model = os.getenv("LLM_MODEL", "")
    try:
        if name == "anthropic":
            r = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                json={"model": model or "claude-haiku-4-5-20251001", "max_tokens": max_tokens,
                      "temperature": 0, "system": system,
                      "messages": [{"role": "user", "content": user}]},
                timeout=60)
            r.raise_for_status()
            text = "".join(b.get("text", "") for b in r.json()["content"])
        elif name == "openai":
            base = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
            r = httpx.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={"model": model or "gpt-4o-mini", "max_tokens": max_tokens, "temperature": 0,
                      "messages": [{"role": "system", "content": system},
                                   {"role": "user", "content": user}]},
                timeout=120)
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"]
        else:
            raise LLMUnavailable(f"unknown LLM_PROVIDER '{name}'")
    except httpx.HTTPStatusError as e:
        raise LLMUnavailable(f"provider returned HTTP {e.response.status_code}")
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
        raise LLMUnavailable(f"provider call failed ({e.__class__.__name__})")
    return _extract_json(text)