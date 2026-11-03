"""What the pipelines return."""
from dataclasses import dataclass


@dataclass
class ExecutionArtifact:
    output: str
    provider_id: str
    model_id: str
    base_version: int
    patch_version: int | None
    prompt_conflict: bool
    tokens_in: int | None
    tokens_out: int | None
    correlation_id: str
