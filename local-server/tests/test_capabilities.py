from __future__ import annotations

from domain.system.capabilities import build_capabilities, explain_capability_error, probe_module


def test_explain_capability_error_maps_known_failures() -> None:
    missing, fix = explain_capability_error("No module named 'sentence_transformers'")
    assert "sentence-transformers" in missing
    assert "uv sync --extra semantic" in fix

    zvec_error, zvec_fix = explain_capability_error("No module named 'zvec'")
    assert "zvec" in zvec_error
    assert "uv sync" in zvec_fix

    unset_error, unset_fix = explain_capability_error(None)
    assert "has not been built" in unset_error
    assert "Rebuild index" in unset_fix

    model_error = "Could not load model from huggingface"
    mapped_error, model_fix = explain_capability_error(model_error)
    assert mapped_error == model_error
    assert "Hugging Face" in model_fix

    unknown, unknown_fix = explain_capability_error("CUDA out of memory")
    assert unknown == "CUDA out of memory"
    assert "Rebuild index" in unknown_fix


def test_build_capabilities_splits_runtime_from_index() -> None:
    missing = build_capabilities(
        semantic_error="No module named 'sentence_transformers'",
        index_ready=False,
    )
    assert missing.keyword_search.available is True
    assert missing.semantic_search.available is False
    assert missing.vector_index.available is False
    assert missing.semantic_search.fix is not None
    assert "uv sync --extra semantic" in missing.semantic_search.fix

    ready = build_capabilities(semantic_error=None, index_ready=True)
    assert ready.semantic_search.available is True
    assert ready.vector_index.available is True
    assert ready.semantic_search.error is None


def test_probe_module_reports_missing_dependency() -> None:
    assert probe_module("tabvault_missing_capability_module") is not None
    assert probe_module("json") is None


def test_capabilities_route_reports_keyword_and_semantic_state(
    client, headers: dict[str, str]
) -> None:
    response = client.get("/api/v1/capabilities", headers=headers)
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["keywordSearch"]["available"] is True
    assert "semanticSearch" in payload
    assert "vectorIndex" in payload
    if not payload["semanticSearch"]["available"]:
        assert payload["semanticSearch"]["error"]
        assert payload["semanticSearch"]["fix"]
