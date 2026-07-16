"""Python SDK for the AI Debug Assistant memory service.

Zero external dependencies (uses stdlib urllib).
Requires the memory service running at the configured base URL.
"""

from __future__ import annotations

import json
import urllib.request
import urllib.parse
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional

MemoryKind = Literal["core", "semantic", "procedural", "resource", "episodic"]
UpdatedBy = Literal["llm", "user", "system"]


@dataclass
class MemoryEntry:
    id: str
    project_id: str
    kind: MemoryKind
    content: str
    tags: List[str]
    strength: float
    created_at: str
    updated_at: str
    updated_by: UpdatedBy
    sources: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_json(cls, d: Dict[str, Any]) -> "MemoryEntry":
        return cls(
            id=d["id"],
            project_id=d["projectId"],
            kind=d["kind"],
            content=d["content"],
            tags=d.get("tags", []),
            strength=d.get("strength", 0),
            created_at=d["createdAt"],
            updated_at=d["updatedAt"],
            updated_by=d["updatedBy"],
            sources=d.get("sources", []) or [],
            metadata=d.get("metadata", {}) or {},
        )


class MemoryClient:
    """Minimal client for /api/memory endpoints."""

    def __init__(self, base_url: str = "http://127.0.0.1:8787", timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # ─── Internal ────────────────────────────────────────────────────────────

    def _request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Any:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("content-type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                err = json.loads(e.read().decode("utf-8"))
                raise RuntimeError(err.get("error") or f"HTTP {e.code}")
            except (ValueError, json.JSONDecodeError):
                raise RuntimeError(f"HTTP {e.code}: {e.reason}")

    # ─── Projects ────────────────────────────────────────────────────────────

    def list_projects(self) -> List[Dict[str, Any]]:
        return self._request("GET", "/api/memory/projects")["projects"]

    def ensure_project(self, name: Optional[str] = None, repo_path: Optional[str] = None) -> Dict[str, Any]:
        """Reuse-by-repoPath if possible, otherwise create."""
        body: Dict[str, Any] = {"name": name or (repo_path.split("/")[-1] if repo_path else "project")}
        if repo_path:
            body["repoPath"] = repo_path
        return self._request("POST", "/api/memory/projects", body)["project"]

    def get_project(self, project_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/api/memory/projects/{project_id}")["project"]

    def update_project_identity(
        self,
        project_id: str,
        *,
        tech_stack: Optional[List[str]] = None,
        languages: Optional[List[str]] = None,
        layout: Optional[str] = None,
        conventions: Optional[List[str]] = None,
        updated_by: UpdatedBy = "llm",
    ) -> Dict[str, Any]:
        from datetime import datetime, timezone
        identity: Dict[str, Any] = {"updatedAt": datetime.now(timezone.utc).isoformat(), "updatedBy": updated_by}
        if tech_stack is not None:
            identity["techStack"] = tech_stack
        if languages is not None:
            identity["languages"] = languages
        if layout is not None:
            identity["layout"] = layout
        if conventions is not None:
            identity["conventions"] = conventions
        return self._request("PATCH", f"/api/memory/projects/{project_id}", {"identity": identity})["project"]

    # ─── Memories ────────────────────────────────────────────────────────────

    def remember(
        self,
        project_id: str,
        *,
        kind: MemoryKind,
        content: str,
        tags: Optional[List[str]] = None,
        sources: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        reinforce_if_similar: bool = False,
        updated_by: UpdatedBy = "llm",
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {
            "kind": kind,
            "content": content,
            "updatedBy": updated_by,
            "reinforceIfSimilar": reinforce_if_similar,
        }
        if tags is not None:
            body["tags"] = tags
        if sources is not None:
            body["sources"] = sources
        if metadata is not None:
            body["metadata"] = metadata
        return self._request("POST", f"/api/memory/projects/{project_id}/memories", body)

    def recall(
        self,
        project_id: str,
        query: str,
        *,
        kinds: Optional[List[MemoryKind]] = None,
        tags: Optional[List[str]] = None,
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        body: Dict[str, Any] = {"query": query, "topK": top_k}
        if kinds:
            body["kinds"] = kinds
        if tags:
            body["tags"] = tags
        return self._request("POST", f"/api/memory/projects/{project_id}/recall", body)["hits"]

    def list_memories(
        self,
        project_id: str,
        *,
        kinds: Optional[List[MemoryKind]] = None,
        tags: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        qs: List[str] = []
        if kinds:
            qs.append(f"kinds={','.join(kinds)}")
        if tags:
            qs.append(f"tags={','.join(tags)}")
        suffix = f"?{'&'.join(qs)}" if qs else ""
        return self._request("GET", f"/api/memory/projects/{project_id}/memories{suffix}")["memories"]

    def forget(self, project_id: str, memory_id: str) -> None:
        self._request("DELETE", f"/api/memory/projects/{project_id}/memories/{memory_id}")


# ─── Convenience example ─────────────────────────────────────────────────────

if __name__ == "__main__":
    client = MemoryClient()
    project = client.ensure_project(name="demo", repo_path="/tmp/demo-repo")
    print(f"project: {project['id']} name={project['name']}")

    result = client.remember(
        project["id"],
        kind="semantic",
        content="所有 DTO 转换在 assembler 层完成",
        tags=["convention", "backend"],
        reinforce_if_similar=True,
    )
    print(f"stored: id={result['entry']['id']} reinforced={result['reinforced']}")

    hits = client.recall(project["id"], "DTO 是怎么转的", top_k=3)
    for h in hits:
        print(f"  score={h['score']:.2f} content={h['entry']['content'][:60]}")
