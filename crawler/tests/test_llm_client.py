from __future__ import annotations

from unittest.mock import MagicMock, patch
from llm_client import LLMClient


def test_llm_client_availability():
    client_without_key = LLMClient(api_key="")
    assert not client_without_key.is_available()

    client_with_key = LLMClient(api_key="test_mock_key")
    assert client_with_key.is_available()


def test_llm_client_extract_fields_mocked():
    client = LLMClient(api_key="mock_key")

    mock_response_data = b'{"candidates": [{"content": {"parts": [{"text": "{\\"title\\": \\"Mocked Book\\", \\"price\\": \\"\\u00a319.99\\"}"}]}}]}'

    mock_resp = MagicMock()
    mock_resp.status = 200
    mock_resp.read.return_value = mock_response_data
    mock_resp.__enter__.return_value = mock_resp

    with patch("urllib.request.urlopen", return_value=mock_resp):
        res = client.extract_fields(
            cleaned_text="<html><body><h1>Mocked Book</h1><p>Price: 19.99</p></body></html>",
            missing_fields=["title", "price"],
        )

    assert res.get("title") == "Mocked Book"
    assert res.get("price") == "£19.99"
