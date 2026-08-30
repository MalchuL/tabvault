"""Probe optional runtime features and turn failures into operator-facing fixes."""

from __future__ import annotations

import importlib

from .dto import CapabilitiesDTO, CapabilityDTO

_MISSING_EMBEDDINGS_FIX = (
    "From the local-server directory run `uv sync --extra semantic`, then restart tabvault-server."
)
_MISSING_ZVEC_FIX = (
    "Reinstall server dependencies with `uv sync` on x86_64 or arm64, then restart tabvault-server."
)
_INDEX_NOT_BUILT_ERROR = "The semantic index has not been built yet."
_INDEX_NOT_BUILT_FIX = (
    "Open Dashboard and choose Rebuild index. The first rebuild downloads the embedding model and "
    "can take several minutes."
)
_MODEL_DOWNLOAD_FIX = (
    "Check network access to Hugging Face, or set TABVAULT_EMBEDDING_MODEL to a local model path, "
    "then rebuild the index."
)


def probe_module(module_name: str) -> str | None:
    """Return an import error message when a runtime dependency cannot be loaded.

    Capabilities checks stay in-process and do not download models. A successful import only means
    the package is installed in this server environment.

    Args:
        module_name (str): Absolute Python module name to import, such as ``sentence_transformers``.

    Returns:
        str | None: The exception text when import fails, otherwise ``None``.
    """
    try:
        importlib.import_module(module_name)
    except Exception as error:
        return str(error)
    return None


def explain_capability_error(error: str | None) -> tuple[str, str]:
    """Map a raw capability or rebuild failure to a short error and fix.

    The Dashboard and Settings pages render these two strings directly. Known install and model
    failures get a specific remedy; an empty error means the runtime is present but no index exists
    yet.

    Args:
        error (str | None): Import error, rebuild ``last_error``, or ``None`` when only the index is
            missing.

    Returns:
        tuple[str, str]: Operator-facing error text and the matching remediation.
    """
    if error is None:
        return _INDEX_NOT_BUILT_ERROR, _INDEX_NOT_BUILT_FIX
    lowered = error.lower()
    if "sentence_transformers" in lowered or "sentence-transformers" in lowered:
        return "The sentence-transformers package is not installed.", _MISSING_EMBEDDINGS_FIX
    if "no module named 'zvec'" in lowered or lowered.endswith("zvec"):
        return "The local vector library (zvec) is not available.", _MISSING_ZVEC_FIX
    if any(token in lowered for token in ("huggingface", "hf_hub", "could not load", "not found")):
        return error, _MODEL_DOWNLOAD_FIX
    return error, _INDEX_NOT_BUILT_FIX


def _capability(available: bool, error: str | None = None) -> CapabilityDTO:
    """Build one capability record, attaching a fix only when the feature is unavailable.

    Args:
        available (bool): Whether the current process can provide the feature.
        error (str | None): Raw failure text used to choose the operator-facing explanation.

    Returns:
        CapabilityDTO: Available flag plus optional error and fix strings.
    """
    if available:
        return CapabilityDTO(available=True)
    message, fix = explain_capability_error(error)
    return CapabilityDTO(available=False, error=message, fix=fix)


def build_capabilities(*, semantic_error: str | None, index_ready: bool) -> CapabilitiesDTO:
    """Assemble the public capabilities snapshot from runtime probes and index readiness.

    Keyword search is always reported as available. Semantic search requires the optional embedding
    extra. The vector index is available only after a successful rebuild in this process.

    Args:
        semantic_error (str | None): Import or last rebuild error that blocks embedding work.
        index_ready (bool): Whether the in-memory vector index currently reports ``ready``.

    Returns:
        CapabilitiesDTO: Named capability records for the HTTP envelope.
    """
    semantic_available = semantic_error is None
    return CapabilitiesDTO(
        keyword_search=_capability(True),
        semantic_search=_capability(semantic_available, semantic_error),
        vector_index=_capability(index_ready, None if index_ready else semantic_error),
    )
