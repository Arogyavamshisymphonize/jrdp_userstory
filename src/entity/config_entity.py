"""Request bodies the API accepts."""
from pydantic import BaseModel, Field, SecretStr


class KeyIn(BaseModel):
    api_key: SecretStr = Field(max_length=512)


class PreferenceIn(BaseModel):
    provider_id: str = Field(max_length=32)
    model_id: str = Field(min_length=1, max_length=255)


class SectionsIn(BaseModel):
    sections: dict[str, str] = Field(max_length=20)


class TaskIn(BaseModel):
    task: str = Field(min_length=1, max_length=50000)
